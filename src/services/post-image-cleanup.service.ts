import {
  POST_IMAGE_DIRECTORY,
  POST_IMAGE_ORPHAN_MIN_AGE_MS,
  isValidPostImageKey,
} from '../constants/post-image.constants';
import * as postRepository from '../repositories/post.repository';
import { listObjectsByPrefix } from './s3.service';
import { deletePostImageKeysSafely } from '../utils/post-image.util';

/** DB에 연결되지 않은 posts/ S3 객체를 정리한다. */
export const cleanupOrphanPostImages = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - POST_IMAGE_ORPHAN_MIN_AGE_MS);
  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    const page = await listObjectsByPrefix(POST_IMAGE_DIRECTORY, {
      continuationToken,
    });

    continuationToken = page.continuationToken;

    const candidateKeys = page.objects
      .filter((object) => object.lastModified < cutoff)
      .map((object) => object.key)
      .filter(isValidPostImageKey);

    if (candidateKeys.length === 0) {
      continue;
    }

    const referencedKeys = new Set(
      await postRepository.findReferencedPostImageKeys(candidateKeys)
    );

    const orphanKeys = candidateKeys.filter((key) => !referencedKeys.has(key));

    if (orphanKeys.length === 0) {
      continue;
    }

    const stillReferencedKeys = new Set(
      await postRepository.findReferencedPostImageKeys(orphanKeys)
    );
    const deletableKeys = orphanKeys.filter(
      (key) => !stillReferencedKeys.has(key)
    );

    await deletePostImageKeysSafely(deletableKeys);
    deletedCount += deletableKeys.length;
  } while (continuationToken);

  return deletedCount;
};
