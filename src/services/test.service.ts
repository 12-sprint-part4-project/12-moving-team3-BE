//예시 코드(이후 삭제)
import { getMessage } from '../repositories/test.repository';
import { AppError } from '../utils/app.error';

export const getTest = () => {
  const message = getMessage();

  if (message === 'Hello') {
    throw new AppError('PROFILE_NOT_FOUND');
  }

  return message;
};
