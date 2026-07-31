import type { Request, Response, NextFunction } from 'express';
import * as adminCompletedService from '../services/admin-completed.service';

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
