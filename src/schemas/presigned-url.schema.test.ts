import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  presignedUploadUrlQuerySchema,
  s3KeySchema,
} from './presigned-url.schema';

describe('presignedUploadUrlQuerySchema', () => {
  it('허용된 prefix를 파싱한다', () => {
    const result = presignedUploadUrlQuerySchema.parse({
      filename: 'photo.png',
      contentType: 'image/png',
      prefix: 'profile-images',
    });

    assert.equal(result.prefix, 'profile-images');
    assert.equal(result.filename, 'photo.png');
  });

  it('허용되지 않은 prefix는 실패한다', () => {
    const result = presignedUploadUrlQuerySchema.safeParse({
      filename: 'photo.png',
      contentType: 'image/png',
      prefix: 'other',
    });

    assert.equal(result.success, false);
  });

  it('filename이 비어 있으면 실패한다', () => {
    const result = presignedUploadUrlQuerySchema.safeParse({
      filename: '',
      contentType: 'image/png',
      prefix: 'posts',
    });

    assert.equal(result.success, false);
  });
});

describe('s3KeySchema', () => {
  it('생략·null·비어 있지 않은 문자열을 허용한다', () => {
    assert.equal(s3KeySchema.parse(undefined), undefined);
    assert.equal(s3KeySchema.parse(null), null);
    assert.equal(s3KeySchema.parse('profile-images/key'), 'profile-images/key');
    assert.equal(s3KeySchema.safeParse('').success, false);
  });
});
