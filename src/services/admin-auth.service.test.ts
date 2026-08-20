import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import type { DeviceType } from '@prisma/client';
import { AppError } from '../utils/app.error';
import {
  createAdminRefreshToken,
  getAdminRefreshTokenExpiry,
  verifyAdminAccessToken,
} from '../utils/admin-jwt.util';
import { hashRefreshToken } from '../utils/token-hash.util';

interface Admin {
  id: number;
  email: string;
  name: string;
}

interface RefreshTokenRecord {
  id: number;
  adminId: number;
  tokenHash: string;
  device: DeviceType;
  expiresAt: Date;
}

interface MutableAdminAuthRepository {
  findAdminRefreshTokenByHash: (
    tokenHash: string
  ) => Promise<RefreshTokenRecord | null>;
  findAdminById: (adminId: number) => Promise<Admin | null>;
  deleteAdminRefreshTokenByHash: (tokenHash: string) => Promise<void>;
}

interface AdminAuthService {
  refreshAdminToken: (
    refreshToken: string | undefined
  ) => Promise<{ accessToken: string }>;
  logoutAdmin: (refreshToken: string | undefined) => Promise<void>;
}

const admins = new Map<number, Admin>();
const records = new Map<string, RefreshTokenRecord>();

let adminAuthService: AdminAuthService;
let adminAuthRepository: MutableAdminAuthRepository;
let originalFindAdminRefreshTokenByHash: MutableAdminAuthRepository['findAdminRefreshTokenByHash'];
let originalFindAdminById: MutableAdminAuthRepository['findAdminById'];
let originalDeleteAdminRefreshTokenByHash: MutableAdminAuthRepository['deleteAdminRefreshTokenByHash'];
let nextRecordId = 1;

const saveRefreshToken = (
  adminId: number,
  device: DeviceType = 'DESKTOP'
): { token: string; record: RefreshTokenRecord } => {
  const token = createAdminRefreshToken(adminId);
  const tokenHash = hashRefreshToken(token);
  const { expiresAt } = getAdminRefreshTokenExpiry(token);
  const record = {
    id: nextRecordId++,
    adminId,
    tokenHash,
    device,
    expiresAt,
  };

  records.set(tokenHash, record);

  return { token, record };
};

const assertUnauthorized = (error: unknown): boolean => {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'ADMIN_UNAUTHORIZED');
  return true;
};

describe('admin-auth service refresh', () => {
  before(async () => {
    process.env.ADMIN_JWT_ACCESS_SECRET = 'admin-access-test-secret';
    process.env.ADMIN_JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.ADMIN_JWT_REFRESH_SECRET = 'admin-refresh-test-secret';
    process.env.ADMIN_JWT_REFRESH_EXPIRES_IN = '7d';

    adminAuthRepository = require('../repositories/admin-auth.repository');
    originalFindAdminRefreshTokenByHash =
      adminAuthRepository.findAdminRefreshTokenByHash;
    originalFindAdminById = adminAuthRepository.findAdminById;
    originalDeleteAdminRefreshTokenByHash =
      adminAuthRepository.deleteAdminRefreshTokenByHash;

    adminAuthRepository.findAdminRefreshTokenByHash = async (tokenHash) =>
      records.get(tokenHash) ?? null;
    adminAuthRepository.findAdminById = async (adminId) =>
      admins.get(adminId) ?? null;
    adminAuthRepository.deleteAdminRefreshTokenByHash = async (tokenHash) => {
      records.delete(tokenHash);
    };

    adminAuthService = await import('./admin-auth.service');
  });

  beforeEach(() => {
    admins.clear();
    records.clear();
    nextRecordId = 1;
    admins.set(1, {
      id: 1,
      email: 'admin-one@example.com',
      name: '관리자 1',
    });
    admins.set(2, {
      id: 2,
      email: 'admin-two@example.com',
      name: '관리자 2',
    });
  });

  after(() => {
    adminAuthRepository.findAdminRefreshTokenByHash =
      originalFindAdminRefreshTokenByHash;
    adminAuthRepository.findAdminById = originalFindAdminById;
    adminAuthRepository.deleteAdminRefreshTokenByHash =
      originalDeleteAdminRefreshTokenByHash;
  });

  it('유효한 Refresh Token으로 Access Token을 재발급한다', async () => {
    const { token } = saveRefreshToken(1);

    const result = await adminAuthService.refreshAdminToken(token);

    assert.equal(verifyAdminAccessToken(result.accessToken).sub, 1);
  });

  it('동일한 Refresh Token으로 연속 재발급해도 모두 성공한다', async () => {
    const { token } = saveRefreshToken(1);

    const first = await adminAuthService.refreshAdminToken(token);
    const second = await adminAuthService.refreshAdminToken(token);

    assert.equal(verifyAdminAccessToken(first.accessToken).sub, 1);
    assert.equal(verifyAdminAccessToken(second.accessToken).sub, 1);
  });

  it('동일한 Refresh Token으로 동시에 여러 번 재발급해도 모두 성공한다', async () => {
    const { token } = saveRefreshToken(1);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        adminAuthService.refreshAdminToken(token)
      )
    );

    assert.equal(results.length, 10);
    for (const result of results) {
      assert.equal(verifyAdminAccessToken(result.accessToken).sub, 1);
    }
  });

  it('재발급 후 기존 Refresh Token 레코드와 만료 시각을 유지한다', async () => {
    const { token, record } = saveRefreshToken(1);
    const originalExpiresAt = record.expiresAt.getTime();

    const result = await adminAuthService.refreshAdminToken(token);

    assert.equal(records.get(record.tokenHash), record);
    assert.equal(record.expiresAt.getTime(), originalExpiresAt);
    assert.deepEqual(Object.keys(result), ['accessToken']);
  });

  it('로그아웃 후 같은 Refresh Token으로 재발급할 수 없다', async () => {
    const { token } = saveRefreshToken(1);

    await adminAuthService.logoutAdmin(token);

    await assert.rejects(
      () => adminAuthService.refreshAdminToken(token),
      assertUnauthorized
    );
  });

  it('만료된 Refresh Token은 거부한다', async () => {
    const token = jwt.sign(
      { sub: 1, typ: 'admin_refresh', jti: 'expired-token' },
      process.env.ADMIN_JWT_REFRESH_SECRET!,
      { expiresIn: -1 }
    );

    await assert.rejects(
      () => adminAuthService.refreshAdminToken(token),
      assertUnauthorized
    );
  });

  it('위조된 Refresh Token은 거부한다', async () => {
    const { token } = saveRefreshToken(1);
    const parts = token.split('.');
    const forgedToken = `${parts[0]}.${parts[1]}.forged-signature`;

    await assert.rejects(
      () => adminAuthService.refreshAdminToken(forgedToken),
      assertUnauthorized
    );
  });

  it('DB에 없는 Refresh Token은 거부한다', async () => {
    const token = createAdminRefreshToken(1);

    await assert.rejects(
      () => adminAuthService.refreshAdminToken(token),
      assertUnauthorized
    );
  });

  it('한 세션 재발급이 다른 관리자와 다른 기기 세션에 영향을 주지 않는다', async () => {
    const currentSession = saveRefreshToken(1, 'DESKTOP');
    const sameAdminOtherDevice = saveRefreshToken(1, 'MOBILE');
    const otherAdminSession = saveRefreshToken(2, 'TABLET');

    await adminAuthService.refreshAdminToken(currentSession.token);

    assert.equal(
      records.get(currentSession.record.tokenHash),
      currentSession.record
    );
    assert.equal(
      records.get(sameAdminOtherDevice.record.tokenHash),
      sameAdminOtherDevice.record
    );
    assert.equal(
      records.get(otherAdminSession.record.tokenHash),
      otherAdminSession.record
    );
  });
});
