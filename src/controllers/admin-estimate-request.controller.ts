import type { NextFunction, Request, Response } from 'express';
import * as adminEstimateRequestService from '../services/admin-estimate-request.service';
import {
  AdminEstimateRequestDetailQuery,
  AdminEstimateRequestListQuery,
} from '../schemas/admin-estimate-request.schema';
import { getValidated } from '../utils/validated.util';
import { EstimateRequestIdParams } from '../schemas/estimate-request.schema';

export const getEstimateRequestStatistics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate } = res.locals.validated.query;

    const statistics =
      await adminEstimateRequestService.getEstimateRequestStatistics({
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

export const getEstimateRequestList = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = getValidated<AdminEstimateRequestListQuery>(res, 'query');
    const { data, meta } =
      await adminEstimateRequestService.getEstimateRequestList(query);

    res.status(200).json({
      data,
      meta,
    });
  } catch (error) {
    next(error);
  }
};

export const getEstimateRequestDetail = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const params = getValidated<EstimateRequestIdParams>(res, 'params');
    const query = getValidated<AdminEstimateRequestDetailQuery>(res, 'query');
    const result = await adminEstimateRequestService.getEstimateRequestDetail(
      params,
      query
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
