import { randomUUID } from 'node:crypto';

/** 채팅 첨부 이미지 S3 디렉터리 prefix */
export const CHAT_ATTACHMENT_DIRECTORY = 'chat-attachments';

/** 채팅 첨부 이미지 최대 용량 (5MB, S3 업로드 가이드·프로필 업로드와 동일) */
export const CHAT_ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024;

/** Presigned URL 유효 시간(초) */
export const CHAT_ATTACHMENT_PRESIGN_EXPIRES_IN = 300;

/** 채팅 첨부 허용 MIME (S3 가이드·프로필 업로드와 동일: JPEG/PNG/WebP) */
export const CHAT_ATTACHMENT_ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ChatAttachmentContentType =
  (typeof CHAT_ATTACHMENT_ALLOWED_CONTENT_TYPES)[number];

const CHAT_ATTACHMENT_EXTENSION_BY_CONTENT_TYPE: Record<
  ChatAttachmentContentType,
  string
> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** contentType에 대응하는 안전한 확장자로 S3 fileKey를 생성한다. */
export const generateChatAttachmentKey = (
  contentType: ChatAttachmentContentType
): string => {
  const extension = CHAT_ATTACHMENT_EXTENSION_BY_CONTENT_TYPE[contentType];
  return `${CHAT_ATTACHMENT_DIRECTORY}/${randomUUID()}.${extension}`;
};
