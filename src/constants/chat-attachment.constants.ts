/** 채팅 첨부 이미지 S3 디렉터리 prefix (공통 presign UPLOAD_PREFIX와 동일) */
export const CHAT_ATTACHMENT_DIRECTORY = 'chat-attachments';

/** 채팅 첨부 이미지 최대 용량 (5MB) */
export const CHAT_ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024;

/** IMAGE 메시지당 첨부 최대 개수 */
export const CHAT_ATTACHMENT_MAX_COUNT = 5;

/** 채팅 첨부 허용 MIME (JPEG/PNG/WebP) */
export const CHAT_ATTACHMENT_ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ChatAttachmentContentType =
  (typeof CHAT_ATTACHMENT_ALLOWED_CONTENT_TYPES)[number];

/**
 * 공통 GET /api/presigned-upload-url 이 발급하는 key 형식.
 * `chat-attachments/{uuid}_{filename}`
 */
const CHAT_ATTACHMENT_KEY_PATTERN = new RegExp(
  `^${CHAT_ATTACHMENT_DIRECTORY}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[^/\\\\]+$`,
  'i'
);

/** IMAGE 메시지 attachments에 넣을 s3Key 형식이 유효한지 확인한다. */
export const isValidChatAttachmentKey = (fileKey: string): boolean => {
  return CHAT_ATTACHMENT_KEY_PATTERN.test(fileKey);
};
