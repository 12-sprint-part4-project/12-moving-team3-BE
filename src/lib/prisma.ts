import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import env from '../config/env';
import { auditContextStorage, getAuditContext } from './request-context';

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

/**
 * 모든 모델 쓰기에 세션 변수(user/admin/skip)를 자동 주입한다.
 * 명시적 runAuditedTransaction 안에서는 중첩 래핑을 하지 않는다.
 * export 타입은 PrismaClient로 고정해 기존 레포/서비스 시그니처와 호환한다.
 */
export const prisma = basePrisma.$extends({
  name: 'audit-session-context',
  query: {
    $allModels: {
      async $allOperations({ operation, args, query }) {
        if (!MUTATING_OPERATIONS.has(operation)) {
          return query(args);
        }

        const store = auditContextStorage.getStore();
        if (store?.inExplicitAuditedTx) {
          return query(args);
        }

        const { userId, adminId, skipAudit } = getAuditContext();

        // set_config(is_local=true)는 트랜잭션 단위라 쓰기와 한 트랜잭션으로 묶는다.
        const [, result] = await basePrisma.$transaction([
          basePrisma.$executeRaw`
            SELECT
              set_config('app.current_user_id', ${userId ?? ''}, true),
              set_config('app.current_admin_id', ${adminId != null ? String(adminId) : ''}, true),
              set_config('app.skip_audit', ${skipAudit ? 'true' : ''}, true)
          `,
          query(args),
        ]);

        return result;
      },
    },
  },
}) as unknown as PrismaClient;

