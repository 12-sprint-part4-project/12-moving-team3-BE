import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { UserType, type DeviceType } from '@prisma/client';
import jwt from 'jsonwebtoken';
import type { ErrorCode } from '../constants/error.codes';
import { AppError } from '../utils/app.error';
import {
  createRefreshToken,
  getAuthRefreshTokenExpiry,
  verifyAccessToken,
} from '../utils/auth-jwt.util';
import { hashAuthPassword } from '../utils/password.util';
import { hashRefreshToken } from '../utils/token-hash.util';

interface AuthUser {
  id: string;
  userType: UserType;
  nickname: string;
  email: string;
  phoneNumber: string | null;
  customerProfile: { id: number; service: unknown[] } | null;
  moverProfile: { id: number; service: unknown[] } | null;
  userStatus: { status: 'ACTIVE' | 'SUSPENDED' } | null;
}

interface LocalAuthUser extends AuthUser {
  authAccounts: { passwordHash: string | null }[];
}

interface RefreshTokenRecord {
  userId: string;
  device: DeviceType;
  expiresAt: Date;
  user: { id: string; userType: UserType };
}

interface MutableAuthRepository {
  findUserWithLocalAuthByEmail: (
    email: string
  ) => Promise<LocalAuthUser | null>;
  findUserByEmail: (email: string) => Promise<{ id: string } | null>;
  findUserByNickname: (nickname: string) => Promise<{ id: string } | null>;
  findUserForAuthById: (userId: string) => Promise<AuthUser | null>;
  findRefreshTokenByHash: (
    tokenHash: string
  ) => Promise<RefreshTokenRecord | null>;
  deleteRefreshTokenByHash: (tokenHash: string) => Promise<{ count: number }>;
  deleteRefreshTokensByUserId: (userId: string) => Promise<{ count: number }>;
  createRefreshTokenRecord: (data: {
    userId: string;
    tokenHash: string;
    device: DeviceType;
    expiresAt: Date;
  }) => Promise<void>;
  createUserWithLocalAuth: (input: {
    name: string;
    nickname: string;
    email: string;
    userType: UserType;
    passwordHash: string;
  }) => Promise<AuthUser & { name: string; createdAt: Date }>;
}

interface MutableAuditContext {
  runAuditedTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
}

interface AuthService {
  login: (input: {
    audience: 'user';
    userType: 'CUSTOMER' | 'MOVER';
    email: string;
    password: string;
    device: DeviceType;
  }) => Promise<{
    user: { id: string; userType: string };
    accessToken: string;
    refreshToken: string;
  }>;
  signup: (input: {
    userType: 'CUSTOMER' | 'MOVER';
    name: string;
    nickname: string;
    email: string;
    password: string;
    passwordConfirmation: string;
  }) => Promise<{ user: { id: string; accessToken?: string } }>;
  getMe: (userId: string) => Promise<{ id: string }>;
  refreshAuthToken: (refreshToken: string | undefined) => Promise<{
    accessToken: string;
    refreshToken: string;
    refreshTokenMaxAgeMs: number;
  }>;
  logout: (refreshToken: string | undefined) => Promise<void>;
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const refreshRecords = new Map<string, RefreshTokenRecord>();

let passwordHash = '';
let authService: AuthService;
let authRepository: MutableAuthRepository;
let auditContext: MutableAuditContext;
let originalRunAuditedTransaction: MutableAuditContext['runAuditedTransaction'];
let originals: {
  findUserWithLocalAuthByEmail: MutableAuthRepository['findUserWithLocalAuthByEmail'];
  findUserByEmail: MutableAuthRepository['findUserByEmail'];
  findUserByNickname: MutableAuthRepository['findUserByNickname'];
  findUserForAuthById: MutableAuthRepository['findUserForAuthById'];
  findRefreshTokenByHash: MutableAuthRepository['findRefreshTokenByHash'];
  deleteRefreshTokenByHash: MutableAuthRepository['deleteRefreshTokenByHash'];
  deleteRefreshTokensByUserId: MutableAuthRepository['deleteRefreshTokensByUserId'];
  createRefreshTokenRecord: MutableAuthRepository['createRefreshTokenRecord'];
  createUserWithLocalAuth: MutableAuthRepository['createUserWithLocalAuth'];
};

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

const createAuthUser = (overrides: Partial<LocalAuthUser> = {}): LocalAuthUser => ({
  id: USER_ID,
  userType: UserType.CUSTOMER,
  nickname: '길동',
  email: 'user@example.com',
  phoneNumber: '01012345678',
  customerProfile: { id: 1, service: [] },
  moverProfile: null,
  userStatus: null,
  authAccounts: [{ passwordHash }],
  ...overrides,
});

const saveRefreshToken = (
  userId: string,
  userType: UserType = UserType.CUSTOMER,
  device: DeviceType = 'DESKTOP'
): { token: string; tokenHash: string } => {
  const token = createRefreshToken(userId);
  const tokenHash = hashRefreshToken(token);
  const { expiresAt } = getAuthRefreshTokenExpiry(token);
  refreshRecords.set(tokenHash, {
    userId,
    device,
    expiresAt,
    user: { id: userId, userType },
  });
  return { token, tokenHash };
};

describe('auth.service', () => {
  before(async () => {
    process.env.JWT_ACCESS_SECRET = 'user-access-test-secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_SECRET = 'user-refresh-test-secret';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';

    passwordHash = await hashAuthPassword('ValidPass1!');
    authRepository = require('../repositories/auth.repository');
    auditContext = require('../lib/audit-context');

    originals = {
      findUserWithLocalAuthByEmail: authRepository.findUserWithLocalAuthByEmail,
      findUserByEmail: authRepository.findUserByEmail,
      findUserByNickname: authRepository.findUserByNickname,
      findUserForAuthById: authRepository.findUserForAuthById,
      findRefreshTokenByHash: authRepository.findRefreshTokenByHash,
      deleteRefreshTokenByHash: authRepository.deleteRefreshTokenByHash,
      deleteRefreshTokensByUserId: authRepository.deleteRefreshTokensByUserId,
      createRefreshTokenRecord: authRepository.createRefreshTokenRecord,
      createUserWithLocalAuth: authRepository.createUserWithLocalAuth,
    };
    originalRunAuditedTransaction = auditContext.runAuditedTransaction;

    auditContext.runAuditedTransaction = async (fn) => fn({});

    authRepository.findRefreshTokenByHash = async (tokenHash) =>
      refreshRecords.get(tokenHash) ?? null;
    authRepository.deleteRefreshTokenByHash = async (tokenHash) => {
      if (!refreshRecords.has(tokenHash)) {
        return { count: 0 };
      }
      refreshRecords.delete(tokenHash);
      return { count: 1 };
    };
    authRepository.deleteRefreshTokensByUserId = async (userId) => {
      for (const [hash, record] of refreshRecords) {
        if (record.userId === userId) {
          refreshRecords.delete(hash);
        }
      }
      return { count: 1 };
    };
    authRepository.createRefreshTokenRecord = async (data) => {
      refreshRecords.set(data.tokenHash, {
        userId: data.userId,
        device: data.device,
        expiresAt: data.expiresAt,
        user: { id: data.userId, userType: UserType.CUSTOMER },
      });
    };

    authService = await import('./auth.service');
  });

  beforeEach(() => {
    refreshRecords.clear();
    authRepository.findUserWithLocalAuthByEmail = async () => null;
    authRepository.findUserByEmail = async () => null;
    authRepository.findUserByNickname = async () => null;
    authRepository.findUserForAuthById = async () => null;
    authRepository.createUserWithLocalAuth = async (input) => ({
      id: 'new-user',
      userType: input.userType,
      name: input.name,
      nickname: input.nickname,
      email: input.email,
      phoneNumber: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      customerProfile: { id: 1, service: [] },
      moverProfile: null,
      userStatus: null,
    });
  });

  after(() => {
    authRepository.findUserWithLocalAuthByEmail =
      originals.findUserWithLocalAuthByEmail;
    authRepository.findUserByEmail = originals.findUserByEmail;
    authRepository.findUserByNickname = originals.findUserByNickname;
    authRepository.findUserForAuthById = originals.findUserForAuthById;
    authRepository.findRefreshTokenByHash = originals.findRefreshTokenByHash;
    authRepository.deleteRefreshTokenByHash =
      originals.deleteRefreshTokenByHash;
    authRepository.deleteRefreshTokensByUserId =
      originals.deleteRefreshTokensByUserId;
    authRepository.createRefreshTokenRecord =
      originals.createRefreshTokenRecord;
    authRepository.createUserWithLocalAuth = originals.createUserWithLocalAuth;
    auditContext.runAuditedTransaction = originalRunAuditedTransaction;
  });

  describe('login', () => {
    it('없는 계정이면 INVALID_CREDENTIALS를 던진다', async () => {
      await assertRejectsWithCode(
        () =>
          authService.login({
            audience: 'user',
            userType: 'CUSTOMER',
            email: 'user@example.com',
            password: 'ValidPass1!',
            device: 'DESKTOP',
          }),
        'INVALID_CREDENTIALS'
      );
    });

    it('비밀번호가 틀리면 INVALID_CREDENTIALS를 던진다', async () => {
      authRepository.findUserWithLocalAuthByEmail = async () =>
        createAuthUser();

      await assertRejectsWithCode(
        () =>
          authService.login({
            audience: 'user',
            userType: 'CUSTOMER',
            email: 'user@example.com',
            password: 'WrongPass1!',
            device: 'DESKTOP',
          }),
        'INVALID_CREDENTIALS'
      );
    });

    it('가입 유형이 다르면 USER_TYPE_MISMATCH를 던진다', async () => {
      authRepository.findUserWithLocalAuthByEmail = async () =>
        createAuthUser({ userType: UserType.MOVER });

      await assertRejectsWithCode(
        () =>
          authService.login({
            audience: 'user',
            userType: 'CUSTOMER',
            email: 'user@example.com',
            password: 'ValidPass1!',
            device: 'DESKTOP',
          }),
        'USER_TYPE_MISMATCH'
      );
    });

    it('로그인 성공 시 Access/Refresh Token을 발급한다', async () => {
      authRepository.findUserWithLocalAuthByEmail = async () =>
        createAuthUser();

      const result = await authService.login({
        audience: 'user',
        userType: 'CUSTOMER',
        email: 'user@example.com',
        password: 'ValidPass1!',
        device: 'DESKTOP',
      });

      const payload = verifyAccessToken(result.accessToken);
      assert.equal(payload.sub, USER_ID);
      assert.equal(payload.role, 'CUSTOMER');
      assert.ok(result.refreshToken.length > 0);
    });
  });

  describe('signup', () => {
    const signupInput = {
      userType: 'CUSTOMER' as const,
      name: '홍길동',
      nickname: '길동',
      email: 'user@example.com',
      password: 'ValidPass1!',
      passwordConfirmation: 'ValidPass1!',
    };

    it('이메일이 이미 있으면 EMAIL_ALREADY_EXISTS를 던진다', async () => {
      authRepository.findUserByEmail = async () => ({ id: USER_ID });

      await assertRejectsWithCode(
        () => authService.signup(signupInput),
        'EMAIL_ALREADY_EXISTS'
      );
    });

    it('닉네임이 이미 있으면 NICKNAME_ALREADY_EXISTS를 던진다', async () => {
      authRepository.findUserByNickname = async () => ({ id: USER_ID });

      await assertRejectsWithCode(
        () => authService.signup(signupInput),
        'NICKNAME_ALREADY_EXISTS'
      );
    });

    it('가입 성공 시 토큰 없이 user만 반환한다', async () => {
      const result = await authService.signup(signupInput);

      assert.equal(result.user.id, 'new-user');
      assert.equal('accessToken' in result.user, false);
    });
  });

  describe('getMe', () => {
    it('계정이 없으면 UNAUTHORIZED를 던진다', async () => {
      await assertRejectsWithCode(() => authService.getMe(USER_ID), 'UNAUTHORIZED');
    });

    it('계정이 있으면 user를 반환한다', async () => {
      authRepository.findUserForAuthById = async () => createAuthUser();

      const user = await authService.getMe(USER_ID);
      assert.equal(user.id, USER_ID);
    });
  });

  describe('refreshAuthToken', () => {
    it('유효한 Refresh Token을 회전하고 Access Token을 재발급한다', async () => {
      const { token, tokenHash } = saveRefreshToken(USER_ID);

      const result = await authService.refreshAuthToken(token);

      assert.equal(verifyAccessToken(result.accessToken).sub, USER_ID);
      assert.equal(refreshRecords.has(tokenHash), false);
      assert.equal(refreshRecords.has(hashRefreshToken(result.refreshToken)), true);
    });

    it('이미 회전된 Refresh Token은 거부한다', async () => {
      const { token } = saveRefreshToken(USER_ID);

      await authService.refreshAuthToken(token);

      await assertRejectsWithCode(
        () => authService.refreshAuthToken(token),
        'UNAUTHORIZED'
      );
    });

    it('쿠키가 없으면 UNAUTHORIZED를 던진다', async () => {
      await assertRejectsWithCode(
        () => authService.refreshAuthToken(undefined),
        'UNAUTHORIZED'
      );
    });

    it('위조된 Refresh Token은 거부한다', async () => {
      const { token } = saveRefreshToken(USER_ID);
      const parts = token.split('.');
      const forged = `${parts[0]}.${parts[1]}.forged-signature`;

      await assertRejectsWithCode(
        () => authService.refreshAuthToken(forged),
        'UNAUTHORIZED'
      );
    });

    it('DB에 없는 Refresh Token은 거부한다', async () => {
      const token = createRefreshToken(USER_ID);

      await assertRejectsWithCode(
        () => authService.refreshAuthToken(token),
        'UNAUTHORIZED'
      );
    });

    it('만료된 Refresh Token JWT는 거부한다', async () => {
      const token = jwt.sign(
        { sub: USER_ID, typ: 'refresh', jti: 'expired' },
        process.env.JWT_REFRESH_SECRET ?? '',
        { expiresIn: -1 }
      );

      await assertRejectsWithCode(
        () => authService.refreshAuthToken(token),
        'UNAUTHORIZED'
      );
    });

    it('동시 회전이면 한 요청만 성공한다', async () => {
      const { token } = saveRefreshToken(USER_ID);

      const results = await Promise.allSettled(
        Array.from({ length: 2 }, () => authService.refreshAuthToken(token))
      );

      const fulfilled = results.filter((item) => item.status === 'fulfilled');
      const rejected = results.filter((item) => item.status === 'rejected');

      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
    });
  });

  describe('logout', () => {
    it('쿠키가 없으면 아무 작업도 하지 않는다', async () => {
      await authService.logout(undefined);
    });

    it('Refresh Token 해시를 DB에서 삭제한다', async () => {
      const { token, tokenHash } = saveRefreshToken(USER_ID);

      await authService.logout(token);

      assert.equal(refreshRecords.has(tokenHash), false);
    });
  });
});
