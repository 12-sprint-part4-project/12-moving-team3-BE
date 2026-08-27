import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMMENT_CONTENT_MAX_LENGTH,
  CONTENT_PREVIEW_MAX_LENGTH,
  MAX_POST_IMAGES,
  commentListQuerySchema,
  createCommentBodySchema,
  createPostBodySchema,
  postListQuerySchema,
  updatePostBodySchema,
} from './post.schema';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

describe('상수', () => {
  it('CONTENT_PREVIEW_MAX_LENGTH는 100', () => {
    assert.equal(CONTENT_PREVIEW_MAX_LENGTH, 100);
  });

  it('COMMENT_CONTENT_MAX_LENGTH는 500', () => {
    assert.equal(COMMENT_CONTENT_MAX_LENGTH, 500);
  });

  it('MAX_POST_IMAGES는 5', () => {
    assert.equal(MAX_POST_IMAGES, 5);
  });
});

// ─────────────────────────────────────────────
// postListQuerySchema
// ─────────────────────────────────────────────

describe('postListQuerySchema', () => {
  it('빈 쿼리면 sort=LATEST, limit=10 기본값 적용', () => {
    const result = postListQuerySchema.parse({});
    assert.equal(result.sort, 'LATEST');
    assert.equal(result.limit, 10);
  });

  it('limit 문자열을 숫자로 변환', () => {
    const result = postListQuerySchema.parse({ limit: '5' });
    assert.equal(result.limit, 5);
  });

  it('limit 범위 초과(21)는 실패', () => {
    assert.throws(() => postListQuerySchema.parse({ limit: '21' }));
  });

  it('유효한 sort 값 통과', () => {
    for (const sort of ['LATEST', 'POPULAR', 'MOST_COMMENTED']) {
      const result = postListQuerySchema.parse({ sort });
      assert.equal(result.sort, sort);
    }
  });

  it('유효하지 않은 sort 실패', () => {
    assert.throws(() => postListQuerySchema.parse({ sort: 'INVALID' }));
  });

  it('keyword 공백만 있으면 undefined', () => {
    const result = postListQuerySchema.parse({ keyword: '   ' });
    assert.equal(result.keyword, undefined);
  });

  it('keyword trim 처리', () => {
    const result = postListQuerySchema.parse({ keyword: '  이사  ' });
    assert.equal(result.keyword, '이사');
  });

  it('hideCompleted=true 문자열 → boolean true', () => {
    const result = postListQuerySchema.parse({ hideCompleted: 'true' });
    assert.equal(result.hideCompleted, true);
  });

  it('hideCompleted=false 문자열 → boolean false', () => {
    const result = postListQuerySchema.parse({ hideCompleted: 'false' });
    assert.equal(result.hideCompleted, false);
  });
});

// ─────────────────────────────────────────────
// createPostBodySchema
// ─────────────────────────────────────────────

const validPostBody = {
  category: 'MOVING_TIP',
  title: '이사 팁 공유합니다',
  content: '이사할 때 이런 점이 좋았습니다.',
};

describe('createPostBodySchema', () => {
  it('유효한 게시글 바디 통과', () => {
    const result = createPostBodySchema.parse(validPostBody);
    assert.equal(result.category, 'MOVING_TIP');
    assert.deepEqual(result.imageKeys, []);
  });

  it('imageKeys 없으면 빈 배열 기본값', () => {
    const result = createPostBodySchema.parse(validPostBody);
    assert.deepEqual(result.imageKeys, []);
  });

  it('imageKeys null이면 빈 배열로 처리', () => {
    const result = createPostBodySchema.parse({ ...validPostBody, imageKeys: null });
    assert.deepEqual(result.imageKeys, []);
  });

  it('title 빈 문자열이면 실패', () => {
    assert.throws(() =>
      createPostBodySchema.parse({ ...validPostBody, title: '' })
    );
  });

  it('title 100자 초과면 실패', () => {
    assert.throws(() =>
      createPostBodySchema.parse({ ...validPostBody, title: 'a'.repeat(101) })
    );
  });

  it('content 빈 문자열이면 실패', () => {
    assert.throws(() =>
      createPostBodySchema.parse({ ...validPostBody, content: '' })
    );
  });

  it('유효하지 않은 category 실패', () => {
    assert.throws(() =>
      createPostBodySchema.parse({ ...validPostBody, category: 'UNKNOWN' })
    );
  });

  it('imageKeys 6개 이상이면 실패', () => {
    const imageKeys = Array.from(
      { length: 6 },
      (_, i) => `posts/00000000-0000-4000-8000-00000000000${i}_img.jpg`
    );
    assert.throws(() =>
      createPostBodySchema.parse({ ...validPostBody, imageKeys })
    );
  });
});

// ─────────────────────────────────────────────
// updatePostBodySchema
// ─────────────────────────────────────────────

describe('updatePostBodySchema', () => {
  it('content만 있으면 통과', () => {
    assert.doesNotThrow(() =>
      updatePostBodySchema.parse({ content: '수정된 내용' })
    );
  });

  it('imageKeys만 있으면 통과', () => {
    assert.doesNotThrow(() =>
      updatePostBodySchema.parse({
        imageKeys: ['posts/00000000-0000-4000-8000-000000000001_img.jpg'],
      })
    );
  });

  it('content, imageKeys 둘 다 없으면 실패', () => {
    assert.throws(() => updatePostBodySchema.parse({}));
  });
});

// ─────────────────────────────────────────────
// createCommentBodySchema
// ─────────────────────────────────────────────

describe('createCommentBodySchema', () => {
  it('유효한 댓글 내용 통과', () => {
    const result = createCommentBodySchema.parse({ content: '댓글 내용입니다.' });
    assert.equal(result.content, '댓글 내용입니다.');
  });

  it('빈 content 실패', () => {
    assert.throws(() => createCommentBodySchema.parse({ content: '' }));
  });

  it('500자 초과 content 실패', () => {
    assert.throws(() =>
      createCommentBodySchema.parse({ content: 'a'.repeat(501) })
    );
  });

  it('500자 content 통과', () => {
    assert.doesNotThrow(() =>
      createCommentBodySchema.parse({ content: 'a'.repeat(500) })
    );
  });
});

// ─────────────────────────────────────────────
// commentListQuerySchema
// ─────────────────────────────────────────────

describe('commentListQuerySchema', () => {
  it('빈 쿼리면 limit=10 기본값', () => {
    const result = commentListQuerySchema.parse({});
    assert.equal(result.limit, 10);
  });

  it('limit 문자열 숫자 변환', () => {
    const result = commentListQuerySchema.parse({ limit: '5' });
    assert.equal(result.limit, 5);
  });

  it('limit 20 초과 실패', () => {
    assert.throws(() => commentListQuerySchema.parse({ limit: '21' }));
  });

  it('cursor 없으면 undefined', () => {
    const result = commentListQuerySchema.parse({});
    assert.equal(result.cursor, undefined);
  });
});
