import type { Prisma } from '@prisma/client';
import { basePrisma } from './prisma';
import {
  auditContextStorage,
  explicitAuditedTxStorage,
  getAuditContext,
} from './request-context';

interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * 쓰기 interactive 트랜잭션 — 시작 시 감사 세션 변수를 한 번 심고,
 * Extension의 중첩 set_config 래핑을 끈다 (explicitAuditedTxStorage).
 */
export const runAuditedTransaction = async <T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T> => {
  // 전용 ALS 스코프로 중첩 래핑 금지 — 공유 스토어 mutate/restore 없음
  return explicitAuditedTxStorage.run(true, async () =>
    basePrisma.$transaction(async (tx) => {
      const { userId, adminId, skipAudit } = getAuditContext();

      await tx.$executeRaw`
        SELECT
          set_config('app.current_user_id', ${userId ?? ''}, true),
          set_config('app.current_admin_id', ${adminId != null ? String(adminId) : ''}, true),
          set_config('app.skip_audit', ${skipAudit ? 'true' : ''}, true)
      `;

      return fn(tx);
    }, options)
  );
};

/**
 * Service가 createHistory를 직접 남길 때 사용한다.
 * skipAudit을 켠 스토어 복사본으로 콜백을 실행한다 (원본 mutate 없음).
 */
export const runWithManualAudit = async <T>(
  fn: () => Promise<T>
): Promise<T> => {
  const existing = auditContextStorage.getStore() ?? {};
  return auditContextStorage.run({ ...existing, skipAudit: true }, fn);
};
