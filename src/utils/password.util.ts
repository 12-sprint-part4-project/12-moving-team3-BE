import bcrypt from 'bcrypt';
import { AppError } from './app.error';

const AUTH_PASSWORD_SALT_ROUNDS = 10;
const ADMIN_PASSWORD_SALT_ROUNDS = 12;

// INVALID_NEW_PASSWORD와 동일 정책 (8~20자, 영문·숫자·특수문자)
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;

// 계정 미존재 시에도 bcrypt.compare를 수행해 응답 시간 차이를 줄이기 위함
export const AUTH_PASSWORD_DUMMY_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const ADMIN_PASSWORD_DUMMY_HASH =
  '$2b$12$5XzC4R7gBVyzjBc5z4kmYODwFEKf/J/ur6ABvfTALn6f0kyiV9fRm';

const hashPassword = async (
  password: string,
  saltRounds: number
): Promise<string> => {
  return bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (
  password: string,
  passwordHash: string
): Promise<boolean> => {
  return bcrypt.compare(password, passwordHash);
};

export const hashAuthPassword = async (password: string): Promise<string> => {
  return hashPassword(password, AUTH_PASSWORD_SALT_ROUNDS);
};

export const hashAdminPassword = async (password: string): Promise<string> => {
  return hashPassword(password, ADMIN_PASSWORD_SALT_ROUNDS);
};

export interface ResolvePasswordHashForUpdateInput {
  currentPassword?: string;
  newPassword?: string;
  newPasswordConfirm?: string;
  findLocalPasswordHash: () => Promise<{ passwordHash: string | null } | null>;
}

/** newPassword가 있을 때만 비밀번호 변경 필드를 검증하고 hash를 반환 */
export const resolvePasswordHashForUpdate = async (
  input: ResolvePasswordHashForUpdateInput
): Promise<string | undefined> => {
  if (input.newPassword === undefined) {
    return undefined;
  }

  if (!input.currentPassword) {
    throw new AppError('CURRENT_PASSWORD_REQUIRED');
  }

  if (!input.newPasswordConfirm) {
    throw new AppError('NEW_PASSWORD_CONFIRM_REQUIRED');
  }

  if (!PASSWORD_REGEX.test(input.newPassword)) {
    throw new AppError('INVALID_NEW_PASSWORD');
  }

  if (input.newPassword !== input.newPasswordConfirm) {
    throw new AppError('NEW_PASSWORD_MISMATCH');
  }

  if (input.currentPassword === input.newPassword) {
    throw new AppError('SAME_AS_CURRENT_PASSWORD');
  }

  const localAuth = await input.findLocalPasswordHash();

  const isPasswordMatched = await comparePassword(
    input.currentPassword,
    localAuth?.passwordHash ?? AUTH_PASSWORD_DUMMY_HASH
  );

  if (!localAuth?.passwordHash || !isPasswordMatched) {
    throw new AppError('CURRENT_PASSWORD_MISMATCH');
  }

  return hashAuthPassword(input.newPassword);
};
