import cron from 'node-cron';
import { cleanupOrphanPostImages } from '../services/post-image-cleanup.service';

export const runCleanupOrphanPostImagesJob = async (): Promise<void> => {
  try {
    const deletedCount = await cleanupOrphanPostImages();

    if (deletedCount > 0) {
      console.log(`[cleanup-orphan-post-images] deleted count=${deletedCount}`);
    }
  } catch (error) {
    console.error('[cleanup-orphan-post-images] failed', error);
  }
};

/** 매일 03:00 Asia/Seoul — DB 미참조 posts/ S3 객체 정리 */
export const startCleanupOrphanPostImagesCron = (): void => {
  cron.schedule(
    '0 3 * * *',
    () => {
      runCleanupOrphanPostImagesJob().catch((error) => {
        console.error('[cleanup-orphan-post-images] job failed', error);
      });
    },
    { timezone: 'Asia/Seoul' }
  );

  console.log('[cron] cleanup orphan post images scheduled (03:00 Asia/Seoul)');
};
