/** 프로필·게시글 업로드 허용 MIME 타입 */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** 이미지 업로드 최대 크기 (5MB) */
export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;

export const isAllowedImageMimeType = (
  mimeType: string
): mimeType is AllowedImageMimeType =>
  (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);

/** 게시글 이미지 S3 key prefix */
export const POST_IMAGE_KEY_PREFIX = 'posts/';

/** posts/{uuid} 형식 검증용 (RFC 4122) */
export const POST_IMAGE_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
