import type { Request, Response, NextFunction } from 'express';
import moversService from '../services/movers.service';

export const getMovers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const queryParams = req.query;
    const movers = await moversService.getMovers(queryParams);

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
    const { id } = req.params;
    const mover = await moversService.getMoverDetail(id);
    res.status(200).json({
      data: mover,
    });
  } catch (error) {
    next(error);
  }
};
