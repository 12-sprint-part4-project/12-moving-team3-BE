//예시 코드(이후 삭제)
import { Request, Response } from "express";
import * as testService from "../services/testService";

export const getTest = (_req: Request, res: Response) => {
  const result = testService.getTest();

  res.json({
    message: result,
  });
};
