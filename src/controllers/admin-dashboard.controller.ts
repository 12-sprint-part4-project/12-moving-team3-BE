import { NextFunction, Request, Response } from 'express';
import * as adminDashboardService from '../services/admin-dashboard.service';

export const adminDashboardController = {
  getStatistics: async (req: Request, res: Response, next: NextFunction) => {
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
  },
};
