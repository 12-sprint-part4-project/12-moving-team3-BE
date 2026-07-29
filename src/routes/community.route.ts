import { Router } from 'express';
import * as postController from '../controllers/post.controller';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  createPostBodySchema,
  postIdParamsSchema,
  postListQuerySchema,
  presignedUrlBodySchema,
  updatePostBodySchema,
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
 * /api/posts/image/presigned-url:
 *   post:
 *     tags: [Posts]
 *     summary: 게시글 이미지 업로드 Presigned URL 발급
 *     description: |
 *       S3에 이미지를 직접 업로드하기 위한 Presigned URL을 발급합니다.
 *       발급된 presignedUrl로 PUT 요청하여 이미지를 업로드하고,
 *       imageKey를 게시글 생성/수정 시 사용합니다.
 *       유효 시간은 5분(300초)입니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [filename, contentType]
 *             properties:
 *               filename:
 *                 type: string
 *                 description: 업로드할 파일명 (확장자 포함)
 *               contentType:
 *                 type: string
 *                 description: image/* MIME 타입 (예: image/jpeg)
 *     responses:
 *       200:
 *         description: Presigned URL 발급 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     presignedUrl:
 *                       type: string
 *                       description: S3 PUT 업로드용 Presigned URL
 *                     imageKey:
 *                       type: string
 *                       description: 게시글 생성/수정 시 사용할 이미지 키
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/image/presigned-url',
  requireAuth,
  validateRequest({ body: presignedUrlBodySchema, errorCode: 'INVALID_REQUEST' }),
  postController.getPresignedUrl
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

/**
 * @swagger
 * /api/posts:
 *   post:
 *     tags: [Posts]
 *     summary: 게시글 생성
 *     description: |
 *       로그인한 사용자가 게시글을 생성합니다.
 *       가구 나눔(FURNITURE_SHARE) 카테고리는 latitude, longitude가 필수입니다.
 *       imageKeys는 최대 5장까지 등록할 수 있습니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, title, content]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [MOVING_TIP, QUESTION, REVIEW, ETC, FURNITURE_SHARE]
 *               region:
 *                 type: string
 *                 enum: [SEOUL, GYEONGGI, INCHEON, GANGWON, CHUNGBUK, CHUNGNAM, SEJONG, DAEJEON, JEONBUK, GWANGJU_JEONNAM, GYEONGBUK, DAEGU, ULSAN, GYEONGNAM, BUSAN, JEJU]
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               content:
 *                 type: string
 *                 minLength: 1
 *               imageKeys:
 *                 type: array
 *                 maxItems: 5
 *                 items:
 *                   type: string
 *                   minLength: 1
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *     responses:
 *       201:
 *         description: 게시글 생성 성공
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
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/',
  requireAuth,
  validateRequest({ body: createPostBodySchema, errorCode: 'INVALID_REQUEST' }),
  postController.createPost
);

/**
 * @swagger
 * /api/posts/{postId}:
 *   patch:
 *     tags: [Posts]
 *     summary: 게시글 수정
 *     description: |
 *       본인 게시글의 content, imageKeys만 수정할 수 있습니다.
 *       imageKeys를 보내면 기존 이미지는 전체 교체됩니다.
 *       content, imageKeys 중 최소 1개는 포함해야 합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 minLength: 1
 *               imageKeys:
 *                 type: array
 *                 maxItems: 5
 *                 items:
 *                   type: string
 *                   minLength: 1
 *     responses:
 *       200:
 *         description: 게시글 수정 성공
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
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.patch(
  '/:postId',
  requireAuth,
  validateRequest({
    params: postIdParamsSchema,
    body: updatePostBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  postController.updatePost
);

/**
 * @swagger
 * /api/posts/{postId}:
 *   delete:
 *     tags: [Posts]
 *     summary: 게시글 삭제
 *     description: 본인 게시글을 soft delete합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       204:
 *         description: 게시글 삭제 성공
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete(
  '/:postId',
  requireAuth,
  validateRequest({ params: postIdParamsSchema, errorCode: 'INVALID_REQUEST' }),
  postController.deletePost
);

export default router;
