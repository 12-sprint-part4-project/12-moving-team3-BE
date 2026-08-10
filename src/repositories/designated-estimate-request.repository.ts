import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type DbClient = typeof prisma | Prisma.TransactionClient;

export interface DesignatedEstimateMoverRow {
  id: number;
  estimateId: number;
  moverId: string;
}

const designatedMoverSelect = {
  id: true,
  estimateId: true,
  moverId: true,
} as const;

/**
 * 견적요청 + 기사 조합으로 지정 견적 행 조회
 */
export const findByEstimateIdAndMoverId = async (
  estimateId: number,
  moverId: string,
  db: DbClient = prisma
): Promise<DesignatedEstimateMoverRow | null> => {
  return db.estimateDesignatedMover.findUnique({
    where: {
      estimateId_moverId: {
        estimateId,
        moverId,
      },
    },
    select: designatedMoverSelect,
  });
};

/**
 * 여러 견적요청에 대해 특정 기사의 지정 행 ID를 일괄 조회한다.
 * @returns estimateId → designatedMoverId
 */
export const findIdsByEstimateIdsAndMoverId = async (
  estimateIds: number[],
  moverId: string,
  db: DbClient = prisma
): Promise<Map<number, number>> => {
  const uniqueEstimateIds = [...new Set(estimateIds.filter((id) => id > 0))];
  if (uniqueEstimateIds.length === 0) {
    return new Map();
  }

  const rows = await db.estimateDesignatedMover.findMany({
    where: {
      estimateId: { in: uniqueEstimateIds },
      moverId,
    },
    select: {
      id: true,
      estimateId: true,
    },
  });

  return new Map(rows.map((row) => [row.estimateId, row.id]));
};

/**
 * 한 견적요청의 지정 행을 moverId → id 맵으로 조회한다.
 */
export const findIdMapByEstimateId = async (
  estimateId: number,
  db: DbClient = prisma
): Promise<Map<string, number>> => {
  const rows = await db.estimateDesignatedMover.findMany({
    where: { estimateId },
    select: {
      id: true,
      moverId: true,
    },
  });

  return new Map(rows.map((row) => [row.moverId, row.id]));
};

/**
 * 지정 견적 행 생성
 */
export const create = async (
  estimateId: number,
  moverId: string,
  db: DbClient = prisma
): Promise<DesignatedEstimateMoverRow> => {
  return db.estimateDesignatedMover.create({
    data: {
      estimateId,
      moverId,
    },
    select: designatedMoverSelect,
  });
};
