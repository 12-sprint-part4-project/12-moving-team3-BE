import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type { MoverProfileBody } from '../schemas/mover-profile.schema';
import * as moverProfileService from '../services/mover-profile.service';

export const saveMoverProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const body = req.body as MoverProfileBody;

    const profile = await moverProfileService.saveMoverProfile({
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
