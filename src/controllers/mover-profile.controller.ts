import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type { MoverProfileBody } from '../schemas/mover-profile.schema';
import * as moverProfileService from '../services/mover-profile.service';

export const getMoverProfile = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const profile = await moverProfileService.getMoverProfile(userId);

    res.status(200).json({
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

export const saveMoverProfile = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const body = res.locals.validated.body as MoverProfileBody;

    const profile = await moverProfileService.saveMoverProfile({
      userId,
      body,
    });

    res.status(200).json({
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};
