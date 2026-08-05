import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type { DesignatedEstimateExistenceParams } from '../schemas/designated-estimate-request.schema';
import * as designatedEstimateRequestService from '../services/designated-estimate-request.service';
import { getValidated } from '../utils/validated.util';

/**
 * GET /api/designated-estimate-requests/:estimateRequestId/movers/:moverId
 * 지정 견적 존재 여부 조회
 */
export const checkDesignatedEstimateExistence = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { estimateRequestId, moverId } =
      getValidated<DesignatedEstimateExistenceParams>(res, 'params');

    const data =
      await designatedEstimateRequestService.checkDesignatedEstimateExistence({
        userId,
        estimateRequestId,
        moverId,
      });

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};
