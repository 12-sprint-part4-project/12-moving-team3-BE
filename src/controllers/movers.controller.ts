import type { Request, Response, NextFunction } from 'express';
import moversService from '../services/movers.service';

export const getMovers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // TODO: validateRequest 연동 후 res.locals.validated.query 사용으로 교체
    const movers = await moversService.getMovers(
      req.query as Record<string, unknown>
    );

    // TODO: API 명세에 pagination meta(total, page, limit 등)가 있으면 응답 형식 맞추기
    res.status(200).json({
      data: movers,
    });
  } catch (error) {
    next(error);
  }
};

export const getMoverDetail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // TODO: validateRequest 연동 후 res.locals.validated.params.id 사용으로 교체
    const id = String(req.params.id);
    const moverDetail = await moversService.getMoverDetail(id);

    res.status(200).json({
      data: moverDetail,
    });
  } catch (error) {
    next(error);
  }
};
