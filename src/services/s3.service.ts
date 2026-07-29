import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import type {} from 'multer';
import { s3Client } from '../config/s3';

interface CreatePresignedUploadUrlInput {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn: number;
}

/** S3 PUT용 Presigned URL을 발급한다. ContentLength·ContentType이 서명에 포함된다. */
export const createPresignedUploadUrl = async (
  input: CreatePresignedUploadUrlInput
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
  });

  return getSignedUrl(s3Client, command, { expiresIn: input.expiresIn });
};

export const uploadImage = async (
  file: Express.Multer.File,
  directory: string
): Promise<string> => {
  const key = `${directory}/${randomUUID()}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await s3Client.send(command);

  return key;
};

export const deleteImage = async (key: string): Promise<void> => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
};
