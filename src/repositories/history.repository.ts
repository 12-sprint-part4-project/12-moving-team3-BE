import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type DbClient = typeof prisma | Prisma.TransactionClient;

/** 공용 History 테이블에 이력을 저장한다. 트랜잭션 안에서는 tx를 넘겨 원자성을 유지한다. */
export const createHistory = async (
  db: DbClient,
  data: Prisma.HistoryUncheckedCreateInput
) => {
  return db.history.create({ data });
};
