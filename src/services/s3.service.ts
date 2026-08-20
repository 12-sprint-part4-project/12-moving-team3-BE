import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { s3Client } from '../config/s3';

interface S3ObjectMetadata {
  contentLength: number;
  contentType: string | undefined;
}

export interface S3ObjectSummary {
  key: string;
  lastModified: Date;
}

export interface ListObjectsByPrefixOptions {
  maxKeys?: number;
  continuationToken?: string;
}

export interface ListObjectsByPrefixResult {
  objects: S3ObjectSummary[];
  continuationToken?: string;
}

/** prefix 하위 S3 객체 목록 (페이지 단위) */
export const listObjectsByPrefix = async (
  prefix: string,
  options?: ListObjectsByPrefixOptions
): Promise<ListObjectsByPrefixResult> => {
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;

  const result = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Prefix: normalizedPrefix,
      MaxKeys: options?.maxKeys ?? 1000,
      ContinuationToken: options?.continuationToken,
    })
  );

  const objects = (result.Contents ?? [])
    .filter(
      (item): item is { Key: string; LastModified: Date } =>
        typeof item.Key === 'string' &&
        item.Key.length > 0 &&
        item.LastModified instanceof Date
    )
    .map((item) => ({
      key: item.Key,
      lastModified: item.LastModified,
    }));

  return {
    objects,
    continuationToken: result.NextContinuationToken,
  };
};

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

/** s3Key가 있으면 조회용 Presigned URL, 없으면 null (비공개 객체용) */
export const toPresignedViewUrl = async (
  s3Key: string | null | undefined
): Promise<string | null> => {
  if (!s3Key) {
    return null;
  }

  return createPresignedViewUrl(s3Key);
};

/** 공개 조회용 베이스 URL (CDN 우선 → S3_PUBLIC_BASE_URL → 버킷 URL) */
const resolvePublicBaseUrl = (): string => {
  const configured =
    process.env.CDN_BASE_URL?.trim() || process.env.S3_PUBLIC_BASE_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, '');
  }

  const bucket = process.env.AWS_S3_BUCKET_NAME?.trim();
  const region = process.env.AWS_REGION?.trim();

  if (bucket && region) {
    return `https://${bucket}.s3.${region}.amazonaws.com`;
  }

  throw new Error(
    'CDN_BASE_URL 또는 S3_PUBLIC_BASE_URL (또는 AWS_S3_BUCKET_NAME + AWS_REGION)이 필요합니다.'
  );
};

/** s3Key → 공개/CDN URL (profile-images/ 등 공개 prefix용) */
export const toPublicViewUrl = (
  s3Key: string | null | undefined
): string | null => {
  if (!s3Key) {
    return null;
  }

  return `${resolvePublicBaseUrl()}/${s3Key}`;
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
