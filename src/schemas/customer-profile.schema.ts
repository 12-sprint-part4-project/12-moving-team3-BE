import { MoveType, Region } from '@prisma/client';
import { z } from 'zod';

const uniqueMoveTypes = (services: MoveType[]) => {
  return new Set(services).size === services.length;
};

const normalizeMoveTypes = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return [value];
  }

  return value;
};

export const customerProfileBodySchema = z.object({
  region: z.enum(Region),
  service: z.preprocess(
    normalizeMoveTypes,
    z.array(z.enum(MoveType)).min(1).refine(uniqueMoveTypes)
  ),
});

export type CustomerProfileBody = z.infer<typeof customerProfileBodySchema>;
