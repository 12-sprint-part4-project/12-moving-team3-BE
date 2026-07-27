import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import type { ErrorCode } from '../constants/error.codes';
import { AppError } from '../utils/app.error';

interface ValidateRequestOptions {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
  errorCode: ErrorCode;
}

interface ValidatedLocals {
  query?: unknown;
  params?: unknown;
}

export const validateRequest = ({
  body,
  query,
  params,
  errorCode,
}: ValidateRequestOptions): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (body) {
        const parsedBody = body.safeParse(req.body);

        if (!parsedBody.success) {
          throw new AppError(errorCode);
        }

        req.body = parsedBody.data;
      }

      const validated: ValidatedLocals = {};

      if (query) {
        const parsedQuery = query.safeParse(req.query);

        if (!parsedQuery.success) {
          throw new AppError(errorCode);
        }

        validated.query = parsedQuery.data;
      }

      if (params) {
        const parsedParams = params.safeParse(req.params);

        if (!parsedParams.success) {
          throw new AppError(errorCode);
        }

        validated.params = parsedParams.data;
      }

      if (query || params) {
        res.locals.validated = validated;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
