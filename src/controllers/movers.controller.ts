import type { Request, Response, NextFunction } from 'express';

export const getMovers = (req: Request, res: Response, next: NextFunction) => {
  try {
    const queryParams = req.query;
  } catch (error) {
    next(error);
  }
};
