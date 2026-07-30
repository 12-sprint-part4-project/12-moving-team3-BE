import { MoveType, Region, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type DbClient = typeof prisma | Prisma.TransactionClient;

export const findCustomerProfileByUserId = async (userId: string) => {
  return prisma.customerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      region: true,
      service: true,
      user: {
        select: {
          name: true,
          email: true,
          phoneNumber: true,
          profileImageKey: true,
        },
      },
    },
  });
};

/** 본인 프로필 조회용 — User 정보 포함 */
export const findCustomerProfileDetailByUserId = async (userId: string) => {
  return prisma.customerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      region: true,
      service: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          profileImageKey: true,
        },
      },
    },
  });
};

export const findLocalPasswordHashByUserId = async (
  userId: string,
  db: DbClient = prisma
) => {
  return db.authAccount.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: 'LOCAL',
      },
    },
    select: {
      passwordHash: true,
    },
  });
};

export interface RegisterCustomerProfileInput {
  userId: string;
  region?: Region;
  service?: MoveType[];
  profileImageKey?: string | null;
  name?: string;
  phoneNumber?: string;
  passwordHash?: string;
}

export const registerCustomerProfile = async (
  input: RegisterCustomerProfileInput
) => {
  return prisma.$transaction(async (tx) => {
    const hasProfileUpdate =
      input.region !== undefined || input.service !== undefined;

    if (hasProfileUpdate) {
      await tx.customerProfile.update({
        where: { userId: input.userId },
        data: {
          ...(input.region !== undefined ? { region: input.region } : {}),
          ...(input.service !== undefined ? { service: input.service } : {}),
        },
      });
    }

    const hasUserUpdate =
      input.name !== undefined ||
      input.phoneNumber !== undefined ||
      input.profileImageKey !== undefined;

    if (hasUserUpdate) {
      await tx.user.update({
        where: { id: input.userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phoneNumber !== undefined
            ? { phoneNumber: input.phoneNumber }
            : {}),
          ...(input.profileImageKey !== undefined
            ? { profileImageKey: input.profileImageKey }
            : {}),
        },
      });
    }

    if (input.passwordHash !== undefined) {
      await tx.authAccount.update({
        where: {
          userId_provider: {
            userId: input.userId,
            provider: 'LOCAL',
          },
        },
        data: {
          passwordHash: input.passwordHash,
        },
      });
    }

    const profile = await tx.customerProfile.findUniqueOrThrow({
      where: { userId: input.userId },
      select: {
        id: true,
        region: true,
        service: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            profileImageKey: true,
          },
        },
      },
    });

    return {
      profileId: profile.id,
      userId: profile.user.id,
      name: profile.user.name,
      email: profile.user.email,
      phoneNumber: profile.user.phoneNumber,
      region: profile.region,
      service: profile.service,
      profileImageKey: profile.user.profileImageKey,
      updatedAt: profile.updatedAt,
    };
  });
};
