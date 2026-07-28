import type { NextFunction, Request, Response } from 'express';

import type {
  MoverDetailParams,
  MoversListQuery,
} from '../schemas/movers.schema';
import moversService from '../services/movers.service';
import { AppError } from '../utils/app.error';

const getValidatedListQuery = (res: Response): MoversListQuery => {
  const query = res.locals.validated?.query;

  if (query == null || typeof query !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return query as MoversListQuery;
};

const getValidatedDetailParams = (res: Response): MoverDetailParams => {
  const params = res.locals.validated?.params;

  if (params == null || typeof params !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return params as MoverDetailParams;
};

export const getMovers = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = getValidatedListQuery(res);
    const movers = await moversService.getMovers(query);

    // TODO: API 명세에 pagination meta(total, page, limit 등)가 있으면 응답 형식 맞추기
    res.status(200).json({
      data: movers,
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
      data: moverDetail,
    });
  } catch (error) {
    next(error);
  }
};
