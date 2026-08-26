import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import {
  createAccessToken,
  createRefreshToken,
  getAuthRefreshTokenExpiry,
  verifyAccessToken,
  verifyRefreshToken,
} from './auth-jwt.util';

describe('auth-jwt.util', () => {
  before(() => {
    process.env.JWT_ACCESS_SECRET = 'user-access-test-secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_SECRET = 'user-refresh-test-secret';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  });

  it('Access Token을 발급하고 검증한다', () => {
    const token = createAccessToken('user-1', 'CUSTOMER');
    const payload = verifyAccessToken(token);

    assert.equal(payload.sub, 'user-1');
    assert.equal(payload.typ, 'access');
    assert.equal(payload.role, 'CUSTOMER');
  });

  it('Refresh Token을 발급하고 검증한다', () => {
    const token = createRefreshToken('user-1');
    const payload = verifyRefreshToken(token);

    assert.equal(payload.sub, 'user-1');
    assert.equal(payload.typ, 'refresh');
    assert.equal(typeof payload.jti, 'string');
    assert.ok(payload.jti.length > 0);
  });

  it('Refresh Token의 exp로 expiresAt과 maxAgeMs를 계산한다', () => {
    const token = createRefreshToken('user-1');
    const { expiresAt, maxAgeMs } = getAuthRefreshTokenExpiry(token);

    assert.ok(expiresAt.getTime() > Date.now());
    assert.ok(maxAgeMs > 0);
  });

  it('Refresh Token을 Access Token으로 검증하면 실패한다', () => {
    const refreshToken = createRefreshToken('user-1');

    assert.throws(() => verifyAccessToken(refreshToken));
  });

  it('Access Token을 Refresh Token으로 검증하면 실패한다', () => {
    const accessToken = createAccessToken('user-1', 'MOVER');

    assert.throws(() => verifyRefreshToken(accessToken));
  });

  it('ADMIN role Access Token은 유저 토큰으로 검증되지 않는다', () => {
    const token = jwt.sign(
      { sub: 'user-1', typ: 'access', role: 'ADMIN' },
      process.env.JWT_ACCESS_SECRET ?? '',
      { expiresIn: '15m' }
    );

    assert.throws(() => verifyAccessToken(token));
  });

  it('만료된 Access Token은 거부한다', () => {
    const token = jwt.sign(
      { sub: 'user-1', typ: 'access', role: 'CUSTOMER' },
      process.env.JWT_ACCESS_SECRET ?? '',
      { expiresIn: -1 }
    );

    assert.throws(() => verifyAccessToken(token));
  });
});
