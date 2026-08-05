import { PostsCategory } from '@prisma/client';
import type {
  CreatePostBody,
  PostListQuery,
  PostNeighborsQuery,
  PostSort,
  UpdatePostBody,
} from '../schemas/post.schema';
import {
  CONTENT_PREVIEW_MAX_LENGTH,
  POST_SORT_VALUES,
} from '../schemas/post.schema';
import * as postRepository from '../repositories/post.repository';
import type { PostCursor } from '../repositories/post.repository';
import { AppError } from '../utils/app.error';
import { toPresignedViewUrl } from './s3.service';

const isPostSort = (value: unknown): value is PostSort =>
  typeof value === 'string' &&
  (POST_SORT_VALUES as readonly string[]).includes(value);

const isPostCursor = (value: unknown): value is PostCursor => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    Number.isInteger(record.id) &&
    (record.id as number) > 0 &&
    isPostSort(record.sort) &&
    typeof record.value === 'string' &&
    record.value.length > 0
  );
};

/** 커서 객체를 base64url 문자열로 인코딩한다. */
const encodeCursor = (cursor: PostCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url');

const NON_NEGATIVE_INT_PATTERN = /^\d+$/;

const assertNonNegativeIntCursorValue = (value: string): void => {
  if (!NON_NEGATIVE_INT_PATTERN.test(value)) {
    throw new AppError('INVALID_QUERY_PARAM');
  }
};

const assertIsoDateCursorValue = (value: string): void => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new AppError('INVALID_QUERY_PARAM');
  }
};

/** base64url 커서를 디코딩한다. sort 불일치·형식 오류 시 INVALID_QUERY_PARAM. */
const decodeCursor = (cursor: string, sort: PostSort): PostCursor => {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  } catch {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  if (!isPostCursor(decoded) || decoded.sort !== sort) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  if (sort === 'POPULAR' || sort === 'MOST_COMMENTED') {
    assertNonNegativeIntCursorValue(decoded.value);
  } else {
    assertIsoDateCursorValue(decoded.value);
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
    return { id: post.id, sort, value: String(post.likeCount) };
  }

  if (sort === 'MOST_COMMENTED') {
    return { id: post.id, sort, value: String(post.commentCount) };
  }

  return { id: post.id, sort, value: post.createdAt.toISOString() };
};

const mapPostListItem = async (
  post: Awaited<ReturnType<typeof postRepository.findPosts>>[number],
  userId?: string
) => ({
  id: post.id,
  category: post.category,
  region: post.region ?? null,
  title: post.title,
  contentPreview: post.content.slice(0, CONTENT_PREVIEW_MAX_LENGTH),
  thumbnailUrl: await toPresignedViewUrl(post.images[0]?.imageKey),
  author: {
    id: post.user.id,
    nickname: post.user.nickname,
    profileImageUrl: await toPresignedViewUrl(post.user.profileImageKey),
  },
  likeCount: post.likeCount,
  commentCount: post.commentCount,
  isLiked: userId ? (post.likes?.length ?? 0) > 0 : null,
  isCompleted:
    post.category === PostsCategory.FURNITURE_SHARE ? post.isCompleted : null,
  createdAt: post.createdAt,
});

const getPostListFilterParams = (query: {
  category?: PostListQuery['category'];
  region?: PostListQuery['region'];
  keyword?: PostListQuery['keyword'];
}) => ({
  category: query.category,
  excludeCategories:
    query.category === undefined ? [PostsCategory.FURNITURE_SHARE] : undefined,
  region: query.region,
  keyword: query.keyword,
});

/** 게시글 목록 조회 */
export const getPosts = async (query: PostListQuery, userId?: string) => {
  const { sort, limit } = query;
  const cursor = query.cursor ? decodeCursor(query.cursor, sort) : undefined;
  const listFilter = getPostListFilterParams(query);

  const rows = await postRepository.findPosts({
    ...listFilter,
    sort,
    cursor,
    limit,
    userId,
  });

  const hasNextPage = rows.length > limit;
  const items = hasNextPage ? rows.slice(0, limit) : rows;
  const lastRow = items.length > 0 ? items[items.length - 1] : undefined;

  return {
    items: await Promise.all(items.map((post) => mapPostListItem(post, userId))),
    meta: {
      nextCursor:
        hasNextPage && lastRow
          ? encodeCursor(getCursorValue(sort, lastRow))
          : null,
      hasNextPage,
    },
  };
};

/** 게시글 이전/다음 조회 */
export const getPostNeighbors = async (
  postId: number,
  query: PostNeighborsQuery
) => {
  const { sort } = query;
  const result = await postRepository.findPostNeighbors({
    postId,
    sort,
    ...getPostListFilterParams(query),
  });

  if (result === null) {
    throw new AppError('POST_NOT_FOUND');
  }

  return {
    prev: result.prev,
    next: result.next,
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
    images: await Promise.all(
      post.images.map(async (img) => ({
        imageUrl: await toPresignedViewUrl(img.imageKey),
      }))
    ),
    author: {
      id: post.user.id,
      nickname: post.user.nickname,
      profileImageUrl: await toPresignedViewUrl(post.user.profileImageKey),
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

/** 게시글 생성 */
export const createPost = async (userId: string, body: CreatePostBody) => {
  if (
    body.category === PostsCategory.FURNITURE_SHARE &&
    (body.latitude === undefined || body.longitude === undefined)
  ) {
    throw new AppError('POST_LOCATION_REQUIRED');
  }

  const post = await postRepository.createPost(userId, body);

  return { id: post.id };
};

const assertPostOwner = async (postId: number, userId: string) => {
  const post = await postRepository.findPostOwner(postId);

  if (!post) {
    throw new AppError('POST_NOT_FOUND');
  }

  if (post.userId !== userId) {
    throw new AppError('POST_FORBIDDEN');
  }
};

/** 게시글 수정 */
export const updatePost = async (
  postId: number,
  userId: string,
  body: UpdatePostBody
) => {
  await assertPostOwner(postId, userId);

  const updated = await postRepository.updatePost(postId, body);

  if (!updated) {
    throw new AppError('POST_NOT_FOUND');
  }

  return { id: updated.id };
};

/** 게시글 삭제 (soft delete) */
export const deletePost = async (postId: number, userId: string) => {
  await assertPostOwner(postId, userId);

  const result = await postRepository.softDeletePost(postId);

  if (result.count === 0) {
    throw new AppError('POST_NOT_FOUND');
  }
};

/** 게시글 조회수 +1 */
export const incrementViewCount = async (postId: number) => {
  const updatedCount = await postRepository.incrementViewCount(postId);

  if (updatedCount === 0) {
    throw new AppError('POST_NOT_FOUND');
  }
};
