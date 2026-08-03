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
  phoneNumber: string;
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
        phoneNumber: input.phoneNumber,
        ...(input.profileImageKey !== undefined
          ? { profileImageKey: input.profileImageKey }
          : {}),
      },
      select: {
        nickname: true,
        phoneNumber: true,
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
      phoneNumber: user.phoneNumber,
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
