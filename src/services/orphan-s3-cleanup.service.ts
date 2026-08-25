import { deleteImage, listObjectsByPrefix } from './s3.service';

export interface OrphanS3CleanupConfig {
  /** S3 prefix (예: posts, chat-attachments) */
  prefix: string;
  /** 이 시간보다 오래된 객체만 후보 */
  orphanMinAgeMs: number;
  /** prefix·형식 검증 */
  isValidKey: (key: string) => boolean;
  /** DB에 참조 중인 key만 반환 */
  findReferencedKeys: (keys: string[]) => Promise<string[]>;
}

export interface DeleteS3KeysResult {
  deletedCount: number;
  failedKeys: string[];
}

/**
 * S3 객체 best-effort 삭제.
 * 실패해도 throw하지 않고, 성공·실패 개수를 반환한다.
 */
export const deleteS3KeysSafely = async (
  keys: string[]
): Promise<DeleteS3KeysResult> => {
  if (keys.length === 0) {
    return { deletedCount: 0, failedKeys: [] };
  }

  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        await deleteImage(key);
        return { key, ok: true as const };
      } catch {
        return { key, ok: false as const };
      }
    })
  );

  const failedKeys = results
    .filter((result) => !result.ok)
    .map((result) => result.key);
  const deletedCount = results.length - failedKeys.length;

  if (failedKeys.length > 0) {
    console.error(
      `[orphan-s3-cleanup] failed to delete ${failedKeys.length} key(s)`,
      failedKeys
    );
  }

  return { deletedCount, failedKeys };
};

/**
 * prefix 하위 S3 객체 중 DB 미참조(고아) 객체를 정리한다.
 * list → age·형식 필터 → 참조 조회 → 재확인 후 삭제.
 * 반환값은 실제 삭제에 성공한 객체 수다.
 */
export const cleanupOrphanS3Objects = async (
  config: OrphanS3CleanupConfig
): Promise<number> => {
  const cutoff = new Date(Date.now() - config.orphanMinAgeMs);
  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    const page = await listObjectsByPrefix(config.prefix, {
      continuationToken,
    });

    continuationToken = page.continuationToken;

    const candidateKeys = page.objects
      .filter((object) => object.lastModified < cutoff)
      .map((object) => object.key)
      .filter(config.isValidKey);

    if (candidateKeys.length === 0) {
      continue;
    }

    const referencedKeys = new Set(
      await config.findReferencedKeys(candidateKeys)
    );

    const orphanKeys = candidateKeys.filter((key) => !referencedKeys.has(key));

    if (orphanKeys.length === 0) {
      continue;
    }

    const stillReferencedKeys = new Set(
      await config.findReferencedKeys(orphanKeys)
    );
    const deletableKeys = orphanKeys.filter(
      (key) => !stillReferencedKeys.has(key)
    );

    const { deletedCount: pageDeletedCount } =
      await deleteS3KeysSafely(deletableKeys);
    deletedCount += pageDeletedCount;
  } while (continuationToken);

  return deletedCount;
};
