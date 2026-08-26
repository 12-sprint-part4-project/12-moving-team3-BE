import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { toPublicViewUrl } from './s3.service';

const ENV_KEYS = [
  'CDN_BASE_URL',
  'S3_PUBLIC_BASE_URL',
  'AWS_S3_BUCKET_NAME',
  'AWS_REGION',
] as const;

const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
  {};

const restoreEnv = (): void => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

const clearPublicUrlEnv = (): void => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
};

describe('toPublicViewUrl', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('s3Key가 없으면 null을 반환한다', () => {
    assert.equal(toPublicViewUrl(null), null);
    assert.equal(toPublicViewUrl(undefined), null);
    assert.equal(toPublicViewUrl(''), null);
  });

  it('CDN_BASE_URL을 우선하고 끝 슬래시를 제거한다', () => {
    clearPublicUrlEnv();
    process.env.CDN_BASE_URL = 'https://cdn.example.com/';
    process.env.S3_PUBLIC_BASE_URL = 'https://s3.example.com';

    assert.equal(
      toPublicViewUrl('profile-images/a.png'),
      'https://cdn.example.com/profile-images/a.png'
    );
  });

  it('CDN이 없으면 S3_PUBLIC_BASE_URL을 사용한다', () => {
    clearPublicUrlEnv();
    process.env.S3_PUBLIC_BASE_URL = 'https://s3.example.com/';

    assert.equal(
      toPublicViewUrl('profile-images/a.png'),
      'https://s3.example.com/profile-images/a.png'
    );
  });

  it('공개 URL env가 없으면 버킷 URL로 조합한다', () => {
    clearPublicUrlEnv();
    process.env.AWS_S3_BUCKET_NAME = 'my-bucket';
    process.env.AWS_REGION = 'ap-northeast-2';

    assert.equal(
      toPublicViewUrl('profile-images/a.png'),
      'https://my-bucket.s3.ap-northeast-2.amazonaws.com/profile-images/a.png'
    );
  });

  it('공개 URL을 만들 설정이 없으면 예외를 던진다', () => {
    clearPublicUrlEnv();

    assert.throws(() => toPublicViewUrl('profile-images/a.png'));
  });
});
