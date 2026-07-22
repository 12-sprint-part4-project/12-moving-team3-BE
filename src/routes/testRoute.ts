//예시 코드(이후 삭제)
import { Router } from "express";
import * as testController from "../controllers/testController";

const router = Router();

router.get("/", testController.getTest);

export default router;
