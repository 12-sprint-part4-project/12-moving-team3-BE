import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../utils/app.error';
import type { ErrorCode } from '../constants/error.codes';
import {
  parseKakaoLoginBody,
  parseLoginBody,
  parseSignupBody,
} from './auth.schema';

const assertAppError =
  (code: ErrorCode) =>
  (error: unknown): boolean => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    return true;
  };

const validSignupBody = {
  userType: 'CUSTOMER',
  name: '홍길동',
  nickname: '길동',
  email: 'User@Example.com',
  password: 'ValidPass1!',
  passwordConfirmation: 'ValidPass1!',
};

describe('parseSignupBody', () => {
  it('이메일을 소문자로 정규화하고 가입 body를 반환한다', () => {
    const result = parseSignupBody(validSignupBody);

    assert.equal(result.email, 'user@example.com');
    assert.equal(result.userType, 'CUSTOMER');
    assert.equal(result.password, 'ValidPass1!');
  });

  it('body가 객체가 아니면 REQUIRED_FIELD_MISSING을 던진다', () => {
    assert.throws(() => parseSignupBody(null), assertAppError('REQUIRED_FIELD_MISSING'));
    assert.throws(() => parseSignupBody([]), assertAppError('REQUIRED_FIELD_MISSING'));
  });

  it('필수값이 비어 있으면 REQUIRED_FIELD_MISSING을 던진다', () => {
    assert.throws(
      () => parseSignupBody({ ...validSignupBody, nickname: '  ' }),
      assertAppError('REQUIRED_FIELD_MISSING')
    );
  });

  it('지원하지 않는 userType이면 INVALID_USER_TYPE을 던진다', () => {
    assert.throws(
      () => parseSignupBody({ ...validSignupBody, userType: 'ADMIN' }),
      assertAppError('INVALID_USER_TYPE')
    );
  });

  it('이메일 형식이 아니면 INVALID_EMAIL_FORMAT을 던진다', () => {
    assert.throws(
      () => parseSignupBody({ ...validSignupBody, email: 'not-an-email' }),
      assertAppError('INVALID_EMAIL_FORMAT')
    );
  });

  it('이메일이 254자를 넘으면 INVALID_EMAIL_FORMAT을 던진다', () => {
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`;
    const email = `${local}@${domain}`;

    assert.ok(email.length > 254);
    assert.throws(
      () => parseSignupBody({ ...validSignupBody, email }),
      assertAppError('INVALID_EMAIL_FORMAT')
    );
  });

  it('local-part가 64자를 넘으면 INVALID_EMAIL_FORMAT을 던진다', () => {
    assert.throws(
      () =>
        parseSignupBody({
          ...validSignupBody,
          email: `${'a'.repeat(65)}@example.com`,
        }),
      assertAppError('INVALID_EMAIL_FORMAT')
    );
  });

  it('도메인 label이 63자를 넘으면 INVALID_EMAIL_FORMAT을 던진다', () => {
    assert.throws(
      () =>
        parseSignupBody({
          ...validSignupBody,
          email: `user@${'a'.repeat(64)}.com`,
        }),
      assertAppError('INVALID_EMAIL_FORMAT')
    );
  });

  it('비밀번호 형식이 아니면 INVALID_PASSWORD_FORMAT을 던진다', () => {
    assert.throws(
      () =>
        parseSignupBody({
          ...validSignupBody,
          password: 'password',
          passwordConfirmation: 'password',
        }),
      assertAppError('INVALID_PASSWORD_FORMAT')
    );
  });

  it('비밀번호 확인이 다르면 PASSWORD_CONFIRMATION_MISMATCH를 던진다', () => {
    assert.throws(
      () =>
        parseSignupBody({
          ...validSignupBody,
          passwordConfirmation: 'ValidPass2!',
        }),
      assertAppError('PASSWORD_CONFIRMATION_MISMATCH')
    );
  });
});

describe('parseLoginBody', () => {
  const validLoginBody = {
    userType: 'MOVER',
    email: '  mover@example.com  ',
    password: 'secret',
  };

  it('이메일을 trim·소문자로 정규화한다', () => {
    const result = parseLoginBody(validLoginBody);

    assert.equal(result.email, 'mover@example.com');
    assert.equal(result.userType, 'MOVER');
    assert.equal(result.password, 'secret');
  });

  it('필수값이 없으면 LOGIN_REQUIRED_FIELD_MISSING을 던진다', () => {
    assert.throws(
      () => parseLoginBody({ userType: 'CUSTOMER', email: 'a@b.co' }),
      assertAppError('LOGIN_REQUIRED_FIELD_MISSING')
    );
    assert.throws(() => parseLoginBody(null), assertAppError('LOGIN_REQUIRED_FIELD_MISSING'));
  });

  it('지원하지 않는 userType이면 INVALID_USER_TYPE을 던진다', () => {
    assert.throws(
      () => parseLoginBody({ ...validLoginBody, userType: 'ADMIN' }),
      assertAppError('INVALID_USER_TYPE')
    );
  });

  it('이메일 형식이 아니면 INVALID_EMAIL_FORMAT을 던진다', () => {
    assert.throws(
      () => parseLoginBody({ ...validLoginBody, email: 'bad' }),
      assertAppError('INVALID_EMAIL_FORMAT')
    );
  });
});

describe('parseKakaoLoginBody', () => {
  it('code를 trim하고 userType을 반환한다', () => {
    const result = parseKakaoLoginBody({
      code: '  auth-code  ',
      userType: 'CUSTOMER',
    });

    assert.deepEqual(result, { code: 'auth-code', userType: 'CUSTOMER' });
  });

  it('code가 없으면 KAKAO_CODE_REQUIRED를 던진다', () => {
    assert.throws(
      () => parseKakaoLoginBody({ userType: 'CUSTOMER' }),
      assertAppError('KAKAO_CODE_REQUIRED')
    );
    assert.throws(() => parseKakaoLoginBody(null), assertAppError('KAKAO_CODE_REQUIRED'));
  });

  it('지원하지 않는 userType이면 INVALID_USER_TYPE을 던진다', () => {
    assert.throws(
      () => parseKakaoLoginBody({ code: 'code', userType: 'ADMIN' }),
      assertAppError('INVALID_USER_TYPE')
    );
  });
});
