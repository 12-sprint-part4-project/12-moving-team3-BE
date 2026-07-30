import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { s3Client } from '../config/s3';

interface S3ObjectMetadata {
  contentLength: number;
  contentType: string | undefined;
}

export const createPresignedUploadUrl = async (
  filename: string,
  contentType: string,
  prefix: string
): Promise<{ uploadUrl: string; s3Key: string }> => {
  const s3Key = `${prefix}/${randomUUID()}_${filename}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: s3Key,
    ContentType: contentType,
  });

  // 5분간 유효한 업로드용 Presigned URL
  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 60 * 5,
  });

  return { uploadUrl, s3Key };
};

export const createPresignedViewUrl = async (
  key: string,
  expiresIn = 60 * 60
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
};

/** s3Key가 있으면 조회용 Presigned URL, 없으면 null */
export const toPresignedViewUrl = async (
  s3Key: string | null | undefined
): Promise<string | null> => {
  if (!s3Key) {
    return null;
  }

  return createPresignedViewUrl(s3Key);
};

export const deleteImage = async (key: string): Promise<void> => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
};

/** S3 객체 메타데이터(크기·MIME)를 조회한다. 객체가 없으면 null. */
export const getObjectMetadata = async (
  key: string
): Promise<S3ObjectMetadata | null> => {
  try {
    const result = await s3Client.send(
      new HeadObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key,
      })
    );

    if (result.ContentLength === undefined) {
      return null;
    }

    return {
      contentLength: result.ContentLength,
      contentType: result.ContentType,
    };
  } catch (error) {
    if (isS3ObjectNotFoundError(error)) {
      return null;
    }

    throw error;
  }
};

/** S3 객체가 없음을 나타내는 에러인지 판별한다. */
const isS3ObjectNotFoundError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if (
    'name' in error &&
    (error.name === 'NotFound' || error.name === 'NoSuchKey')
  ) {
    return true;
  }

  if (
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata &&
    error.$metadata.httpStatusCode === 404
  ) {
    return true;
  }

  return false;
};
