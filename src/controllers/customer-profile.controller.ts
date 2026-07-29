import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type { CustomerProfileBody } from '../schemas/customer-profile.schema';
import * as customerProfileService from '../services/customer-profile.service';

export const registerCustomerProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const body = res.locals.validated.body as CustomerProfileBody;

    const profile = await customerProfileService.registerCustomerProfile({
      userId,
      body,
      file: req.file,
    });

    res.status(200).json({
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};
