import type { ChatRoomType, MoveType, UserType } from '@prisma/client';
import { isMessagingAllowedByEstimateStatus } from '../constants/chat.constants';
import type { AuthenticatedUser } from '../middlewares/auth.middleware';
import * as chatRepository from '../repositories/chat.repository';
import type { CreateChatRoomBody } from '../schemas/chat.schema';
import { AppError } from '../utils/app.error';
import { toProfileImageUrl } from '../utils/profile-image.util';

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

interface ChatRoomDetailResult {
  partner: {
    id: string;
    userType: UserType;
    nickname: string;
    profileImageUrl: string | null;
  };
  requestSummary: {
    estimateRequestId: number;
    moveType: MoveType | null;
    moveDate: string | null;
    originAddress: string | null;
    destinationAddress: string | null;
  } | null;
  quoteId: number | null;
  isMessagingAllowed: boolean;
  updatedAt: string;
}

/** Date를 ISO 8601 문자열로 변환한다. */
const toIsoString = (date: Date) => date.toISOString();

/** Date를 YYYY-MM-DD 형식으로 변환한다. */
const toDateString = (date: Date) => date.toISOString().slice(0, 10);

/**
 * 채팅방 참여자 ID 목록을 결정한다.
 * - CUSTOMER: [고객, 기사]
 * - MOVER: 본인이 moverId와 일치해야 하며, 견적 요청의 고객을 포함한다.
 */
const resolveParticipantIds = async (params: {
  authUser: AuthenticatedUser;
  moverId: string;
  estimateRequestId?: number;
}): Promise<string[]> => {
  if (params.authUser.userType === 'CUSTOMER') {
    if (params.authUser.userId === params.moverId) {
      throw new AppError('INVALID_REQUEST');
    }

    return [params.authUser.userId, params.moverId];
  }

  if (params.authUser.userId !== params.moverId) {
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
  authUser: AuthenticatedUser,
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
      estimateRequest.userId !== authUser.userId
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

/**
 * 채팅방 상세 정보를 조회한다.
 * - 활성 참여자(leftAt IS NULL)만 접근 가능
 * - partner는 상대방 유저 정보를 반환
 */
export const getChatRoomDetail = async (
  authUser: AuthenticatedUser,
  roomId: number
): Promise<ChatRoomDetailResult> => {
  const room = await chatRepository.findRoomDetailById(roomId);

  if (!room) {
    throw new AppError('ROOM_NOT_FOUND');
  }

  const isActiveParticipant = room.participants.some(
    (participant) => participant.participantId === authUser.userId
  );

  if (!isActiveParticipant) {
    throw new AppError('FORBIDDEN');
  }

  const partnerParticipant = room.participants.find(
    (participant) => participant.participantId !== authUser.userId
  );

  if (!partnerParticipant) {
    throw new AppError('ROOM_NOT_FOUND');
  }

  const partner = partnerParticipant.user;

  return {
    partner: {
      id: partner.id,
      userType: partner.userType,
      nickname: partner.nickname,
      profileImageUrl: toProfileImageUrl(partner.profileImageKey),
    },
    requestSummary: room.estimateRequest
      ? {
          estimateRequestId: room.estimateRequest.id,
          moveType: room.estimateRequest.moveType,
          moveDate: room.estimateRequest.moveDate
            ? toDateString(room.estimateRequest.moveDate)
            : null,
          originAddress: room.estimateRequest.departureAddress,
          destinationAddress: room.estimateRequest.arrivalAddress,
        }
      : null,
    quoteId: room.quoteId,
    isMessagingAllowed: isMessagingAllowedByEstimateStatus(
      room.estimateRequest?.status
    ),
    updatedAt: toIsoString(room.updatedAt),
  };
};
