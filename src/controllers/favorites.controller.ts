import type { NextFunction, Request, Response } from 'express';

import type { FavoriteMoverIdParam } from '../schemas/favorites.schema';
import * as favoritesService from '../services/favorites.service';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import { AppError } from '../utils/app.error';

/** res.locals.validated에서 query/params를 꺼내오는 공통 헬퍼 */
const getValidatedData = <T>(res: Response, key: 'query' | 'params'): T => {
  const value = res.locals.validated?.[key];

  if (value == null || typeof value !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return value as T;
};

const getValidatedDetailParams = (res: Response): FavoriteMoverIdParam =>
  getValidatedData<FavoriteMoverIdParam>(res, 'params');

export const addFavorite = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { moverId } = getValidatedDetailParams(res);
    const favorite = await favoritesService.addFavorite({
      userId,
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
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { moverId } = getValidatedDetailParams(res);
    await favoritesService.removeFavorite({
      userId: userId,
      moverId,
    });

    res.status(200).json({
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
