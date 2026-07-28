import { MoveType, Region } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const findMoverProfileByUserId = async (userId: string) => {
  return prisma.moverProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      service: true,
      user: {
        select: {
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
