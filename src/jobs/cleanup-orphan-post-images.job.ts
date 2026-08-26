import { cleanupOrphanPostImages } from '../services/post-image-cleanup.service';
import { runCronJobSafely, startSeoulDailyCron } from './seoul-daily-cron';

const LOG_LABEL = 'cleanup-orphan-post-images';

export const runCleanupOrphanPostImagesJob = (): Promise<void> =>
  runCronJobSafely(LOG_LABEL, cleanupOrphanPostImages);

/** 매일 03:00 Asia/Seoul — DB 미참조 posts/ S3 객체 정리 */
export const startCleanupOrphanPostImagesCron = (): void => {
  startSeoulDailyCron({
    expression: '0 3 * * *',
    logLabel: LOG_LABEL,
    run: cleanupOrphanPostImages,
  });
};
