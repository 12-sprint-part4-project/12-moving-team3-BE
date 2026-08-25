import type { NextFunction, Request, Response } from 'express';
import type {
  AdminReportDetailParams,
  AdminReportDetailQuery,
  AdminReportListQuery,
  AdminReportProcessBody,
} from '../schemas/admin-report.schema';
import * as adminReportService from '../services/admin-report.service';
import { getAuthenticatedAdmin } from '../middlewares/auth.middleware';
import { getValidated } from '../utils/validated.util';

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
    const query = getValidated<AdminReportListQuery>(res, 'query');
    const data = await adminReportService.getAdminReportList(query);

    // 관리자 API 공통 포맷: 성공 본문을 data로 감싼다.
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** 관리자 신고 상세 조회 */
export const getAdminReportDetail = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { reportId } = getValidated<AdminReportDetailParams>(res, 'params');
    const query = getValidated<AdminReportDetailQuery>(res, 'query');
    const data = await adminReportService.getAdminReportDetail(reportId, query);

    // 관리자 API 공통 포맷: 성공 본문을 data로 감싼다.
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** 관리자 신고 처리 — Action 실행 후 RESOLVED */
export const resolveAdminReport = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { reportId } = getValidated<AdminReportDetailParams>(res, 'params');
    const { actions } = getValidated<AdminReportProcessBody>(res, 'body');
    const { adminId } = getAuthenticatedAdmin(res);

    const data = await adminReportService.resolveAdminReport({
      reportId,
      adminId,
      actions,
    });

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** 관리자 신고 반려 — Action 없이 REJECTED만 저장 */
export const rejectAdminReport = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { reportId } = getValidated<AdminReportDetailParams>(res, 'params');
    const { adminId } = getAuthenticatedAdmin(res);

    const data = await adminReportService.rejectAdminReport({
      reportId,
      adminId,
    });

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};
