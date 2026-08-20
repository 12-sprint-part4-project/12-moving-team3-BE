import {
  POST_IMAGE_ALLOWED_CONTENT_TYPES,
  POST_IMAGE_MAX_SIZE,
  isValidPostImageKey,
} from '../constants/post-image.constants';
import * as postRepository from '../repositories/post.repository';
import { deleteImage, getObjectMetadata } from '../services/s3.service';
import { AppError } from './app.error';

/** 게시글 imageKeys — S3 존재·prefix·MIME·용량 검증 */
export const assertValidPostImageKeys = async (
  imageKeys: string[]
): Promise<void> => {
  if (imageKeys.length === 0) {
    return;
  }

  if (new Set(imageKeys).size !== imageKeys.length) {
    throw new AppError('INVALID_REQUEST', 'imageKey가 중복되었습니다.');
  }

  await Promise.all(
    imageKeys.map(async (imageKey) => {
      if (!isValidPostImageKey(imageKey)) {
        throw new AppError(
          'INVALID_REQUEST',
          '유효하지 않은 imageKey입니다. posts/ prefix 형식이어야 합니다.'
        );
      }

      const metadata = await getObjectMetadata(imageKey);

      if (!metadata) {
        throw new AppError('INVALID_REQUEST', '업로드되지 않은 이미지입니다.');
      }

      if (metadata.contentLength > POST_IMAGE_MAX_SIZE) {
        throw new AppError('IMAGE_SIZE_EXCEEDED');
      }

      if (
        !metadata.contentType ||
        !(POST_IMAGE_ALLOWED_CONTENT_TYPES as readonly string[]).includes(
          metadata.contentType
        )
      ) {
        throw new AppError('INVALID_IMAGE_FORMAT');
      }
    })
  );
};

const assertImageKeysNotReferenced = async (
  imageKeys: string[]
): Promise<void> => {
  if (imageKeys.length === 0) {
    return;
  }

  const referencedKeys =
    await postRepository.findReferencedPostImageKeys(imageKeys);

  if (referencedKeys.length > 0) {
    throw new AppError('INVALID_REQUEST', '이미 사용 중인 imageKey입니다.');
  }
};

export { assertImageKeysNotReferenced };

/** imageKeys가 DB에 참조되지 않았을 때만 S3에서 삭제한다. */
export const deleteUnreferencedPostImageKeys = async (
  imageKeys: string[]
): Promise<void> => {
  if (imageKeys.length === 0) {
    return;
  }

  const referencedKeys = new Set(
    await postRepository.findReferencedPostImageKeys(imageKeys)
  );
  const deletableKeys = imageKeys.filter((key) => !referencedKeys.has(key));

  await deletePostImageKeysSafely(deletableKeys);
};

/** S3 객체 best-effort 삭제 — 실패해도 throw하지 않는다. */
export const deletePostImageKeysSafely = async (
  imageKeys: string[]
): Promise<void> => {
  if (imageKeys.length === 0) {
    return;
  }

  await Promise.all(
    imageKeys.map(async (imageKey) => {
      try {
        await deleteImage(imageKey);
      } catch {
        // orphan 정리 실패는 요청 처리 결과에 영향을 주지 않는다.
      }
    })
  );
};
