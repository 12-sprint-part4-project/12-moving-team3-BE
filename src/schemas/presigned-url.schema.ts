import { z } from 'zod';

/** S3 업로드 폴더 prefix */
export const UPLOAD_PREFIX_VALUES = [
  'profile-images',
  'posts',
  'chat-attachments',
] as const;

export type UploadPrefix = (typeof UPLOAD_PREFIX_VALUES)[number];

export const presignedUploadUrlQuerySchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  prefix: z.enum(UPLOAD_PREFIX_VALUES),
});

export type PresignedUploadUrlQuery = z.infer<
  typeof presignedUploadUrlQuerySchema
>;

export const s3KeySchema = z.string().min(1).optional();
