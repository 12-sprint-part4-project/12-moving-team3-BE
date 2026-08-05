import { z } from 'zod';

/** GET /:estimateRequestId/movers/:moverId path params */
export const designatedEstimateExistenceParamsSchema = z.object({
  estimateRequestId: z.coerce.number().int().positive(),
  moverId: z.uuid('유효하지 않은 기사님 ID입니다.'),
});

export type DesignatedEstimateExistenceParams = z.infer<
  typeof designatedEstimateExistenceParamsSchema
>;
