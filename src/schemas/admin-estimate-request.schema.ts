import { z } from 'zod';
import { adminStatisticsFilterSchema } from './admin-statistics.schema';
import {
  listQuerySchema,
  sortDirectionSchema,
} from './admin-list-query.schema';
import { EstimateRequestStatus, MoveType } from '@prisma/client';

export const moveTypeSchema = z.enum(MoveType);

export const estimateRequestManageStatusSchema = z.enum([
  EstimateRequestStatus.SUBMITTED,
  EstimateRequestStatus.CONFIRMED,
  EstimateRequestStatus.EXPIRED,
  EstimateRequestStatus.CANCELED,
]);

/** 견적 요청 목록·상세 공통 필터 필드 (page/pageSize·기간 제외) */
const adminEstimateRequestFilterObjectSchema = z.object({
  id: z.coerce.number().int().min(1).max(2147483647).optional(),
  userName: z.string().trim().min(1).optional(),
  phoneNumber: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.replace(/\D/g, '').length > 0)
    .optional(),
  status: estimateRequestManageStatusSchema.optional(),
  sort: sortDirectionSchema.optional(),
});

export const adminEstimateRequestListQuerySchema = listQuerySchema
  .extend(adminEstimateRequestFilterObjectSchema.shape)
  .and(adminStatisticsFilterSchema);

export type AdminEstimateRequestListQuery = z.infer<
  typeof adminEstimateRequestListQuerySchema
>;

/** GET /api/admin/estimate-requests/:estimateRequestId query (목록과 동일, page/pageSize 제외) */
export const adminEstimateRequestDetailQuerySchema =
  adminEstimateRequestFilterObjectSchema.and(adminStatisticsFilterSchema);

export type AdminEstimateRequestDetailQuery = z.infer<
  typeof adminEstimateRequestDetailQuerySchema
>;

export const adminCompletedListQuerySchema = listQuerySchema
  .extend({
    id: z.coerce.number().int().min(1).max(2147483647).optional(),
    userName: z.string().trim().min(1).optional(),
    phoneNumber: z
      .string()
      .trim()
      .min(1)
      .refine((value) => value.replace(/\D/g, '').length > 0)
      .optional(),
    moveType: moveTypeSchema.optional(),
    sort: sortDirectionSchema.optional(),
  })
  .and(adminStatisticsFilterSchema);

export type AdminCompletedListQuery = z.infer<
  typeof adminCompletedListQuerySchema
>;
