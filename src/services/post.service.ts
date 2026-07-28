import { PostsCategory } from '@prisma/client';
import type { PostListQuery } from '../schemas/post.schema';
import { CONTENT_PREVIEW_MAX_LENGTH } from '../schemas/post.schema';
import * as postRepository from '../repositories/post.repository';
import type { PostCursor } from '../repositories/post.repository';
import { AppError } from '../utils/app.error';
import { toProfileImageUrl } from '../utils/profile-image.util';

const isPostCursor = (value: unknown): value is PostCursor => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    Number.isInteger(record.id) &&
    (record.id as number) > 0 &&
    typeof record.value === 'string' &&
    record.value.length > 0
  );
};

/** 커서 객체를 base64url 문자열로 인코딩한다. */
const encodeCursor = (cursor: PostCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url');

/** base64url 커서를 디코딩한다. 형식이 올바르지 않으면 INVALID_QUERY_PARAM. */
const decodeCursor = (cursor: string): PostCursor => {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  } catch {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  if (!isPostCursor(decoded)) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return decoded;
};

const getCursorValue = (
  sort: PostListQuery['sort'],
  post: {
    id: number;
    createdAt: Date;
    likeCount: number;
    commentCount: number;
  }
): PostCursor => {
  if (sort === 'POPULAR') {
    return { id: post.id, value: String(post.likeCount) };
  }

  if (sort === 'MOST_COMMENTED') {
    return { id: post.id, value: String(post.commentCount) };
  }

  return { id: post.id, value: post.createdAt.toISOString() };
};

const mapPostListItem = (
  post: Awaited<ReturnType<typeof postRepository.findPosts>>[number],
  userId?: string
) => ({
  id: post.id,
  category: post.category,
  region: post.region ?? null,
  title: post.title,
  contentPreview: post.content.slice(0, CONTENT_PREVIEW_MAX_LENGTH),
  thumbnailUrl: toProfileImageUrl(post.images[0]?.imageKey),
  author: {
    id: post.user.id,
    nickname: post.user.nickname,
    profileImageUrl: toProfileImageUrl(post.user.profileImageKey),
  },
  likeCount: post.likeCount,
  commentCount: post.commentCount,
  isLiked: userId ? (post.likes?.length ?? 0) > 0 : null,
  isCompleted:
    post.category === PostsCategory.FURNITURE_SHARE ? post.isCompleted : null,
  createdAt: post.createdAt,
});

/** 게시글 목록 조회 */
export const getPosts = async (query: PostListQuery, userId?: string) => {
  const { category, region, sort, limit } = query;
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

  const rows = await postRepository.findPosts({
    category,
    region,
    sort,
    cursor,
    limit,
    userId,
  });

  const hasNextPage = rows.length > limit;
  const items = hasNextPage ? rows.slice(0, limit) : rows;
  const lastRow = items.length > 0 ? items[items.length - 1] : undefined;

  return {
    items: items.map((post) => mapPostListItem(post, userId)),
    meta: {
      nextCursor:
        hasNextPage && lastRow ? encodeCursor(getCursorValue(sort, lastRow)) : null,
      hasNextPage,
    },
  };
};

/** 게시글 상세 조회 */
export const getPostById = async (postId: number, userId?: string) => {
  const post = await postRepository.findPostById(postId, userId);

  if (!post) {
    throw new AppError('POST_NOT_FOUND');
  }

  return {
    id: post.id,
    category: post.category,
    region: post.region ?? null,
    title: post.title,
    content: post.content,
    images: post.images.map((img) => ({
      imageUrl: toProfileImageUrl(img.imageKey),
    })),
    author: {
      id: post.user.id,
      nickname: post.user.nickname,
      profileImageUrl: toProfileImageUrl(post.user.profileImageKey),
    },
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    isLiked: userId ? (post.likes?.length ?? 0) > 0 : null,
    isCompleted:
      post.category === PostsCategory.FURNITURE_SHARE ? post.isCompleted : null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
};
