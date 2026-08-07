import type { NextFunction, Request, Response } from 'express';
import * as adminReviewService from '../services/admin-review.service';

export const getReviewStatistics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate } = res.locals.validated.query;

    const statistics = await adminReviewService.getReviewStatistics({
      startDate,
      endDate,
    });

    res.status(200).json({ data: statistics });
  } catch (error) {
    next(error);
  }
};
