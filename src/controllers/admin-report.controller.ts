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

/** 관리자 신고 목록 조회 */
export const getAdminReportList = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await adminReportService.getAdminReportList();

    // 관리자 API 공통 포맷: 성공 본문을 data로 감싼다.
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};
