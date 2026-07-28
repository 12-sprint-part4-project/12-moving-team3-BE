import { Region } from '@prisma/client';
import { z } from 'zod';
import { moveTypeArraySchema } from './profile.schema';

export const customerProfileBodySchema = z.object({
  region: z.enum(Region),
  service: moveTypeArraySchema,
});

export type CustomerProfileBody = z.infer<typeof customerProfileBodySchema>;
