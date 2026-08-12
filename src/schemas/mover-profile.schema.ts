import { z } from 'zod';
import { s3KeySchema } from './presigned-url.schema';
import { moveTypeArraySchema, regionArraySchema } from './profile.schema';

export const moverProfileBodySchema = z.object({
  nickname: z.string().trim().min(2).max(20),
  career: z.coerce.number().int().min(0).max(50),
  shortDescription: z.string().trim().min(1).max(20),
  description: z.string().trim().min(8),
  service: moveTypeArraySchema,
  serviceRegions: regionArraySchema,
  s3Key: s3KeySchema,
});

export type MoverProfileBody = z.infer<typeof moverProfileBodySchema>;

/** 기본정보 수정. 비밀번호는 newPassword가 있을 때만 service에서 조건부 검증 */
export const moverBasicInfoBodySchema = z.object({
  name: z.string().trim().min(2).max(20),
  phoneNumber: z.string().regex(/^010\d{8}$/),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(1).optional(),
  newPasswordConfirm: z.string().min(1).optional(),
});

export type MoverBasicInfoBody = z.infer<typeof moverBasicInfoBodySchema>;
