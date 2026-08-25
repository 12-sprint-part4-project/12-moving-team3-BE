import cron from 'node-cron';

interface SeoulDailyCronOptions {
  /** node-cron 표현식 (예: '0 3 * * *') */
  expression: string;
  /** 로그 prefix (예: cleanup-orphan-post-images) */
  logLabel: string;
  run: () => Promise<unknown>;
}

/** Asia/Seoul 일일 크론을 등록한다. run 실패는 로그만 남긴다. */
export const startSeoulDailyCron = (options: SeoulDailyCronOptions): void => {
  const { expression, logLabel, run } = options;

  cron.schedule(
    expression,
    () => {
      Promise.resolve()
        .then(run)
        .catch((error) => {
          console.error(`[${logLabel}] job failed`, error);
        });
    },
    { timezone: 'Asia/Seoul' }
  );
};

/** 배치 본문을 try/catch로 감싸 로그 후 삼킨다. */
export const runCronJobSafely = async (
  logLabel: string,
  run: () => Promise<unknown>
): Promise<void> => {
  try {
    await run();
  } catch (error) {
    console.error(`[${logLabel}] failed`, error);
  }
};
