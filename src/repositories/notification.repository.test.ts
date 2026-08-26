import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Region, type Prisma } from '@prisma/client';
import {
  createManyFanoutNotifications,
  findMoverIdsForNewRequestChunk,
  markAsRead,
  markOutboxFailure,
  type NotificationRow,
} from './notification.repository';

interface FakeNotificationDb {
  notification: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
    findFirst: (args: unknown) => Promise<NotificationRow | null>;
    createMany: (args: unknown) => Promise<{ count: number }>;
  };
  notificationOutbox: {
    update: (args: unknown) => Promise<unknown>;
  };
  moverProfile: {
    findMany: (args: unknown) => Promise<Array<{ userId: string }>>;
  };
}

const asDbClient = (fakeDb: FakeNotificationDb): Prisma.TransactionClient =>
  fakeDb as unknown as Prisma.TransactionClient;

const notificationRow = (
  overrides: Partial<NotificationRow> = {}
): NotificationRow =>
  ({
    id: 1,
    type: 'REVIEW_REQUESTED',
    content: '알림',
    payload: {},
    isRead: false,
    createdAt: new Date('2026-08-26T00:00:00.000Z'),
    quoteId: null,
    estimateRequestId: null,
    commentId: null,
    reviewId: null,
    userReportId: null,
    ...overrides,
  }) as NotificationRow;

const createFakeDb = (
  overrides: Partial<FakeNotificationDb> = {}
): FakeNotificationDb => ({
  notification: {
    updateMany: async () => ({ count: 0 }),
    findFirst: async () => null,
    createMany: async () => ({ count: 0 }),
  },
  notificationOutbox: {
    update: async () => ({}),
  },
  moverProfile: {
    findMany: async () => [],
  },
  ...overrides,
});

describe('markAsRead', () => {
  it('갱신된 행이 없으면 재조회 없이 null을 반환한다', async () => {
    let findFirstCalled = false;
    const fakeDb = createFakeDb({
      notification: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async () => {
          findFirstCalled = true;
          return null;
        },
        createMany: async () => ({ count: 0 }),
      },
    });

    const result = await markAsRead(1, 'user-1', asDbClient(fakeDb));

    assert.equal(result, null);
    assert.equal(findFirstCalled, false);
  });

  it('갱신된 행이 있으면 id·receiverId 조건으로 updateMany 후 해당 알림을 재조회한다', async () => {
    const row = notificationRow({ id: 1, isRead: true });
    let updateManyArgs: unknown;
    const fakeDb = createFakeDb({
      notification: {
        updateMany: async (args) => {
          updateManyArgs = args;
          return { count: 1 };
        },
        findFirst: async () => row,
        createMany: async () => ({ count: 0 }),
      },
    });

    const result = await markAsRead(1, 'user-1', asDbClient(fakeDb));

    assert.deepEqual(updateManyArgs, {
      where: { id: 1, receiverId: 'user-1' },
      data: { isRead: true },
    });
    assert.equal(result, row);
  });
});

describe('markOutboxFailure', () => {
  it('lastError가 1000자를 넘으면 1000자로 잘라서 저장한다', async () => {
    const longError = 'x'.repeat(1500);
    let updateArgs: { data: { lastError: string; status: string } } | undefined;
    const fakeDb = createFakeDb({
      notificationOutbox: {
        update: async (args) => {
          updateArgs = args as typeof updateArgs;
          return {};
        },
      },
    });

    await markOutboxFailure(1, longError, 1, 5, asDbClient(fakeDb));

    assert.equal(updateArgs?.data.lastError.length, 1000);
  });

  it('attempts가 maxAttempts 이상이면 FAILED로 전환한다', async () => {
    let updateArgs: { data: { status: string } } | undefined;
    const fakeDb = createFakeDb({
      notificationOutbox: {
        update: async (args) => {
          updateArgs = args as typeof updateArgs;
          return {};
        },
      },
    });

    await markOutboxFailure(1, 'boom', 5, 5, asDbClient(fakeDb));

    assert.equal(updateArgs?.data.status, 'FAILED');
  });

  it('attempts가 maxAttempts 미만이면 PENDING으로 되돌려 재시도 대기시킨다', async () => {
    let updateArgs: { data: { status: string } } | undefined;
    const fakeDb = createFakeDb({
      notificationOutbox: {
        update: async (args) => {
          updateArgs = args as typeof updateArgs;
          return {};
        },
      },
    });

    await markOutboxFailure(1, 'boom', 2, 5, asDbClient(fakeDb));

    assert.equal(updateArgs?.data.status, 'PENDING');
  });
});

describe('createManyFanoutNotifications', () => {
  it('rows가 비어있으면 db를 호출하지 않고 0을 반환한다', async () => {
    let createManyCalled = false;
    const fakeDb = createFakeDb({
      notification: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async () => null,
        createMany: async () => {
          createManyCalled = true;
          return { count: 0 };
        },
      },
    });

    const result = await createManyFanoutNotifications([], asDbClient(fakeDb));

    assert.equal(result, 0);
    assert.equal(createManyCalled, false);
  });

  it('rows가 있으면 db.notification.createMany를 호출하고 실제 삽입 건수를 반환한다', async () => {
    let createManyArgs: unknown;
    const fakeDb = createFakeDb({
      notification: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async () => null,
        createMany: async (args) => {
          createManyArgs = args;
          return { count: 2 };
        },
      },
    });

    const result = await createManyFanoutNotifications(
      [
        {
          receiverId: 'mover-1',
          type: 'NEW_QUOTE_REQUEST_ARRIVED',
          content: '견적 요청이 도착했어요',
          payload: { customerName: '홍고객' },
          estimateRequestId: 10,
          sourceId: '10',
        },
        {
          receiverId: 'mover-2',
          type: 'NEW_QUOTE_REQUEST_ARRIVED',
          content: '견적 요청이 도착했어요',
          payload: { customerName: '홍고객' },
          estimateRequestId: 10,
          sourceId: '10',
        },
      ],
      asDbClient(fakeDb)
    );

    assert.equal(result, 2);
    assert.ok(createManyArgs);
  });
});

describe('findMoverIdsForNewRequestChunk', () => {
  it('regions가 비어있으면 db를 호출하지 않고 빈 배열을 반환한다', async () => {
    let findManyCalled = false;
    const fakeDb = createFakeDb({
      moverProfile: {
        findMany: async () => {
          findManyCalled = true;
          return [];
        },
      },
    });

    const result = await findMoverIdsForNewRequestChunk(
      { regions: [], moveType: 'HOME', take: 200 },
      asDbClient(fakeDb)
    );

    assert.deepEqual(result, []);
    assert.equal(findManyCalled, false);
  });

  it('regions가 있으면 매칭된 기사 프로필의 userId 목록을 반환한다', async () => {
    const fakeDb = createFakeDb({
      moverProfile: {
        findMany: async () => [{ userId: 'mover-1' }, { userId: 'mover-2' }],
      },
    });

    const result = await findMoverIdsForNewRequestChunk(
      { regions: [Region.SEOUL], moveType: 'HOME', take: 200 },
      asDbClient(fakeDb)
    );

    assert.deepEqual(result, ['mover-1', 'mover-2']);
  });
});
