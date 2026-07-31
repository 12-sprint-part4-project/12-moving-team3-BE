import { UserType } from '@prisma/client';

// 객체 형태는 interface, null 가능 여부는 호출부 파라미터에서 명시
interface ProfileWithService {
  service: unknown[];
}

/**
 * 유저 타입별 프로필 등록 완료 여부
 * CUSTOMER/MOVER 모두 해당 프로필의 service 가 1개 이상이면 완료
 */
export const resolveIsProfileCompleted = (
  userType: UserType,
  customerProfile: ProfileWithService | null,
  moverProfile: ProfileWithService | null
): boolean => {
  if (userType === UserType.CUSTOMER) {
    return (customerProfile?.service.length ?? 0) > 0;
  }

  if (userType === UserType.MOVER) {
    return (moverProfile?.service.length ?? 0) > 0;
  }

  return false;
};
