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
  region:
    | 'SEOUL'
    | 'GYEONGGI'
    | 'INCHEON'
    | 'GANGWON'
    | 'CHUNGBUK'
    | 'CHUNGNAM'
    | 'SEJONG'
    | 'DAEJEON'
    | 'JEONBUK'
    | 'GWANGJU_JEONNAM'
    | 'GYEONGBUK'
    | 'DAEGU'
    | 'ULSAN'
    | 'GYEONGNAM'
    | 'BUSAN'
    | 'JEJU';
  service: ('SMALL' | 'HOME' | 'OFFICE')[];
  profileImageKey: string | null;
}

export const updateCustomerProfile = async (
  input: UpdateCustomerProfileInput
) => {
  return prisma.customerProfile.update({
    where: { userId: input.userId },
    data: {
      region: input.region,
      service: input.service,
      profileImageKey: input.profileImageKey,
    },
    select: {
      region: true,
      service: true,
      updatedAt: true,
    },
  });
};
