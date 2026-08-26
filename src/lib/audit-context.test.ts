import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { runAuditedTransaction, runWithManualAudit } from './audit-context';
import { basePrisma } from './prisma';
import {
  auditContextStorage,
  explicitAuditedTxStorage,
  getAuditContext,
} from './request-context';

// basePrisma는 Prisma Client Proxy라 mock.method가 프로퍼티 디스크립터를 못 읽는다.
// $transaction을 직접 재할당해 교체하고 afterEach에서 원복한다.
const originalTransaction = basePrisma.$transaction;

describe('runWithManualAudit', () => {
  it('기존 컨텍스트가 없으면 skipAudit:true로 실행된다', async () => {
    let observed: unknown;

    await runWithManualAudit(async () => {
      observed = getAuditContext();
      return 'done';
    });

    assert.deepEqual(observed, { skipAudit: true });
  });

  it('기존 컨텍스트가 있으면 병합하고, 콜백 종료 후 바깥 컨텍스트는 오염되지 않는다', async () => {
    let observedInside: unknown;

    await auditContextStorage.run({ userId: 'user-1' }, async () => {
      await runWithManualAudit(async () => {
        observedInside = getAuditContext();
      });

      assert.deepEqual(getAuditContext(), { userId: 'user-1' });
    });

    assert.deepEqual(observedInside, { userId: 'user-1', skipAudit: true });
  });

  it('콜백의 반환값을 그대로 전달한다', async () => {
    const result = await runWithManualAudit(async () => 42);

    assert.equal(result, 42);
  });
});

interface FakeTx {
  $executeRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<number>;
}

const createFakeTx = (
  onExecuteRaw?: (values: unknown[]) => void
): FakeTx => ({
  $executeRaw: (_strings, ...values) => {
    onExecuteRaw?.(values);
    return Promise.resolve(0);
  },
});

const stubTransaction = (
  fakeTx: FakeTx
): void => {
  basePrisma.$transaction = ((fn: (tx: FakeTx) => Promise<unknown>) =>
    fn(fakeTx)) as typeof basePrisma.$transaction;
};

describe('runAuditedTransaction', () => {
  afterEach(() => {
    basePrisma.$transaction = originalTransaction;
  });

  it('감사 컨텍스트의 userId/adminId/skipAudit을 SQL 파라미터로 매핑한다', async () => {
    let capturedValues: unknown[] = [];
    stubTransaction(createFakeTx((values) => (capturedValues = values)));

    await auditContextStorage.run(
      { userId: 'user-1', adminId: 5, skipAudit: true },
      () => runAuditedTransaction(async () => 'ok')
    );

    assert.deepEqual(capturedValues, ['user-1', '5', 'true']);
  });

  it('컨텍스트가 없으면 세 값 다 빈 문자열로 채운다', async () => {
    let capturedValues: unknown[] = [];
    stubTransaction(createFakeTx((values) => (capturedValues = values)));

    await runAuditedTransaction(async () => 'ok');

    assert.deepEqual(capturedValues, ['', '', '']);
  });

  it('콜백의 반환값을 그대로 리턴한다', async () => {
    stubTransaction(createFakeTx());

    const result = await runAuditedTransaction(async () => ({ id: 1 }));

    assert.deepEqual(result, { id: 1 });
  });

  it('콜백이 explicitAuditedTxStorage 스코프(true) 안에서 실행된다', async () => {
    let observedInsideTx: boolean | undefined;
    stubTransaction(createFakeTx());

    await runAuditedTransaction(async () => {
      observedInsideTx = explicitAuditedTxStorage.getStore();
      return null;
    });

    assert.equal(observedInsideTx, true);
  });
});
