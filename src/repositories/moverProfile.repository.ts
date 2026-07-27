import type { MoveType, Prisma, Region } from '@prisma/client';

import { prisma } from '../lib/prisma';

export type MoverListSort =
  | 'career_asc'
  | 'career_desc'
  | 'createdAt_asc'
  | 'createdAt_desc';

/** service → repository로 넘기는 목록 조회 조건 (Prisma 문법 없음) */
export interface FindMoversFilters {
  keyword?: string;
  regions?: Region[];
  moveTypes?: MoveType[];
  sort?: MoverListSort;
  page?: number;
  limit?: number;
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

const buildMoverListWhere = (
  filters: FindMoversFilters
): Prisma.MoverProfileWhereInput => {
  const conditions: Prisma.MoverProfileWhereInput[] = [];

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

const buildMoverListOrderBy = (
  sort: MoverListSort = 'createdAt_desc'
): Prisma.MoverProfileOrderByWithRelationInput => {
  switch (sort) {
    case 'career_asc':
      return { career: 'asc' };
    case 'career_desc':
      return { career: 'desc' };
    case 'createdAt_asc':
      return { createdAt: 'asc' };
    case 'createdAt_desc':
    default:
      return { createdAt: 'desc' };
  }
};

const moverProfileRepository = {
  /** Read: 목록 조회 (where / orderBy / include / pagination은 repository에서 조합) */
  findMovers: async (
    filters: FindMoversFilters,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    return dbClient.moverProfile.findMany({
      where: buildMoverListWhere(filters),
      orderBy: buildMoverListOrderBy(filters.sort),
      include: moverListInclude,
      skip: (page - 1) * limit,
      take: limit,
    });
  },

  /** Read: id로 상세 조회 */
  findMoverProfileById: async (
    id: number,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;

    return dbClient.moverProfile.findUnique({
      where: { id },
      include: moverDetailInclude,
    });
  },

  createMoverProfile: async (
    data: CreateMoverProfileInput,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;

    return dbClient.moverProfile.create({
      data,
      include: moverDetailInclude,
    });
  },

  updateMoverProfile: async (
    id: number,
    data: UpdateMoverProfileInput,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;

    return dbClient.moverProfile.update({
      where: { id },
      data,
      include: moverDetailInclude,
    });
  },

  deleteMoverProfile: async (id: number, tx?: Prisma.TransactionClient) => {
    const dbClient = tx ?? prisma;

    return dbClient.moverProfile.delete({
      where: { id },
    });
  },
};

export default moverProfileRepository;
