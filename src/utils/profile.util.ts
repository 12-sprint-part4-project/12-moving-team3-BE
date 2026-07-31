import { UserType } from '@prisma/client';

type ProfileWithService = { service: unknown[] } | null;

/**
 * 유저 타입별 프로필 등록 완료 여부
 * CUSTOMER/MOVER 모두 해당 프로필의 service 가 1개 이상이면 완료
 */
export const resolveIsProfileCompleted = (
  userType: UserType,
  customerProfile: ProfileWithService,
  moverProfile: ProfileWithService
): boolean => {
  if (userType === UserType.CUSTOMER) {
    return (customerProfile?.service.length ?? 0) > 0;
  }

  if (userType === UserType.MOVER) {
    return (moverProfile?.service.length ?? 0) > 0;
  }

  return false;
};
