import { MoveType, Region } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const findCustomerProfileByUserId = async (userId: string) => {
  return prisma.customerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      region: true,
      service: true,
    },
  });
};

export interface UpdateCustomerProfileInput {
  userId: string;
  region: Region;
  service: MoveType[];
}

export const updateCustomerProfile = async (
  input: UpdateCustomerProfileInput
) => {
  return prisma.customerProfile.update({
    where: { userId: input.userId },
    data: {
      region: input.region,
      service: input.service,
    },
    select: {
      region: true,
      service: true,
      updatedAt: true,
    },
  });
};
