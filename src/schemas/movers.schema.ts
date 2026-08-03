import { MoveType, Region } from '@prisma/client';
import { z } from 'zod';

/** 기사 목록 정렬 — 모두 내림차순(리뷰·평점·경력·확정 많은/높은 순) */
export const MOVER_SORT_FIELDS = [
  'reviewCount',
  'averageRating',
  'career',
  'confirmedCount',
] as const;

/**
 * 쿼리 파라미터를 문자열 배열로 정규화
 * `?region=SEOUL&region=BUSAN` 와 `?region=SEOUL,BUSAN` 모두 지원
 */
const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => String(item).split(','));
  }

  return String(value).split(',');
};

const regionArraySchema = z.preprocess(
  (value) =>
    value === undefined || value === '' ? undefined : toStringArray(value),
  z.array(z.enum(Region)).min(1)
);

const moveTypeArraySchema = z.preprocess(
  (value) =>
    value === undefined || value === '' ? undefined : toStringArray(value),
  z.array(z.enum(MoveType)).min(1)
);

/** GET /api/movers 목록 쿼리 */
export const moversListQuerySchema = z.object({
  keyword: z.string().trim().min(1).optional(),
  region: regionArraySchema.optional(),
  moveType: moveTypeArraySchema.optional(),
  sort: z.enum(MOVER_SORT_FIELDS).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(10).optional().default(10),
});

/** GET /api/movers/:id path param */
export const moverDetailParamsSchema = z.object({
  id: z.uuid(),
});

/** GET /api/movers/favorites query */
export const favoriteMoversQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(10).optional().default(10),
});

export type MoversListQuery = z.infer<typeof moversListQuerySchema>;
export type MoverDetailParams = z.infer<typeof moverDetailParamsSchema>;
export type FavoriteMoversQuery = z.infer<typeof favoriteMoversQuerySchema>;
