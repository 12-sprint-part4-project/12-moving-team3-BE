import { AsyncLocalStorage } from 'node:async_hooks';

/** HTTP 요청(또는 감사 트랜잭션) 범위의 actor·플래그 */
export interface AuditContextStore {
  userId?: string;
  adminId?: number;
  /** true면 DB 트리거가 histories INSERT를 건너뛴다 (Service 직접 createHistory용) */
  skipAudit?: boolean;
}

export const auditContextStorage = new AsyncLocalStorage<AuditContextStore>();

/**
 * 명시적 runAuditedTransaction 구간에만 true.
 * 요청 공유 스토어를 mutate하지 않고 스코프에 바인딩해 병렬 레이스를 막는다.
 */
export const explicitAuditedTxStorage = new AsyncLocalStorage<boolean>();

/** 스토어가 없으면 빈 객체를 반환한다 (cron 등 요청 밖 경로) */
export const getAuditContext = (): AuditContextStore =>
  auditContextStorage.getStore() ?? {};
