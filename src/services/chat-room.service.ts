import type {
  ChatRoomType,
  QuoteStatus,
  UserType,
} from '@prisma/client';
import type {
  ChatRoomDetailResult,
  ChatRoomListItem,
  ChatRoomListResult,
  ChatRoomPartner,
  CreateChatRoomResult,
  LeaveChatRoomResult,
  UnreadCountResult,
} from '../dtos/chat.dto';
import { toDateStringKst } from '../utils/date.util';
import {
  isMessagingAllowedForChatRoom,
  resolveChatCounterpartDisplayName,
  resolveChatRoomQuoteBind,
} from '../constants/chat.constants';
import { runAuditedTransaction } from '../lib/audit-context';
import { prisma } from '../lib/prisma';
import type { AuthenticatedUser } from '../middlewares/auth.middleware';
import * as chatRepository from '../repositories/chat.repository';
import type {
  ChatDbClient,
  ChatRoomRecord,
} from '../repositories/chat.repository';
import type {
  CreateChatRoomBody,
  CreateCommunityChatRoomBody,
  CreateEstimateChatRoomBody,
} from '../schemas/chat.schema';
import { AppError } from '../utils/app.error';
import { assertChatRoomExists } from '../utils/chat-access.util';
import {
  compareChatRoomsByLastActivityDesc,
  computeChatRoomLastActivityAt,
} from '../utils/chat-room-activity.util';
import { emitChatPartnerLeft } from './chat-socket.service';
import * as notificationService from './notification.service';
import { toPublicViewUrl } from './s3.service';

/** Date를 ISO 8601 문자열로 변환한다. */
const toIsoString = (date: Date) => date.toISOString();

/**
 * 채팅 응답용 quoteStatus.
 * COMMUNITY는 견적과 무관하므로 항상 null.
 */
const toQuoteStatus = (
  roomType: ChatRoomType,
  quote: { status: QuoteStatus } | null | undefined
): QuoteStatus | null => {
  if (roomType === 'COMMUNITY') {
    return null;
  }

  return quote?.status ?? null;
};

interface ChatRoomPartnerSource {
  id: string;
  userType: UserType;
  name: string;
  nickname: string;
  profileImageKey: string | null;
}

/**
 * 채팅 응답용 partner.
 * displayName은 roomType별 알림과 동일 규칙 (#299).
 * COMMUNITY는 프로필 이미지를 노출하지 않는다 (#363).
 */
const toChatRoomPartner = (
  partner: ChatRoomPartnerSource,
  roomType: ChatRoomType
): ChatRoomPartner => ({
  id: partner.id,
  userType: partner.userType,
  name: partner.name,
  nickname: partner.nickname,
  displayName: resolveChatCounterpartDisplayName(roomType, partner),
  profileImageUrl:
    roomType === 'COMMUNITY'
      ? null
      : toPublicViewUrl(partner.profileImageKey),
});

/** 비본인 참여자 중 활성(leftAt IS NULL) 참여자를 우선 선택한다. */
const selectPartnerParticipant = <
  T extends { participantId: string; leftAt: Date | null },
>(
  participants: T[],
  authUserId: string
): T | null => {
  const partnerCandidates = participants.filter(
    (participant) => participant.participantId !== authUserId
  );

  return (
    partnerCandidates.find((participant) => participant.leftAt === null) ??
    partnerCandidates[0] ??
    null
  );
};

/** Date를 KST 기준 YYYY-MM-DD 형식으로 변환한다. */
const toDateString = (date: Date) => toDateStringKst(date);

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
 * 1) designatedMoverId
 * 2) quoteId (없으면 estimateRequestId+참여자로 폴백 — 견적 연결 전 GENERAL 방 재사용)
 * 3) estimateRequestId + 참여자 (GENERAL|DESIGNATED — 타입 달라도 한 방으로 재사용)
 */
const findExistingRoom = async (
  params: {
    designatedMoverId?: number;
    quoteId?: number;
    estimateRequestId?: number;
    roomType: ChatRoomType;
    participantIds: string[];
  },
  dbClient?: ChatDbClient
) => {
  if (params.designatedMoverId !== undefined) {
    const byDesignated = await chatRepository.findRoomByDesignatedMoverId(
      params.designatedMoverId,
      dbClient
    );
    if (byDesignated) {
      return byDesignated;
    }
  }

  if (params.quoteId !== undefined) {
    const byQuote = await chatRepository.findRoomByQuoteId(
      params.quoteId,
      dbClient
    );
    if (byQuote) {
      return byQuote;
    }
  }

  if (params.estimateRequestId !== undefined) {
    // 같은 견적·참여자면 GENERAL↔DESIGNATED를 별도 방으로 두지 않는다.
    return chatRepository.findRoomByEstimateAndParticipants(
      {
        estimateRequestId: params.estimateRequestId,
        roomType: params.roomType,
        roomTypes: ['DESIGNATED', 'GENERAL'],
        participantIds: params.participantIds,
      },
      dbClient
    );
  }

  return null;
};

/** 기존 방 재사용·quoteId 갱신 결과를 CreateChatRoomResult로 만든다. */
const toExistingRoomResult = (
  room: ChatRoomRecord,
  quoteUpdated: boolean
): CreateChatRoomResult => {
  if (quoteUpdated) {
    return {
      status: 200,
      data: {
        roomId: room.id,
        roomType: room.roomType,
        quoteId: room.quoteId,
        updatedAt: toIsoString(room.updatedAt),
      },
    };
  }

  return {
    status: 200,
    data: {
      roomId: room.id,
      roomType: room.roomType,
      quoteId: room.quoteId,
      createdAt: toIsoString(room.createdAt),
      updatedAt: toIsoString(room.updatedAt),
    },
  };
};

/**
 * 트랜잭션 안에서 기존 방을 재사용하거나 quoteId 최초 연결·DESIGNATED 승격을 반영한다.
 * quoteId는 null → 값 최초 연결만 허용하고, 이미 다른 quoteId면 INVALID_REQUEST.
 */
interface ReuseOrUpdateExistingRoomParams {
  room: ChatRoomRecord;
  quoteId?: number;
  designatedMoverId?: number;
  targetRoomType: ChatRoomType;
}

const reuseOrUpdateExistingRoom = async (
  params: ReuseOrUpdateExistingRoomParams,
  dbClient: ChatDbClient
): Promise<{ room: ChatRoomRecord; quoteUpdated: boolean }> => {
  const { room, quoteId, designatedMoverId, targetRoomType } = params;

  // 이미 DESIGNATED인데 다른 designatedMoverId로 바꾸려 하면 거부
  if (
    targetRoomType === 'DESIGNATED' &&
    room.roomType === 'DESIGNATED' &&
    designatedMoverId !== undefined &&
    room.designatedMoverId != null &&
    room.designatedMoverId !== designatedMoverId
  ) {
    throw new AppError('INVALID_REQUEST');
  }

  const quoteBind =
    quoteId !== undefined
      ? resolveChatRoomQuoteBind(room.quoteId, quoteId)
      : null;

  if (quoteBind === 'conflict') {
    throw new AppError('INVALID_REQUEST');
  }

  const quoteIdToBind = quoteBind === 'bind' ? quoteId : undefined;

  // GENERAL → DESIGNATED 승격만 허용 (DESIGNATED의 designatedMoverId는 교체하지 않음)
  if (
    targetRoomType === 'DESIGNATED' &&
    room.roomType === 'GENERAL' &&
    designatedMoverId !== undefined
  ) {
    const updatedRoom = await chatRepository.promoteRoomToDesignated(
      {
        roomId: room.id,
        designatedMoverId,
        quoteId: quoteIdToBind,
      },
      dbClient
    );
    return {
      room: updatedRoom,
      quoteUpdated: quoteBind === 'bind',
    };
  }

  if (quoteBind === 'bind' && quoteId !== undefined) {
    const updatedRoom = await chatRepository.updateRoomQuoteId(
      room.id,
      quoteId,
      dbClient
    );
    return { room: updatedRoom, quoteUpdated: true };
  }

  return { room, quoteUpdated: false };
};

/**
 * 채팅방을 생성하거나 기존 방을 반환한다.
 * - 지정 요청으로 방이 이미 있으면 quoteId가 없을 때만 최초 연결(200)
 * - 이미 다른 quoteId가 있으면 INVALID_REQUEST
 * - 동일 조건의 기존 방이 있으면 그대로 반환(200)
 * - 없으면 신규 생성(201)
 * - COMMUNITY: 가구나눔 게시글 기준, 견적 무관, 고객·기사 모두 가능
 */
export const createChatRoom = async (
  authUser: AuthenticatedUser,
  body: CreateChatRoomBody
): Promise<CreateChatRoomResult> => {
  if (body.roomType === 'COMMUNITY') {
    return createCommunityChatRoom(authUser, body);
  }

  return createEstimateChatRoom(authUser, body);
};

/**
 * 가구나눔(COMMUNITY) 채팅방을 생성하거나 기존 방을 반환한다.
 * - 참여자: 요청자 + 게시글 작성자 (userType 제한 없음)
 * - 견적 필드(estimate/quote/designated)는 사용하지 않음
 * - 동일 게시글·동일 참여자 쌍이면 기존 방 반환(200)
 */
const createCommunityChatRoom = async (
  authUser: AuthenticatedUser,
  body: CreateCommunityChatRoomBody
): Promise<CreateChatRoomResult> => {
  const post = await chatRepository.findFurnitureSharePostById(
    body.communityPostId
  );

  if (!post) {
    throw new AppError('POST_NOT_FOUND');
  }

  if (post.isCompleted === true) {
    throw new AppError('INVALID_REQUEST', '나눔이 완료된 게시글입니다.');
  }

  if (body.moverId !== post.userId) {
    throw new AppError('INVALID_REQUEST');
  }

  if (authUser.userId === post.userId) {
    throw new AppError('INVALID_REQUEST');
  }

  const author = await chatRepository.findActiveUserById(post.userId);

  if (!author) {
    throw new AppError('POST_NOT_FOUND');
  }

  const participantIds = [authUser.userId, post.userId];

  const existingRoom =
    await chatRepository.findRoomByCommunityPostAndParticipants({
      communityPostId: post.id,
      participantIds,
    });

  if (existingRoom) {
    return toExistingRoomResult(existingRoom, false);
  }

  // 방+참여자를 한 트랜잭션으로 묶고, 잠금 없이 생성 직전 재조회로 레이스를 완화한다. (#265)
  const txResult = await runAuditedTransaction(
    async (tx) => {
      const roomAfterCheck =
        await chatRepository.findRoomByCommunityPostAndParticipants(
          {
            communityPostId: post.id,
            participantIds,
          },
          tx
        );

      if (roomAfterCheck) {
        return { kind: 'reused' as const, room: roomAfterCheck };
      }

      const created = await chatRepository.createChatRoom(
        {
          communityPostId: post.id,
          roomType: 'COMMUNITY',
          participantIds,
        },
        tx
      );
      return { kind: 'created' as const, room: created };
    },
    { timeout: 15_000 }
  );

  if (txResult.kind === 'reused') {
    return toExistingRoomResult(txResult.room, false);
  }

  try {
    await notificationService.notifyChatRoomOpenedToCounterparts({
      creatorId: authUser.userId,
      participantIds,
      chatRoomId: txResult.room.id,
      roomType: 'COMMUNITY',
    });
  } catch (error) {
    console.error(
      `[createChatRoom] community chat room opened notification failed roomId=${txResult.room.id}`,
      error
    );
  }

  return {
    status: 201,
    data: {
      roomId: txResult.room.id,
      roomType: txResult.room.roomType,
      quoteId: txResult.room.quoteId,
      createdAt: toIsoString(txResult.room.createdAt),
      updatedAt: toIsoString(txResult.room.updatedAt),
    },
  };
};

/**
 * 견적(GENERAL·DESIGNATED) 채팅방을 생성하거나 기존 방을 반환한다.
 */
const createEstimateChatRoom = async (
  authUser: AuthenticatedUser,
  body: CreateEstimateChatRoomBody
): Promise<CreateChatRoomResult> => {
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
    const reused = await reuseOrUpdateExistingRoom(
      {
        room: existingRoom,
        quoteId,
        designatedMoverId,
        targetRoomType: body.roomType,
      },
      prisma
    );
    return toExistingRoomResult(reused.room, reused.quoteUpdated);
  }

  // FOR UPDATE 후 같은 tx에서 기존 방 재조회 → 없으면 생성.
  // runAuditedTransaction: 감사 세션 + extension 중첩 tx 방지 (#265)
  const txResult = await runAuditedTransaction(
    async (tx) => {
      if (estimateRequestId !== undefined) {
        const lockedRequest =
          await chatRepository.findEstimateRequestByIdForUpdate(
            estimateRequestId,
            tx
          );

        if (!lockedRequest) {
          throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
        }

        if (
          !isMessagingAllowedForChatRoom({
            estimateRequestStatus: lockedRequest.status,
          })
        ) {
          throw new AppError('MESSAGING_NOT_ALLOWED');
        }
      }

      const roomAfterLock = await findExistingRoom(
        {
          designatedMoverId,
          quoteId,
          estimateRequestId,
          roomType: body.roomType,
          participantIds,
        },
        tx
      );

      if (roomAfterLock) {
        const reused = await reuseOrUpdateExistingRoom(
          {
            room: roomAfterLock,
            quoteId,
            designatedMoverId,
            targetRoomType: body.roomType,
          },
          tx
        );
        return {
          kind: 'reused' as const,
          room: reused.room,
          quoteUpdated: reused.quoteUpdated,
        };
      }

      const created = await chatRepository.createChatRoom(
        {
          estimateRequestId,
          quoteId,
          designatedMoverId,
          roomType: body.roomType,
          participantIds,
        },
        tx
      );
      return { kind: 'created' as const, room: created };
    },
    { timeout: 15_000 }
  );

  if (txResult.kind === 'reused') {
    return toExistingRoomResult(txResult.room, txResult.quoteUpdated);
  }

  // 신규 생성(201)만 — 기존 방 재사용(200)에서는 발송하지 않음
  try {
    await notificationService.notifyChatRoomOpenedToCounterparts({
      creatorId: authUser.userId,
      participantIds,
      chatRoomId: txResult.room.id,
      roomType: body.roomType,
    });
  } catch (error) {
    console.error(
      `[createChatRoom] chat room opened notification failed roomId=${txResult.room.id}`,
      error
    );
  }

  return {
    status: 201,
    data: {
      roomId: txResult.room.id,
      roomType: txResult.room.roomType,
      quoteId: txResult.room.quoteId,
      createdAt: toIsoString(txResult.room.createdAt),
      updatedAt: toIsoString(txResult.room.updatedAt),
    },
  };
};

/**
 * 채팅방 목록을 조회한다.
 * - 활성 참여(leftAt IS NULL) 방만 포함
 * - 상대가 나간 방도 목록에 유지(partner는 최신 참여 이력 기준)
 * - lastMessage / unreadCount는 최근 joinedAt 이후 메시지만 반영
 * - lastActivityAt(방 생성·재참여·메시지 중 최신) 내림차순 정렬 (#328)
 */
export const getChatRoomList = async (
  authUser: AuthenticatedUser
): Promise<ChatRoomListResult> => {
  const rooms = await chatRepository.findActiveRoomsByUserId(authUser.userId);

  const roomVisibility = rooms
    .map((room) => {
      const myParticipation = room.participants.find(
        (participant) =>
          participant.participantId === authUser.userId &&
          participant.leftAt === null
      );

      if (!myParticipation) {
        return null;
      }

      return {
        room,
        joinedAt: myParticipation.joinedAt,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const roomFilters = roomVisibility.map(({ room, joinedAt }) => ({
    roomId: room.id,
    joinedAt,
  }));

  const partnerRoomFilters = roomVisibility.flatMap(({ room }) => {
    const partnerParticipant = selectPartnerParticipant(
      room.participants,
      authUser.userId
    );

    if (!partnerParticipant) {
      return [];
    }

    return [
      {
        roomId: room.id,
        partnerId: partnerParticipant.participantId,
      },
    ];
  });

  const [lastMessageByRoomId, unreadCountByRoomId, partnerReadStatusByRoomId] =
    await Promise.all([
      chatRepository.findLastMessagesByRooms(roomFilters),
      chatRepository.findUnreadCountsByRooms(authUser.userId, roomFilters),
      chatRepository.findPartnerReadStatusesByRooms(partnerRoomFilters),
    ]);

  const roomListItems = (
    await Promise.all(
      roomVisibility.map(
        async ({ room, joinedAt }): Promise<ChatRoomListItem | null> => {
          const partnerParticipant = selectPartnerParticipant(
            room.participants,
            authUser.userId
          );

          if (!partnerParticipant) {
            return null;
          }

          const partner = partnerParticipant.user;
          const lastMessage = lastMessageByRoomId.get(room.id);
          const partnerReadStatus = partnerReadStatusByRoomId.get(room.id);
          const lastActivityAt = computeChatRoomLastActivityAt({
            roomCreatedAt: room.createdAt,
            joinedAt,
            lastMessageCreatedAt: lastMessage?.createdAt ?? null,
          });

          return {
            roomId: room.id,
            roomType: room.roomType,
            quoteStatus: toQuoteStatus(room.roomType, room.quote),
            partner: toChatRoomPartner(partner, room.roomType),
            lastMessage: lastMessage
              ? {
                  messageId: lastMessage.messageId,
                  senderId: lastMessage.senderId,
                  content: lastMessage.content,
                  messageType: lastMessage.messageType,
                  createdAt: toIsoString(lastMessage.createdAt),
                }
              : null,
            lastActivityAt: toIsoString(lastActivityAt),
            partnerLastReadMessageId:
              partnerReadStatus?.lastReadMessageId ?? null,
            partnerLastReadAt: partnerReadStatus
              ? toIsoString(partnerReadStatus.readAt)
              : null,
            unreadCount: unreadCountByRoomId.get(room.id) ?? 0,
          };
        }
      )
    )
  ).filter((item): item is ChatRoomListItem => item !== null);

  roomListItems.sort(compareChatRoomsByLastActivityDesc);

  return { rooms: roomListItems };
};

/**
 * 활성 참여 중인 모든 채팅방의 미읽음 수를 합산한다.
 * 방별 정책은 목록 API와 동일(마지막 읽음 이후 · 본인 발신 제외 · joinedAt 이후).
 */
export const getUnreadCount = async (
  authUser: AuthenticatedUser
): Promise<UnreadCountResult> => {
  const roomFilters = await chatRepository.findActiveRoomFiltersByUserId(
    authUser.userId
  );
  const unreadCountByRoomId = await chatRepository.findUnreadCountsByRooms(
    authUser.userId,
    roomFilters
  );

  let unreadCount = 0;
  for (const count of unreadCountByRoomId.values()) {
    unreadCount += count;
  }

  return { unreadCount };
};

/**
 * 채팅방 상세 정보를 조회한다.
 * - 활성 참여자(leftAt IS NULL)만 접근 가능
 * - partner는 상대방 유저 정보(활성 우선, 없으면 최근 참여 이력)를 반환
 * - partnerLastReadMessageId는 상대방 읽음 커서(없으면 null)
 * - isPartnerLeft / partnerLeftAt은 상대 참여 row의 leftAt으로 파생 (#314)
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
    (participant) =>
      participant.participantId === authUser.userId &&
      participant.leftAt === null
  );

  if (!isActiveParticipant) {
    throw new AppError('FORBIDDEN');
  }

  const partnerParticipant = selectPartnerParticipant(
    room.participants,
    authUser.userId
  );

  if (!partnerParticipant) {
    throw new AppError('ROOM_NOT_FOUND');
  }

  const partner = partnerParticipant.user;
  const partnerReadStatus = await chatRepository.findPartnerReadStatus(
    roomId,
    partner.id
  );
  const isPartnerLeft = partnerParticipant.leftAt !== null;

  return {
    roomType: room.roomType,
    partner: toChatRoomPartner(partner, room.roomType),
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
    quoteStatus: toQuoteStatus(room.roomType, room.quote),
    isMessagingAllowed: isMessagingAllowedForChatRoom({
      estimateRequestStatus: room.estimateRequest?.status,
      quoteStatus: room.quote?.status,
    }),
    partnerLastReadMessageId: partnerReadStatus?.lastReadMessageId ?? null,
    partnerLastReadAt: partnerReadStatus
      ? toIsoString(partnerReadStatus.readAt)
      : null,
    isPartnerLeft,
    partnerLeftAt:
      isPartnerLeft && partnerParticipant.leftAt
        ? toIsoString(partnerParticipant.leftAt)
        : null,
    updatedAt: toIsoString(room.updatedAt),
  };
};


/**
 * 채팅방에서 나간다.
 * - 활성 참여(leftAt IS NULL) row에 leftAt을 설정한다
 * - 이미 나간 상태면 ALREADY_LEFT, 참여 이력이 없으면 FORBIDDEN
 * - 성공 시 남은 활성 참여자에게 chat:partner-left를 알린다 (#314)
 */
export const leaveChatRoom = async (
  authUser: AuthenticatedUser,
  roomId: number
): Promise<LeaveChatRoomResult> => {
  await assertChatRoomExists(roomId);

  const leftAt = new Date();
  const result = await chatRepository.leaveActiveParticipation(
    roomId,
    authUser.userId,
    leftAt
  );

  if (result.count === 0) {
    const anyParticipation = await chatRepository.findAnyParticipation(
      roomId,
      authUser.userId
    );

    if (anyParticipation) {
      throw new AppError('ALREADY_LEFT');
    }

    throw new AppError('FORBIDDEN', '채팅방 참여 권한이 없습니다.');
  }

  const leftAtIso = toIsoString(leftAt);
  await emitChatPartnerLeft({
    roomId,
    leftAt: leftAtIso,
  });

  return {
    roomId,
    leftAt: leftAtIso,
  };
};
