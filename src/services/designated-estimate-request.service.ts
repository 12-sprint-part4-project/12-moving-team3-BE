import { EstimateRequestStatus, Prisma, QuoteStatus } from '@prisma/client';
import type {
  CreateDesignatedEstimateDto,
  DesignatedEstimateExistenceDto,
  DesignatedEstimateMoverDto,
} from '../dtos/designated-estimate-request.dto';
import { runAuditedTransaction } from '../lib/audit-context';
import { prisma } from '../lib/prisma';
import * as chatRepository from '../repositories/chat.repository';
import type { ChatDbClient } from '../repositories/chat.repository';
import * as designatedEstimateRequestRepository from '../repositories/designated-estimate-request.repository';
import * as estimateRequestRepository from '../repositories/estimate-request.repository';
import * as quoteRepository from '../repositories/quote.repository';
import { findUserById } from '../repositories/user.repository';
import { AppError } from '../utils/app.error';
import * as notificationService from './notification.service';

/** 지정 요청을 막을 수신 견적 상태 (대기·확정) */
const BLOCKING_QUOTE_STATUSES: readonly QuoteStatus[] = [
  QuoteStatus.PENDING,
  QuoteStatus.CONFIRMED,
];

interface DesignatedEstimateMoverRow {
  id: number;
  estimateId: number;
  moverId: string;
}

interface DesignatedEstimateRequestServiceParams {
  userId: string;
  estimateRequestId: number;
  moverId: string;
}

/** 지정 생성 직후 기존 채팅방 roomType 동기화 입력 */
interface SyncDesignatedChatRoomParams {
  estimateRequestId: number;
  customerId: string;
  moverId: string;
  designatedMoverId: number;
}

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

const toDto = (
  row: DesignatedEstimateMoverRow
): DesignatedEstimateMoverDto => ({
  id: row.id,
  estimateId: row.estimateId,
  moverId: row.moverId,
});

/**
 * 동일 견적요청·고객·기사 GENERAL 채팅방이 있으면 DESIGNATED로 승격한다.
 * 방이 없으면 생성하지 않는다. 이미 DESIGNATED면 designatedMoverId를 바꾸지 않는다.
 */
const syncDesignatedChatRoomType = async (
  dbClient: ChatDbClient,
  params: SyncDesignatedChatRoomParams
): Promise<void> => {
  const room = await chatRepository.findRoomByEstimateAndParticipants(
    {
      estimateRequestId: params.estimateRequestId,
      roomTypes: ['DESIGNATED', 'GENERAL'],
      participantIds: [params.customerId, params.moverId],
    },
    dbClient
  );

  if (!room || room.roomType !== 'GENERAL') {
    return;
  }

  await chatRepository.promoteRoomToDesignated(
    {
      roomId: room.id,
      designatedMoverId: params.designatedMoverId,
    },
    dbClient
  );
};

/**
 * 지정 견적 존재 여부 조회 (고객 본인 견적요청만)
 */
export const checkDesignatedEstimateExistence = async (
  params: DesignatedEstimateRequestServiceParams
): Promise<DesignatedEstimateExistenceDto> => {
  const { userId, estimateRequestId, moverId } = params;

  const estimateRequest =
    await estimateRequestRepository.findEstimateRequestById(estimateRequestId);

  if (!estimateRequest) {
    throw new AppError(
      'ESTIMATE_REQUEST_NOT_FOUND',
      '일반 견적 요청이 존재하지 않습니다.'
    );
  }

  if (estimateRequest.userId !== userId) {
    throw new AppError('FORBIDDEN', '본인의 견적 요청만 조회할 수 있습니다.');
  }

  const designatedEstimateRequest =
    await designatedEstimateRequestRepository.findByEstimateIdAndMoverId(
      estimateRequestId,
      moverId
    );

  if (!designatedEstimateRequest) {
    return { exists: false, designatedEstimateRequest: null };
  }

  return {
    exists: true,
    designatedEstimateRequest: toDto(designatedEstimateRequest),
  };
};

/**
 * 지정 견적 요청 생성 — SUBMITTED 상태의 본인 견적요청에만 가능
 * 트랜잭션에서 estimate_request FOR UPDATE 후 Quote/지정 검사·생성으로 race를 차단
 * 동일 견적·참여자 GENERAL 채팅방이 있으면 DESIGNATED로 승격한다(없으면 생성하지 않음)
 */
export const createDesignatedEstimateRequest = async (
  params: DesignatedEstimateRequestServiceParams
): Promise<CreateDesignatedEstimateDto> => {
  const { userId, estimateRequestId, moverId } = params;

  const estimateRequest =
    await estimateRequestRepository.findEstimateRequestById(estimateRequestId);

  if (!estimateRequest) {
    throw new AppError(
      'ESTIMATE_REQUEST_NOT_FOUND',
      '일반 견적 요청이 존재하지 않습니다.'
    );
  }

  if (estimateRequest.userId !== userId) {
    throw new AppError('FORBIDDEN', '본인의 견적 요청만 지정할 수 있습니다.');
  }

  // 멱등: 소유권 확인 직후 기존 지정 행이 있으면 상태와 무관하게 반환
  const existing =
    await designatedEstimateRequestRepository.findByEstimateIdAndMoverId(
      estimateRequestId,
      moverId
    );

  if (existing) {
    // 지정만 되고 채팅하기 전 GENERAL 방이 남아 있을 수 있어 roomType을 보정한다
    await syncDesignatedChatRoomType(prisma, {
      estimateRequestId,
      customerId: userId,
      moverId,
      designatedMoverId: existing.id,
    });
    return toDto(existing);
  }

  if (estimateRequest.status !== EstimateRequestStatus.SUBMITTED) {
    throw new AppError('ESTIMATE_REQUEST_NOT_SUBMITTED');
  }

  const mover = await findUserById(moverId);

  if (!mover || mover.deletedAt || mover.userType !== 'MOVER') {
    throw new AppError('MOVER_NOT_FOUND');
  }

  const existingQuote = await quoteRepository.findExistingQuoteByStatuses(
    prisma,
    estimateRequestId,
    moverId,
    BLOCKING_QUOTE_STATUSES
  );

  if (existingQuote) {
    throw new AppError('QUOTE_ALREADY_RECEIVED_FROM_MOVER');
  }

  try {
    const created = await runAuditedTransaction(async (tx) => {
      const locked = await quoteRepository.findEstimateRequestForUpdate(
        tx,
        estimateRequestId
      );

      if (!locked) {
        throw new AppError(
          'ESTIMATE_REQUEST_NOT_FOUND',
          '일반 견적 요청이 존재하지 않습니다.'
        );
      }

      if (locked.status !== EstimateRequestStatus.SUBMITTED) {
        throw new AppError('ESTIMATE_REQUEST_NOT_SUBMITTED');
      }

      const lockedDetail =
        await estimateRequestRepository.findEstimateRequestById(
          estimateRequestId,
          tx
        );

      if (!lockedDetail) {
        throw new AppError(
          'ESTIMATE_REQUEST_NOT_FOUND',
          '일반 견적 요청이 존재하지 않습니다.'
        );
      }

      if (lockedDetail.userId !== userId) {
        throw new AppError(
          'FORBIDDEN',
          '본인의 견적 요청만 지정할 수 있습니다.'
        );
      }

      const designatedInTx =
        await designatedEstimateRequestRepository.findByEstimateIdAndMoverId(
          estimateRequestId,
          moverId,
          tx
        );

      if (designatedInTx) {
        throw new AppError('DESIGNATED_ALREADY_EXISTS');
      }

      const quoteInTx = await quoteRepository.findExistingQuoteByStatuses(
        tx,
        estimateRequestId,
        moverId,
        BLOCKING_QUOTE_STATUSES
      );

      if (quoteInTx) {
        throw new AppError('QUOTE_ALREADY_RECEIVED_FROM_MOVER');
      }

      const createdRow = await designatedEstimateRequestRepository.create(
        estimateRequestId,
        moverId,
        tx
      );

      // 지정 생성과 동시에 기존 GENERAL 방을 DESIGNATED로 승격 (없으면 생성하지 않음)
      await syncDesignatedChatRoomType(tx, {
        estimateRequestId,
        customerId: userId,
        moverId,
        designatedMoverId: createdRow.id,
      });

      return toDto(createdRow);
    });

    // 지정 알림 — 커밋 이후(실패해도 지정 생성은 유지). 일반 알림과 별도 사건.
    try {
      await notificationService.notifyDesignatedQuoteRequestArrived({
        estimateRequestId,
        customerId: userId,
        moverId,
        moveType: estimateRequest.moveType,
      });
    } catch (error) {
      console.error(
        `[createDesignatedEstimateRequest] designated notification failed estimateId=${estimateRequestId} moverId=${moverId}`,
        error
      );
    }

    return created;
  } catch (error) {
    // 동시 요청·tx 내 재조회로 이미 존재하면 기존 행 반환 (알림 미발송)
    if (
      (error instanceof AppError &&
        error.code === 'DESIGNATED_ALREADY_EXISTS') ||
      isUniqueConstraintError(error)
    ) {
      const raced =
        await designatedEstimateRequestRepository.findByEstimateIdAndMoverId(
          estimateRequestId,
          moverId
        );

      if (raced) {
        await syncDesignatedChatRoomType(prisma, {
          estimateRequestId,
          customerId: userId,
          moverId,
          designatedMoverId: raced.id,
        });
        return toDto(raced);
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('DESIGNATED_ALREADY_EXISTS');
    }

    throw error;
  }
};
