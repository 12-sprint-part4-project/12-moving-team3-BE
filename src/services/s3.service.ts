import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type {} from 'multer';
import { s3Client } from '../config/s3';

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
