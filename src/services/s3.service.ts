import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from '../config/s3';

interface CreatePresignedUploadUrlInput {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn: number;
}

/** S3 PUT용 Presigned URL을 발급한다. ContentType·ContentLength를 서명에 강제 포함한다. */
export const createPresignedUploadUrl = async (
  input: CreatePresignedUploadUrlInput
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
  });

  // S3RequestPresigner는 기본적으로 content-type을 unsignable로 두므로,
  // signableHeaders로 명시해야 업로드 MIME/크기를 URL 서명으로 강제할 수 있다.
  return getSignedUrl(s3Client, command, {
    expiresIn: input.expiresIn,
    signableHeaders: new Set(['content-type', 'content-length']),
  });
};

/** S3 GET용 Presigned URL을 발급한다. (조회용) */
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

export const deleteImage = async (key: string): Promise<void> => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
};
