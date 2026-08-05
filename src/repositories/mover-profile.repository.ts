import { MoveType, Region, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type DbClient = typeof prisma | Prisma.TransactionClient;

export const findMoverProfileByUserId = async (userId: string) => {
  return prisma.moverProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      service: true,
      user: {
        select: {
          name: true,
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

/** 본인 프로필 조회용 — User·serviceRegions 포함 */
export const findMoverProfileDetailByUserId = async (userId: string) => {
  return prisma.moverProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      service: true,
      career: true,
      shortDescription: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      serviceRegions: {
        select: {
          region: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          nickname: true,
          email: true,
          phoneNumber: true,
          profileImageKey: true,
        },
      },
    },
  });
};

export interface SaveMoverProfileInput {
  userId: string;
  nickname: string;
  career: number;
  shortDescription: string;
  description: string;
  service: MoveType[];
  serviceRegions: Region[];
  profileImageKey?: string | null;
}

export const saveMoverProfile = async (input: SaveMoverProfileInput) => {
  return prisma.$transaction(async (tx) => {
    await tx.moverProfile.update({
      where: { userId: input.userId },
      data: {
        service: input.service,
        career: input.career,
        shortDescription: input.shortDescription,
        description: input.description,
        serviceRegions: {
          deleteMany: {},
          create: input.serviceRegions.map((region) => ({ region })),
        },
      },
    });

    const user = await tx.user.update({
      where: { id: input.userId },
      data: {
        nickname: input.nickname,
        ...(input.profileImageKey !== undefined
          ? { profileImageKey: input.profileImageKey }
          : {}),
      },
      select: {
        nickname: true,
        profileImageKey: true,
      },
    });

    const profile = await tx.moverProfile.findUniqueOrThrow({
      where: { userId: input.userId },
      select: {
        career: true,
        shortDescription: true,
        description: true,
        service: true,
        updatedAt: true,
        serviceRegions: {
          select: {
            region: true,
          },
        },
      },
    });

    return {
      nickname: user.nickname,
      career: profile.career,
      shortDescription: profile.shortDescription,
      description: profile.description,
      service: profile.service,
      serviceRegions: profile.serviceRegions.map((item) => item.region),
      profileImageKey: user.profileImageKey,
      updatedAt: profile.updatedAt,
    };
  });
};

export interface UpdateMoverBasicInfoInput {
  userId: string;
  name?: string;
  phoneNumber?: string;
  passwordHash?: string;
}

export const updateMoverBasicInfo = async (input: UpdateMoverBasicInfoInput) => {
  return prisma.$transaction(async (tx) => {
    const hasUserUpdate =
      input.name !== undefined || input.phoneNumber !== undefined;

    if (hasUserUpdate) {
      await tx.user.update({
        where: { id: input.userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phoneNumber !== undefined
            ? { phoneNumber: input.phoneNumber }
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

    const user = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: {
        name: true,
        email: true,
        phoneNumber: true,
        updatedAt: true,
      },
    });

    return {
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      updatedAt: user.updatedAt,
    };
  });
};
