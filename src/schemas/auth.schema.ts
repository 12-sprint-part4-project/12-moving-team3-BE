import { z } from 'zod';
import { AppError } from '../utils/app.error';

export type ApiUserType = 'CUSTOMER' | 'DRIVER';

export interface LoginBody {
  userType: ApiUserType;
  email: string;
  password: string;
}

export interface SignupBody {
  userType: ApiUserType;
  name: string;
  nickname: string;
  email: string;
  phoneNumber: string;
  password: string;
  passwordConfirmation: string;
}

const SIGNUP_REQUIRED_FIELDS = [
  'userType',
  'name',
  'nickname',
  'email',
  'phoneNumber',
  'password',
  'passwordConfirmation',
] as const;

const API_USER_TYPES: readonly ApiUserType[] = ['CUSTOMER', 'DRIVER'];

// INVALID_NEW_PASSWORD와 동일한 정책(8~20자, 영문·숫자·특수문자)을 재사용
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;

const PHONE_NUMBER_REGEX = /^\d{11}$/;

const isBlank = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  return false;
};

const isApiUserType = (value: string): value is ApiUserType => {
  return (API_USER_TYPES as readonly string[]).includes(value);
};

const LOGIN_REQUIRED_FIELDS = ['userType', 'email', 'password'] as const;

/**
 * 로그인 요청 body를 명세의 검증 순서에 맞춰 파싱한다.
 */
export const parseLoginBody = (body: unknown): LoginBody => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('LOGIN_REQUIRED_FIELD_MISSING');
  }

  const data = body as Record<string, unknown>;

  for (const field of LOGIN_REQUIRED_FIELDS) {
    if (isBlank(data[field])) {
      throw new AppError('LOGIN_REQUIRED_FIELD_MISSING');
    }
  }

  if (typeof data.userType !== 'string' || !isApiUserType(data.userType)) {
    throw new AppError('INVALID_USER_TYPE');
  }

  const emailResult = z.email().safeParse(data.email);

  if (!emailResult.success) {
    throw new AppError('INVALID_EMAIL_FORMAT');
  }

  const normalizedEmail = emailResult.data.trim().toLowerCase();

  if (typeof data.password !== 'string') {
    throw new AppError('LOGIN_REQUIRED_FIELD_MISSING');
  }

  return {
    userType: data.userType,
    email: normalizedEmail,
    password: data.password,
  };
};

/**
 * 회원가입 요청 body를 명세의 검증 순서에 맞춰 파싱한다.
 * TODO: 닉네임 형식 검증 규칙은 팀에서 확정 후 적용
 */
export const parseSignupBody = (body: unknown): SignupBody => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('REQUIRED_FIELD_MISSING');
  }

  const data = body as Record<string, unknown>;

  for (const field of SIGNUP_REQUIRED_FIELDS) {
    if (isBlank(data[field])) {
      throw new AppError('REQUIRED_FIELD_MISSING');
    }
  }

  if (typeof data.userType !== 'string' || !isApiUserType(data.userType)) {
    throw new AppError('INVALID_USER_TYPE');
  }

  // TODO: 닉네임 형식 검증 규칙은 팀에서 확정 후 적용
  if (typeof data.nickname !== 'string') {
    throw new AppError('REQUIRED_FIELD_MISSING');
  }

  if (typeof data.name !== 'string') {
    throw new AppError('REQUIRED_FIELD_MISSING');
  }

  const emailResult = z.email().safeParse(data.email);

  if (!emailResult.success) {
    throw new AppError('INVALID_EMAIL_FORMAT');
  }

  const normalizedEmail = emailResult.data.trim().toLowerCase();

  if (
    typeof data.phoneNumber !== 'string' ||
    !PHONE_NUMBER_REGEX.test(data.phoneNumber)
  ) {
    throw new AppError('INVALID_PHONE_NUMBER_FORMAT');
  }

  if (
    typeof data.password !== 'string' ||
    !PASSWORD_REGEX.test(data.password)
  ) {
    throw new AppError('INVALID_PASSWORD_FORMAT');
  }

  if (data.password !== data.passwordConfirmation) {
    throw new AppError('PASSWORD_CONFIRMATION_MISMATCH');
  }

  return {
    userType: data.userType,
    name: data.name,
    nickname: data.nickname,
    email: normalizedEmail,
    phoneNumber: data.phoneNumber,
    password: data.password,
    passwordConfirmation: String(data.passwordConfirmation),
  };
};
