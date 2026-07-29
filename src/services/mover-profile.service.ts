import type {} from 'multer';
import * as moverProfileRepository from '../repositories/mover-profile.repository';
import type { MoverProfileBody } from '../schemas/mover-profile.schema';
import { deleteImage, uploadImage } from './s3.service';
import { toProfileImageUrl } from '../utils/profile-image.util';
import { AppError } from '../utils/app.error';
import { toAppErrorFromPrisma } from '../utils/prisma-error.util';

export interface SaveMoverProfileInput {
  userId: string;
  body: MoverProfileBody;
  file?: Express.Multer.File;
}

export const saveMoverProfile = async (input: SaveMoverProfileInput) => {
  const existingProfile = await moverProfileRepository.findMoverProfileByUserId(
    input.userId
  );

  if (!existingProfile) {
    throw new AppError('PROFILE_NOT_FOUND');
  }

  const previousProfileImageKey = existingProfile.user.profileImageKey;
  let uploadedProfileImageKey: string | undefined;

  if (input.file) {
    uploadedProfileImageKey = await uploadImage(input.file, 'profile-images');
  }

  try {
    const profile = await moverProfileRepository.saveMoverProfile({
      userId: input.userId,
      nickname: input.body.nickname,
      career: input.body.career,
      shortDescription: input.body.shortDescription,
      description: input.body.description,
      service: input.body.service,
      serviceRegions: input.body.serviceRegions,
      profileImageKey: uploadedProfileImageKey,
    });

    if (
      uploadedProfileImageKey &&
      previousProfileImageKey &&
      previousProfileImageKey !== uploadedProfileImageKey
    ) {
      try {
        await deleteImage(previousProfileImageKey);
      } catch {
        // 정리 실패 시에도 프로필 저장 결과는 유지한다.
      }
    }

    return {
      nickname: profile.nickname,
      career: profile.career,
      shortDescription: profile.shortDescription,
      description: profile.description,
      service: profile.service,
      serviceRegions: profile.serviceRegions,
      profileImageUrl: toProfileImageUrl(profile.profileImageKey),
      updatedAt: profile.updatedAt,
    };
  } catch (error) {
    if (uploadedProfileImageKey) {
      try {
        await deleteImage(uploadedProfileImageKey);
      } catch {
        // DB 반영 실패 후 업로드 정리마저 실패하면 orphan 가능성을 남긴다.
      }
    }

    const appError = toAppErrorFromPrisma(error);

    if (appError) {
      throw appError;
    }

    throw error;
  }
};
