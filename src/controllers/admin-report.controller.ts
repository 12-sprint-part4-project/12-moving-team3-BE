import type { NextFunction, Request, Response } from 'express';
import * as adminReportService from '../services/admin-report.service';

export const getReportStatistics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate } = res.locals.validated.query;
    const statistics = await adminReportService.getReportStatistics({
      startDate,
      endDate,
    });
    res.status(200).json({ data: statistics });
  } catch (error) {
    next(error);
  }
};
