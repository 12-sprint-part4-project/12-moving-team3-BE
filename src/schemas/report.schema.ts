import { z } from 'zod';

const userReportTargetSchema = z.enum([
  'USER',
  'REVIEW',
  'CHAT_ROOM',
  'MESSAGE',
  'ARTICLE',
  'COMMENT',
]);

const userReportCategorySchema = z.enum([
  'INAPPROPRIATE_PROFILE',
  'ABUSIVE_LANGUAGE',
]);

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positiveIntStringRegex = /^[1-9]\d*$/;

/** Prisma/Postgres Int 상한 — Number(targetId) 후 findFirst 시 validation 500 방지 */
const PRISMA_INT_MAX = 2_147_483_647;

/** POST /api/reports Body */
export const reportCreateBodySchema = z
  .object({
    target: userReportTargetSchema,
    targetId: z.string().trim().min(1).max(36),
    category: userReportCategorySchema,
  })
  .superRefine((data, ctx) => {
    if (data.target === 'USER') {
      if (!uuidRegex.test(data.targetId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['targetId'],
          message: 'USER 대상의 targetId는 UUID 형식이어야 합니다.',
        });
      }
      return;
    }

    if (!positiveIntStringRegex.test(data.targetId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetId'],
        message: 'targetId는 양의 정수 문자열이어야 합니다.',
      });
      return;
    }

    // 자릿수만 맞으면 Zod를 통과하던 값(예: 9 반복 20자리)이
    // Number() → Infinity/Int 초과 → Prisma validation → 500이 되지 않도록 상한 검사
    const numericId = Number(data.targetId);
    if (
      !Number.isSafeInteger(numericId) ||
      numericId < 1 ||
      numericId > PRISMA_INT_MAX
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetId'],
        message: `targetId는 1 이상 ${PRISMA_INT_MAX} 이하의 정수여야 합니다.`,
      });
    }
  });

export type ReportCreateBody = z.infer<typeof reportCreateBodySchema>;
