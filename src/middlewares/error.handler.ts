import { type ErrorRequestHandler } from 'express';
import { ERROR_CODES } from '../constants/error.codes';
import { AppError } from '../utils/app.error';
import { toAppErrorFromPrisma } from '../utils/prisma-error.util';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
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

  res.status(internalServerError.status).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: internalServerError.message,
    },
  });
};
