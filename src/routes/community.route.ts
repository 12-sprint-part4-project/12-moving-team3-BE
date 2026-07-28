import { Router } from 'express';
import * as postController from '../controllers/post.controller';
import { optionalAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  postIdParamsSchema,
  postListQuerySchema,
} from '../schemas/post.schema';

const router = Router();

/**
 * @swagger
 * /api/posts:
 *   get:
 *     tags: [Posts]
 *     summary: 게시글 목록 조회
 *     description: |
 *       커뮤니티 게시글 목록을 커서 기반으로 조회합니다.
 *       카테고리를 지정하지 않으면 가구 나눔(FURNITURE_SHARE) 게시글은 제외됩니다.
 *       Bearer Access Token은 선택입니다. 토큰이 있으면 isLiked가 반영되고, 없으면 isLiked는 null입니다.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: query
 *         name: category
 *         required: false
 *         schema:
 *           type: string
 *           enum: [MOVING_TIP, QUESTION, REVIEW, ETC, FURNITURE_SHARE]
 *         description: 게시글 카테고리 필터
 *       - in: query
 *         name: region
 *         required: false
 *         schema:
 *           type: string
 *           enum: [SEOUL, GYEONGGI, INCHEON, GANGWON, CHUNGBUK, CHUNGNAM, SEJONG, DAEJEON, JEONBUK, GWANGJU_JEONNAM, GYEONGBUK, DAEGU, ULSAN, GYEONGNAM, BUSAN, JEJU]
 *         description: 지역 필터 (가구 나눔 등)
 *       - in: query
 *         name: sort
 *         required: false
 *         schema:
 *           type: string
 *           enum: [LATEST, POPULAR, MOST_COMMENTED]
 *           default: LATEST
 *         description: 정렬 기준
 *       - in: query
 *         name: cursor
 *         required: false
 *         schema:
 *           type: string
 *         description: 이전 응답 meta.nextCursor 값
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 10
 *         description: 페이지당 조회 개수
 *     responses:
 *       200:
 *         description: 게시글 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           category:
 *                             type: string
 *                           region:
 *                             type: string
 *                             nullable: true
 *                           title:
 *                             type: string
 *                           contentPreview:
 *                             type: string
 *                           thumbnailUrl:
 *                             type: string
 *                             nullable: true
 *                           author:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               nickname:
 *                                 type: string
 *                               profileImageUrl:
 *                                 type: string
 *                                 nullable: true
 *                           likeCount:
 *                             type: integer
 *                           commentCount:
 *                             type: integer
 *                           isLiked:
 *                             type: boolean
 *                             nullable: true
 *                             description: 로그인 시 true/false, 비로그인 시 null
 *                           isCompleted:
 *                             type: boolean
 *                             nullable: true
 *                             description: 가구 나눔 카테고리에만 값 존재
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     nextCursor:
 *                       type: string
 *                       nullable: true
 *                     hasNextPage:
 *                       type: boolean
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/',
  optionalAuth,
  validateRequest({
    query: postListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  postController.getPosts
);

/**
 * @swagger
 * /api/posts/{postId}:
 *   get:
 *     tags: [Posts]
 *     summary: 게시글 상세 조회
 *     description: |
 *       게시글 상세 정보를 조회합니다. 삭제된 게시글은 404를 반환합니다.
 *       Bearer Access Token은 선택입니다. 토큰이 있으면 isLiked가 반영되고, 없으면 isLiked는 null입니다.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: 게시글 ID
 *     responses:
 *       200:
 *         description: 게시글 상세 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     category:
 *                       type: string
 *                     region:
 *                       type: string
 *                       nullable: true
 *                     title:
 *                       type: string
 *                     content:
 *                       type: string
 *                     images:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           imageUrl:
 *                             type: string
 *                             nullable: true
 *                     author:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         nickname:
 *                           type: string
 *                         profileImageUrl:
 *                           type: string
 *                           nullable: true
 *                     likeCount:
 *                       type: integer
 *                     commentCount:
 *                       type: integer
 *                     isLiked:
 *                       type: boolean
 *                       nullable: true
 *                     isCompleted:
 *                       type: boolean
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/:postId',
  optionalAuth,
  validateRequest({
    params: postIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  postController.getPostById
);

export default router;
