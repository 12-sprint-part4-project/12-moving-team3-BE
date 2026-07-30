import { Region } from '@prisma/client';
import { z } from 'zod';
import { s3KeySchema } from './presigned-url.schema';
import { moveTypeArraySchema } from './profile.schema';

export const customerProfileBodySchema = z.object({
  region: z.enum(Region),
  service: moveTypeArraySchema,
  s3Key: s3KeySchema,
});

export type CustomerProfileBody = z.infer<typeof customerProfileBodySchema>;
