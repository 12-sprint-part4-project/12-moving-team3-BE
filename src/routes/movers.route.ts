import { Router } from 'express';

import * as moversController from '../controllers/movers.controller';

const router = Router();

/**
 * @swagger
 * /api/movers:
 *   get:
 *     tags: [Movers]
 *     summary: 기사님 목록 조회
 *     description: |
 *       기사 프로필 목록을 조회합니다.
 *       keyword, region, moveType, sort, order, page, limit 쿼리로 필터·정렬·페이지네이션할 수 있습니다.
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: 닉네임·소개글 검색어
 *       - in: query
 *         name: region
 *         schema:
 *           oneOf:
 *             - type: string
 *             - type: array
 *               items:
 *                 type: string
 *         description: 활동 지역 (Region enum, 복수 가능)
 *       - in: query
 *         name: moveType
 *         schema:
 *           oneOf:
 *             - type: string
 *             - type: array
 *               items:
 *                 type: string
 *         description: 제공 서비스 (SMALL | HOME | OFFICE, 복수 가능)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [career, createdAt]
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: 조회 성공
 *       400:
 *         description: 잘못된 쿼리 파라미터
 *       500:
 *         description: 서버 내부 오류
 */
router.get('/', moversController.getMovers);

/**
 * @swagger
 * /api/movers/{id}:
 *   get:
 *     tags: [Movers]
 *     summary: 기사님 상세 조회
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 기사 프로필 ID (mover_profiles.id)
 *     responses:
 *       200:
 *         description: 조회 성공
 *       400:
 *         description: 잘못된 ID
 *       404:
 *         description: 기사님 없음
 *       500:
 *         description: 서버 내부 오류
 */
router.get('/:id', moversController.getMoverDetail);

export default router;
