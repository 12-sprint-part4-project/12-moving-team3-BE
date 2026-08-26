import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import * as auditContext from '../lib/audit-context';
import * as notificationRepository from '../repositories/notification.repository';
import type {
  NotificationRow,
  QuoteNotificationContext,
} from '../repositories/notification.repository';
import { AppError } from '../utils/app.error';
import {
  createMoveDayReminderIfAbsent,
  createNotification,
  markNotificationAsRead,
  notifyDesignatedQuoteRejectedByQuoteId,
  notifyQuoteConfirmedByQuoteId,
  notifyQuoteOfferArrivedByQuoteId,
  notifyReviewRequested,
  processNotificationOutboxTick,
} from './notification.service';
import * as notificationSse from './notification-sse.service';

const runTxImmediately = async <T>(
  fn: (tx: unknown) => Promise<T>
): Promise<T> => fn({});

const noopPublish = (): void => {
  // no-op — SSE 부수효과 없이 알림 도메인 로직만 검증
};

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

const quoteContext = (
  overrides: Partial<QuoteNotificationContext> = {}
): QuoteNotificationContext =>
  ({
    quoteId: 1,
    estimateRequestId: 10,
    customerId: 'customer-1',
    customerName: '홍고객',
    moverId: 'mover-1',
    moverName: '김기사',
    moveType: 'HOME',
    isDesignated: false,
    status: 'PENDING',
    ...overrides,
  }) as QuoteNotificationContext;

describe('createNotification', () => {
  afterEach(() => mock.restoreAll());

  it('tx가 없으면 생성 직후 SSE로 notification·unread-count를 즉시 푸시한다', async () => {
    mock.method(notificationRepository, 'create', async () =>
      notificationRow({ id: 1 })
    );
    mock.method(
      notificationRepository,
      'countUnreadByReceiver',
      async () => 3
    );
    const notified: string[] = [];
    mock.method(notificationSse, 'publishNotification', (userId: string) => {
      notified.push(userId);
    });
    const unreadPublished: Array<{ userId: string; count: number }> = [];
    mock.method(
      notificationSse,
      'publishUnreadCount',
      (userId: string, count: number) => {
        unreadPublished.push({ userId, count });
      }
    );

    const result = await createNotification({
      receiverId: 'user-1',
      type: 'REVIEW_REQUESTED',
      payload: { moveTypeLabel: '소형이사' },
    });

    assert.equal(result.id, 1);
    assert.deepEqual(notified, ['user-1']);
    assert.deepEqual(unreadPublished, [{ userId: 'user-1', count: 3 }]);
  });

  it('tx가 있으면 SSE 푸시를 건너뛴다', async () => {
    mock.method(notificationRepository, 'create', async () =>
      notificationRow()
    );
    let publishCalled = false;
    mock.method(notificationSse, 'publishNotification', () => {
      publishCalled = true;
    });

    await createNotification({
      receiverId: 'user-1',
      type: 'REVIEW_REQUESTED',
      payload: {},
      tx: {} as unknown as Parameters<typeof createNotification>[0]['tx'],
    });

    assert.equal(publishCalled, false);
  });
});

describe('markNotificationAsRead', () => {
  afterEach(() => mock.restoreAll());

  it('대상이 없으면 NOTIFICATION_NOT_FOUND를 던진다', async () => {
    mock.method(notificationRepository, 'markAsRead', async () => null);

    await assert.rejects(
      markNotificationAsRead(1, 'user-1'),
      (error: unknown) =>
        error instanceof AppError && error.code === 'NOTIFICATION_NOT_FOUND'
    );
  });

  it('성공하면 unread-count를 SSE로 다시 푸시한다', async () => {
    mock.method(notificationRepository, 'markAsRead', async () =>
      notificationRow({ id: 5, isRead: true })
    );
    mock.method(
      notificationRepository,
      'countUnreadByReceiver',
      async () => 1
    );
    const unreadPublished: Array<{ userId: string; count: number }> = [];
    mock.method(
      notificationSse,
      'publishUnreadCount',
      (userId: string, count: number) => {
        unreadPublished.push({ userId, count });
      }
    );

    const result = await markNotificationAsRead(5, 'user-1');

    assert.equal(result.id, 5);
    assert.deepEqual(unreadPublished, [{ userId: 'user-1', count: 1 }]);
  });
});

describe('notifyQuoteConfirmedByQuoteId', () => {
  afterEach(() => mock.restoreAll());

  it('견적 컨텍스트가 없으면 아무 것도 생성하지 않는다', async () => {
    mock.method(
      notificationRepository,
      'findQuoteNotificationContext',
      async () => null
    );
    let createCalled = false;
    mock.method(notificationRepository, 'create', async () => {
      createCalled = true;
      return notificationRow();
    });

    await notifyQuoteConfirmedByQuoteId(1);

    assert.equal(createCalled, false);
  });

  it('기사=고객(자기 자신)이면 기사 알림은 생성하지 않는다', async () => {
    mock.method(
      notificationRepository,
      'findQuoteNotificationContext',
      async () => quoteContext({ moverId: 'customer-1' })
    );
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    let createCallCount = 0;
    mock.method(notificationRepository, 'create', async () => {
      createCallCount += 1;
      return notificationRow({ id: createCallCount });
    });
    mock.method(
      notificationRepository,
      'countUnreadByReceiver',
      async () => 0
    );
    mock.method(notificationSse, 'publishNotification', noopPublish);
    mock.method(notificationSse, 'publishUnreadCount', noopPublish);

    await notifyQuoteConfirmedByQuoteId(1);

    assert.equal(createCallCount, 1);
  });

  it('고객과 기사가 다르면 둘 다 생성하고 커밋 후 각각 SSE로 푸시한다', async () => {
    mock.method(
      notificationRepository,
      'findQuoteNotificationContext',
      async () => quoteContext()
    );
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    let createCallCount = 0;
    mock.method(notificationRepository, 'create', async () => {
      createCallCount += 1;
      return notificationRow({ id: createCallCount });
    });
    mock.method(
      notificationRepository,
      'countUnreadByReceiver',
      async () => 0
    );
    const publishedTo: string[] = [];
    mock.method(notificationSse, 'publishNotification', (userId: string) => {
      publishedTo.push(userId);
    });
    mock.method(notificationSse, 'publishUnreadCount', noopPublish);

    await notifyQuoteConfirmedByQuoteId(1);

    assert.equal(createCallCount, 2);
    assert.deepEqual(publishedTo.sort(), ['customer-1', 'mover-1']);
  });
});

describe('notifyQuoteOfferArrivedByQuoteId', () => {
  afterEach(() => mock.restoreAll());

  it('moverId가 없으면 null을 반환한다', async () => {
    mock.method(
      notificationRepository,
      'findQuoteNotificationContext',
      async () => quoteContext({ moverId: null })
    );

    assert.equal(await notifyQuoteOfferArrivedByQuoteId(1), null);
  });

  it('status가 PENDING이 아니면 null을 반환한다', async () => {
    mock.method(
      notificationRepository,
      'findQuoteNotificationContext',
      async () => quoteContext({ status: 'CONFIRMED' })
    );

    assert.equal(await notifyQuoteOfferArrivedByQuoteId(1), null);
  });

  it('정상이면 고객에게 견적 도착 알림을 생성한다', async () => {
    mock.method(
      notificationRepository,
      'findQuoteNotificationContext',
      async () => quoteContext({ status: 'PENDING' })
    );
    mock.method(notificationRepository, 'create', async () =>
      notificationRow({ id: 9 })
    );
    mock.method(
      notificationRepository,
      'countUnreadByReceiver',
      async () => 0
    );
    mock.method(notificationSse, 'publishNotification', noopPublish);
    mock.method(notificationSse, 'publishUnreadCount', noopPublish);

    const result = await notifyQuoteOfferArrivedByQuoteId(1);

    assert.equal(result?.id, 9);
  });
});

describe('notifyDesignatedQuoteRejectedByQuoteId', () => {
  afterEach(() => mock.restoreAll());

  it('moverId가 없으면 null을 반환한다', async () => {
    mock.method(
      notificationRepository,
      'findQuoteNotificationContext',
      async () => quoteContext({ moverId: null, status: 'REJECTED' })
    );

    assert.equal(await notifyDesignatedQuoteRejectedByQuoteId(1), null);
  });

  it('status가 REJECTED가 아니면 null을 반환한다', async () => {
    mock.method(
      notificationRepository,
      'findQuoteNotificationContext',
      async () =>
        quoteContext({ status: 'PENDING', isDesignated: true })
    );

    assert.equal(await notifyDesignatedQuoteRejectedByQuoteId(1), null);
  });

  it('지정 견적이 아니면(isDesignated:false) null을 반환한다', async () => {
    mock.method(
      notificationRepository,
      'findQuoteNotificationContext',
      async () =>
        quoteContext({ status: 'REJECTED', isDesignated: false })
    );

    assert.equal(await notifyDesignatedQuoteRejectedByQuoteId(1), null);
  });

  it('지정 견적이 반려되면 고객에게 알림을 생성한다', async () => {
    mock.method(
      notificationRepository,
      'findQuoteNotificationContext',
      async () => quoteContext({ status: 'REJECTED', isDesignated: true })
    );
    mock.method(notificationRepository, 'create', async () =>
      notificationRow({ id: 7 })
    );
    mock.method(
      notificationRepository,
      'countUnreadByReceiver',
      async () => 0
    );
    mock.method(notificationSse, 'publishNotification', noopPublish);
    mock.method(notificationSse, 'publishUnreadCount', noopPublish);

    const result = await notifyDesignatedQuoteRejectedByQuoteId(1);

    assert.equal(result?.id, 7);
  });
});

describe('createMoveDayReminderIfAbsent', () => {
  afterEach(() => mock.restoreAll());

  it('이미 존재하면 null을 반환하고 생성하지 않는다', async () => {
    mock.method(
      notificationRepository,
      'existsByReceiverTypeAndEstimate',
      async () => true
    );
    let createCalled = false;
    mock.method(notificationRepository, 'create', async () => {
      createCalled = true;
      return notificationRow();
    });

    const result = await createMoveDayReminderIfAbsent({
      receiverId: 'user-1',
      type: 'CUSTOMER_MOVE_DAY_REMINDER',
      estimateRequestId: 1,
      payload: {},
    });

    assert.equal(result, null);
    assert.equal(createCalled, false);
  });

  it('없으면 생성한다', async () => {
    mock.method(
      notificationRepository,
      'existsByReceiverTypeAndEstimate',
      async () => false
    );
    mock.method(notificationRepository, 'create', async () =>
      notificationRow({ id: 3 })
    );
    mock.method(
      notificationRepository,
      'countUnreadByReceiver',
      async () => 0
    );
    mock.method(notificationSse, 'publishNotification', noopPublish);
    mock.method(notificationSse, 'publishUnreadCount', noopPublish);

    const result = await createMoveDayReminderIfAbsent({
      receiverId: 'user-1',
      type: 'CUSTOMER_MOVE_DAY_REMINDER',
      estimateRequestId: 1,
      payload: {},
    });

    assert.equal(result?.id, 3);
  });
});

describe('notifyReviewRequested', () => {
  afterEach(() => mock.restoreAll());

  it('이미 REVIEW_REQUESTED가 있으면 null을 반환하고 생성하지 않는다', async () => {
    mock.method(
      notificationRepository,
      'existsByReceiverTypeAndEstimate',
      async () => true
    );
    let createCalled = false;
    mock.method(notificationRepository, 'create', async () => {
      createCalled = true;
      return notificationRow();
    });

    const result = await notifyReviewRequested({
      customerId: 'user-1',
      moveType: 'HOME',
      estimateRequestId: 1,
    });

    assert.equal(result, null);
    assert.equal(createCalled, false);
  });
});

type FakeOutboxJob = Awaited<
  ReturnType<typeof notificationRepository.claimOutboxJob>
>;

const claimJob = (job: {
  id: number;
  jobType: 'NEW_QUOTE_REQUEST_FANOUT';
  sourceId: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  cursorUserId: string | null;
  attempts: number;
}): FakeOutboxJob => job as unknown as FakeOutboxJob;

/** 첫 claim은 주어진 잡을 반환하고, 그 뒤로는 null(틱 종료)을 반환한다 */
const claimOnceThenNull = (job: FakeOutboxJob) => {
  let callCount = 0;
  return async (): Promise<FakeOutboxJob> => {
    callCount += 1;
    return callCount === 1 ? job : (null as unknown as FakeOutboxJob);
  };
};

describe('processNotificationOutboxTick', () => {
  afterEach(() => mock.restoreAll());

  it('claim할 잡이 없으면 즉시 종료한다', async () => {
    let claimCallCount = 0;
    mock.method(notificationRepository, 'claimOutboxJob', async () => {
      claimCallCount += 1;
      return null;
    });

    await processNotificationOutboxTick();

    assert.equal(claimCallCount, 1);
  });

  it('FAILED 상태로 claim된 잡은 처리하지 않고, 다음 claim의 excludeIds에 포함시킨다', async () => {
    const receivedExcludeIds: number[][] = [];
    let call = 0;
    mock.method(
      notificationRepository,
      'claimOutboxJob',
      async (options: { excludeIds?: readonly number[] } = {}) => {
        receivedExcludeIds.push([...(options.excludeIds ?? [])]);
        call += 1;
        if (call === 1) {
          return claimJob({
            id: 1,
            jobType: 'NEW_QUOTE_REQUEST_FANOUT',
            sourceId: '1',
            status: 'FAILED',
            cursorUserId: null,
            attempts: 5,
          });
        }
        return null;
      }
    );

    await processNotificationOutboxTick();

    assert.deepEqual(receivedExcludeIds, [[], [1]]);
  });

  it('대상 견적요청이 없으면 DONE 처리한다', async () => {
    mock.method(
      notificationRepository,
      'claimOutboxJob',
      claimOnceThenNull(
        claimJob({
          id: 2,
          jobType: 'NEW_QUOTE_REQUEST_FANOUT',
          sourceId: '99',
          status: 'PROCESSING',
          cursorUserId: null,
          attempts: 1,
        })
      )
    );
    mock.method(
      notificationRepository,
      'findEstimateRequestForFanout',
      async () => null
    );
    let doneCalledWith: number | undefined;
    mock.method(notificationRepository, 'markOutboxDone', async (id: number) => {
      doneCalledWith = id;
    });

    await processNotificationOutboxTick();

    assert.equal(doneCalledWith, 2);
  });

  it('SUBMITTED 상태가 아니면 DONE 처리한다', async () => {
    mock.method(
      notificationRepository,
      'claimOutboxJob',
      claimOnceThenNull(
        claimJob({
          id: 3,
          jobType: 'NEW_QUOTE_REQUEST_FANOUT',
          sourceId: '10',
          status: 'PROCESSING',
          cursorUserId: null,
          attempts: 1,
        })
      )
    );
    mock.method(notificationRepository, 'findEstimateRequestForFanout', async () => ({
      id: 10,
      userId: 'user-1',
      status: 'EXPIRED',
      moveType: 'HOME',
      departureAddress: '서울특별시 강남구',
      arrivalAddress: '경기도 성남시',
    }));
    let doneCalledWith: number | undefined;
    mock.method(notificationRepository, 'markOutboxDone', async (id: number) => {
      doneCalledWith = id;
    });

    await processNotificationOutboxTick();

    assert.equal(doneCalledWith, 3);
  });

  it('moveType이 없으면 DONE 처리한다', async () => {
    mock.method(
      notificationRepository,
      'claimOutboxJob',
      claimOnceThenNull(
        claimJob({
          id: 4,
          jobType: 'NEW_QUOTE_REQUEST_FANOUT',
          sourceId: '11',
          status: 'PROCESSING',
          cursorUserId: null,
          attempts: 1,
        })
      )
    );
    mock.method(notificationRepository, 'findEstimateRequestForFanout', async () => ({
      id: 11,
      userId: 'user-1',
      status: 'SUBMITTED',
      moveType: null,
      departureAddress: '서울특별시 강남구',
      arrivalAddress: '경기도 성남시',
    }));
    let doneCalledWith: number | undefined;
    mock.method(notificationRepository, 'markOutboxDone', async (id: number) => {
      doneCalledWith = id;
    });

    await processNotificationOutboxTick();

    assert.equal(doneCalledWith, 4);
  });

  it('매칭되는 서비스 지역이 없으면 DONE 처리한다', async () => {
    mock.method(
      notificationRepository,
      'claimOutboxJob',
      claimOnceThenNull(
        claimJob({
          id: 5,
          jobType: 'NEW_QUOTE_REQUEST_FANOUT',
          sourceId: '12',
          status: 'PROCESSING',
          cursorUserId: null,
          attempts: 1,
        })
      )
    );
    mock.method(notificationRepository, 'findEstimateRequestForFanout', async () => ({
      id: 12,
      userId: 'user-1',
      status: 'SUBMITTED',
      moveType: 'HOME',
      departureAddress: null,
      arrivalAddress: null,
    }));
    let doneCalledWith: number | undefined;
    mock.method(notificationRepository, 'markOutboxDone', async (id: number) => {
      doneCalledWith = id;
    });

    await processNotificationOutboxTick();

    assert.equal(doneCalledWith, 5);
  });

  it('매칭 기사가 0명이면 DONE 처리한다', async () => {
    mock.method(
      notificationRepository,
      'claimOutboxJob',
      claimOnceThenNull(
        claimJob({
          id: 6,
          jobType: 'NEW_QUOTE_REQUEST_FANOUT',
          sourceId: '13',
          status: 'PROCESSING',
          cursorUserId: null,
          attempts: 1,
        })
      )
    );
    mock.method(notificationRepository, 'findEstimateRequestForFanout', async () => ({
      id: 13,
      userId: 'user-1',
      status: 'SUBMITTED',
      moveType: 'HOME',
      departureAddress: '서울특별시 강남구',
      arrivalAddress: '경기도 성남시',
    }));
    mock.method(notificationRepository, 'findUserNameById', async () => '홍고객');
    mock.method(
      notificationRepository,
      'findMoverIdsForNewRequestChunk',
      async () => []
    );
    let doneCalledWith: number | undefined;
    mock.method(notificationRepository, 'markOutboxDone', async (id: number) => {
      doneCalledWith = id;
    });

    await processNotificationOutboxTick();

    assert.equal(doneCalledWith, 6);
  });

  it('청크가 상한(5회)에 도달하면 DONE 대신 PENDING으로 양보(yield)한다', async () => {
    const chunkSize = notificationRepository.NOTIFICATION_OUTBOX_CHUNK_SIZE;
    const fullChunk = Array.from({ length: chunkSize }, (_, i) => `mover-${i}`);

    mock.method(
      notificationRepository,
      'claimOutboxJob',
      claimOnceThenNull(
        claimJob({
          id: 7,
          jobType: 'NEW_QUOTE_REQUEST_FANOUT',
          sourceId: '14',
          status: 'PROCESSING',
          cursorUserId: null,
          attempts: 1,
        })
      )
    );
    mock.method(notificationRepository, 'findEstimateRequestForFanout', async () => ({
      id: 14,
      userId: 'user-1',
      status: 'SUBMITTED',
      moveType: 'HOME',
      departureAddress: '서울특별시 강남구',
      arrivalAddress: '경기도 성남시',
    }));
    mock.method(notificationRepository, 'findUserNameById', async () => '홍고객');
    mock.method(
      notificationRepository,
      'findMoverIdsForNewRequestChunk',
      async () => fullChunk
    );
    mock.method(
      notificationRepository,
      'createManyFanoutNotifications',
      async () => chunkSize
    );
    mock.method(notificationSse, 'publishNotificationRefresh', noopPublish);
    mock.method(notificationRepository, 'updateOutboxCursor', async () => {});
    let doneCalled = false;
    mock.method(notificationRepository, 'markOutboxDone', async () => {
      doneCalled = true;
    });
    let yieldArgs: { id: number; cursor: string } | undefined;
    mock.method(
      notificationRepository,
      'markOutboxYield',
      async (id: number, cursor: string) => {
        yieldArgs = { id, cursor };
      }
    );

    await processNotificationOutboxTick();

    assert.equal(doneCalled, false);
    assert.deepEqual(yieldArgs, {
      id: 7,
      cursor: fullChunk[fullChunk.length - 1],
    });
  });

  it('마지막 청크가 상한보다 작으면 DONE 처리하고, 삽입된 만큼 refresh 이벤트를 발행한다', async () => {
    mock.method(
      notificationRepository,
      'claimOutboxJob',
      claimOnceThenNull(
        claimJob({
          id: 8,
          jobType: 'NEW_QUOTE_REQUEST_FANOUT',
          sourceId: '15',
          status: 'PROCESSING',
          cursorUserId: null,
          attempts: 1,
        })
      )
    );
    mock.method(notificationRepository, 'findEstimateRequestForFanout', async () => ({
      id: 15,
      userId: 'user-1',
      status: 'SUBMITTED',
      moveType: 'HOME',
      departureAddress: '서울특별시 강남구',
      arrivalAddress: '경기도 성남시',
    }));
    mock.method(notificationRepository, 'findUserNameById', async () => '홍고객');
    mock.method(notificationRepository, 'findMoverIdsForNewRequestChunk', async () => [
      'mover-1',
      'mover-2',
    ]);
    mock.method(
      notificationRepository,
      'createManyFanoutNotifications',
      async () => 2
    );
    const refreshedTo: string[] = [];
    mock.method(notificationSse, 'publishNotificationRefresh', (userId: string) => {
      refreshedTo.push(userId);
    });
    let doneCalledWith: number | undefined;
    mock.method(notificationRepository, 'markOutboxDone', async (id: number) => {
      doneCalledWith = id;
    });

    await processNotificationOutboxTick();

    assert.equal(doneCalledWith, 8);
    assert.deepEqual(refreshedTo.sort(), ['mover-1', 'mover-2']);
  });

  it('처리 중 예외가 나도(잘못된 sourceId) markOutboxFailure 후 다음 claim으로 계속 진행한다', async () => {
    let claimCallCount = 0;
    mock.method(notificationRepository, 'claimOutboxJob', async () => {
      claimCallCount += 1;
      if (claimCallCount === 1) {
        return claimJob({
          id: 9,
          jobType: 'NEW_QUOTE_REQUEST_FANOUT',
          sourceId: 'not-a-number',
          status: 'PROCESSING',
          cursorUserId: null,
          attempts: 2,
        });
      }
      return null;
    });
    let failureArgs: { id: number; attempts: number } | undefined;
    mock.method(
      notificationRepository,
      'markOutboxFailure',
      async (id: number, _message: string, attempts: number) => {
        failureArgs = { id, attempts };
      }
    );

    await processNotificationOutboxTick();

    assert.equal(claimCallCount, 2);
    assert.deepEqual(failureArgs, { id: 9, attempts: 2 });
  });
});
