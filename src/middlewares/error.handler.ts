import { type ErrorRequestHandler } from 'express';
import env from '../config/env';
import { ERROR_CODES } from '../constants/error.codes';
import { AppError } from '../utils/app.error';
import { toAppErrorFromPrisma } from '../utils/prisma-error.util';

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  const prismaAppError = toAppErrorFromPrisma(error);

  if (prismaAppError) {
    res.status(prismaAppError.status).json({
      error: {
        code: prismaAppError.code,
        message: prismaAppError.message,
      },
    });
    return;
  }

  console.error(error);

  const internalServerError = ERROR_CODES.INTERNAL_SERVER_ERROR;
  const payload: {
    code: string;
    message: string;
    stack?: string;
  } = {
    code: 'INTERNAL_SERVER_ERROR',
    message: internalServerError.message,
  };

  if (env.nodeEnv !== 'production' && error instanceof Error) {
    payload.stack = error.stack;
  }

  res.status(internalServerError.status).json({
    error: payload,
  });
};
