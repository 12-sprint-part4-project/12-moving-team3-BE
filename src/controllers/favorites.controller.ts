import type { NextFunction, Request, Response } from 'express';

import type { FavoriteMoverIdParam } from '../schemas/favorites.schema';
import * as favoritesService from '../services/favorites.service';
import { AppError } from '../utils/app.error';

/** 인증 미들웨어가 주입할 user. 타입 확장은 인증 담당자가 담당 */
type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    userType: 'CUSTOMER' | 'MOVER';
  };
};

export const addFavorite = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED');
    }

    const { moverId } = res.locals.validated?.params as FavoriteMoverIdParam;
    const favorite = await favoritesService.addFavorite({
      userId: req.user.id,
      userType: req.user.userType,
      moverId,
    });

    res.status(201).json({
      data: favorite,
    });
  } catch (error) {
    next(error);
  }
};

export const removeFavorite = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED');
    }

    const { moverId } = res.locals.validated?.params as FavoriteMoverIdParam;
    await favoritesService.removeFavorite({
      userId: req.user.id,
      moverId,
    });

    res.status(200).json({
      success: true,
      message: '찜이 취소되었습니다.',
    });
  } catch (error) {
    next(error);
  }
};
