import bcrypt from 'bcrypt';

// 관리자 계정은 일반 유저보다 높은 보호 수준을 적용
const ADMIN_PASSWORD_SALT_ROUNDS = 12;

// 계정 미존재 시에도 bcrypt.compare를 수행해 응답 시간 차이를 줄이기 위함
export const ADMIN_PASSWORD_DUMMY_HASH =
  '$2b$12$5XzC4R7gBVyzjBc5z4kmYODwFEKf/J/ur6ABvfTALn6f0kyiV9fRm';

export const hashAdminPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, ADMIN_PASSWORD_SALT_ROUNDS);
};

export const compareAdminPassword = async (
  password: string,
  passwordHash: string
): Promise<boolean> => {
  return bcrypt.compare(password, passwordHash);
};
