import * as authRepository from '../repositories/auth.repository';
import * as customerProfileRepository from '../repositories/customer-profile.repository';
import type { CustomerProfileBody } from '../schemas/customer-profile.schema';
import { resolvePasswordHashForUpdate } from '../utils/auth-password.util';
import { AppError } from '../utils/app.error';
import { toAppErrorFromPrisma } from '../utils/prisma-error.util';
import { deleteImage, toPublicViewUrl } from './s3.service';

export interface RegisterCustomerProfileInput {
  userId: string;
  body: CustomerProfileBody;
}

interface CreateCustomerProfileInput {
  userId: string;
  body: CustomerProfileBody;
  previousProfileImageKey: string | null;
}

interface UpdateCustomerProfileInput {
  userId: string;
  body: CustomerProfileBody;
  existingProfile: NonNullable<
    Awaited<
      ReturnType<typeof customerProfileRepository.findCustomerProfileByUserId>
    >
  >;
}

const areSameService = (
  current: readonly string[],
  next: readonly string[]
): boolean => {
  if (current.length !== next.length) {
    return false;
  }

  const currentSet = new Set(current);
  return next.every((item) => currentSet.has(item));
};

export const getCustomerProfile = async (userId: string) => {
  const profile =
    await customerProfileRepository.findCustomerProfileDetailByUserId(userId);

  // 프로필 행이 없거나 아직 등록(service)을 완료하지 않은 경우
  if (!profile || profile.service.length === 0) {
    throw new AppError('PROFILE_NOT_FOUND');
  }

  const localAuth =
    await authRepository.findLocalPasswordHashByUserId(userId);

  return {
    profileId: profile.id,
    userId: profile.user.id,
    name: profile.user.name,
    nickname: profile.user.nickname,
    email: profile.user.email,
    phoneNumber: profile.user.phoneNumber,
    profileImageUrl: toPublicViewUrl(profile.user.profileImageKey),
    service: profile.service,
    region: profile.region,
    hasPassword: Boolean(localAuth?.passwordHash),
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

  const isRegister = existingProfile.service.length === 0;
  const { body } = input;

  if (isRegister) {
    return createCustomerProfile({
      userId: input.userId,
      body,
      previousProfileImageKey: existingProfile.user.profileImageKey,
    });
  }

  return updateCustomerProfile({
    userId: input.userId,
    body,
    existingProfile,
  });
};

const createCustomerProfile = async (input: CreateCustomerProfileInput) => {
  const { body } = input;

  if (body.region === undefined) {
    throw new AppError('REGION_REQUIRED');
  }

  if (body.service === undefined) {
    throw new AppError('SERVICE_TYPE_REQUIRED');
  }

  const existingNicknameUser = await authRepository.findUserByNickname(
    body.nickname
  );

  if (existingNicknameUser && existingNicknameUser.id !== input.userId) {
    throw new AppError('NICKNAME_ALREADY_EXISTS');
  }

  const existingPhoneUser = await authRepository.findUserByPhoneNumber(
    body.phoneNumber
  );

  if (existingPhoneUser && existingPhoneUser.id !== input.userId) {
    throw new AppError('PHONE_NUMBER_ALREADY_EXISTS');
  }

  const nextProfileImageKey = body.s3Key ?? null;

  let profile;
  try {
    profile = await customerProfileRepository.registerCustomerProfile({
      userId: input.userId,
      region: body.region,
      service: body.service,
      profileImageKey: nextProfileImageKey,
      nickname: body.nickname,
      phoneNumber: body.phoneNumber,
      ...(body.name !== undefined ? { name: body.name } : {}),
    });

    if (
      nextProfileImageKey &&
      input.previousProfileImageKey &&
      input.previousProfileImageKey !== nextProfileImageKey
    ) {
      try {
        await deleteImage(input.previousProfileImageKey);
      } catch {
        // 정리 실패 시에도 프로필 저장 결과는 유지한다.
      }
    }
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

  return {
    profileId: profile.profileId,
    userId: profile.userId,
    name: profile.name,
    nickname: profile.nickname,
    email: profile.email,
    phoneNumber: profile.phoneNumber,
    region: profile.region,
    service: profile.service,
    profileImageUrl: toPublicViewUrl(profile.profileImageKey),
    updatedAt: profile.updatedAt,
  };
};

const updateCustomerProfile = async (input: UpdateCustomerProfileInput) => {
  const { body, existingProfile } = input;
  const previousProfileImageKey = existingProfile.user.profileImageKey;

  const hasNameChange =
    body.name !== undefined && body.name !== existingProfile.user.name;
  const hasNicknameChange =
    body.nickname !== existingProfile.user.nickname;
  const hasPhoneChange =
    body.phoneNumber !== existingProfile.user.phoneNumber;
  const hasRegionChange =
    body.region !== undefined && body.region !== existingProfile.region;
  const hasServiceChange =
    body.service !== undefined &&
    !areSameService(existingProfile.service, body.service);
  const hasImageChange =
    body.s3Key !== undefined && body.s3Key !== previousProfileImageKey;
  const hasPasswordChange = body.newPassword !== undefined;

  if (
    !hasNameChange &&
    !hasNicknameChange &&
    !hasPhoneChange &&
    !hasRegionChange &&
    !hasServiceChange &&
    !hasImageChange &&
    !hasPasswordChange
  ) {
    throw new AppError('NO_CHANGE');
  }

  if (hasNicknameChange) {
    const existingNicknameUser = await authRepository.findUserByNickname(
      body.nickname
    );

    if (existingNicknameUser && existingNicknameUser.id !== input.userId) {
      throw new AppError('NICKNAME_ALREADY_EXISTS');
    }
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

  const nextProfileImageKey = hasImageChange ? body.s3Key : undefined;

  let profile;
  try {
    profile = await customerProfileRepository.registerCustomerProfile({
      userId: input.userId,
      ...(hasRegionChange ? { region: body.region } : {}),
      ...(hasServiceChange ? { service: body.service } : {}),
      ...(hasNameChange ? { name: body.name } : {}),
      ...(hasNicknameChange ? { nickname: body.nickname } : {}),
      ...(hasPhoneChange ? { phoneNumber: body.phoneNumber } : {}),
      ...(nextProfileImageKey !== undefined
        ? { profileImageKey: nextProfileImageKey }
        : {}),
      ...(nextPasswordHash !== undefined
        ? { passwordHash: nextPasswordHash }
        : {}),
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

  return {
    profileId: profile.profileId,
    userId: profile.userId,
    name: profile.name,
    nickname: profile.nickname,
    email: profile.email,
    phoneNumber: profile.phoneNumber,
    region: profile.region,
    service: profile.service,
    profileImageUrl: toPublicViewUrl(profile.profileImageKey),
    updatedAt: profile.updatedAt,
  };
};
