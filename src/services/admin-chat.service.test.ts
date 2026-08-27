import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { ChatRoomType, MessageType, Prisma, UserType } from '@prisma/client';
import type {
  AdminChatDetailRow,
  AdminChatLastMessageRow,
  AdminChatListRow,
  AdminChatMessageRow,
} from '../repositories/admin-chat.repository';
import * as adminChatRepository from '../repositories/admin-chat.repository';
import type {
  AdminChatDetailQuery,
  AdminChatListQuery,
} from '../schemas/admin-chat.schema';
import * as chatAttachmentUtil from '../utils/chat-attachment.util';
import { AppError } from '../utils/app.error';
import {
  getAdminChatDetail,
  getAdminChatList,
  getAdminChatMessages,
} from './admin-chat.service';

const USER_ID_1 = '11111111-1111-4111-8111-111111111111';
const USER_ID_2 = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = new Date('2026-08-10T00:00:00.000Z');
const UPDATED_AT = new Date('2026-08-15T00:00:00.000Z');
const LAST_MESSAGE_AT = new Date('2026-08-20T00:00:00.000Z');
const JOINED_AT_OLD = new Date('2026-08-01T00:00:00.000Z');
const JOINED_AT_NEW = new Date('2026-08-05T00:00:00.000Z');
const MESSAGE_CREATED_AT = new Date('2026-08-21T00:00:00.000Z');

const defaultListQuery: AdminChatListQuery = {
  page: 1,
  pageSize: 10,
};

const defaultDetailQuery: AdminChatDetailQuery = {};

const adminChatListOrderBy: Prisma.ChatRoomOrderByWithRelationInput[] = [
  { lastMessageAt: { sort: 'desc', nulls: 'last' } },
  { updatedAt: 'desc' },
  { id: 'desc' },
];

const adminChatPrevOrderBy: Prisma.ChatRoomOrderByWithRelationInput[] = [
  { lastMessageAt: { sort: 'asc', nulls: 'first' } },
  { updatedAt: 'asc' },
  { id: 'asc' },
];

const assertChatRoomNotFound = (error: unknown): boolean => {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'ADMIN_CHAT_ROOM_NOT_FOUND');
  return true;
};

type AdminChatParticipantRow = AdminChatListRow['participants'][number];

const buildParticipant = (
  overrides: Partial<AdminChatParticipantRow> & {
    participantId?: string;
    joinedAt?: Date;
  } = {}
): AdminChatParticipantRow => ({
  participantId: USER_ID_1,
  joinedAt: JOINED_AT_NEW,
  leftAt: null,
  user: {
    id: USER_ID_1,
    name: '홍길동',
    nickname: '길동',
    email: 'hong@example.com',
    userType: UserType.CUSTOMER,
    deletedAt: null,
  },
  ...overrides,
});

const buildListRow = (
  overrides: Partial<AdminChatListRow> = {}
): AdminChatListRow => ({
  id: 1,
  roomType: ChatRoomType.GENERAL,
  estimateRequestId: null,
  quoteId: null,
  communityPostId: null,
  lastMessageAt: LAST_MESSAGE_AT,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  participants: [buildParticipant()],
  ...overrides,
});

const buildDetailRow = (
  overrides: Partial<AdminChatDetailRow> = {}
): AdminChatDetailRow => ({
  id: 1,
  roomType: ChatRoomType.GENERAL,
  estimateRequestId: 10,
  quoteId: 20,
  designatedMoverId: 30,
  communityPostId: null,
  lastMessageAt: LAST_MESSAGE_AT,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  participants: [buildParticipant()],
  ...overrides,
});

const buildLastMessage = (
  overrides: Partial<AdminChatLastMessageRow> = {}
): AdminChatLastMessageRow => ({
  id: 100,
  roomId: 1,
  senderId: USER_ID_1,
  content: '안녕하세요',
  messageType: MessageType.TEXT,
  createdAt: MESSAGE_CREATED_AT,
  ...overrides,
});

const buildMessageRow = (
  overrides: Partial<AdminChatMessageRow> = {}
): AdminChatMessageRow => ({
  id: 200,
  roomId: 1,
  senderId: USER_ID_1,
  messageType: MessageType.TEXT,
  content: '마스킹된 내용',
  isFiltered: true,
  createdAt: MESSAGE_CREATED_AT,
  sender: {
    id: USER_ID_1,
    name: '홍길동',
    nickname: '길동',
    email: 'hong@example.com',
    userType: UserType.CUSTOMER,
    deletedAt: null,
  },
  attachments: [],
  rawLog: { rawContent: '원문 내용' },
  ...overrides,
});

describe('getAdminChatList', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('findAdminChatRoomsWithCount에 query를 그대로 전달하고 페이지네이션을 계산한다', async () => {
    let receivedParams: AdminChatListQuery | undefined;
    mock.method(
      adminChatRepository,
      'findAdminChatRoomsWithCount',
      async (params: AdminChatListQuery) => {
        receivedParams = params;
        return { items: [], totalCount: 21 };
      }
    );
    mock.method(
      adminChatRepository,
      'findAdminChatLastMessagesByRoomIds',
      async () => new Map()
    );

    const params: AdminChatListQuery = {
      page: 2,
      pageSize: 10,
      userName: '홍길동',
    };
    const result = await getAdminChatList(params);

    assert.deepEqual(receivedParams, params);
    assert.deepEqual(result.pagination, {
      page: 2,
      pageSize: 10,
      totalCount: 21,
      totalPages: 3,
    });
  });

  it('totalCount가 0이면 totalPages도 0이다', async () => {
    mock.method(
      adminChatRepository,
      'findAdminChatRoomsWithCount',
      async () => ({ items: [], totalCount: 0 })
    );
    mock.method(
      adminChatRepository,
      'findAdminChatLastMessagesByRoomIds',
      async () => new Map()
    );

    const result = await getAdminChatList(defaultListQuery);

    assert.equal(result.pagination.totalPages, 0);
  });

  it('목록이 비어 있으면 findAdminChatLastMessagesByRoomIds([])를 호출한다', async () => {
    let receivedRoomIds: number[] | undefined;
    mock.method(
      adminChatRepository,
      'findAdminChatRoomsWithCount',
      async () => ({ items: [], totalCount: 0 })
    );
    mock.method(
      adminChatRepository,
      'findAdminChatLastMessagesByRoomIds',
      async (roomIds: number[]) => {
        receivedRoomIds = roomIds;
        return new Map();
      }
    );

    await getAdminChatList(defaultListQuery);

    assert.deepEqual(receivedRoomIds, []);
  });

  it('현재 페이지의 채팅방 ID만 모아 배치 조회한다', async () => {
    let receivedRoomIds: number[] | undefined;
    mock.method(
      adminChatRepository,
      'findAdminChatRoomsWithCount',
      async () => ({
        items: [buildListRow({ id: 1 }), buildListRow({ id: 2 })],
        totalCount: 2,
      })
    );
    mock.method(
      adminChatRepository,
      'findAdminChatLastMessagesByRoomIds',
      async (roomIds: number[]) => {
        receivedRoomIds = roomIds;
        return new Map([
          [1, buildLastMessage({ id: 101, roomId: 1 })],
          [2, buildLastMessage({ id: 102, roomId: 2, content: '두 번째 방' })],
        ]);
      }
    );

    const result = await getAdminChatList(defaultListQuery);

    assert.deepEqual(receivedRoomIds, [1, 2]);
    assert.deepEqual(result.items[0]?.lastMessage, {
      id: 101,
      senderId: USER_ID_1,
      content: '안녕하세요',
      messageType: MessageType.TEXT,
      createdAt: MESSAGE_CREATED_AT,
    });
    assert.equal(result.items[1]?.lastMessage?.content, '두 번째 방');
  });

  it('Map에 최근 메시지가 없으면 lastMessage는 null이다', async () => {
    mock.method(
      adminChatRepository,
      'findAdminChatRoomsWithCount',
      async () => ({
        items: [buildListRow({ id: 3 })],
        totalCount: 1,
      })
    );
    mock.method(
      adminChatRepository,
      'findAdminChatLastMessagesByRoomIds',
      async () => new Map()
    );

    const result = await getAdminChatList(defaultListQuery);

    assert.equal(result.items[0]?.lastMessage, null);
  });

  describe('참여자 정규화', () => {
    it('참여자 DTO 필드를 정확히 변환하고 deletedAt은 노출하지 않는다', async () => {
      const leftAt = new Date('2026-08-18T00:00:00.000Z');
      mock.method(
        adminChatRepository,
        'findAdminChatRoomsWithCount',
        async () => ({
          items: [
            buildListRow({
              participants: [
                buildParticipant({
                  leftAt,
                  user: {
                    id: USER_ID_1,
                    name: '홍길동',
                    nickname: '길동',
                    email: 'hong@example.com',
                    userType: UserType.CUSTOMER,
                    deletedAt: null,
                  },
                }),
              ],
            }),
          ],
          totalCount: 1,
        })
      );
      mock.method(
        adminChatRepository,
        'findAdminChatLastMessagesByRoomIds',
        async () => new Map()
      );

      const result = await getAdminChatList(defaultListQuery);
      const participant = result.items[0]?.participants[0];

      assert.deepEqual(participant, {
        id: USER_ID_1,
        name: '홍길동',
        nickname: '길동',
        email: 'hong@example.com',
        userType: UserType.CUSTOMER,
        joinedAt: JOINED_AT_NEW,
        leftAt,
        isDeleted: false,
      });
      assert.equal('deletedAt' in (participant ?? {}), false);
    });

    it('user.deletedAt이 있으면 isDeleted가 true다', async () => {
      const deletedAt = new Date('2026-08-19T00:00:00.000Z');
      mock.method(
        adminChatRepository,
        'findAdminChatRoomsWithCount',
        async () => ({
          items: [
            buildListRow({
              participants: [
                buildParticipant({
                  user: {
                    id: USER_ID_1,
                    name: '홍길동',
                    nickname: '길동',
                    email: 'hong@example.com',
                    userType: UserType.CUSTOMER,
                    deletedAt,
                  },
                }),
              ],
            }),
          ],
          totalCount: 1,
        })
      );
      mock.method(
        adminChatRepository,
        'findAdminChatLastMessagesByRoomIds',
        async () => new Map()
      );

      const result = await getAdminChatList(defaultListQuery);

      assert.equal(result.items[0]?.participants[0]?.isDeleted, true);
    });

    it('같은 participantId는 joinedAt이 가장 최근인 row만 남긴다', async () => {
      mock.method(
        adminChatRepository,
        'findAdminChatRoomsWithCount',
        async () => ({
          items: [
            buildListRow({
              participants: [
                buildParticipant({
                  participantId: USER_ID_1,
                  joinedAt: JOINED_AT_OLD,
                  user: {
                    id: USER_ID_1,
                    name: '이전',
                    nickname: 'old',
                    email: 'old@example.com',
                    userType: UserType.CUSTOMER,
                    deletedAt: null,
                  },
                }),
                buildParticipant({
                  participantId: USER_ID_1,
                  joinedAt: JOINED_AT_NEW,
                  user: {
                    id: USER_ID_1,
                    name: '최신',
                    nickname: 'new',
                    email: 'new@example.com',
                    userType: UserType.CUSTOMER,
                    deletedAt: null,
                  },
                }),
              ],
            }),
          ],
          totalCount: 1,
        })
      );
      mock.method(
        adminChatRepository,
        'findAdminChatLastMessagesByRoomIds',
        async () => new Map()
      );

      const result = await getAdminChatList(defaultListQuery);

      assert.equal(result.items[0]?.participants.length, 1);
      assert.equal(result.items[0]?.participants[0]?.name, '최신');
      assert.equal(result.items[0]?.participants[0]?.joinedAt, JOINED_AT_NEW);
    });

    it('joinedAt이 같으면 나중에 순회한 row를 선택한다', async () => {
      mock.method(
        adminChatRepository,
        'findAdminChatRoomsWithCount',
        async () => ({
          items: [
            buildListRow({
              participants: [
                buildParticipant({
                  participantId: USER_ID_1,
                  joinedAt: JOINED_AT_NEW,
                  user: {
                    id: USER_ID_1,
                    name: '첫번째',
                    nickname: 'first',
                    email: 'first@example.com',
                    userType: UserType.CUSTOMER,
                    deletedAt: null,
                  },
                }),
                buildParticipant({
                  participantId: USER_ID_1,
                  joinedAt: JOINED_AT_NEW,
                  user: {
                    id: USER_ID_1,
                    name: '두번째',
                    nickname: 'second',
                    email: 'second@example.com',
                    userType: UserType.CUSTOMER,
                    deletedAt: null,
                  },
                }),
              ],
            }),
          ],
          totalCount: 1,
        })
      );
      mock.method(
        adminChatRepository,
        'findAdminChatLastMessagesByRoomIds',
        async () => new Map()
      );

      const result = await getAdminChatList(defaultListQuery);

      assert.equal(result.items[0]?.participants[0]?.name, '두번째');
    });

    it('서로 다른 참여자는 모두 유지한다', async () => {
      mock.method(
        adminChatRepository,
        'findAdminChatRoomsWithCount',
        async () => ({
          items: [
            buildListRow({
              participants: [
                buildParticipant({ participantId: USER_ID_1 }),
                buildParticipant({
                  participantId: USER_ID_2,
                  user: {
                    id: USER_ID_2,
                    name: '김기사',
                    nickname: 'mover',
                    email: 'mover@example.com',
                    userType: UserType.MOVER,
                    deletedAt: null,
                  },
                }),
              ],
            }),
          ],
          totalCount: 1,
        })
      );
      mock.method(
        adminChatRepository,
        'findAdminChatLastMessagesByRoomIds',
        async () => new Map()
      );

      const result = await getAdminChatList(defaultListQuery);

      assert.equal(result.items[0]?.participants.length, 2);
    });

    it('참여자가 없는 채팅방은 빈 배열을 반환한다', async () => {
      mock.method(
        adminChatRepository,
        'findAdminChatRoomsWithCount',
        async () => ({
          items: [buildListRow({ participants: [] })],
          totalCount: 1,
        })
      );
      mock.method(
        adminChatRepository,
        'findAdminChatLastMessagesByRoomIds',
        async () => new Map()
      );

      const result = await getAdminChatList(defaultListQuery);

      assert.deepEqual(result.items[0]?.participants, []);
    });
  });
});

describe('getAdminChatDetail', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('채팅방이 없으면 ADMIN_CHAT_ROOM_NOT_FOUND를 던진다', async () => {
    mock.method(
      adminChatRepository,
      'findAdminChatRoomDetail',
      async () => null
    );

    await assert.rejects(
      () => getAdminChatDetail(99, defaultDetailQuery),
      assertChatRoomNotFound
    );
  });

  it('상세 필드와 참여자 정규화 결과를 반환한다', async () => {
    mock.method(adminChatRepository, 'findAdminChatRoomDetail', async () =>
      buildDetailRow()
    );
    mock.method(adminChatRepository, 'findAdminChatFirst', async () => ({
      id: 1,
    }));

    const result = await getAdminChatDetail(1, defaultDetailQuery);

    assert.deepEqual(
      {
        id: result.id,
        roomType: result.roomType,
        estimateRequestId: result.estimateRequestId,
        quoteId: result.quoteId,
        designatedMoverId: result.designatedMoverId,
        communityPostId: result.communityPostId,
        lastMessageAt: result.lastMessageAt,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      },
      {
        id: 1,
        roomType: ChatRoomType.GENERAL,
        estimateRequestId: 10,
        quoteId: 20,
        designatedMoverId: 30,
        communityPostId: null,
        lastMessageAt: LAST_MESSAGE_AT,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      }
    );
    assert.equal(result.participants.length, 1);
    assert.equal(result.participants[0]?.isDeleted, false);
  });

  it('현재 채팅방이 목록 필터 밖이면 prevId와 nextId가 null이고 이전·다음 조회를 하지 않는다', async () => {
    let findFirstCallCount = 0;

    mock.method(adminChatRepository, 'findAdminChatRoomDetail', async () =>
      buildDetailRow()
    );
    mock.method(adminChatRepository, 'findAdminChatFirst', async () => {
      findFirstCallCount += 1;
      return null;
    });

    const result = await getAdminChatDetail(1, defaultDetailQuery);

    assert.equal(findFirstCallCount, 1);
    assert.equal(result.prevId, null);
    assert.equal(result.nextId, null);
  });

  describe('lastMessageAt이 있는 채팅방', () => {
    const current = {
      id: 5,
      lastMessageAt: LAST_MESSAGE_AT,
      updatedAt: UPDATED_AT,
    };

    it('sort=DESC 기준 이전·다음 where와 정렬을 사용한다', async () => {
      const neighborCalls: Array<{
        where: Prisma.ChatRoomWhereInput;
        orderBy: Prisma.ChatRoomOrderByWithRelationInput[];
      }> = [];
      let callIndex = 0;

      mock.method(adminChatRepository, 'findAdminChatRoomDetail', async () =>
        buildDetailRow(current)
      );
      mock.method(
        adminChatRepository,
        'findAdminChatFirst',
        async (
          where: Prisma.ChatRoomWhereInput,
          orderBy: Prisma.ChatRoomOrderByWithRelationInput[]
        ) => {
          callIndex += 1;
          if (callIndex === 1) {
            return { id: current.id };
          }
          neighborCalls.push({ where, orderBy });
          return null;
        }
      );

      await getAdminChatDetail(5, defaultDetailQuery);

      assert.equal(neighborCalls.length, 2);
      assert.deepEqual(neighborCalls[0]?.orderBy, adminChatPrevOrderBy);
      assert.deepEqual(neighborCalls[1]?.orderBy, adminChatListOrderBy);
      assert.deepEqual(neighborCalls[0]?.where, {
        AND: [
          adminChatRepository.buildAdminChatListWhere(defaultDetailQuery),
          {
            OR: [
              { lastMessageAt: { gt: LAST_MESSAGE_AT } },
              { lastMessageAt: LAST_MESSAGE_AT, updatedAt: { gt: UPDATED_AT } },
              {
                lastMessageAt: LAST_MESSAGE_AT,
                updatedAt: UPDATED_AT,
                id: { gt: current.id },
              },
            ],
          },
        ],
      });
      assert.deepEqual(neighborCalls[1]?.where, {
        AND: [
          adminChatRepository.buildAdminChatListWhere(defaultDetailQuery),
          {
            OR: [
              { lastMessageAt: { lt: LAST_MESSAGE_AT } },
              { lastMessageAt: LAST_MESSAGE_AT, updatedAt: { lt: UPDATED_AT } },
              {
                lastMessageAt: LAST_MESSAGE_AT,
                updatedAt: UPDATED_AT,
                id: { lt: current.id },
              },
              { lastMessageAt: null },
            ],
          },
        ],
      });
    });
  });

  describe('lastMessageAt이 null인 채팅방', () => {
    const current = {
      id: 8,
      lastMessageAt: null,
      updatedAt: UPDATED_AT,
    };

    it('null 방 기준 이전·다음 where를 사용한다', async () => {
      const neighborCalls: Array<{
        where: Prisma.ChatRoomWhereInput;
        orderBy: Prisma.ChatRoomOrderByWithRelationInput[];
      }> = [];
      let callIndex = 0;

      mock.method(adminChatRepository, 'findAdminChatRoomDetail', async () =>
        buildDetailRow({
          id: current.id,
          lastMessageAt: null,
          updatedAt: current.updatedAt,
        })
      );
      mock.method(
        adminChatRepository,
        'findAdminChatFirst',
        async (
          where: Prisma.ChatRoomWhereInput,
          orderBy: Prisma.ChatRoomOrderByWithRelationInput[]
        ) => {
          callIndex += 1;
          if (callIndex === 1) {
            return { id: current.id };
          }
          neighborCalls.push({ where, orderBy });
          return null;
        }
      );

      await getAdminChatDetail(8, defaultDetailQuery);

      assert.deepEqual(neighborCalls[0]?.where, {
        AND: [
          adminChatRepository.buildAdminChatListWhere(defaultDetailQuery),
          {
            OR: [
              { lastMessageAt: { not: null } },
              { lastMessageAt: null, updatedAt: { gt: UPDATED_AT } },
              {
                lastMessageAt: null,
                updatedAt: UPDATED_AT,
                id: { gt: current.id },
              },
            ],
          },
        ],
      });
      assert.deepEqual(neighborCalls[1]?.where, {
        AND: [
          adminChatRepository.buildAdminChatListWhere(defaultDetailQuery),
          {
            OR: [
              { lastMessageAt: null, updatedAt: { lt: UPDATED_AT } },
              {
                lastMessageAt: null,
                updatedAt: UPDATED_AT,
                id: { lt: current.id },
              },
            ],
          },
        ],
      });
    });
  });

  describe('이전·다음 채팅방 결과', () => {
    it('이전·다음 방이 모두 있으면 두 ID를 반환한다', async () => {
      const responses: Array<{ id: number } | null> = [
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ];
      let responseIndex = 0;

      mock.method(adminChatRepository, 'findAdminChatRoomDetail', async () =>
        buildDetailRow()
      );
      mock.method(adminChatRepository, 'findAdminChatFirst', async () => {
        const response = responses[responseIndex];
        responseIndex += 1;
        return response ?? null;
      });

      const result = await getAdminChatDetail(1, defaultDetailQuery);

      assert.equal(result.prevId, 2);
      assert.equal(result.nextId, 3);
    });

    it('이전 방만 있으면 prevId만 반환한다', async () => {
      const responses: Array<{ id: number } | null> = [
        { id: 1 },
        { id: 2 },
        null,
      ];
      let responseIndex = 0;

      mock.method(adminChatRepository, 'findAdminChatRoomDetail', async () =>
        buildDetailRow()
      );
      mock.method(adminChatRepository, 'findAdminChatFirst', async () => {
        const response = responses[responseIndex];
        responseIndex += 1;
        return response ?? null;
      });

      const result = await getAdminChatDetail(1, defaultDetailQuery);

      assert.equal(result.prevId, 2);
      assert.equal(result.nextId, null);
    });

    it('다음 방만 있으면 nextId만 반환한다', async () => {
      const responses: Array<{ id: number } | null> = [
        { id: 1 },
        null,
        { id: 3 },
      ];
      let responseIndex = 0;

      mock.method(adminChatRepository, 'findAdminChatRoomDetail', async () =>
        buildDetailRow()
      );
      mock.method(adminChatRepository, 'findAdminChatFirst', async () => {
        const response = responses[responseIndex];
        responseIndex += 1;
        return response ?? null;
      });

      const result = await getAdminChatDetail(1, defaultDetailQuery);

      assert.equal(result.prevId, null);
      assert.equal(result.nextId, 3);
    });

    it('이전·다음 방이 모두 없으면 null을 반환한다', async () => {
      const responses: Array<{ id: number } | null> = [{ id: 1 }, null, null];
      let responseIndex = 0;

      mock.method(adminChatRepository, 'findAdminChatRoomDetail', async () =>
        buildDetailRow()
      );
      mock.method(adminChatRepository, 'findAdminChatFirst', async () => {
        const response = responses[responseIndex];
        responseIndex += 1;
        return response ?? null;
      });

      const result = await getAdminChatDetail(1, defaultDetailQuery);

      assert.equal(result.prevId, null);
      assert.equal(result.nextId, null);
    });
  });
});

describe('getAdminChatMessages', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('채팅방이 없으면 ADMIN_CHAT_ROOM_NOT_FOUND를 던지고 메시지 Repository를 호출하지 않는다', async () => {
    let messagesCalled = false;

    mock.method(adminChatRepository, 'findAdminChatRoomId', async () => null);
    mock.method(
      adminChatRepository,
      'findAdminChatMessagesByCursor',
      async () => {
        messagesCalled = true;
        return { messages: [], hasNext: false };
      }
    );

    await assert.rejects(
      () => getAdminChatMessages(99, { limit: 30 }),
      assertChatRoomNotFound
    );
    assert.equal(messagesCalled, false);
  });

  it('findAdminChatMessagesByCursor에 roomId, before, limit을 전달한다', async () => {
    let receivedParams:
      | {
          roomId: number;
          before?: number;
          limit: number;
        }
      | undefined;

    mock.method(adminChatRepository, 'findAdminChatRoomId', async () => ({
      id: 1,
    }));
    mock.method(
      adminChatRepository,
      'findAdminChatMessagesByCursor',
      async (params: { roomId: number; before?: number; limit: number }) => {
        receivedParams = params;
        return { messages: [], hasNext: false };
      }
    );
    mock.method(chatAttachmentUtil, 'toAttachmentViewUrls', async () => []);

    await getAdminChatMessages(1, { limit: 20, before: 150 });

    assert.deepEqual(receivedParams, {
      roomId: 1,
      before: 150,
      limit: 20,
    });
  });

  it('before가 없어도 Repository에 limit만 전달한다', async () => {
    let receivedParams:
      | {
          roomId: number;
          before?: number;
          limit: number;
        }
      | undefined;

    mock.method(adminChatRepository, 'findAdminChatRoomId', async () => ({
      id: 1,
    }));
    mock.method(
      adminChatRepository,
      'findAdminChatMessagesByCursor',
      async (params: { roomId: number; before?: number; limit: number }) => {
        receivedParams = params;
        return { messages: [], hasNext: false };
      }
    );
    mock.method(chatAttachmentUtil, 'toAttachmentViewUrls', async () => []);

    await getAdminChatMessages(1, { limit: 30 });

    assert.deepEqual(receivedParams, {
      roomId: 1,
      before: undefined,
      limit: 30,
    });
  });

  it('메시지 DTO와 발신자, rawContent, 첨부 파일을 변환한다', async () => {
    const deletedAt = new Date('2026-08-22T00:00:00.000Z');
    const attachmentCalls: Array<{ fileKey: string }[]> = [];

    mock.method(adminChatRepository, 'findAdminChatRoomId', async () => ({
      id: 1,
    }));
    mock.method(
      adminChatRepository,
      'findAdminChatMessagesByCursor',
      async () => ({
        messages: [
          buildMessageRow({
            id: 301,
            content: '마스킹',
            isFiltered: true,
            rawLog: { rawContent: '원문' },
            attachments: [{ fileKey: 'chat/a.png' }],
            sender: {
              id: USER_ID_1,
              name: '홍길동',
              nickname: '길동',
              email: 'hong@example.com',
              userType: UserType.CUSTOMER,
              deletedAt,
            },
          }),
          buildMessageRow({
            id: 300,
            content: '일반',
            isFiltered: false,
            rawLog: null,
            attachments: [],
          }),
        ],
        hasNext: true,
      })
    );
    mock.method(
      chatAttachmentUtil,
      'toAttachmentViewUrls',
      async (attachments: chatAttachmentUtil.ChatAttachmentFileKey[]) => {
        attachmentCalls.push(attachments);
        return attachments.map(
          (attachment: chatAttachmentUtil.ChatAttachmentFileKey) =>
            `https://cdn.example.com/${attachment.fileKey}`
        );
      }
    );

    const result = await getAdminChatMessages(1, { limit: 30 });

    assert.equal(result.messages.length, 2);
    assert.deepEqual(result.messages[0], {
      id: 301,
      senderId: USER_ID_1,
      sender: {
        id: USER_ID_1,
        name: '홍길동',
        nickname: '길동',
        email: 'hong@example.com',
        userType: UserType.CUSTOMER,
        isDeleted: true,
      },
      messageType: MessageType.TEXT,
      content: '마스킹',
      rawContent: '원문',
      isFiltered: true,
      attachments: ['https://cdn.example.com/chat/a.png'],
      createdAt: MESSAGE_CREATED_AT,
    });
    assert.equal('deletedAt' in result.messages[0].sender, false);
    assert.equal(result.messages[1]?.rawContent, null);
    assert.deepEqual(result.messages[1]?.attachments, []);
    assert.deepEqual(attachmentCalls[0], [{ fileKey: 'chat/a.png' }]);
    assert.deepEqual(attachmentCalls[1], []);
    assert.deepEqual(result.meta, {
      hasNext: true,
      nextCursor: 300,
    });
  });

  it('hasNext가 false이면 nextCursor는 null이다', async () => {
    mock.method(adminChatRepository, 'findAdminChatRoomId', async () => ({
      id: 1,
    }));
    mock.method(
      adminChatRepository,
      'findAdminChatMessagesByCursor',
      async () => ({
        messages: [buildMessageRow({ id: 400 })],
        hasNext: false,
      })
    );
    mock.method(chatAttachmentUtil, 'toAttachmentViewUrls', async () => []);

    const result = await getAdminChatMessages(1, { limit: 30 });

    assert.deepEqual(result.meta, {
      hasNext: false,
      nextCursor: null,
    });
  });

  it('메시지가 비어 있으면 nextCursor는 null이다', async () => {
    mock.method(adminChatRepository, 'findAdminChatRoomId', async () => ({
      id: 1,
    }));
    mock.method(
      adminChatRepository,
      'findAdminChatMessagesByCursor',
      async () => ({
        messages: [],
        hasNext: false,
      })
    );
    mock.method(chatAttachmentUtil, 'toAttachmentViewUrls', async () => []);

    const result = await getAdminChatMessages(1, { limit: 30 });

    assert.deepEqual(result.messages, []);
    assert.deepEqual(result.meta, {
      hasNext: false,
      nextCursor: null,
    });
  });

  it('Repository가 반환한 메시지 순서를 유지한다', async () => {
    mock.method(adminChatRepository, 'findAdminChatRoomId', async () => ({
      id: 1,
    }));
    mock.method(
      adminChatRepository,
      'findAdminChatMessagesByCursor',
      async () => ({
        messages: [
          buildMessageRow({ id: 502, content: '최신' }),
          buildMessageRow({ id: 501, content: '이전' }),
        ],
        hasNext: false,
      })
    );
    mock.method(chatAttachmentUtil, 'toAttachmentViewUrls', async () => []);

    const result = await getAdminChatMessages(1, { limit: 30 });

    assert.deepEqual(
      result.messages.map((message) => message.id),
      [502, 501]
    );
  });
});
