import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { MoveType, Region } from '@prisma/client';
import type { ErrorCode } from '../constants/error.codes';
import type { MoverProfileBody } from '../schemas/mover-profile.schema';
import { AppError } from '../utils/app.error';
import {
  saveMoverProfile,
  updateMoverBasicInfo,
} from './mover-profile.service';

interface MoverProfileRow {
  id: number;
  service: MoveType[];
  user: {
    name: string;
    phoneNumber: string | null;
    profileImageKey: string | null;
  };
}

interface SaveMoverProfileResult {
  nickname: string;
  career: number;
  shortDescription: string;
  description: string;
  service: MoveType[];
  serviceRegions: Region[];
  profileImageKey: string | null;
  updatedAt: Date;
}

interface MutableMoverProfileRepository {
  findMoverProfileByUserId: (userId: string) => Promise<MoverProfileRow | null>;
  saveMoverProfile: (input: unknown) => Promise<SaveMoverProfileResult>;
  updateMoverBasicInfo: (input: unknown) => Promise<{
    name: string;
    email: string;
    phoneNumber: string | null;
    updatedAt: Date;
  }>;
}

interface MutableAuthRepository {
  findUserByPhoneNumber: (
    phoneNumber: string
  ) => Promise<{ id: string } | null>;
}

interface MutableS3Service {
  deleteImage: (key: string) => Promise<void>;
}

interface MutableMoverEmbeddingService {
  reindexMoverProfileEmbedding: (userId: string) => Promise<void>;
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-01T00:00:00.000Z');

const moverProfileRepository =
  require('../repositories/mover-profile.repository') as MutableMoverProfileRepository;
const authRepository =
  require('../repositories/auth.repository') as MutableAuthRepository;
const s3Service = require('./s3.service') as MutableS3Service;
const moverEmbeddingService =
  require('./mover-embedding.service') as MutableMoverEmbeddingService;

const originals = {
  findMoverProfileByUserId: moverProfileRepository.findMoverProfileByUserId,
  saveMoverProfile: moverProfileRepository.saveMoverProfile,
  updateMoverBasicInfo: moverProfileRepository.updateMoverBasicInfo,
  findUserByPhoneNumber: authRepository.findUserByPhoneNumber,
  deleteImage: s3Service.deleteImage,
  reindexMoverProfileEmbedding:
    moverEmbeddingService.reindexMoverProfileEmbedding,
};

const deletedKeys: string[] = [];
const reindexedUserIds: string[] = [];

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

const existingProfile = (): MoverProfileRow => ({
  id: 1,
  service: [MoveType.HOME],
  user: {
    name: '김기사',
    phoneNumber: '01011112222',
    profileImageKey: 'profile-images/old.png',
  },
});

const profileBody = (): MoverProfileBody => ({
  nickname: '김기사',
  career: 5,
  shortDescription: '안전 이사',
  description: '경력을 바탕으로 이사합니다.',
  service: [MoveType.HOME],
  serviceRegions: [Region.SEOUL],
});

describe('mover-profile.service', () => {
  before(() => {
    process.env.CDN_BASE_URL = 'https://cdn.example.com';
  });

  afterEach(() => {
    deletedKeys.length = 0;
    reindexedUserIds.length = 0;
  });

  after(() => {
    moverProfileRepository.findMoverProfileByUserId =
      originals.findMoverProfileByUserId;
    moverProfileRepository.saveMoverProfile = originals.saveMoverProfile;
    moverProfileRepository.updateMoverBasicInfo =
      originals.updateMoverBasicInfo;
    authRepository.findUserByPhoneNumber = originals.findUserByPhoneNumber;
    s3Service.deleteImage = originals.deleteImage;
    moverEmbeddingService.reindexMoverProfileEmbedding =
      originals.reindexMoverProfileEmbedding;
  });

  const stubDefaults = () => {
    moverProfileRepository.findMoverProfileByUserId = async () =>
      existingProfile();
    moverProfileRepository.saveMoverProfile = async () => ({
      nickname: '김기사',
      career: 5,
      shortDescription: '안전 이사',
      description: '경력을 바탕으로 이사합니다.',
      service: [MoveType.HOME],
      serviceRegions: [Region.SEOUL],
      profileImageKey: null,
      updatedAt: NOW,
    });
    moverProfileRepository.updateMoverBasicInfo = async () => ({
      name: '김기사',
      email: 'mover@example.com',
      phoneNumber: '01011112222',
      updatedAt: NOW,
    });
    authRepository.findUserByPhoneNumber = async () => null;
    s3Service.deleteImage = async (key) => {
      deletedKeys.push(key);
    };
    moverEmbeddingService.reindexMoverProfileEmbedding = async (userId) => {
      reindexedUserIds.push(userId);
    };
  };

  describe('saveMoverProfile', () => {
    it('프로필 행이 없으면 PROFILE_NOT_FOUND를 던진다', async () => {
      stubDefaults();
      moverProfileRepository.findMoverProfileByUserId = async () => null;

      await assertRejectsWithCode(
        () => saveMoverProfile({ userId: USER_ID, body: profileBody() }),
        'PROFILE_NOT_FOUND'
      );
    });

    it('저장 성공 시 이전 이미지를 삭제하고 임베딩을 재계산한다', async () => {
      stubDefaults();
      moverProfileRepository.saveMoverProfile = async () => ({
        nickname: '김기사',
        career: 5,
        shortDescription: '안전 이사',
        description: '경력을 바탕으로 이사합니다.',
        service: [MoveType.HOME],
        serviceRegions: [Region.SEOUL],
        profileImageKey: 'profile-images/new.png',
        updatedAt: NOW,
      });

      const result = await saveMoverProfile({
        userId: USER_ID,
        body: { ...profileBody(), s3Key: 'profile-images/new.png' },
      });

      assert.deepEqual(deletedKeys, ['profile-images/old.png']);
      assert.deepEqual(reindexedUserIds, [USER_ID]);
      assert.equal(
        result.profileImageUrl,
        'https://cdn.example.com/profile-images/new.png'
      );
    });

    it('DB 저장 실패 시 새로 올린 s3Key를 삭제한다', async () => {
      stubDefaults();
      moverProfileRepository.saveMoverProfile = async () => {
        throw new Error('db fail');
      };

      await assert.rejects(() =>
        saveMoverProfile({
          userId: USER_ID,
          body: { ...profileBody(), s3Key: 'profile-images/new.png' },
        })
      );

      assert.deepEqual(deletedKeys, ['profile-images/new.png']);
      assert.deepEqual(reindexedUserIds, []);
    });
  });

  describe('updateMoverBasicInfo', () => {
    it('변경점이 없으면 NO_CHANGE를 던진다', async () => {
      stubDefaults();

      await assertRejectsWithCode(
        () =>
          updateMoverBasicInfo({
            userId: USER_ID,
            body: {
              name: '김기사',
              phoneNumber: '01011112222',
            },
          }),
        'NO_CHANGE'
      );
    });

    it('다른 사용자가 쓰는 전화번호면 PHONE_NUMBER_ALREADY_EXISTS를 던진다', async () => {
      stubDefaults();
      authRepository.findUserByPhoneNumber = async () => ({ id: OTHER_ID });

      await assertRejectsWithCode(
        () =>
          updateMoverBasicInfo({
            userId: USER_ID,
            body: {
              name: '김기사',
              phoneNumber: '01099998888',
            },
          }),
        'PHONE_NUMBER_ALREADY_EXISTS'
      );
    });

    it('이름 변경 시 임베딩을 재계산한다', async () => {
      stubDefaults();
      moverProfileRepository.updateMoverBasicInfo = async () => ({
        name: '이기사',
        email: 'mover@example.com',
        phoneNumber: '01011112222',
        updatedAt: NOW,
      });

      const result = await updateMoverBasicInfo({
        userId: USER_ID,
        body: {
          name: '이기사',
          phoneNumber: '01011112222',
        },
      });

      assert.equal(result.name, '이기사');
      assert.deepEqual(reindexedUserIds, [USER_ID]);
    });
  });
});
