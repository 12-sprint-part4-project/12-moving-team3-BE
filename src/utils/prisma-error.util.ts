import { Prisma } from '@prisma/client';
import type { ErrorCode } from '../constants/error.codes';
import { AppError } from './app.error';

const UNIQUE_CONSTRAINT_ERROR_MAP: Record<string, ErrorCode> = {
  email: 'EMAIL_ALREADY_EXISTS',
  nickname: 'NICKNAME_ALREADY_EXISTS',
  phone_number: 'PHONE_NUMBER_ALREADY_EXISTS',
  phoneNumber: 'PHONE_NUMBER_ALREADY_EXISTS',
};

const resolveUniqueConstraintErrorCode = (
  target: unknown
): ErrorCode | null => {
  const fields = Array.isArray(target)
    ? target.filter((value): value is string => typeof value === 'string')
    : typeof target === 'string'
      ? [target]
      : [];

  for (const field of fields) {
    const errorCode = UNIQUE_CONSTRAINT_ERROR_MAP[field];

    if (errorCode) {
      return errorCode;
    }
  }

  return null;
};

/** Prisma unique constraint(P2002)를 공통 에러 형식으로 변환한다. */
export const toAppErrorFromPrisma = (error: unknown): AppError | null => {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return null;
  }

  const errorCode = resolveUniqueConstraintErrorCode(error.meta?.target);

  if (!errorCode) {
    return null;
  }

  return new AppError(errorCode);
};
