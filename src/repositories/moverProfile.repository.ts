import { prisma } from '../lib/prisma';

import { MoveType } from '@prisma/client';

interface CreateMoverProfileInput {
  userId: string;
  service: MoveType[];
  career: number;
  description: string;
  shortDescription: string;
}

interface UpdateMoverProfileInput {
  service: MoveType[];
  career: number;
  description: string;
  shortDescription: string;
}

const moverProfileRepository = {
  createMoverProfile: async (
    data: CreateMoverProfileInput,
    tx: Prisma.TransactionClient
  ) => {
    const dbClient = tx || prisma;
    return dbClient.moverProfile.create({
      data,
    });
  },
  updateMoverProfile: async (
    id: number,
    data: UpdateMoverProfileInput,
    tx: Prisma.TransactionClient
  ) => {
    const dbClient = tx || prisma;
    return dbClient.moverProfile.update({
      where: { id },
      data,
    });
  },
  deleteMoverProfile: async (id: number, tx: Prisma.TransactionClient) => {
    const dbClient = tx || prisma;
    return dbClient.moverProfile.delete({
      where: { id },
    });
  },
};

export default moverProfileRepository;
