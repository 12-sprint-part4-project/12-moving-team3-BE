import type { Request, Response, NextFunction } from 'express';
import * as adminCompletedService from '../services/admin-completed.service';
import { getValidated } from '../utils/validated.util';
import { AdminCompletedListQuery } from '../schemas/admin-estimate-request.schema';
import { EstimateRequestIdParams } from '../schemas/estimate-request.schema';

export const getCompletedStatistics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate } = res.locals.validated.query;
    const statistics = await adminCompletedService.getCompletedStatistics({
      startDate,
      endDate,
    });
    res.status(200).json({
      data: statistics,
    });
  } catch (error) {
    next(error);
  }
};

export const getCompletedList = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = getValidated<AdminCompletedListQuery>(res, 'query');
    const { data, meta } = await adminCompletedService.getCompletedList(query);
    res.status(200).json({
      data,
      meta,
    });
  } catch (error) {
    next(error);
  }
};

export const getCompletedRequestDetail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const params = getValidated<EstimateRequestIdParams>(res, 'params');
    const result =
      await adminCompletedService.getCompletedRequestDetail(params);
    res.status(200).json({
      result,
    });
  } catch (error) {
    next(error);
  }
};
