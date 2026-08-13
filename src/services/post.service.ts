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
import {
  isPostContentEmpty,
  sanitizePostHtml,
  stripPostContent,
  stripPostContentPreview,
  isHtmlContent,
} from '../utils/post-content.util';
import {
  assertValidPostImageKeys,
  assertImageKeysNotReferenced,
  deleteUnreferencedPostImageKeys,
} from '../utils/post-image.util';
import { toAppErrorFromPrisma } from '../utils/prisma-error.util';
import { toPublicViewUrl } from './s3.service';

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

const resolvePostContent = (content: string): string => {
  const sanitized = isHtmlContent(content) ? sanitizePostHtml(content) : content;

  if (isPostContentEmpty(sanitized)) {
    throw new AppError('POST_CONTENT_EMPTY');
  }

  return sanitized;
};

const mapPostListItem = (
  post: Awaited<ReturnType<typeof postRepository.findPosts>>[number],
  userId?: string
) => ({
  id: post.id,
  category: post.category,
  region: post.region ?? null,
  title: post.title,
  contentPreview: stripPostContentPreview(post.content).slice(
    0,
    CONTENT_PREVIEW_MAX_LENGTH
  ),
  thumbnailUrl: toPublicViewUrl(post.images[0]?.imageKey),
  author: {
    id: post.user.id,
    nickname: post.user.nickname,
    profileImageUrl: toPublicViewUrl(post.user.profileImageKey),
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
  hideCompleted?: PostListQuery['hideCompleted'];
}) => ({
  category: query.category,
  excludeCategories:
    query.category === undefined ? [PostsCategory.FURNITURE_SHARE] : undefined,
  region: query.region,
  keyword: query.keyword,
  hideCompleted: query.hideCompleted,
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
    items: items.map((post) => mapPostListItem(post, userId)),
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
    images: post.images.map((img) => ({
      imageKey: img.imageKey,
      imageUrl: toPublicViewUrl(img.imageKey),
    })),
    author: {
      id: post.user.id,
      nickname: post.user.nickname,
      profileImageUrl: toPublicViewUrl(post.user.profileImageKey),
    },
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    isLiked: userId ? (post.likes?.length ?? 0) > 0 : null,
    isMine: userId ? post.user.id === userId : null,
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
    body.region === undefined
  ) {
    throw new AppError('POST_REGION_REQUIRED');
  }

  await assertValidPostImageKeys(body.imageKeys);
  await assertImageKeysNotReferenced(body.imageKeys);

  const content = resolvePostContent(body.content);

  try {
    const post = await postRepository.createPost(userId, {
      ...body,
      content,
    });

    return { id: post.id };
  } catch (error) {
    await deleteUnreferencedPostImageKeys(body.imageKeys);

    const appError = toAppErrorFromPrisma(error);

    if (appError) {
      throw appError;
    }

    throw error;
  }
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

  const previousImageKeys =
    body.imageKeys !== undefined
      ? await postRepository.findImageKeysByPostId(postId)
      : [];

  const newImageKeys =
    body.imageKeys !== undefined
      ? body.imageKeys.filter(
          (imageKey) => !previousImageKeys.includes(imageKey)
        )
      : [];

  if (body.imageKeys !== undefined) {
    await assertValidPostImageKeys(body.imageKeys);
    await assertImageKeysNotReferenced(newImageKeys);
  }

  try {
    const updated = await postRepository.updatePost(postId, {
      ...body,
      ...(body.content !== undefined
        ? { content: resolvePostContent(body.content) }
        : {}),
    });

    if (!updated) {
      throw new AppError('POST_NOT_FOUND');
    }

    if (body.imageKeys !== undefined) {
      const nextImageKeySet = new Set(body.imageKeys);
      const removedImageKeys = previousImageKeys.filter(
        (imageKey) => !nextImageKeySet.has(imageKey)
      );

      await deleteUnreferencedPostImageKeys(removedImageKeys);
    }

    return { id: updated.id };
  } catch (error) {
    await deleteUnreferencedPostImageKeys(newImageKeys);

    if (error instanceof AppError) {
      throw error;
    }

    const appError = toAppErrorFromPrisma(error);

    if (appError) {
      throw appError;
    }

    throw error;
  }
};

/** 가구 나눔 게시글 나눔 완료 (작성자만, FURNITURE_SHARE) */
export const completePost = async (postId: number, userId: string) => {
  const post = await postRepository.findPostForComplete(postId);

  if (!post) {
    throw new AppError('POST_NOT_FOUND');
  }

  if (post.userId !== userId) {
    throw new AppError('POST_FORBIDDEN');
  }

  if (post.category !== PostsCategory.FURNITURE_SHARE) {
    throw new AppError('POST_FORBIDDEN');
  }

  if (post.isCompleted === true) {
    throw new AppError('POST_ALREADY_COMPLETED');
  }

  const updatedCount = await postRepository.completePost(postId);

  if (updatedCount === 0) {
    throw new AppError('POST_NOT_FOUND');
  }

  return { id: postId };
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
