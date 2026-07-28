import { Router } from 'express';

import * as moversController from '../controllers/movers.controller';

const router = Router();

// 기사님 목록 조회 (Swagger 문서: src/docs/movers.swagger.yaml)
router.get('/', moversController.getMovers);

// 기사님 상세 조회 (Swagger 문서: src/docs/movers.swagger.yaml)
router.get('/:id', moversController.getMoverDetail);

export default router;
