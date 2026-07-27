import bcrypt from 'bcrypt';

const PASSWORD_SALT_ROUNDS = 10;

export const hashAuthPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
};

export const compareAuthPassword = async (
  password: string,
  passwordHash: string
): Promise<boolean> => {
  return bcrypt.compare(password, passwordHash);
};
