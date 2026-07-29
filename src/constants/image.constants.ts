/** 프로필·게시글 업로드 허용 MIME 타입 */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** 게시글 이미지 S3 key prefix */
export const POST_IMAGE_KEY_PREFIX = 'posts/';
