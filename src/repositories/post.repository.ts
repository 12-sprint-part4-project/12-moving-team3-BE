import { PostsCategory, Region, type Prisma } from '@prisma/client';
import { runAuditedTransaction } from '../lib/audit-context';
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
  keyword?: string;
  sort: PostSort;
  cursor?: PostCursor;
  limit: number;
  userId?: string;
}

export interface PostListFilterParams {
  category?: PostsCategory;
  excludeCategories?: PostsCategory[];
  region?: Region;
  keyword?: string;
}

export interface FindPostNeighborsParams extends PostListFilterParams {
  postId: number;
  sort: PostSort;
}

const buildPostListBaseWhere = (
  params: PostListFilterParams
): Prisma.PostWhereInput => ({
  deletedAt: null,
  ...(params.category && { category: params.category }),
  ...(params.excludeCategories?.length && {
    category: { notIn: params.excludeCategories },
  }),
  ...(params.region && { region: params.region }),
  ...(params.keyword && {
    OR: [
      { title: { contains: params.keyword, mode: 'insensitive' } },
      { content: { contains: params.keyword, mode: 'insensitive' } },
    ],
  }),
});

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

// 게시글 목록 조회 (category, region, keyword는 값이 있을 때만 where에 추가)
export const findPosts = async ({
  category,
  excludeCategories,
  region,
  keyword,
  sort,
  cursor,
  limit,
  userId,
}: FindPostsParams) => {
  const baseWhere = buildPostListBaseWhere({
    category,
    excludeCategories,
    region,
    keyword,
  });

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

const neighborSelect = { id: true, title: true } as const;

/** 게시글 이전/다음 (목록 필터·정렬과 동일). post 없으면 null */
export const findPostNeighbors = async ({
  postId,
  sort,
  ...filterParams
}: FindPostNeighborsParams) => {
  const baseWhere = buildPostListBaseWhere(filterParams);

  const current = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
    select: {
      id: true,
      createdAt: true,
      likeCount: true,
      commentCount: true,
    },
  });

  if (!current) {
    return null;
  }

  const inFilter = await prisma.post.findFirst({
    where: { AND: [baseWhere, { id: postId }] },
    select: { id: true },
  });

  if (!inFilter) {
    return { prev: null, next: null };
  }

  if (sort === 'POPULAR') {
    const [prev, next] = await Promise.all([
      prisma.post.findFirst({
        where: {
          AND: [
            baseWhere,
            {
              OR: [
                { likeCount: { gt: current.likeCount } },
                { likeCount: current.likeCount, id: { gt: current.id } },
              ],
            },
          ],
        },
        orderBy: [{ likeCount: 'asc' }, { id: 'asc' }],
        select: neighborSelect,
      }),
      prisma.post.findFirst({
        where: {
          AND: [
            baseWhere,
            {
              OR: [
                { likeCount: { lt: current.likeCount } },
                { likeCount: current.likeCount, id: { lt: current.id } },
              ],
            },
          ],
        },
        orderBy: [{ likeCount: 'desc' }, { id: 'desc' }],
        select: neighborSelect,
      }),
    ]);

    return { prev, next };
  }

  if (sort === 'MOST_COMMENTED') {
    const [prev, next] = await Promise.all([
      prisma.post.findFirst({
        where: {
          AND: [
            baseWhere,
            {
              OR: [
                { commentCount: { gt: current.commentCount } },
                {
                  commentCount: current.commentCount,
                  id: { gt: current.id },
                },
              ],
            },
          ],
        },
        orderBy: [{ commentCount: 'asc' }, { id: 'asc' }],
        select: neighborSelect,
      }),
      prisma.post.findFirst({
        where: {
          AND: [
            baseWhere,
            {
              OR: [
                { commentCount: { lt: current.commentCount } },
                {
                  commentCount: current.commentCount,
                  id: { lt: current.id },
                },
              ],
            },
          ],
        },
        orderBy: [{ commentCount: 'desc' }, { id: 'desc' }],
        select: neighborSelect,
      }),
    ]);

    return { prev, next };
  }

  const [prev, next] = await Promise.all([
    prisma.post.findFirst({
      where: {
        AND: [
          baseWhere,
          {
            OR: [
              { createdAt: { gt: current.createdAt } },
              { createdAt: current.createdAt, id: { gt: current.id } },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: neighborSelect,
    }),
    prisma.post.findFirst({
      where: {
        AND: [
          baseWhere,
          {
            OR: [
              { createdAt: { lt: current.createdAt } },
              { createdAt: current.createdAt, id: { lt: current.id } },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: neighborSelect,
    }),
  ]);

  return { prev, next };
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

/** 가구 나눔 완료 처리용 게시글 조회 */
export const findPostForComplete = async (postId: number) => {
  return prisma.post.findFirst({
    where: {
      id: postId,
      deletedAt: null,
    },
    select: {
      id: true,
      userId: true,
      category: true,
      isCompleted: true,
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
): Promise<{ id: number } | null> => {
  const run = async (client: DbClient): Promise<{ id: number } | null> => {
    const updateData: Prisma.PostUpdateManyMutationInput = {};

    if (body.content !== undefined) {
      updateData.content = body.content;
    } else if (body.imageKeys !== undefined) {
      updateData.updatedAt = new Date();
    }

    if (Object.keys(updateData).length > 0) {
      const result = await client.post.updateMany({
        where: { id: postId, deletedAt: null },
        data: updateData,
      });

      if (result.count === 0) {
        return null;
      }
    }

    if (body.imageKeys !== undefined) {
      await client.postImage.deleteMany({ where: { postId } });
      await client.postImage.createMany({
        data: body.imageKeys.map((imageKey) => ({ postId, imageKey })),
      });
    }

    return { id: postId };
  };

  if (db) {
    return run(db);
  }

  return runAuditedTransaction(async (tx) => run(tx));
};

/** 게시글 soft delete */
export const softDeletePost = async (postId: number) => {
  return prisma.post.updateMany({
    where: { id: postId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
};

/** 게시글에 연결된 imageKey 목록 */
export const findImageKeysByPostId = async (
  postId: number
): Promise<string[]> => {
  const rows = await prisma.postImage.findMany({
    where: { postId },
    select: { imageKey: true },
  });

  return rows.map((row) => row.imageKey);
};

/** post_images에 참조 중인 imageKey만 반환 */
export const findReferencedPostImageKeys = async (
  imageKeys: string[]
): Promise<string[]> => {
  if (imageKeys.length === 0) {
    return [];
  }

  const rows = await prisma.postImage.findMany({
    where: { imageKey: { in: imageKeys } },
    select: { imageKey: true },
  });

  return rows.map((row) => row.imageKey);
};

/** 가구 나눔 완료 — isCompleted = true. 미완료(null/false)만 갱신, 대상 없으면 0 반환 */
export const completePost = async (postId: number) => {
  const result = await prisma.post.updateMany({
    where: { id: postId, deletedAt: null, isCompleted: { not: true } },
    data: { isCompleted: true },
  });

  return result.count;
};

/** 게시글 조회수 +1. 대상 없으면 0 반환 */
export const incrementViewCount = async (postId: number) => {
  const result = await prisma.post.updateMany({
    where: { id: postId, deletedAt: null },
    data: { viewCount: { increment: 1 } },
  });

  return result.count;
};
