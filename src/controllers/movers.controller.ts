import type { Request, Response, NextFunction } from 'express';
import moversService from '../services/movers.service';

export const getMovers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const movers = await moversService.getMovers(
      req.query as Record<string, unknown>
    );

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
    const id = String(req.params.id);
    const moverDetail = await moversService.getMoverDetail(id);

    res.status(200).json({
      data: moverDetail,
    });
  } catch (error) {
    next(error);
  }
};
