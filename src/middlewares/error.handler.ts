import { type ErrorRequestHandler } from 'express';
import { AppError } from '../utils/app.error';
import { ERROR_CODES } from '../constants/error.codes';

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

  console.error(error);

  const internalServerError = ERROR_CODES.INTERNAL_SERVER_ERROR;

  res.status(internalServerError.status).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: internalServerError.message,
    },
  });
};
