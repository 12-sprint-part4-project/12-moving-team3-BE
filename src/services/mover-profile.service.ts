import * as authRepository from '../repositories/auth.repository';
import * as moverProfileRepository from '../repositories/mover-profile.repository';
import { countConfirmedQuotesByMoverId } from '../repositories/quote.repository';
import type {
  MoverBasicInfoBody,
  MoverProfileBody,
} from '../schemas/mover-profile.schema';
import { resolvePasswordHashForUpdate } from '../utils/auth-password.util';
import { deleteImage, toPresignedViewUrl } from './s3.service';
import { AppError } from '../utils/app.error';
import { toAppErrorFromPrisma } from '../utils/prisma-error.util';

export interface SaveMoverProfileInput {
  userId: string;
  body: MoverProfileBody;
}

export interface UpdateMoverBasicInfoServiceInput {
  userId: string;
  body: MoverBasicInfoBody;
}

export const getMoverProfile = async (userId: string) => {
  const profile =
    await moverProfileRepository.findMoverProfileDetailByUserId(userId);

  // 프로필 행이 없거나 아직 등록(service)을 완료하지 않은 경우
  if (!profile || profile.service.length === 0) {
    throw new AppError('PROFILE_NOT_FOUND');
  }

  const [profileImageUrl, confirmedCount, localAuth] = await Promise.all([
    toPresignedViewUrl(profile.user.profileImageKey),
    countConfirmedQuotesByMoverId(userId),
    authRepository.findLocalPasswordHashByUserId(userId),
  ]);

  return {
    profileId: profile.id,
    userId: profile.user.id,
    name: profile.user.name,
    nickname: profile.user.nickname,
    email: profile.user.email,
    phoneNumber: profile.user.phoneNumber,
    profileImageUrl,
    career: profile.career,
    shortDescription: profile.shortDescription,
    description: profile.description,
    service: profile.service,
    serviceRegions: profile.serviceRegions.map((item) => item.region),
    confirmedCount,
    hasPassword: Boolean(localAuth?.passwordHash),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};

export const saveMoverProfile = async (input: SaveMoverProfileInput) => {
  const existingProfile = await moverProfileRepository.findMoverProfileByUserId(
    input.userId
  );

  if (!existingProfile) {
    throw new AppError('PROFILE_NOT_FOUND');
  }

  const previousProfileImageKey = existingProfile.user.profileImageKey;
  const nextProfileImageKey = input.body.s3Key;

  try {
    const profile = await moverProfileRepository.saveMoverProfile({
      userId: input.userId,
      nickname: input.body.nickname,
      career: input.body.career,
      shortDescription: input.body.shortDescription,
      description: input.body.description,
      service: input.body.service,
      serviceRegions: input.body.serviceRegions,
      profileImageKey: nextProfileImageKey,
    });

    if (
      nextProfileImageKey &&
      previousProfileImageKey &&
      previousProfileImageKey !== nextProfileImageKey
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
      profileImageUrl: await toPresignedViewUrl(profile.profileImageKey),
      updatedAt: profile.updatedAt,
    };
  } catch (error) {
    if (nextProfileImageKey) {
      try {
        await deleteImage(nextProfileImageKey);
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

export const updateMoverBasicInfo = async (
  input: UpdateMoverBasicInfoServiceInput
) => {
  const existingProfile = await moverProfileRepository.findMoverProfileByUserId(
    input.userId
  );

  if (!existingProfile) {
    throw new AppError('PROFILE_NOT_FOUND');
  }

  const { body } = input;
  const hasNameChange = body.name !== existingProfile.user.name;
  const hasPhoneChange = body.phoneNumber !== existingProfile.user.phoneNumber;
  const hasPasswordChange = body.newPassword !== undefined;

  if (!hasNameChange && !hasPhoneChange && !hasPasswordChange) {
    throw new AppError('NO_CHANGE');
  }

  if (hasPhoneChange) {
    const existingPhoneUser = await authRepository.findUserByPhoneNumber(
      body.phoneNumber
    );

    if (existingPhoneUser && existingPhoneUser.id !== input.userId) {
      throw new AppError('PHONE_NUMBER_ALREADY_EXISTS');
    }
  }

  const nextPasswordHash = await resolvePasswordHashForUpdate({
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
    newPasswordConfirm: body.newPasswordConfirm,
    findLocalPasswordHash: () =>
      authRepository.findLocalPasswordHashByUserId(input.userId),
  });

  try {
    return await moverProfileRepository.updateMoverBasicInfo({
      userId: input.userId,
      ...(hasNameChange ? { name: body.name } : {}),
      ...(hasPhoneChange ? { phoneNumber: body.phoneNumber } : {}),
      ...(nextPasswordHash !== undefined
        ? { passwordHash: nextPasswordHash }
        : {}),
    });
  } catch (error) {
    const appError = toAppErrorFromPrisma(error);

    if (appError) {
      throw appError;
    }

    throw error;
  }
};
