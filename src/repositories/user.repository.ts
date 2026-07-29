import { prisma } from '../lib/prisma';

export const findUserById = async (id: string) => {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      userType: true,
      deletedAt: true,
    },
  });
};
