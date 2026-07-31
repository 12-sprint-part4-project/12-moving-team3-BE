import { UserType } from '@prisma/client';
import type { RequestHandler } from 'express';
import type { ErrorCode } from '../constants/error.codes';
import * as customerProfileRepository from '../repositories/customer-profile.repository';
import * as moverProfileRepository from '../repositories/mover-profile.repository';
import { AppError } from '../utils/app.error';
import { resolveIsProfileCompleted } from '../utils/profile.util';
import { getAuthenticatedUser } from './auth.middleware';

type ProfileUserType = typeof UserType.CUSTOMER | typeof UserType.MOVER;

/**
 * 유저 타입별 프로필 완료 여부를 검사하는 미들웨어 팩토리
 * requireAuth + allowUserTypes(...) 뒤에 사용
 */
const requireCompletedProfile =
  (userType: ProfileUserType, incompleteErrorCode: ErrorCode): RequestHandler =>
  async (_req, res, next) => {
    try {
      const { userId } = getAuthenticatedUser(res);

      const [customerProfile, moverProfile] =
        userType === UserType.CUSTOMER
          ? [
              await customerProfileRepository.findCustomerProfileByUserId(
                userId
              ),
              null,
            ]
          : [
              null,
              await moverProfileRepository.findMoverProfileByUserId(userId),
            ];

      const isCompleted = resolveIsProfileCompleted(
        userType,
        customerProfile,
        moverProfile
      );

      if (!isCompleted) {
        throw new AppError(incompleteErrorCode);
      }

      next();
    } catch (error) {
      next(error);
    }
  };

/** 고객 프로필 등록이 완료된 사용자만 통과 */
export const requireCompletedCustomerProfile = requireCompletedProfile(
  UserType.CUSTOMER,
  'PROFILE_NOT_FOUND'
);

/** 기사 프로필 등록이 완료된 사용자만 통과 */
export const requireCompletedMoverProfile = requireCompletedProfile(
  UserType.MOVER,
  'PROFILE_NOT_REGISTERED'
);
