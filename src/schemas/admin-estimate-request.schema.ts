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

export const adminEstimateRequestListQuerySchema = listQuerySchema
  .extend({
    id: z.coerce.number().int().min(1).optional(),
    userName: z.string().trim().min(1).optional(),
    phoneNumber: z
      .string()
      .trim()
      .min(1)
      .refine((value) => value.replace(/\D/g, '').length > 0)
      .optional(),
    status: estimateRequestManageStatusSchema.optional(),
    sort: sortDirectionSchema.optional(),
  })
  .and(adminStatisticsFilterSchema);

export type AdminEstimateRequestListQuery = z.infer<
  typeof adminEstimateRequestListQuerySchema
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
