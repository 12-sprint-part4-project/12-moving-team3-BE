import {
  CHAT_ATTACHMENT_DIRECTORY,
  CHAT_ATTACHMENT_ORPHAN_MIN_AGE_MS,
  isValidChatAttachmentKey,
} from '../constants/chat-attachment.constants';
import * as chatRepository from '../repositories/chat.repository';
import { cleanupOrphanS3Objects } from './orphan-s3-cleanup.service';

/** DB에 연결되지 않은 chat-attachments/ S3 객체를 정리한다. */
export const cleanupOrphanChatAttachments = (): Promise<number> =>
  cleanupOrphanS3Objects({
    prefix: CHAT_ATTACHMENT_DIRECTORY,
    orphanMinAgeMs: CHAT_ATTACHMENT_ORPHAN_MIN_AGE_MS,
    isValidKey: isValidChatAttachmentKey,
    findReferencedKeys: chatRepository.findReferencedChatAttachmentKeys,
  });
