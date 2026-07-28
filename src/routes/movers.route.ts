import { Router } from 'express';

import * as moversController from '../controllers/movers.controller';

const router = Router();

// 기사님 목록 조회 (Swagger 문서: src/docs/movers.swagger.yaml)
// TODO: schemas/movers.schema.ts 추가 후 validateRequest(query) 연결
router.get('/', moversController.getMovers);

// 기사님 상세 조회 (Swagger 문서: src/docs/movers.swagger.yaml)
// TODO: schemas/movers.schema.ts 추가 후 validateRequest(params.id) 연결
router.get('/:id', moversController.getMoverDetail);

export default router;
