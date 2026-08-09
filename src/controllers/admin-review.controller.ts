import type { NextFunction, Request, Response } from 'express';
import type {
  AdminReviewListQuery,
  AdminReviewParams,
} from '../schemas/admin-review.schema';
import * as adminReviewService from '../services/admin-review.service';
import { getAuthenticatedAdmin } from '../utils/admin-auth.util';
import { getValidated } from '../utils/validated.util';

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

/** 관리자 리뷰 목록 조회 */
export const getAdminReviewList = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = getValidated<AdminReviewListQuery>(res, 'query');

    const data = await adminReviewService.getAdminReviewList(query);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** 관리자 리뷰 soft delete — 성공 시 본문 없이 204 (일반 리뷰 DELETE와 동일) */
export const deleteAdminReview = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { reviewId } = getValidated<AdminReviewParams>(res, 'params');
    const { adminId } = getAuthenticatedAdmin(res);

    await adminReviewService.deleteAdminReview(reviewId, adminId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
