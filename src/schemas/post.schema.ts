import { PostsCategory, Region } from '@prisma/client';
import { z } from 'zod';
import { POST_IMAGE_S3_KEY_PATTERN } from '../constants/post-image.constants';

export const POST_SORT_VALUES = [
  'LATEST',
  'POPULAR',
  'MOST_COMMENTED',
] as const;

export type PostSort = (typeof POST_SORT_VALUES)[number];

/** 목록 응답 content 미리보기 최대 길이 */
export const CONTENT_PREVIEW_MAX_LENGTH = 100;

/** 댓글/대댓글 content 최대 길이 */
export const COMMENT_CONTENT_MAX_LENGTH = 500;

/** trim 후 빈 keyword는 undefined (검색 조건 미적용) */
const optionalKeywordQuerySchema = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(1).optional());

export const postListQuerySchema = z.object({
  category: z.enum(PostsCategory).optional(),
  region: z.enum(Region).optional(),
  keyword: optionalKeywordQuerySchema,
  sort: z.enum(POST_SORT_VALUES).optional().default('LATEST'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

export type PostListQuery = z.infer<typeof postListQuerySchema>;

/** GET /api/posts/:postId/neighbors query (목록과 동일, cursor/limit 제외) */
export const postNeighborsQuerySchema = postListQuerySchema.pick({
  category: true,
  region: true,
  keyword: true,
  sort: true,
});

export type PostNeighborsQuery = z.infer<typeof postNeighborsQuerySchema>;

export const postIdParamsSchema = z.object({
  postId: z.coerce.number().int().positive(),
});

export type PostIdParams = z.infer<typeof postIdParamsSchema>;

export const MAX_POST_IMAGES = 5;

const postImageKeySchema = z.string().regex(POST_IMAGE_S3_KEY_PATTERN, {
  message: 'imageKey는 posts/{uuid}_{filename} 형식의 s3Key여야 합니다.',
});

const optionalPostImageKeysSchema = z.preprocess(
  (value) => (value === null || value === undefined ? [] : value),
  z.array(postImageKeySchema).max(MAX_POST_IMAGES).default([])
);

/** 게시글 생성 요청 바디 */
export const createPostBodySchema = z.object({
  category: z.enum(PostsCategory),
  region: z.enum(Region).optional(),
  title: z.string().min(1).max(100),
  content: z.string().min(1),
  imageKeys: optionalPostImageKeysSchema,
});

export type CreatePostBody = z.infer<typeof createPostBodySchema>;

/** 게시글 수정 요청 바디 (content, imageKeys만 수정 가능) */
export const updatePostBodySchema = z
  .object({
    content: z.string().min(1).optional(),
    imageKeys: z.array(postImageKeySchema).max(MAX_POST_IMAGES).optional(),
  })
  .refine(
    (data) => data.content !== undefined || data.imageKeys !== undefined,
    { message: 'content 또는 imageKeys 중 하나 이상 필요합니다.' }
  );

export type UpdatePostBody = z.infer<typeof updatePostBodySchema>;

export const commentIdParamsSchema = z.object({
  postId: z.coerce.number().int().positive(),
  commentId: z.coerce.number().int().positive(),
});

export type CommentIdParams = z.infer<typeof commentIdParamsSchema>;

export const createCommentBodySchema = z.object({
  content: z.string().min(1).max(COMMENT_CONTENT_MAX_LENGTH),
});

export type CreateCommentBody = z.infer<typeof createCommentBodySchema>;

/** 댓글 목록 조회 query (최상위 댓글 기준 커서 페이지네이션) */
export const commentListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

export type CommentListQuery = z.infer<typeof commentListQuerySchema>;
