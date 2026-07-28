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

export interface RegisterCustomerProfileInput {
  userId: string;
  region: Region;
  service: MoveType[];
  profileImageKey: string | null;
}

export const registerCustomerProfile = async (
  input: RegisterCustomerProfileInput
) => {
  return prisma.$transaction(async (tx) => {
    await tx.customerProfile.update({
      where: { userId: input.userId },
      data: {
        region: input.region,
        service: input.service,
      },
    });

    const user = await tx.user.update({
      where: { id: input.userId },
      data: {
        profileImageKey: input.profileImageKey,
      },
      select: {
        profileImageKey: true,
      },
    });

    const profile = await tx.customerProfile.findUniqueOrThrow({
      where: { userId: input.userId },
      select: {
        region: true,
        service: true,
        updatedAt: true,
      },
    });

    return {
      ...profile,
      profileImageKey: user.profileImageKey,
    };
  });
};
