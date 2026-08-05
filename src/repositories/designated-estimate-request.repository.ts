import { prisma } from '../lib/prisma';

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
  moverId: string
): Promise<DesignatedEstimateMoverRow | null> => {
  return prisma.estimateDesignatedMover.findUnique({
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
 * 지정 견적 행 생성
 */
export const create = async (
  estimateId: number,
  moverId: string
): Promise<DesignatedEstimateMoverRow> => {
  return prisma.estimateDesignatedMover.create({
    data: {
      estimateId,
      moverId,
    },
    select: designatedMoverSelect,
  });
};
