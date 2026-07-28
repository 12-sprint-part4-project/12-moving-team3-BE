import type { NextFunction, Request, Response } from 'express';

import type { FavoriteMoverIdParam } from '../schemas/favorites.schema';
import * as favoritesService from '../services/favorites.service';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';

export const addFavorite = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { moverId } = res.locals.validated?.params as FavoriteMoverIdParam;
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
    const { moverId } = res.locals.validated?.params as FavoriteMoverIdParam;
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
