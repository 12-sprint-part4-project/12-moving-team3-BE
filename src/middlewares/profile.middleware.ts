import { UserType } from '@prisma/client';
import type { RequestHandler } from 'express';
import type { ErrorCode } from '../constants/error.codes';
import * as customerProfileRepository from '../repositories/customer-profile.repository';
import * as moverProfileRepository from '../repositories/mover-profile.repository';
import type { PresignedUploadUrlQuery } from '../schemas/presigned-url.schema';
import { AppError } from '../utils/app.error';
import { resolveIsProfileCompleted } from '../utils/profile.util';
import { getAuthenticatedUser } from './auth.middleware';

type ProfileUserType = typeof UserType.CUSTOMER | typeof UserType.MOVER;

/**
 * 유저 타입별 프로필 완료 여부를 검사하는 미들웨어 팩토리
 * requireAuth + allowUserTypes(...) 뒤에 사용
 */
const requireCompletedProfileForType =
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
export const requireCompletedCustomerProfile = requireCompletedProfileForType(
  UserType.CUSTOMER,
  'PROFILE_NOT_FOUND'
);

/** 기사 프로필 등록이 완료된 사용자만 통과 */
export const requireCompletedMoverProfile = requireCompletedProfileForType(
  UserType.MOVER,
  'PROFILE_NOT_FOUND'
);

/** CUSTOMER/MOVER 공통 — 채팅 등 양쪽이 쓰는 API용 */
export const requireCompletedProfile: RequestHandler = (req, res, next) => {
  const { userType } = getAuthenticatedUser(res);

  if (userType === UserType.CUSTOMER) {
    return requireCompletedCustomerProfile(req, res, next);
  }

  if (userType === UserType.MOVER) {
    return requireCompletedMoverProfile(req, res, next);
  }

  next();
};

/** chat-attachments presign만 프로필 완료 요구 (validateRequest 뒤) */
export const requireCompletedProfileForChatAttachment: RequestHandler = (
  req,
  res,
  next
) => {
  const query = res.locals.validated?.query as
    PresignedUploadUrlQuery | undefined;

  if (query?.prefix !== 'chat-attachments') {
    next();
    return;
  }

  return requireCompletedProfile(req, res, next);
};
