import { Region } from '@prisma/client';
import { z } from 'zod';
import { s3KeySchema } from './presigned-url.schema';
import { moveTypeArraySchema } from './profile.schema';

/** 등록/수정 공통 body. 비밀번호는 수정 시 newPassword가 있을 때만 service에서 조건부 검증 */
export const customerProfileBodySchema = z.object({
  name: z.string().trim().min(2).max(20).optional(),
  phoneNumber: z
    .string()
    .regex(/^\d{11}$/)
    .optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(1).optional(),
  newPasswordConfirm: z.string().min(1).optional(),
  region: z.enum(Region).optional(),
  service: moveTypeArraySchema.optional(),
  s3Key: s3KeySchema,
});

export type CustomerProfileBody = z.infer<typeof customerProfileBodySchema>;
