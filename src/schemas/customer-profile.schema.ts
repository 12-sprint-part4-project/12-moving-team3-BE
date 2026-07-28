import { MoveType, Region } from '@prisma/client';
import { z } from 'zod';

const uniqueMoveTypes = (services: MoveType[]) => {
  return new Set(services).size === services.length;
};

export const customerProfileBodySchema = z.object({
  region: z.enum(Region),
  service: z
    .array(z.enum(MoveType))
    .min(1)
    .refine(uniqueMoveTypes, 'service values must be unique'),
});

export type CustomerProfileBody = z.infer<typeof customerProfileBodySchema>;
