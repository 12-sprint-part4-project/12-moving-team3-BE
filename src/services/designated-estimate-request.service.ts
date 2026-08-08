import { EstimateRequestStatus, Prisma, QuoteStatus } from '@prisma/client';
import type {
  CreateDesignatedEstimateDto,
  DesignatedEstimateExistenceDto,
  DesignatedEstimateMoverDto,
} from '../dtos/designated-estimate-request.dto';
import { runAuditedTransaction } from '../lib/audit-context';
import { prisma } from '../lib/prisma';
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

  if (estimateRequest.status !== EstimateRequestStatus.SUBMITTED) {
    throw new AppError('ESTIMATE_REQUEST_NOT_SUBMITTED');
  }

  const mover = await findUserById(moverId);

  if (!mover || mover.deletedAt || mover.userType !== 'MOVER') {
    throw new AppError('MOVER_NOT_FOUND');
  }

  const existing =
    await designatedEstimateRequestRepository.findByEstimateIdAndMoverId(
      estimateRequestId,
      moverId
    );

  // 이미 지정된 경우 기존 행을 반환 (designatedMoverId 유지 — 채팅 생성용)
  if (existing) {
    return toDto(existing);
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

      return toDto(
        await designatedEstimateRequestRepository.create(
          estimateRequestId,
          moverId,
          tx
        )
      );
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
