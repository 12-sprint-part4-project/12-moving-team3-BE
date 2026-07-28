import * as customerProfileRepository from '../repositories/customer-profile.repository';
import type { CustomerProfileBody } from '../schemas/customer-profile.schema';
import { AppError } from '../utils/app.error';

export interface RegisterCustomerProfileInput {
  userId: string;
  body: CustomerProfileBody;
}

export const registerCustomerProfile = async (
  input: RegisterCustomerProfileInput
) => {
  const existingProfile =
    await customerProfileRepository.findCustomerProfileByUserId(input.userId);

  if (!existingProfile) {
    throw new AppError('PROFILE_NOT_FOUND');
  }

  if (existingProfile.service.length > 0) {
    throw new AppError('PROFILE_ALREADY_COMPLETED');
  }

  const profile = await customerProfileRepository.updateCustomerProfile({
    userId: input.userId,
    region: input.body.region,
    service: input.body.service,
  });

  return {
    region: profile.region,
    service: profile.service,
    // TODO: 이미지 업로드 미들웨어 연결 후 User.profileImageKey 저장 및 URL 응답 추가
    profileImageUrl: null,
    updatedAt: profile.updatedAt,
  };
};
