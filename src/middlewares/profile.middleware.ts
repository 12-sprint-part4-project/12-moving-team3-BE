import { UserType } from '@prisma/client';
import type { RequestHandler } from 'express';
import * as customerProfileRepository from '../repositories/customer-profile.repository';
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
