import type { ChatRoomType, UserType } from '@prisma/client';
import * as chatRepository from '../repositories/chat.repository';
import type { CreateChatRoomBody } from '../schemas/chat.schema';
import { AppError } from '../utils/app.error';

interface AuthUser {
  id: string;
  userType: UserType;
}

interface CreateChatRoomResult {
  status: 200 | 201;
  data: {
    roomId: number;
    roomType: ChatRoomType;
    quoteId: number | null;
    createdAt?: string;
    updatedAt: string;
  };
}

/** Date를 ISO 8601 문자열로 변환한다. */
const toIsoString = (date: Date) => date.toISOString();

/**
 * 채팅방 참여자 ID 목록을 결정한다.
 * - CUSTOMER: [고객, 기사]
 * - MOVER: 본인이 moverId와 일치해야 하며, 견적 요청의 고객을 포함한다.
 */
const resolveParticipantIds = async (params: {
  authUser: AuthUser;
  moverId: string;
  estimateRequestId?: number;
}): Promise<string[]> => {
  if (params.authUser.userType === 'CUSTOMER') {
    if (params.authUser.id === params.moverId) {
      throw new AppError('INVALID_REQUEST');
    }

    return [params.authUser.id, params.moverId];
  }

  if (params.authUser.id !== params.moverId) {
    throw new AppError('FORBIDDEN');
  }

  if (params.estimateRequestId === undefined) {
    throw new AppError('INVALID_REQUEST');
  }

  const estimateRequest = await chatRepository.findEstimateRequestById(
    params.estimateRequestId
  );

  if (!estimateRequest) {
    throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
  }

  return [estimateRequest.userId, params.moverId];
};

/**
 * 기존 채팅방 조회 우선순위:
 * 1) designatedMoverId 2) quoteId 3) estimateRequestId + 참여자
 */
const findExistingRoom = async (params: {
  designatedMoverId?: number;
  quoteId?: number;
  estimateRequestId?: number;
  roomType: ChatRoomType;
  participantIds: string[];
}) => {
  if (params.designatedMoverId !== undefined) {
    return chatRepository.findRoomByDesignatedMoverId(params.designatedMoverId);
  }

  if (params.quoteId !== undefined) {
    return chatRepository.findRoomByQuoteId(params.quoteId);
  }

  if (params.estimateRequestId !== undefined) {
    return chatRepository.findRoomByEstimateAndParticipants({
      estimateRequestId: params.estimateRequestId,
      roomType: params.roomType,
      participantIds: params.participantIds,
    });
  }

  return null;
};

/**
 * 채팅방을 생성하거나 기존 방을 반환한다.
 * - 지정 요청으로 방이 이미 있으면 quoteId만 업데이트(200)
 * - 동일 조건의 기존 방이 있으면 그대로 반환(200)
 * - 없으면 신규 생성(201)
 * - COMMUNITY는 현재 미지원
 */
export const createChatRoom = async (
  authUser: AuthUser,
  body: CreateChatRoomBody
): Promise<CreateChatRoomResult> => {
  if (body.roomType === 'COMMUNITY') {
    throw new AppError('INVALID_REQUEST');
  }

  const mover = await chatRepository.findMoverById(body.moverId);

  if (!mover) {
    throw new AppError('MOVER_NOT_FOUND');
  }

  let estimateRequestId = body.estimateRequestId;
  let designatedMoverId = body.designatedMoverId;
  const quoteId = body.quoteId;

  if (designatedMoverId !== undefined) {
    const designatedMover =
      await chatRepository.findDesignatedMoverById(designatedMoverId);

    if (!designatedMover) {
      throw new AppError('DESIGNATED_MOVER_NOT_FOUND');
    }

    if (designatedMover.moverId !== body.moverId) {
      throw new AppError('INVALID_REQUEST');
    }

    if (
      estimateRequestId !== undefined &&
      designatedMover.estimateId !== estimateRequestId
    ) {
      throw new AppError('INVALID_REQUEST');
    }

    estimateRequestId = estimateRequestId ?? designatedMover.estimateId;
  }

  if (quoteId !== undefined) {
    const quote = await chatRepository.findQuoteById(quoteId);

    if (!quote) {
      throw new AppError('QUOTE_NOT_FOUND');
    }

    if (quote.moverId !== body.moverId) {
      throw new AppError('INVALID_REQUEST');
    }

    if (
      estimateRequestId !== undefined &&
      quote.estimateRequestId !== estimateRequestId
    ) {
      throw new AppError('INVALID_REQUEST');
    }

    estimateRequestId = estimateRequestId ?? quote.estimateRequestId;
  }

  if (estimateRequestId !== undefined) {
    const estimateRequest =
      await chatRepository.findEstimateRequestById(estimateRequestId);

    if (!estimateRequest) {
      throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
    }

    if (
      authUser.userType === 'CUSTOMER' &&
      estimateRequest.userId !== authUser.id
    ) {
      throw new AppError('FORBIDDEN');
    }
  }

  if (body.roomType === 'DESIGNATED' && designatedMoverId === undefined) {
    throw new AppError('INVALID_REQUEST');
  }

  if (body.roomType === 'GENERAL' && estimateRequestId === undefined) {
    throw new AppError('INVALID_REQUEST');
  }

  const participantIds = await resolveParticipantIds({
    authUser,
    moverId: body.moverId,
    estimateRequestId,
  });

  const existingRoom = await findExistingRoom({
    designatedMoverId,
    quoteId,
    estimateRequestId,
    roomType: body.roomType,
    participantIds,
  });

  if (existingRoom) {
    const shouldUpdateQuoteId =
      quoteId !== undefined && existingRoom.quoteId !== quoteId;

    if (shouldUpdateQuoteId && quoteId !== undefined) {
      const updatedRoom = await chatRepository.updateRoomQuoteId(
        existingRoom.id,
        quoteId
      );

      return {
        status: 200,
        data: {
          roomId: updatedRoom.id,
          roomType: updatedRoom.roomType,
          quoteId: updatedRoom.quoteId,
          updatedAt: toIsoString(updatedRoom.updatedAt),
        },
      };
    }

    return {
      status: 200,
      data: {
        roomId: existingRoom.id,
        roomType: existingRoom.roomType,
        quoteId: existingRoom.quoteId,
        createdAt: toIsoString(existingRoom.createdAt),
        updatedAt: toIsoString(existingRoom.updatedAt),
      },
    };
  }

  const createdRoom = await chatRepository.createChatRoom({
    estimateRequestId,
    quoteId,
    designatedMoverId,
    roomType: body.roomType,
    participantIds,
  });

  return {
    status: 201,
    data: {
      roomId: createdRoom.id,
      roomType: createdRoom.roomType,
      quoteId: createdRoom.quoteId,
      createdAt: toIsoString(createdRoom.createdAt),
      updatedAt: toIsoString(createdRoom.updatedAt),
    },
  };
};
