import {
  Prisma,
  QuoteStatus,
  type MoveType,
  type Region,
} from '@prisma/client';

import { prisma } from '../lib/prisma';
import { MOVER_SORT_FIELDS } from '../schemas/movers.schema';
import type {
  FavoriteListCursor,
  MoverListCursor,
} from '../utils/movers-cursor.util';

/** 기사 목록 정렬 — 모두 내림차순(많은/높은 순). SSOT: MOVER_SORT_FIELDS */
export type MoverListSort = (typeof MOVER_SORT_FIELDS)[number];

const DEFAULT_MOVER_LIST_SORT: MoverListSort = 'reviewCount';

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
      name: true,
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

/** 집계 정렬 시 커서용 정렬값이 붙은 목록 행 */
export type MoverListRow = Prisma.MoverProfileGetPayload<{
  include: typeof moverListInclude;
}> & {
  listSortValue?: number;
};

const moverDetailInclude = {
  user: {
    select: {
      id: true,
      name: true,
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

const isAggregateSort = (
  sort: MoverListSort
): sort is Exclude<MoverListSort, 'career'> =>
  sort === 'reviewCount' ||
  sort === 'averageRating' ||
  sort === 'confirmedCount';

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
            name: { contains: filters.keyword, mode: 'insensitive' },
          },
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
  const conditions: Prisma.FavoriteWhereInput[] = [{ userId: params.userId }];

  if (params.onlyActiveMovers) {
    conditions.push({ mover: buildActiveMoverUserWhere() });
  }

  return { AND: conditions };
};

/** 경력 많은 순(desc) 키셋 커서 */
const buildCareerCursorCondition = (
  cursor: MoverListCursor
): Prisma.MoverProfileWhereInput => {
  const career = Number(cursor.value);

  return {
    OR: [
      { career: { lt: career } },
      { AND: [{ career }, { id: { lt: cursor.id } }] },
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

interface RankedCandidate {
  id: number;
  userId: string;
  sortValue: number;
}

const compareRankedDesc = (a: RankedCandidate, b: RankedCandidate): number => {
  if (b.sortValue !== a.sortValue) {
    return b.sortValue - a.sortValue;
  }

  return b.id - a.id;
};

/** desc 키셋: 커서 이후(더 작거나, 같으면 id가 더 작은) 항목만 */
const isAfterDescCursor = (
  item: RankedCandidate,
  cursor: MoverListCursor
): boolean => {
  const cursorValue = Number(cursor.value);

  return (
    item.sortValue < cursorValue ||
    (item.sortValue === cursorValue && item.id < cursor.id)
  );
};

/**
 * 리뷰 수·평점·확정 건수 정렬값 일괄 조회 (Prisma only)
 * - reviewCount / averageRating: Review + Quote 관계
 * - confirmedCount: Quote groupBy
 */
const loadAggregateSortValuesByMoverIds = async (
  moverIds: string[],
  sort: Exclude<MoverListSort, 'career'>,
  dbClient: Prisma.TransactionClient | typeof prisma
): Promise<Map<string, number>> => {
  const uniqueMoverIds = [...new Set(moverIds.filter(Boolean))];
  const result = new Map<string, number>();

  for (const moverId of uniqueMoverIds) {
    result.set(moverId, 0);
  }

  if (uniqueMoverIds.length === 0) {
    return result;
  }

  if (sort === 'confirmedCount') {
    const rows = await dbClient.quote.groupBy({
      by: ['moverId'],
      where: {
        moverId: { in: uniqueMoverIds },
        status: QuoteStatus.CONFIRMED,
        deletedAt: null,
      },
      _count: { _all: true },
    });

    for (const row of rows) {
      if (row.moverId != null) {
        result.set(row.moverId, row._count._all);
      }
    }

    return result;
  }

  const reviews = await dbClient.review.findMany({
    where: {
      deletedAt: null,
      quote: {
        deletedAt: null,
        moverId: { in: uniqueMoverIds },
      },
    },
    select: {
      rating: true,
      quote: {
        select: { moverId: true },
      },
    },
  });

  const aggregates = new Map<string, { sum: number; count: number }>();

  for (const review of reviews) {
    const moverId = review.quote.moverId;
    if (!moverId) {
      continue;
    }

    const current = aggregates.get(moverId) ?? { sum: 0, count: 0 };
    current.sum += review.rating;
    current.count += 1;
    aggregates.set(moverId, current);
  }

  for (const [moverId, { sum, count }] of aggregates) {
    if (sort === 'reviewCount') {
      result.set(moverId, count);
      continue;
    }

    // averageRating — 리뷰 통계와 동일하게 소수 1자리
    result.set(moverId, count === 0 ? 0 : Math.round((sum / count) * 10) / 10);
  }

  return result;
};

const findMoversByAggregateSort = async (
  filters: FindMoversFilters,
  sort: Exclude<MoverListSort, 'career'>,
  limit: number,
  dbClient: Prisma.TransactionClient | typeof prisma
): Promise<{ items: MoverListRow[]; hasNextPage: boolean }> => {
  const candidates = await dbClient.moverProfile.findMany({
    where: buildMoverListWhere(filters),
    select: { id: true, userId: true },
  });

  if (candidates.length === 0) {
    return { items: [], hasNextPage: false };
  }

  const sortValues = await loadAggregateSortValuesByMoverIds(
    candidates.map((candidate) => candidate.userId),
    sort,
    dbClient
  );

  let ranked: RankedCandidate[] = candidates.map((candidate) => ({
    id: candidate.id,
    userId: candidate.userId,
    sortValue: sortValues.get(candidate.userId) ?? 0,
  }));

  ranked.sort(compareRankedDesc);

  const { cursor } = filters;
  if (cursor) {
    ranked = ranked.filter((item) => isAfterDescCursor(item, cursor));
  }

  const hasNextPage = ranked.length > limit;
  const pageRows = hasNextPage ? ranked.slice(0, limit) : ranked;
  const ids = pageRows.map((row) => row.id);

  if (ids.length === 0) {
    return { items: [], hasNextPage: false };
  }

  const profiles = await dbClient.moverProfile.findMany({
    where: { id: { in: ids } },
    include: moverListInclude,
  });
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const sortValueById = new Map(pageRows.map((row) => [row.id, row.sortValue]));

  const items: MoverListRow[] = [];
  for (const id of ids) {
    const profile = profileById.get(id);
    if (!profile) {
      continue;
    }

    items.push({
      ...profile,
      listSortValue: sortValueById.get(id) ?? 0,
    });
  }

  return { items, hasNextPage };
};

const moversRepository = {
  findMovers: async (
    filters: FindMoversFilters,
    tx?: Prisma.TransactionClient
  ): Promise<{
    items: MoverListRow[];
    hasNextPage: boolean;
    sort: MoverListSort;
  }> => {
    const dbClient = tx ?? prisma;
    const sort = filters.sort ?? DEFAULT_MOVER_LIST_SORT;
    const limit = filters.limit ?? 10;

    if (isAggregateSort(sort)) {
      const { items, hasNextPage } = await findMoversByAggregateSort(
        filters,
        sort,
        limit,
        dbClient
      );

      return { items, hasNextPage, sort };
    }

    // career — MoverProfile 컬럼이므로 DB orderBy + 키셋 커서
    const baseWhere = buildMoverListWhere(filters);
    const where: Prisma.MoverProfileWhereInput = filters.cursor
      ? {
          AND: [baseWhere, buildCareerCursorCondition(filters.cursor)],
        }
      : baseWhere;

    const rows = await dbClient.moverProfile.findMany({
      where,
      orderBy: [{ career: 'desc' }, { id: 'desc' }],
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
                // 이사유형 Chip용 — FE favorites 매퍼가 item.service 또는 moverProfile.service 사용
                service: true,
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

export default moversRepository;
