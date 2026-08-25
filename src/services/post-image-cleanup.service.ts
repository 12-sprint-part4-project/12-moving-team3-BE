import {
  POST_IMAGE_DIRECTORY,
  POST_IMAGE_ORPHAN_MIN_AGE_MS,
  isValidPostImageKey,
} from '../constants/post-image.constants';
import * as postRepository from '../repositories/post.repository';
import { cleanupOrphanS3Objects } from './orphan-s3-cleanup.service';

/** DB에 연결되지 않은 posts/ S3 객체를 정리한다. */
export const cleanupOrphanPostImages = (): Promise<number> =>
  cleanupOrphanS3Objects({
    prefix: POST_IMAGE_DIRECTORY,
    orphanMinAgeMs: POST_IMAGE_ORPHAN_MIN_AGE_MS,
    isValidKey: isValidPostImageKey,
    findReferencedKeys: postRepository.findReferencedPostImageKeys,
  });
