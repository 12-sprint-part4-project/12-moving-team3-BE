import { z } from 'zod';
import { adminStatisticsFilterSchema } from './admin-statistics.schema';
import { listQuerySchema } from './admin-list-query.schema';
import { EstimateRequestStatus, MoveType } from '@prisma/client';

export const moveTypeSchema = z.enum(MoveType);

export const estimateRequestManageStatusSchema = z.enum([
  EstimateRequestStatus.SUBMITTED,
  EstimateRequestStatus.CONFIRMED,
  EstimateRequestStatus.EXPIRED,
  EstimateRequestStatus.CANCELED,
]);

export const estimateRequestSortSchema = z.enum([
  'submittedAt_asc',
  'submittedAt_desc',
]);

export const adminEstimateRequestListQuerySchema = listQuerySchema
  .extend({
    status: estimateRequestManageStatusSchema.optional(),
    sort: estimateRequestSortSchema.optional(),
  })
  .and(adminStatisticsFilterSchema);

export type AdminEstimateRequestListQuery = z.infer<
  typeof adminEstimateRequestListQuerySchema
>;

export const adminCompletedListSortSchema = z.enum([
  'moveDate_asc',
  'moveDate_desc',
]);

export const adminCompletedListQuerySchema = listQuerySchema
  .extend({
    moveType: moveTypeSchema.optional(),
    sort: adminCompletedListSortSchema.optional(),
  })
  .and(adminStatisticsFilterSchema);

export type AdminCompletedListQuery = z.infer<
  typeof adminCompletedListQuerySchema
>;
