import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from '../config/s3';

/**
 * S3 PUT용 Presigned URL을 발급한다.
 * (so.md: GET /presigned-upload-url)
 */
export const createPresignedUploadUrl = async (
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; s3Key: string }> => {
  const s3Key = `uploads/${Date.now()}_${filename}`;

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

/**
 * S3 GET용 Presigned URL을 발급한다. (조회용)
 * (so.md: 사진 목록 조회)
 */
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
