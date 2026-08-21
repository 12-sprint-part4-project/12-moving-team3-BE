import type { PostsCategory, Region } from '@prisma/client';

// ────────────────────────────────────────────────────────────────────
// 공통
// ────────────────────────────────────────────────────────────────────

export interface PostAuthorDto {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
}

export interface CursorMetaDto {
  nextCursor: string | null;
  hasNextPage: boolean;
}

// ────────────────────────────────────────────────────────────────────
// 게시글
// ────────────────────────────────────────────────────────────────────

/** GET /api/posts — 목록 아이템 */
export interface PostListItemDto {
  id: number;
  category: PostsCategory;
  region: Region | null;
  title: string;
  contentPreview: string;
  thumbnailUrl: string | null;
  author: PostAuthorDto;
  likeCount: number;
  commentCount: number;
  /** 비로그인 시 null */
  isLiked: boolean | null;
  /** FURNITURE_SHARE 외 null */
  isCompleted: boolean | null;
  createdAt: Date;
}

export interface PostListResultDto {
  items: PostListItemDto[];
  meta: CursorMetaDto;
}

/** GET /api/posts/:postId — 상세 */
export interface PostDetailDto {
  id: number;
  category: PostsCategory;
  region: Region | null;
  title: string;
  content: string;
  images: { imageKey: string; imageUrl: string | null }[];
  author: PostAuthorDto;
  likeCount: number;
  commentCount: number;
  /** 비로그인 시 null */
  isLiked: boolean | null;
  /** 비로그인 시 null */
  isMine: boolean | null;
  /** FURNITURE_SHARE 외 null */
  isCompleted: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

/** GET /api/posts/:postId/neighbors */
export interface PostNeighborItemDto {
  id: number;
  title: string;
}

export interface PostNeighborsResultDto {
  prev: PostNeighborItemDto | null;
  next: PostNeighborItemDto | null;
}

/** POST /api/posts, PATCH /api/posts/:postId, PATCH /api/posts/:postId/complete */
export interface PostIdResultDto {
  id: number;
}

// ────────────────────────────────────────────────────────────────────
// 댓글
// ────────────────────────────────────────────────────────────────────

export interface CommentItemDto {
  id: number;
  content: string;
  author: PostAuthorDto;
  /** 비로그인 시 null */
  isMine: boolean | null;
  createdAt: Date;
}

export interface CommentWithRepliesDto extends CommentItemDto {
  replies: CommentItemDto[];
}

export interface CommentListResultDto {
  items: CommentWithRepliesDto[];
  meta: CursorMetaDto;
}

/** POST /api/posts/:postId/comments, POST /api/posts/:postId/comments/:commentId/replies */
export interface CommentIdResultDto {
  id: number;
}
