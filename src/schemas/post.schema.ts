import { PostsCategory, Region } from '@prisma/client';
import { z } from 'zod';

export const POST_SORT_VALUES = [
  'LATEST',
  'POPULAR',
  'MOST_COMMENTED',
] as const;

export type PostSort = (typeof POST_SORT_VALUES)[number];

/** 목록 응답 content 미리보기 최대 길이 */
export const CONTENT_PREVIEW_MAX_LENGTH = 100;

export const postListQuerySchema = z.object({
  category: z.enum(PostsCategory).optional(),
  region: z.enum(Region).optional(),
  sort: z.enum(POST_SORT_VALUES).optional().default('LATEST'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

export type PostListQuery = z.infer<typeof postListQuerySchema>;

export const postIdParamsSchema = z.object({
  postId: z.coerce.number().int().positive(),
});

export type PostIdParams = z.infer<typeof postIdParamsSchema>;
