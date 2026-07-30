import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type { PresignedUploadUrlQuery } from '../schemas/presigned-url.schema';
import * as s3Service from '../services/s3.service';

/** GET .../presigned-upload-url (so.md 1번 API) */
export const getPresignedUploadUrl = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    getAuthenticatedUser(res);
    const query = res.locals.validated.query as PresignedUploadUrlQuery;
    const data = await s3Service.createPresignedUploadUrl(
      query.filename,
      query.contentType,
      query.prefix
    );

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};
