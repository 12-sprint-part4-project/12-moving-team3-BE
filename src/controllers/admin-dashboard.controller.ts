import type { NextFunction, Request, Response } from 'express';
import * as adminDashboardService from '../services/admin-dashboard.service';

export const getStatistics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate } = res.locals.validated.query;

    const statistics = await adminDashboardService.getStatistics({
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

export const getRequestTrend = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { period } = res.locals.validated.query;

    const requestTrend = await adminDashboardService.getRequestTrend(period);

    res.status(200).json({ data: requestTrend });
  } catch (error) {
    next(error);
  }
};

export const getRequestStatus = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const requestStatus = await adminDashboardService.getRequestStatus();
    res.status(200).json({ data: requestStatus });
  } catch (error) {
    next(error);
  }
};
