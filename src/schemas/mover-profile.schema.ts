import { z } from 'zod';
import { moveTypeArraySchema, regionArraySchema } from './profile.schema';

export const moverProfileBodySchema = z.object({
  nickname: z.string().trim().min(2).max(20),
  career: z.coerce.number().int().min(0),
  shortDescription: z.string().trim().min(1).max(10),
  description: z.string().trim().min(8),
  service: moveTypeArraySchema,
  serviceRegions: regionArraySchema,
});

export type MoverProfileBody = z.infer<typeof moverProfileBodySchema>;
