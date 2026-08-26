import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from './app.error';
import {
  decodeMoverListCursor,
  encodeMoverListCursor,
  getMoverListCursorValue,
} from './movers-cursor.util';

describe('encodeMoverListCursor / decodeMoverListCursor', () => {
  it('encode 후 같은 sort로 decode하면 원본을 복원한다', () => {
    const cursor = {
      sort: 'reviewCount' as const,
      value: '12',
      id: 42,
    };

    const decoded = decodeMoverListCursor(
      encodeMoverListCursor(cursor),
      'reviewCount'
    );

    assert.deepEqual(decoded, cursor);
  });

  it('깨진 커서 문자열이면 INVALID_QUERY_PARAM을 던진다', () => {
    assert.throws(
      () => decodeMoverListCursor('not-valid-base64{{{', 'reviewCount'),
      (error: unknown) =>
        error instanceof AppError && error.code === 'INVALID_QUERY_PARAM'
    );
  });

  it('커서로 인코딩된 sort와 요청 sort가 다르면 INVALID_QUERY_PARAM을 던진다', () => {
    const encoded = encodeMoverListCursor({
      sort: 'reviewCount',
      value: '3',
      id: 1,
    });

    assert.throws(
      () => decodeMoverListCursor(encoded, 'career'),
      (error: unknown) =>
        error instanceof AppError && error.code === 'INVALID_QUERY_PARAM'
    );
  });
});

describe('getMoverListCursorValue', () => {
  it('career가 null이면 커서 value를 null로 둔다', () => {
    assert.deepEqual(
      getMoverListCursorValue('career', { id: 7, career: null }),
      {
        sort: 'career',
        value: 'null',
        id: 7,
      }
    );
  });
});
