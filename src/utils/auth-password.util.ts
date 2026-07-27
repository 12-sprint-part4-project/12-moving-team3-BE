import bcrypt from 'bcrypt';

const PASSWORD_SALT_ROUNDS = 10;

// 계정 미존재 시에도 bcrypt.compare를 수행해 응답 시간 차이를 줄이기 위함
export const AUTH_PASSWORD_DUMMY_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const hashAuthPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
};

export const compareAuthPassword = async (
  password: string,
  passwordHash: string
): Promise<boolean> => {
  return bcrypt.compare(password, passwordHash);
};
