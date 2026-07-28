import * as customerProfileRepository from '../repositories/customer-profile.repository';
import type { CustomerProfileBody } from '../schemas/customer-profile.schema';
import { AppError } from '../utils/app.error';
import { uploadImage } from './s3.service.js';

export interface RegisterCustomerProfileInput {
  userId: string;
  body: CustomerProfileBody;
  file?: Express.Multer.File;
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

  let profileImageKey: string | null = null;

  if (input.file) {
    profileImageKey = await uploadImage(input.file, 'profile-images');
  }

  const profile = await customerProfileRepository.updateCustomerProfile({
    userId: input.userId,
    region: input.body.region,
    service: input.body.service,
    profileImageKey,
  });

  return {
    region: profile.region,
    service: profile.service,
    profileImageKey,
    updatedAt: profile.updatedAt,
  };
};
