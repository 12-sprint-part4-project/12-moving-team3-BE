import type { Prisma } from '@prisma/client';
import { basePrisma } from './prisma';
import {
  auditContextStorage,
  getAuditContext,
  type AuditContextStore,
} from './request-context';

type TransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

/**
 * 쓰기 interactive 트랜잭션 — 시작 시 감사 세션 변수를 한 번 심고,
 * Extension의 중첩 set_config 래핑을 끈다 (inExplicitAuditedTx).
 */
export const runAuditedTransaction = async <T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T> => {
  const store = auditContextStorage.getStore();
  const previousInExplicit = store?.inExplicitAuditedTx;

  if (store) {
    store.inExplicitAuditedTx = true;
  }

  try {
    return await basePrisma.$transaction(async (tx) => {
      const { userId, adminId, skipAudit } = getAuditContext();

      await tx.$executeRaw`
        SELECT
          set_config('app.current_user_id', ${userId ?? ''}, true),
          set_config('app.current_admin_id', ${adminId != null ? String(adminId) : ''}, true),
          set_config('app.skip_audit', ${skipAudit ? 'true' : ''}, true)
      `;

      return fn(tx);
    }, options);
  } finally {
    if (store) {
      store.inExplicitAuditedTx = previousInExplicit;
    }
  }
};

/**
 * Service가 createHistory를 직접 남길 때 사용한다.
 * DB 트리거 스킵 플래그를 켠 뒤 콜백을 실행하고, 끝나면 이전 값으로 복원한다.
 */
export const runWithManualAudit = async <T>(fn: () => Promise<T>): Promise<T> => {
  const existing = auditContextStorage.getStore();

  if (existing) {
    const previousSkip = existing.skipAudit;
    existing.skipAudit = true;
    try {
      return await fn();
    } finally {
      existing.skipAudit = previousSkip;
    }
  }

  // 요청 컨텍스트가 없으면 skip 전용 스토어를 잠시 연다 (배치 등)
  const isolated: AuditContextStore = { skipAudit: true };
  return auditContextStorage.run(isolated, fn);
};
