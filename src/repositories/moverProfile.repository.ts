import type { MoveType, Prisma, Region } from '@prisma/client';

import { prisma } from '../lib/prisma';
import type {
  FavoriteListCursor,
  MoverListCursor,
} from '../utils/movers-cursor.util';

export type MoverListSort =
  | 'career_asc'
  | 'career_desc'
  | 'createdAt_asc'
  | 'createdAt_desc';

const DEFAULT_MOVER_LIST_SORT: MoverListSort = 'createdAt_desc';

/** service → repository로 넘기는 목록 조회 조건 (Prisma 문법 없음) */
export interface FindMoversFilters {
  keyword?: string;
  regions?: Region[];
  moveTypes?: MoveType[];
  sort?: MoverListSort;
  cursor?: MoverListCursor;
  limit?: number;
  /** 삭제되지 않은 MOVER 유저만 조회 */
  onlyActiveMovers?: boolean;
}

export interface FindFavoriteMoversParams {
  userId: string;
  cursor?: FavoriteListCursor;
  limit?: number;
  /** 삭제되지 않은 MOVER 유저만 조회 */
  onlyActiveMovers?: boolean;
}

export interface FindMoverProfileByIdParams {
  moverId: string;
  /** 삭제되지 않은 MOVER 유저만 조회 */
  onlyActiveMovers?: boolean;
}

export interface CreateMoverProfileInput {
  userId: string;
  service: MoveType[];
  career: number;
  description: string;
  shortDescription: string;
}

export interface UpdateMoverProfileInput {
  service: MoveType[];
  career: number;
  description: string;
  shortDescription: string;
}

const moverListInclude = {
  user: {
    select: {
      id: true,
      nickname: true,
      profileImageKey: true,
    },
  },
  serviceRegions: {
    select: {
      id: true,
      region: true,
    },
  },
} satisfies Prisma.MoverProfileInclude;

const moverDetailInclude = {
  user: {
    select: {
      id: true,
      name: true,
      nickname: true,
      profileImageKey: true,
    },
  },
  serviceRegions: {
    select: {
      id: true,
      region: true,
    },
  },
} satisfies Prisma.MoverProfileInclude;

/** addFavorite와 동일한 활성 기사 조건 (deletedAt null + userType MOVER) */
const buildActiveMoverUserWhere = (): Prisma.UserWhereInput => ({
  deletedAt: null,
  userType: 'MOVER',
});

const buildMoverListWhere = (
  filters: FindMoversFilters
): Prisma.MoverProfileWhereInput => {
  const conditions: Prisma.MoverProfileWhereInput[] = [];

  if (filters.onlyActiveMovers) {
    conditions.push({ user: buildActiveMoverUserWhere() });
  }

  if (filters.keyword) {
    conditions.push({
      OR: [
        {
          user: {
            nickname: { contains: filters.keyword, mode: 'insensitive' },
          },
        },
        {
          description: { contains: filters.keyword, mode: 'insensitive' },
        },
        {
          shortDescription: {
            contains: filters.keyword,
            mode: 'insensitive',
          },
        },
      ],
    });
  }

  if (filters.regions && filters.regions.length > 0) {
    conditions.push({
      serviceRegions: {
        some: { region: { in: filters.regions } },
      },
    });
  }

  if (filters.moveTypes && filters.moveTypes.length > 0) {
    conditions.push({
      service: { hasSome: filters.moveTypes },
    });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
};

const buildMoverDetailWhere = (
  params: FindMoverProfileByIdParams
): Prisma.MoverProfileWhereInput => {
  const conditions: Prisma.MoverProfileWhereInput[] = [
    { userId: params.moverId },
  ];

  if (params.onlyActiveMovers) {
    conditions.push({ user: buildActiveMoverUserWhere() });
  }

  return { AND: conditions };
};

const buildFavoriteListWhere = (
  params: FindFavoriteMoversParams
): Prisma.FavoriteWhereInput => {
  const conditions: Prisma.FavoriteWhereInput[] = [
    { userId: params.userId },
  ];

  if (params.onlyActiveMovers) {
    conditions.push({ mover: buildActiveMoverUserWhere() });
  }

  return { AND: conditions };
};

const buildMoverListOrderBy = (
  sort: MoverListSort
): Prisma.MoverProfileOrderByWithRelationInput[] => {
  switch (sort) {
    case 'career_asc':
      return [{ career: 'asc' }, { id: 'asc' }];
    case 'career_desc':
      return [{ career: 'desc' }, { id: 'desc' }];
    case 'createdAt_asc':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'createdAt_desc':
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
};

/** 정렬 방향에 맞는 키셋 커서 조건 */
const buildMoverListCursorCondition = (
  sort: MoverListSort,
  cursor: MoverListCursor
): Prisma.MoverProfileWhereInput => {
  const isDescending = sort.endsWith('_desc');

  if (sort.startsWith('career')) {
    const career = Number(cursor.value);

    return isDescending
      ? {
          OR: [
            { career: { lt: career } },
            { AND: [{ career }, { id: { lt: cursor.id } }] },
          ],
        }
      : {
          OR: [
            { career: { gt: career } },
            { AND: [{ career }, { id: { gt: cursor.id } }] },
          ],
        };
  }

  const createdAt = new Date(cursor.value);

  return isDescending
    ? {
        OR: [
          { createdAt: { lt: createdAt } },
          { AND: [{ createdAt }, { id: { lt: cursor.id } }] },
        ],
      }
    : {
        OR: [
          { createdAt: { gt: createdAt } },
          { AND: [{ createdAt }, { id: { gt: cursor.id } }] },
        ],
      };
};

const buildFavoriteListCursorCondition = (
  cursor: FavoriteListCursor
): Prisma.FavoriteWhereInput => {
  const createdAt = new Date(cursor.value);

  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { AND: [{ createdAt }, { id: { lt: cursor.id } }] },
    ],
  };
};

const moverProfileRepository = {
  findMovers: async (
    filters: FindMoversFilters,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;
    const sort = filters.sort ?? DEFAULT_MOVER_LIST_SORT;
    const limit = filters.limit ?? 10;
    const baseWhere = buildMoverListWhere(filters);
    const where: Prisma.MoverProfileWhereInput = filters.cursor
      ? { AND: [baseWhere, buildMoverListCursorCondition(sort, filters.cursor)] }
      : baseWhere;

    const rows = await dbClient.moverProfile.findMany({
      where,
      orderBy: buildMoverListOrderBy(sort),
      include: moverListInclude,
      take: limit + 1,
    });

    const hasNextPage = rows.length > limit;

    return {
      items: hasNextPage ? rows.slice(0, limit) : rows,
      hasNextPage,
      sort,
    };
  },

  findMoverProfileById: async (
    params: FindMoverProfileByIdParams,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;

    return dbClient.moverProfile.findFirst({
      where: buildMoverDetailWhere(params),
      include: moverDetailInclude,
    });
  },

  findFavoriteMoversById: async (
    params: FindFavoriteMoversParams,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;
    const limit = params.limit ?? 10;
    const baseWhere = buildFavoriteListWhere(params);
    const where: Prisma.FavoriteWhereInput = params.cursor
      ? { AND: [baseWhere, buildFavoriteListCursorCondition(params.cursor)] }
      : baseWhere;

    const rows = await dbClient.favorite.findMany({
      where,
      include: {
        mover: {
          select: {
            id: true,
            name: true,
            profileImageKey: true,
            moverProfile: {
              select: {
                career: true,
                serviceRegions: {
                  select: { id: true, region: true },
                },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasNextPage = rows.length > limit;

    return {
      items: hasNextPage ? rows.slice(0, limit) : rows,
      hasNextPage,
    };
  },
};

export default moverProfileRepository;
