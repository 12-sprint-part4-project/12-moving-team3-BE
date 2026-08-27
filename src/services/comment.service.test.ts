import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { AppError } from '../utils/app.error';
import {
  createComment,
  createReply,
  deleteComment,
  getComments,
} from './comment.service';

interface MutableCommentRepository {
  findTopLevelComments: (...args: unknown[]) => Promise<unknown[]>;
  findRepliesByParentIds: (...args: unknown[]) => Promise<unknown[]>;
  createComment: (...args: unknown[]) => Promise<unknown>;
  findCommentById: (...args: unknown[]) => Promise<unknown>;
  softDeleteComment: (...args: unknown[]) => Promise<{ count: number }>;
}

interface MutablePostRepository {
  findPostOwner: (postId: number) => Promise<unknown>;
}

interface MutableNotificationService {
  notifyCommunityCommentOrReplyByCommentId: (commentId: number) => Promise<void>;
}

const commentRepository =
  require('../repositories/comment.repository') as MutableCommentRepository;
const postRepository =
  require('../repositories/post.repository') as MutablePostRepository;
const notificationService =
  require('./notification.service') as MutableNotificationService;

const POST_ID = 1;
const USER_ID = 'user-uuid-1111';
const OTHER_USER_ID = 'user-uuid-2222';
const CREATED_AT = new Date('2026-08-01T00:00:00.000Z');

const validAuthor = { id: USER_ID, nickname: '작성자' };

const originals = {
  findPostOwner: postRepository.findPostOwner,
  findTopLevelComments: commentRepository.findTopLevelComments,
  findRepliesByParentIds: commentRepository.findRepliesByParentIds,
  createComment: commentRepository.createComment,
  findCommentById: commentRepository.findCommentById,
  softDeleteComment: commentRepository.softDeleteComment,
  notifyCommunityCommentOrReplyByCommentId:
    notificationService.notifyCommunityCommentOrReplyByCommentId,
};

afterEach(() => {
  postRepository.findPostOwner = originals.findPostOwner;
  commentRepository.findTopLevelComments = originals.findTopLevelComments;
  commentRepository.findRepliesByParentIds = originals.findRepliesByParentIds;
  commentRepository.createComment = originals.createComment;
  commentRepository.findCommentById = originals.findCommentById;
  commentRepository.softDeleteComment = originals.softDeleteComment;
  notificationService.notifyCommunityCommentOrReplyByCommentId =
    originals.notifyCommunityCommentOrReplyByCommentId;
});

// ─────────────────────────────────────────────
// getComments
// ─────────────────────────────────────────────

describe('getComments', () => {
  it('게시글이 없으면 POST_NOT_FOUND 에러', async () => {
    postRepository.findPostOwner = async () => null;

    await assert.rejects(
      () => getComments(POST_ID, { limit: 10 }),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'POST_NOT_FOUND');
        return true;
      }
    );
  });

  it('댓글이 없으면 빈 items 반환', async () => {
    postRepository.findPostOwner = async () => ({ id: POST_ID });
    commentRepository.findTopLevelComments = async () => [];
    commentRepository.findRepliesByParentIds = async () => [];

    const result = await getComments(POST_ID, { limit: 10 });

    assert.deepEqual(result.items, []);
    assert.equal(result.meta.hasNextPage, false);
    assert.equal(result.meta.nextCursor, null);
  });

  it('댓글 목록 반환 및 author 매핑 확인', async () => {
    const comment = {
      id: 1,
      userId: USER_ID,
      content: '댓글 내용',
      createdAt: CREATED_AT,
      user: validAuthor,
    };

    postRepository.findPostOwner = async () => ({ id: POST_ID });
    commentRepository.findTopLevelComments = async () => [comment];
    commentRepository.findRepliesByParentIds = async () => [];

    const result = await getComments(POST_ID, { limit: 10 });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].content, '댓글 내용');
    assert.equal(result.items[0].author.id, USER_ID);
    assert.equal(result.items[0].author.nickname, '작성자');
    assert.equal(result.items[0].isMine, null);
  });

  it('userId 전달 시 isMine 판별', async () => {
    const comment = {
      id: 1,
      userId: USER_ID,
      content: '내 댓글',
      createdAt: CREATED_AT,
      user: validAuthor,
    };

    postRepository.findPostOwner = async () => ({ id: POST_ID });
    commentRepository.findTopLevelComments = async () => [comment];
    commentRepository.findRepliesByParentIds = async () => [];

    const result = await getComments(POST_ID, { limit: 10 }, USER_ID);

    assert.equal(result.items[0].isMine, true);
  });

  it('다른 userId면 isMine false', async () => {
    const comment = {
      id: 1,
      userId: USER_ID,
      content: '다른 사람 댓글',
      createdAt: CREATED_AT,
      user: validAuthor,
    };

    postRepository.findPostOwner = async () => ({ id: POST_ID });
    commentRepository.findTopLevelComments = async () => [comment];
    commentRepository.findRepliesByParentIds = async () => [];

    const result = await getComments(POST_ID, { limit: 10 }, OTHER_USER_ID);

    assert.equal(result.items[0].isMine, false);
  });

  it('limit+1개 반환되면 hasNextPage true, nextCursor 생성', async () => {
    const comments = Array.from({ length: 11 }, (_, i) => ({
      id: i + 1,
      userId: USER_ID,
      content: `댓글 ${i + 1}`,
      createdAt: CREATED_AT,
      user: validAuthor,
    }));

    postRepository.findPostOwner = async () => ({ id: POST_ID });
    commentRepository.findTopLevelComments = async () => comments;
    commentRepository.findRepliesByParentIds = async () => [];

    const result = await getComments(POST_ID, { limit: 10 });

    assert.equal(result.items.length, 10);
    assert.equal(result.meta.hasNextPage, true);
    assert.ok(result.meta.nextCursor !== null);
  });

  it('대댓글이 올바른 댓글에 매핑됨', async () => {
    const comment = {
      id: 1,
      userId: USER_ID,
      content: '댓글',
      createdAt: CREATED_AT,
      user: validAuthor,
    };
    const reply = {
      id: 2,
      userId: OTHER_USER_ID,
      parentId: 1,
      content: '대댓글',
      createdAt: CREATED_AT,
      user: { id: OTHER_USER_ID, nickname: '다른사람' },
    };

    postRepository.findPostOwner = async () => ({ id: POST_ID });
    commentRepository.findTopLevelComments = async () => [comment];
    commentRepository.findRepliesByParentIds = async () => [reply];

    const result = await getComments(POST_ID, { limit: 10 });

    assert.equal(result.items[0].replies.length, 1);
    assert.equal(result.items[0].replies[0].content, '대댓글');
  });
});

// ─────────────────────────────────────────────
// createComment
// ─────────────────────────────────────────────

describe('createComment', () => {
  it('게시글이 없으면 POST_NOT_FOUND 에러', async () => {
    postRepository.findPostOwner = async () => null;

    await assert.rejects(
      () => createComment(POST_ID, USER_ID, '댓글'),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'POST_NOT_FOUND');
        return true;
      }
    );
  });

  it('댓글 생성 성공 시 id 반환', async () => {
    postRepository.findPostOwner = async () => ({ id: POST_ID });
    commentRepository.createComment = async () => ({ id: 99 });
    notificationService.notifyCommunityCommentOrReplyByCommentId = async () => {};

    const result = await createComment(POST_ID, USER_ID, '댓글 내용');

    assert.equal(result.id, 99);
  });
});

// ─────────────────────────────────────────────
// createReply
// ─────────────────────────────────────────────

describe('createReply', () => {
  it('게시글이 없으면 POST_NOT_FOUND 에러', async () => {
    postRepository.findPostOwner = async () => null;

    await assert.rejects(
      () => createReply(POST_ID, 1, USER_ID, '대댓글'),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'POST_NOT_FOUND');
        return true;
      }
    );
  });

  it('부모 댓글이 없으면 COMMENT_NOT_FOUND 에러', async () => {
    postRepository.findPostOwner = async () => ({ id: POST_ID });
    commentRepository.findCommentById = async () => null;

    await assert.rejects(
      () => createReply(POST_ID, 1, USER_ID, '대댓글'),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'COMMENT_NOT_FOUND');
        return true;
      }
    );
  });

  it('부모 댓글이 다른 게시글이면 COMMENT_NOT_FOUND 에러', async () => {
    postRepository.findPostOwner = async () => ({ id: POST_ID });
    commentRepository.findCommentById = async () => ({
      id: 1,
      postId: 999,
      parentId: null,
    });

    await assert.rejects(
      () => createReply(POST_ID, 1, USER_ID, '대댓글'),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'COMMENT_NOT_FOUND');
        return true;
      }
    );
  });

  it('대댓글에 대댓글 달면 REPLY_DEPTH_EXCEEDED 에러', async () => {
    postRepository.findPostOwner = async () => ({ id: POST_ID });
    commentRepository.findCommentById = async () => ({
      id: 2,
      postId: POST_ID,
      parentId: 1, // 이미 대댓글
    });

    await assert.rejects(
      () => createReply(POST_ID, 2, USER_ID, '대댓글의 대댓글'),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'REPLY_DEPTH_EXCEEDED');
        return true;
      }
    );
  });

  it('대댓글 생성 성공 시 id 반환', async () => {
    postRepository.findPostOwner = async () => ({ id: POST_ID });
    commentRepository.findCommentById = async () => ({
      id: 1,
      postId: POST_ID,
      parentId: null,
    });
    commentRepository.createComment = async () => ({ id: 55 });
    notificationService.notifyCommunityCommentOrReplyByCommentId = async () => {};

    const result = await createReply(POST_ID, 1, USER_ID, '대댓글 내용');

    assert.equal(result.id, 55);
  });
});

// ─────────────────────────────────────────────
// deleteComment
// ─────────────────────────────────────────────

describe('deleteComment', () => {
  it('댓글이 없으면 COMMENT_NOT_FOUND 에러', async () => {
    commentRepository.findCommentById = async () => null;

    await assert.rejects(
      () => deleteComment(POST_ID, 1, USER_ID),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'COMMENT_NOT_FOUND');
        return true;
      }
    );
  });

  it('다른 게시글의 댓글이면 COMMENT_NOT_FOUND 에러', async () => {
    commentRepository.findCommentById = async () => ({
      id: 1,
      postId: 999,
      userId: USER_ID,
    });

    await assert.rejects(
      () => deleteComment(POST_ID, 1, USER_ID),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'COMMENT_NOT_FOUND');
        return true;
      }
    );
  });

  it('본인 댓글이 아니면 COMMENT_FORBIDDEN 에러', async () => {
    commentRepository.findCommentById = async () => ({
      id: 1,
      postId: POST_ID,
      userId: OTHER_USER_ID,
    });

    await assert.rejects(
      () => deleteComment(POST_ID, 1, USER_ID),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'COMMENT_FORBIDDEN');
        return true;
      }
    );
  });

  it('삭제된 댓글이 없으면 COMMENT_NOT_FOUND 에러', async () => {
    commentRepository.findCommentById = async () => ({
      id: 1,
      postId: POST_ID,
      userId: USER_ID,
    });
    commentRepository.softDeleteComment = async () => ({ count: 0 });

    await assert.rejects(
      () => deleteComment(POST_ID, 1, USER_ID),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'COMMENT_NOT_FOUND');
        return true;
      }
    );
  });

  it('댓글 삭제 성공', async () => {
    commentRepository.findCommentById = async () => ({
      id: 1,
      postId: POST_ID,
      userId: USER_ID,
    });
    commentRepository.softDeleteComment = async () => ({ count: 1 });

    await assert.doesNotReject(() => deleteComment(POST_ID, 1, USER_ID));
  });
});
