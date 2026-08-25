import { cleanupOrphanChatAttachments } from '../services/chat-attachment-cleanup.service';
import { runCronJobSafely, startSeoulDailyCron } from './seoul-daily-cron';

const LOG_LABEL = 'cleanup-orphan-chat-attachments';

export const runCleanupOrphanChatAttachmentsJob = (): Promise<void> =>
  runCronJobSafely(LOG_LABEL, cleanupOrphanChatAttachments);

/** 매일 03:10 Asia/Seoul — DB 미참조 chat-attachments/ S3 객체 정리 (#414) */
export const startCleanupOrphanChatAttachmentsCron = (): void => {
  startSeoulDailyCron({
    expression: '10 3 * * *',
    logLabel: LOG_LABEL,
    run: cleanupOrphanChatAttachments,
  });
};
