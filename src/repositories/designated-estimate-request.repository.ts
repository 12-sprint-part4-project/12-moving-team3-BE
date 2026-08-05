import { prisma } from '../lib/prisma';

export interface DesignatedEstimateMoverRow {
  id: number;
  estimateId: number;
  moverId: string;
}

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
    select: {
      id: true,
      estimateId: true,
      moverId: true,
    },
  });
};
