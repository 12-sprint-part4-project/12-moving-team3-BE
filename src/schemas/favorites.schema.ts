import { z } from 'zod';

/** moverId = 찜할 기사님의 User id (UUID) */
export const favoriteMoverIdParamSchema = z.object({
  moverId: z.uuid('유효하지 않은 기사님 ID입니다.'),
});

export type FavoriteMoverIdParam = z.infer<typeof favoriteMoverIdParamSchema>;
