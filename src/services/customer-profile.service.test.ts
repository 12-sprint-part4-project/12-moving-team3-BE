import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { MoveType, Region } from '@prisma/client';
import type { ErrorCode } from '../constants/error.codes';
import type { CustomerProfileBody } from '../schemas/customer-profile.schema';
import { AppError } from '../utils/app.error';
import {
  getCustomerProfile,
  registerCustomerProfile,
} from './customer-profile.service';

interface CustomerProfileRow {
  id: number;
  region: Region | null;
  service: MoveType[];
  user: {
    name: string;
    nickname: string;
    email: string;
    phoneNumber: string | null;
    profileImageKey: string | null;
  };
}

interface CustomerProfileDetailRow extends CustomerProfileRow {
  createdAt: Date;
  updatedAt: Date;
  user: CustomerProfileRow['user'] & { id: string };
}

interface RegisterResult {
  profileId: number;
  userId: string;
  name: string;
  nickname: string;
  email: string;
  phoneNumber: string | null;
  region: Region | null;
  service: MoveType[];
  profileImageKey: string | null;
  updatedAt: Date;
}

interface MutableCustomerProfileRepository {
  findCustomerProfileByUserId: (
    userId: string
  ) => Promise<CustomerProfileRow | null>;
  findCustomerProfileDetailByUserId: (
    userId: string
  ) => Promise<CustomerProfileDetailRow | null>;
  registerCustomerProfile: (input: unknown) => Promise<RegisterResult>;
}

interface MutableAuthRepository {
  findUserByNickname: (nickname: string) => Promise<{ id: string } | null>;
  findUserByPhoneNumber: (
    phoneNumber: string
  ) => Promise<{ id: string } | null>;
  findLocalPasswordHashByUserId: (
    userId: string
  ) => Promise<{ passwordHash: string | null } | null>;
}

interface MutableS3Service {
  deleteImage: (key: string) => Promise<void>;
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-01T00:00:00.000Z');

const customerProfileRepository =
  require('../repositories/customer-profile.repository') as MutableCustomerProfileRepository;
const authRepository =
  require('../repositories/auth.repository') as MutableAuthRepository;
const s3Service = require('./s3.service') as MutableS3Service;

const originals = {
  findCustomerProfileByUserId:
    customerProfileRepository.findCustomerProfileByUserId,
  findCustomerProfileDetailByUserId:
    customerProfileRepository.findCustomerProfileDetailByUserId,
  registerCustomerProfile: customerProfileRepository.registerCustomerProfile,
  findUserByNickname: authRepository.findUserByNickname,
  findUserByPhoneNumber: authRepository.findUserByPhoneNumber,
  findLocalPasswordHashByUserId: authRepository.findLocalPasswordHashByUserId,
  deleteImage: s3Service.deleteImage,
};

const deletedKeys: string[] = [];

const assertRejectsWithCode = async (
  fn: () => Promise<unknown>,
  code: ErrorCode
) => {
  await assert.rejects(fn, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    return true;
  });
};

const emptyProfile = (): CustomerProfileRow => ({
  id: 1,
  region: null,
  service: [],
  user: {
    name: '홍길동',
    nickname: '길동',
    email: 'user@example.com',
    phoneNumber: null,
    profileImageKey: null,
  },
});

const completedProfile = (): CustomerProfileRow => ({
  id: 1,
  region: Region.SEOUL,
  service: [MoveType.SMALL],
  user: {
    name: '홍길동',
    nickname: '길동',
    email: 'user@example.com',
    phoneNumber: '01012345678',
    profileImageKey: 'profile-images/old.png',
  },
});

const registerResult = (
  overrides: Partial<RegisterResult> = {}
): RegisterResult => ({
  profileId: 1,
  userId: USER_ID,
  name: '홍길동',
  nickname: '길동',
  email: 'user@example.com',
  phoneNumber: '01012345678',
  region: Region.SEOUL,
  service: [MoveType.SMALL],
  profileImageKey: null,
  updatedAt: NOW,
  ...overrides,
});

describe('customer-profile.service', () => {
  before(() => {
    process.env.CDN_BASE_URL = 'https://cdn.example.com';
  });

  afterEach(() => {
    deletedKeys.length = 0;
  });

  after(() => {
    customerProfileRepository.findCustomerProfileByUserId =
      originals.findCustomerProfileByUserId;
    customerProfileRepository.findCustomerProfileDetailByUserId =
      originals.findCustomerProfileDetailByUserId;
    customerProfileRepository.registerCustomerProfile =
      originals.registerCustomerProfile;
    authRepository.findUserByNickname = originals.findUserByNickname;
    authRepository.findUserByPhoneNumber = originals.findUserByPhoneNumber;
    authRepository.findLocalPasswordHashByUserId =
      originals.findLocalPasswordHashByUserId;
    s3Service.deleteImage = originals.deleteImage;
  });

  const stubDefaults = () => {
    customerProfileRepository.findCustomerProfileByUserId = async () =>
      emptyProfile();
    customerProfileRepository.findCustomerProfileDetailByUserId = async () =>
      null;
    customerProfileRepository.registerCustomerProfile = async () =>
      registerResult();
    authRepository.findUserByNickname = async () => null;
    authRepository.findUserByPhoneNumber = async () => null;
    authRepository.findLocalPasswordHashByUserId = async () => null;
    s3Service.deleteImage = async (key) => {
      deletedKeys.push(key);
    };
  };

  describe('getCustomerProfile', () => {
    it('프로필이 없거나 미등록이면 PROFILE_NOT_FOUND를 던진다', async () => {
      stubDefaults();
      customerProfileRepository.findCustomerProfileDetailByUserId = async () =>
        null;

      await assertRejectsWithCode(
        () => getCustomerProfile(USER_ID),
        'PROFILE_NOT_FOUND'
      );
    });

    it('service가 비어 있으면 PROFILE_NOT_FOUND를 던진다', async () => {
      stubDefaults();
      customerProfileRepository.findCustomerProfileDetailByUserId = async () => ({
        ...emptyProfile(),
        createdAt: NOW,
        updatedAt: NOW,
        user: { ...emptyProfile().user, id: USER_ID },
      });

      await assertRejectsWithCode(
        () => getCustomerProfile(USER_ID),
        'PROFILE_NOT_FOUND'
      );
    });

    it('등록된 프로필과 hasPassword·이미지 URL을 반환한다', async () => {
      stubDefaults();
      customerProfileRepository.findCustomerProfileDetailByUserId = async () => ({
        id: 1,
        region: Region.SEOUL,
        service: [MoveType.SMALL],
        createdAt: NOW,
        updatedAt: NOW,
        user: {
          id: USER_ID,
          name: '홍길동',
          nickname: '길동',
          email: 'user@example.com',
          phoneNumber: '01012345678',
          profileImageKey: 'profile-images/me.png',
        },
      });
      authRepository.findLocalPasswordHashByUserId = async () => ({
        passwordHash: 'hashed',
      });

      const result = await getCustomerProfile(USER_ID);

      assert.equal(result.profileId, 1);
      assert.equal(result.userId, USER_ID);
      assert.equal(result.hasPassword, true);
      assert.equal(
        result.profileImageUrl,
        'https://cdn.example.com/profile-images/me.png'
      );
      assert.deepEqual(result.service, [MoveType.SMALL]);
    });
  });

  describe('registerCustomerProfile 등록', () => {
    it('프로필 행이 없으면 PROFILE_NOT_FOUND를 던진다', async () => {
      stubDefaults();
      customerProfileRepository.findCustomerProfileByUserId = async () => null;

      await assertRejectsWithCode(
        () =>
          registerCustomerProfile({
            userId: USER_ID,
            body: { phoneNumber: '01012345678' },
          }),
        'PROFILE_NOT_FOUND'
      );
    });

    it('region이 없으면 REGION_REQUIRED를 던진다', async () => {
      stubDefaults();

      await assertRejectsWithCode(
        () =>
          registerCustomerProfile({
            userId: USER_ID,
            body: {
              phoneNumber: '01012345678',
              service: [MoveType.SMALL],
            },
          }),
        'REGION_REQUIRED'
      );
    });

    it('service가 없으면 SERVICE_TYPE_REQUIRED를 던진다', async () => {
      stubDefaults();

      await assertRejectsWithCode(
        () =>
          registerCustomerProfile({
            userId: USER_ID,
            body: {
              phoneNumber: '01012345678',
              region: Region.SEOUL,
            },
          }),
        'SERVICE_TYPE_REQUIRED'
      );
    });

    it('다른 사용자가 쓰는 닉네임이면 NICKNAME_ALREADY_EXISTS를 던진다', async () => {
      stubDefaults();
      authRepository.findUserByNickname = async () => ({ id: OTHER_ID });

      await assertRejectsWithCode(
        () =>
          registerCustomerProfile({
            userId: USER_ID,
            body: {
              phoneNumber: '01012345678',
              region: Region.SEOUL,
              service: [MoveType.SMALL],
              nickname: '길동',
            },
          }),
        'NICKNAME_ALREADY_EXISTS'
      );
    });

    it('다른 사용자가 쓰는 전화번호면 PHONE_NUMBER_ALREADY_EXISTS를 던진다', async () => {
      stubDefaults();
      authRepository.findUserByPhoneNumber = async () => ({ id: OTHER_ID });

      await assertRejectsWithCode(
        () =>
          registerCustomerProfile({
            userId: USER_ID,
            body: {
              phoneNumber: '01012345678',
              region: Region.SEOUL,
              service: [MoveType.SMALL],
            },
          }),
        'PHONE_NUMBER_ALREADY_EXISTS'
      );
    });

    it('등록에 성공하면 프로필을 반환한다', async () => {
      stubDefaults();

      const result = await registerCustomerProfile({
        userId: USER_ID,
        body: {
          phoneNumber: '01012345678',
          region: Region.SEOUL,
          service: [MoveType.SMALL],
        },
      });

      assert.equal(result.profileId, 1);
      assert.equal(result.region, Region.SEOUL);
    });

    it('DB 저장 실패 시 새로 올린 s3Key를 삭제한다', async () => {
      stubDefaults();
      customerProfileRepository.registerCustomerProfile = async () => {
        throw new Error('db fail');
      };

      await assert.rejects(() =>
        registerCustomerProfile({
          userId: USER_ID,
          body: {
            phoneNumber: '01012345678',
            region: Region.SEOUL,
            service: [MoveType.SMALL],
            s3Key: 'profile-images/new.png',
          },
        })
      );

      assert.deepEqual(deletedKeys, ['profile-images/new.png']);
    });
  });

  describe('registerCustomerProfile 수정', () => {
    const sameBody = (): CustomerProfileBody => ({
      phoneNumber: '01012345678',
      region: Region.SEOUL,
      service: [MoveType.SMALL],
      name: '홍길동',
      nickname: '길동',
    });

    it('변경점이 없으면 NO_CHANGE를 던진다', async () => {
      stubDefaults();
      customerProfileRepository.findCustomerProfileByUserId = async () =>
        completedProfile();

      await assertRejectsWithCode(
        () =>
          registerCustomerProfile({
            userId: USER_ID,
            body: sameBody(),
          }),
        'NO_CHANGE'
      );
    });

    it('서비스 순서만 바뀌면 변경으로 보지 않는다', async () => {
      stubDefaults();
      customerProfileRepository.findCustomerProfileByUserId = async () => ({
        ...completedProfile(),
        service: [MoveType.SMALL, MoveType.HOME],
      });

      await assertRejectsWithCode(
        () =>
          registerCustomerProfile({
            userId: USER_ID,
            body: {
              ...sameBody(),
              service: [MoveType.HOME, MoveType.SMALL],
            },
          }),
        'NO_CHANGE'
      );
    });

    it('이미지를 바꾸면 이전 s3Key를 삭제한다', async () => {
      stubDefaults();
      customerProfileRepository.findCustomerProfileByUserId = async () =>
        completedProfile();
      customerProfileRepository.registerCustomerProfile = async () =>
        registerResult({ profileImageKey: 'profile-images/new.png' });

      const result = await registerCustomerProfile({
        userId: USER_ID,
        body: {
          ...sameBody(),
          s3Key: 'profile-images/new.png',
        },
      });

      assert.deepEqual(deletedKeys, ['profile-images/old.png']);
      assert.equal(
        result.profileImageUrl,
        'https://cdn.example.com/profile-images/new.png'
      );
    });
  });
});
