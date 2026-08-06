/** 게시글 이미지 S3 prefix (공통 presign UPLOAD_PREFIX.posts) */
export const POST_IMAGE_DIRECTORY = 'posts';

/** 게시글 이미지 최대 용량 (5MB) */
export const POST_IMAGE_MAX_SIZE = 5 * 1024 * 1024;

/** 게시글 이미지 허용 MIME (JPEG/PNG/WebP) */
export const POST_IMAGE_ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** presigned-upload-url(prefix=posts) key 형식: posts/{uuid}_{filename} */
export const POST_IMAGE_S3_KEY_PATTERN =
  /^posts\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_.+$/i;

/** 업로드만 하고 게시글에 연결되지 않은 S3 객체 정리 대기 시간 */
export const POST_IMAGE_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export const isValidPostImageKey = (imageKey: string): boolean =>
  POST_IMAGE_S3_KEY_PATTERN.test(imageKey);
