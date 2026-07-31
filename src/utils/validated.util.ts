import type { Response } from 'express';
import type { ErrorCode } from '../constants/error.codes';
import { AppError } from './app.error';

type ValidatedKey = 'params' | 'body' | 'query';

const DEFAULT_ERROR_CODES: Record<ValidatedKey, ErrorCode> = {
  query: 'INVALID_QUERY_PARAM',
  params: 'INVALID_REQUEST',
  body: 'INVALID_REQUEST',
};

/** res.locals.validated에서 검증된 params/body/query를 꺼내옵니다. */
export const getValidated = <T>(
  res: Response,
  key: ValidatedKey,
  errorCode?: ErrorCode
): T => {
  const value = res.locals.validated?.[key];

  if (value == null || typeof value !== 'object') {
    throw new AppError(errorCode ?? DEFAULT_ERROR_CODES[key]);
  }

  return value as T;
};
