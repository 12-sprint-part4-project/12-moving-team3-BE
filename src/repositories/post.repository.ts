import { PostsCategory, Region, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type {
  CreatePostBody,
  PostSort,
  UpdatePostBody,
} from '../schemas/post.schema';

type DbClient = typeof prisma | Prisma.TransactionClient;

export interface PostCursor {
  id: number;
  sort: PostSort;
  value: string;
}

export interface FindPostsParams {
  category?: PostsCategory;
  excludeCategories?: PostsCategory[];
  region?: Region;
  sort: PostSort;
  cursor?: PostCursor;
  limit: number;
  userId?: string;
}

/** 정렬 기준 desc + id desc 키셋 커서 조건 */
const buildCursorCondition = (
  sort: PostSort,
  cursor: PostCursor
): Prisma.PostWhereInput => {
  if (sort === 'POPULAR') {
    const likeCount = parseInt(cursor.value, 10);

    return {
      OR: [
        { likeCount: { lt: likeCount } },
        { likeCount, id: { lt: cursor.id } },
      ],
    };
  }

  if (sort === 'MOST_COMMENTED') {
    const commentCount = parseInt(cursor.value, 10);

    return {
      OR: [
        { commentCount: { lt: commentCount } },
        { commentCount, id: { lt: cursor.id } },
      ],
    };
  }

  const createdAt = new Date(cursor.value);

  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { createdAt, id: { lt: cursor.id } },
    ],
  };
};

// 게시글 목록 조회
export const findPosts = async ({
  category,
  excludeCategories,
  region,
  sort,
  cursor,
  limit,
  userId,
}: FindPostsParams) => {
  const baseWhere: Prisma.PostWhereInput = {
    deletedAt: null,
    ...(category && { category }),
    ...(excludeCategories?.length && {
      category: { notIn: excludeCategories },
    }),
    ...(region && { region }),
  };

  const where: Prisma.PostWhereInput = cursor
    ? { AND: [baseWhere, buildCursorCondition(sort, cursor)] }
    : baseWhere;

  const orderBy: Prisma.PostOrderByWithRelationInput[] =
    sort === 'POPULAR'
      ? [{ likeCount: 'desc' }, { id: 'desc' }]
      : sort === 'MOST_COMMENTED'
        ? [{ commentCount: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }];

  return prisma.post.findMany({
    where,
    orderBy,
    take: limit + 1,
    select: {
      id: true,
      category: true,
      region: true,
      title: true,
      content: true,
      likeCount: true,
      commentCount: true,
      isCompleted: true,
      createdAt: true,
      user: {
        select: { id: true, nickname: true, profileImageKey: true },
      },
      // 썸네일용 첫 번째 이미지만 조회
      images: {
        orderBy: { id: 'asc' },
        take: 1,
        select: { imageKey: true },
      },
      ...(userId
        ? {
            likes: {
              where: { userId },
              select: { id: true },
            },
          }
        : {}),
    },
  });
};

// 게시글 상세 조회
// soft delete 적용 — deletedAt이 null인 게시글만 조회
export const findPostById = async (postId: number, userId?: string) => {
  return prisma.post.findFirst({
    where: {
      id: postId,
      deletedAt: null,
    },
    select: {
      id: true,
      category: true,
      region: true,
      title: true,
      content: true,
      likeCount: true,
      commentCount: true,
      isCompleted: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: { id: true, nickname: true, profileImageKey: true },
      },
      // 전체 이미지 조회
      images: {
        orderBy: { id: 'asc' },
        select: { imageKey: true },
      },
      ...(userId
        ? {
            likes: {
              where: { userId },
              select: { id: true },
            },
          }
        : {}),
    },
  });
};

/** 게시글 작성자 조회 (권한 검사용) */
export const findPostOwner = async (postId: number) => {
  return prisma.post.findFirst({
    where: {
      id: postId,
      deletedAt: null,
    },
    select: {
      id: true,
      userId: true,
    },
  });
};

/** 게시글 생성 */
export const createPost = async (userId: string, body: CreatePostBody) => {
  return prisma.post.create({
    data: {
      userId,
      category: body.category,
      region: body.region,
      title: body.title,
      content: body.content,
      latitude: body.latitude,
      longitude: body.longitude,
      images: {
        create: body.imageKeys.map((imageKey) => ({ imageKey })),
      },
    },
    select: { id: true },
  });
};

/** 게시글 수정 (기존 이미지 전체 교체) */
export const updatePost = async (
  postId: number,
  body: UpdatePostBody,
  db?: DbClient
) => {
  const run = async (client: DbClient) => {
    if (body.imageKeys !== undefined) {
      await client.postImage.deleteMany({ where: { postId } });
    }

    return client.post.update({
      where: { id: postId },
      data: {
        ...(body.content !== undefined && { content: body.content }),
        ...(body.imageKeys !== undefined && {
          images: {
            create: body.imageKeys.map((imageKey) => ({ imageKey })),
          },
        }),
      },
      select: { id: true },
    });
  };

  if (db) {
    return run(db);
  }

  return prisma.$transaction(async (tx) => run(tx));
};

/** 게시글 soft delete */
export const softDeletePost = async (postId: number) => {
  return prisma.post.updateMany({
    where: { id: postId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
};
