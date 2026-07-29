import type { NextFunction, Request, Response } from 'express';

import type {
  FavoriteMoversQuery,
  MoverDetailParams,
  MoversListQuery,
} from '../schemas/movers.schema';
import moversService from '../services/movers.service';
import { AppError } from '../utils/app.error';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';

/** res.locals.validated에서 query/params를 꺼내오는 공통 헬퍼 */
const getValidatedData = <T>(res: Response, key: 'query' | 'params'): T => {
  const value = res.locals.validated?.[key];

  if (value == null || typeof value !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return value as T;
};

const getValidatedListQuery = (res: Response): MoversListQuery =>
  getValidatedData<MoversListQuery>(res, 'query');

const getValidatedDetailParams = (res: Response): MoverDetailParams =>
  getValidatedData<MoverDetailParams>(res, 'params');

const getValidatedFavoriteMoversQuery = (res: Response): FavoriteMoversQuery =>
  getValidatedData<FavoriteMoversQuery>(res, 'query');

export const getMovers = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = getValidatedListQuery(res);
    const response = await moversService.getMovers(query);

    res.status(200).json({
      data: response.data,
      meta: response.meta,
    });
  } catch (error) {
    next(error);
  }
};

export const getMoverDetail = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = getValidatedDetailParams(res);
    const moverDetail = await moversService.getMoverDetail(id);

    res.status(200).json({
      data: moverDetail.data,
    });
  } catch (error) {
    next(error);
  }
};

export const getFavoriteMovers = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res); //애초에 customer만 접근 가능한 곳으로, usertype은 꺼낼 필요x
    const query = getValidatedFavoriteMoversQuery(res); //pagination 정보만 들어있음.

    const response = await moversService.getFavoriteMovers({
      userId,
      query,
    });

    res.status(200).json({
      data: response.data,
      meta: response.meta,
    });
  } catch (error) {
    next(error);
  }
};
