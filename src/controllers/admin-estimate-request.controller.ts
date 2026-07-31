import type { NextFunction, Request, Response } from 'express';
import * as adminEstimateRequestService from '../services/admin-estimate-request.service';

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
