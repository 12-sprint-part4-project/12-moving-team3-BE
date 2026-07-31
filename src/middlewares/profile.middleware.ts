import { UserType } from '@prisma/client';
import type { RequestHandler } from 'express';
import * as customerProfileRepository from '../repositories/customer-profile.repository';
import * as moverProfileRepository from '../repositories/mover-profile.repository';
import { AppError } from '../utils/app.error';
import { resolveIsProfileCompleted } from '../utils/profile.util';
import {
  getAuthenticatedUser,
  type AuthenticatedUser,
} from './auth.middleware';

/**
 * requireAuth + allowUserTypes('CUSTOMER') 뒤에 사용.
 * 고객 프로필 등록이 완료된 사용자만 통과시킨다.
 */
export const requireCompletedCustomerProfile: RequestHandler = async (
  _req,
  res,
  next
) => {
  try {
    const user: AuthenticatedUser = getAuthenticatedUser(res);
    const customerProfile =
      await customerProfileRepository.findCustomerProfileByUserId(user.userId);

    const isCompleted = resolveIsProfileCompleted(
      UserType.CUSTOMER,
      customerProfile,
      null
    );

    if (!isCompleted) {
      throw new AppError('PROFILE_NOT_FOUND');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * requireAuth + allowUserTypes('MOVER') 뒤에 사용.
 * 기사 프로필 등록이 완료된 사용자만 통과시킨다.
 */
export const requireCompletedMoverProfile: RequestHandler = async (
  _req,
  res,
  next
) => {
  try {
    const user: AuthenticatedUser = getAuthenticatedUser(res);
    const moverProfile =
      await moverProfileRepository.findMoverProfileByUserId(user.userId);

    const isCompleted = resolveIsProfileCompleted(
      UserType.MOVER,
      null,
      moverProfile
    );

    if (!isCompleted) {
      // 기사 도메인 기존 API와 동일 코드 (받은 견적/견적 목록 등)
      throw new AppError('PROFILE_NOT_REGISTERED');
    }

    next();
  } catch (error) {
    next(error);
  }
};
