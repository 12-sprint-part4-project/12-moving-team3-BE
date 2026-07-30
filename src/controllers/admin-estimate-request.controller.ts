import type { NextFunction, Request, Response } from 'express';
import * as adminEstimateRequestService from '../services/admin-estimate-request.service';

export const getEstimateRequestStatistics = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate, keyword } = res.locals.validated.query;

    const statistics =
      await adminEstimateRequestService.getEstimateRequestStatistics({
        startDate,
        endDate,
        keyword,
      });

    res.status(200).json({
      data: statistics,
    });
  } catch (error) {
    next(error);
  }
};
