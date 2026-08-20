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
    status: estimateRequestManageStatusSchema.optional(),
    sort: sortDirectionSchema.optional(),
  })
  .and(adminStatisticsFilterSchema);

export type AdminEstimateRequestListQuery = z.infer<
  typeof adminEstimateRequestListQuerySchema
>;

export const adminCompletedListQuerySchema = listQuerySchema
  .extend({
    moveType: moveTypeSchema.optional(),
    sort: sortDirectionSchema.optional(),
  })
  .and(adminStatisticsFilterSchema);

export type AdminCompletedListQuery = z.infer<
  typeof adminCompletedListQuerySchema
>;
