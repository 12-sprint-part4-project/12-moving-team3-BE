import bcrypt from 'bcrypt';

// 관리자 계정은 일반 유저보다 높은 보호 수준을 적용
const ADMIN_PASSWORD_SALT_ROUNDS = 12;

/** 관리자 비밀번호를 bcrypt로 해시한다. */
export const hashAdminPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, ADMIN_PASSWORD_SALT_ROUNDS);
};

/** 평문 비밀번호와 저장된 해시가 일치하는지 비교한다. */
export const compareAdminPassword = async (
  password: string,
  passwordHash: string,
): Promise<boolean> => {
  return bcrypt.compare(password, passwordHash);
};
