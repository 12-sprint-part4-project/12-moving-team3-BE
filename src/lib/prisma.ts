import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import env from '../config/env';
import {
  explicitAuditedTxStorage,
  getAuditContext,
} from './request-context';

const connectionString = env.databaseUrl;

if (!connectionString) {
  throw new Error('DATABASE_URL 환경 변수가 설정되지 않았습니다.');
}

const adapter = new PrismaPg({
  connectionString,
});

/** Extension 미적용 원본 — 세션 변수 SET과 명시적 감사 트랜잭션에 사용한다 */
export const basePrisma = new PrismaClient({
  adapter,
});

const MUTATING_OPERATIONS = new Set<string>([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

/** Prisma model name(PascalCase) → TransactionClient delegate(camelCase) */
const toDelegateName = (model: string) =>
  model.charAt(0).toLowerCase() + model.slice(1);

/**
 * Extension 래핑 재진입 방지.
 * adapter-pg에서는 query(args)가 interactive tx의 set_config와
 * 같은 연결에 붙지 않으므로, 반드시 같은 tx delegate로 실행한다.
 */
const auditWrapStorage = new AsyncLocalStorage<boolean>();

/**
 * 모든 모델 쓰기에 세션 변수(user/admin/skip)를 자동 주입한다.
 * 명시적 runAuditedTransaction 안에서는 중첩 래핑을 하지 않는다.
 * export 타입은 PrismaClient로 고정해 기존 레포/서비스 시그니처와 호환한다.
 */
export const prisma = basePrisma.$extends({
  name: 'audit-session-context',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!MUTATING_OPERATIONS.has(operation)) {
          return query(args);
        }

        // explicitAuditedTxStorage / auditWrapStorage: 스코프 바인딩이라 병렬 요청과 간섭 없음
        if (explicitAuditedTxStorage.getStore() || auditWrapStorage.getStore()) {
          // 이미 감사 tx 안 — 중첩 set_config 금지. tx delegate 경로면 여기로 오면 안 됨.
          return query(args);
        }

        const { userId, adminId, skipAudit } = getAuditContext();
        const delegateName = toDelegateName(model);

        return auditWrapStorage.run(true, () =>
          basePrisma.$transaction(async (tx) => {
            await tx.$executeRaw`
              SELECT
                set_config('app.current_user_id', ${userId ?? ''}, true),
                set_config('app.current_admin_id', ${adminId != null ? String(adminId) : ''}, true),
                set_config('app.skip_audit', ${skipAudit ? 'true' : ''}, true)
            `;

            const delegate = (tx as Record<string, any>)[delegateName];
            if (!delegate || typeof delegate[operation] !== 'function') {
              throw new Error(
                `audit extension: tx.${delegateName}.${operation} not found (model=${model})`
              );
            }

            return delegate[operation](args);
          })
        );
      },
    },
  },
}) as unknown as PrismaClient;
