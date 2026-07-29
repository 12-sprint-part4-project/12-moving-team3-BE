import * as customerProfileRepository from '../repositories/customer-profile.repository';
import type { CustomerProfileBody } from '../schemas/customer-profile.schema';
import { AppError } from '../utils/app.error';
import type {} from 'multer';
import { uploadImage } from './s3.service';
import { toProfileImageUrl } from '../utils/profile-image.util';

export interface RegisterCustomerProfileInput {
  userId: string;
  body: CustomerProfileBody;
  file?: Express.Multer.File;
}

export const getCustomerProfile = async (userId: string) => {
  const profile =
    await customerProfileRepository.findCustomerProfileDetailByUserId(userId);

  // 프로필 행이 없거나 아직 등록(service)을 완료하지 않은 경우
  if (!profile || profile.service.length === 0) {
    throw new AppError('PROFILE_NOT_FOUND');
  }

  return {
    profileId: profile.id,
    userId: profile.user.id,
    name: profile.user.name,
    email: profile.user.email,
    phoneNumber: profile.user.phoneNumber,
    profileImageUrl: toProfileImageUrl(profile.user.profileImageKey),
    service: profile.service,
    region: profile.region,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};

export const registerCustomerProfile = async (
  input: RegisterCustomerProfileInput
) => {
  const existingProfile =
    await customerProfileRepository.findCustomerProfileByUserId(input.userId);

  if (!existingProfile) {
    throw new AppError('PROFILE_NOT_FOUND');
  }

  if (existingProfile.service.length > 0) {
    throw new AppError('PROFILE_ALREADY_EXISTS');
  }

  const profileImageKey = input.file
    ? await uploadImage(input.file, 'profile-images')
    : null;

  const profile = await customerProfileRepository.registerCustomerProfile({
    userId: input.userId,
    region: input.body.region,
    service: input.body.service,
    profileImageKey,
  });

  return {
    region: profile.region,
    service: profile.service,
    profileImageUrl: toProfileImageUrl(profile.profileImageKey),
    updatedAt: profile.updatedAt,
  };
};
