import { Router } from 'express';
import * as commentController from '../controllers/comment.controller';
import * as likeController from '../controllers/like.controller';
import * as postController from '../controllers/post.controller';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  commentIdParamsSchema,
  commentListQuerySchema,
  createCommentBodySchema,
  createPostBodySchema,
  postIdParamsSchema,
  postListQuerySchema,
  postNeighborsQuerySchema,
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
 *       category, region, keyword, sort, cursor, limit 쿼리로 필터·정렬·무한 스크롤 조회할 수 있습니다.
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
 *         name: keyword
 *         required: false
 *         schema:
 *           type: string
 *         description: 제목·본문 부분 일치 검색 (대소문자 무시). 공백만 있으면 무시됩니다.
 *         example: 이사
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
 * /api/posts/{postId}/neighbors:
 *   get:
 *     tags: [Posts]
 *     summary: 게시글 이전/다음 조회
 *     description: |
 *       목록 API와 동일한 category, region, keyword, sort 기준으로 이전·다음 게시글을 조회합니다.
 *       prev는 목록에서 더 최신(위), next는 더 오래됨(아래)입니다.
 *       현재 글이 필터에 포함되지 않으면 prev/next 모두 null입니다.
 *       Bearer Access Token은 선택입니다.
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
 *       - in: query
 *         name: category
 *         required: false
 *         schema:
 *           type: string
 *           enum: [MOVING_TIP, QUESTION, REVIEW, ETC, FURNITURE_SHARE]
 *       - in: query
 *         name: region
 *         required: false
 *         schema:
 *           type: string
 *           enum: [SEOUL, GYEONGGI, INCHEON, GANGWON, CHUNGBUK, CHUNGNAM, SEJONG, DAEJEON, JEONBUK, GWANGJU_JEONNAM, GYEONGBUK, DAEGU, ULSAN, GYEONGNAM, BUSAN, JEJU]
 *       - in: query
 *         name: keyword
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         required: false
 *         schema:
 *           type: string
 *           enum: [LATEST, POPULAR, MOST_COMMENTED]
 *           default: LATEST
 *     responses:
 *       200:
 *         description: 이전/다음 게시글 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     prev:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: integer
 *                         title:
 *                           type: string
 *                     next:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: integer
 *                         title:
 *                           type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/:postId/neighbors',
  optionalAuth,
  validateRequest({
    params: postIdParamsSchema,
    query: postNeighborsQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  postController.getPostNeighbors
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
 *       이미지는 `GET /api/presigned-upload-url?prefix=posts`로 업로드한 뒤 반환된 s3Key를 사용합니다.
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
 *                 description: presigned-upload-url(prefix=posts)로 발급받은 s3Key 목록
 *                 items:
 *                   type: string
 *                   minLength: 1
 *                   pattern: ^posts/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_.+$
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
 *                 description: presigned-upload-url(prefix=posts)로 발급받은 s3Key 목록
 *                 items:
 *                   type: string
 *                   minLength: 1
 *                   pattern: ^posts/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_.+$
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

/**
 * @swagger
 * /api/posts/{postId}/likes:
 *   post:
 *     tags: [Posts]
 *     summary: 게시글 좋아요 추가
 *     description: 로그인한 사용자가 게시글에 좋아요를 추가합니다. 이미 좋아요한 경우 409를 반환합니다.
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
 *       201:
 *         description: 좋아요 추가 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   nullable: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *   delete:
 *     tags: [Posts]
 *     summary: 게시글 좋아요 취소
 *     description: 로그인한 사용자가 게시글 좋아요를 취소합니다. 좋아요 기록이 없으면 404를 반환합니다.
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
 *         description: 좋아요 취소 성공
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/:postId/likes',
  requireAuth,
  validateRequest({ params: postIdParamsSchema, errorCode: 'INVALID_REQUEST' }),
  likeController.createLike
);

router.delete(
  '/:postId/likes',
  requireAuth,
  validateRequest({ params: postIdParamsSchema, errorCode: 'INVALID_REQUEST' }),
  likeController.deleteLike
);

/**
 * @swagger
 * /api/posts/{postId}/views:
 *   post:
 *     tags: [Posts]
 *     summary: 게시글 조회수 증가
 *     description: |
 *       게시글 상세 조회 시 조회수를 1 증가시킵니다.
 *       Bearer Access Token은 선택입니다. 비로그인(게스트)도 호출할 수 있습니다.
 *       중복 호출 방지는 FE(sessionStorage)에서 처리합니다.
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
 *     responses:
 *       204:
 *         description: 조회수 증가 성공
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/:postId/views',
  optionalAuth,
  validateRequest({ params: postIdParamsSchema, errorCode: 'INVALID_REQUEST' }),
  postController.incrementViewCount
);

/**
 * @swagger
 * /api/posts/{postId}/comments:
 *   get:
 *     tags: [Posts]
 *     summary: 댓글 목록 조회
 *     description: |
 *       게시글의 최상위 댓글을 커서 기반으로 조회합니다.
 *       각 댓글에 대댓글(replies)이 포함됩니다 (depth 1).
 *       정렬은 최상위 댓글 기준 작성일 오름차순(과거→최신)입니다.
 *       Bearer Access Token은 선택입니다. 토큰이 있으면 isMine이 반영됩니다.
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
 *         description: 페이지당 최상위 댓글 개수
 *     responses:
 *       200:
 *         description: 댓글 목록 조회 성공
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
 *                           content:
 *                             type: string
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
 *                           isMine:
 *                             type: boolean
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           replies:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                 content:
 *                                   type: string
 *                                 author:
 *                                   type: object
 *                                   properties:
 *                                     id:
 *                                       type: string
 *                                       format: uuid
 *                                     nickname:
 *                                       type: string
 *                                     profileImageUrl:
 *                                       type: string
 *                                       nullable: true
 *                                 isMine:
 *                                   type: boolean
 *                                   nullable: true
 *                                 createdAt:
 *                                   type: string
 *                                   format: date-time
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *   post:
 *     tags: [Posts]
 *     summary: 댓글 작성
 *     description: 로그인한 사용자가 게시글에 댓글을 작성합니다.
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
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: 댓글 작성 성공
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/:postId/comments',
  optionalAuth,
  validateRequest({
    params: postIdParamsSchema,
    query: commentListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  commentController.getComments
);

router.post(
  '/:postId/comments',
  requireAuth,
  validateRequest({
    params: postIdParamsSchema,
    body: createCommentBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  commentController.createComment
);

/**
 * @swagger
 * /api/posts/{postId}/comments/{commentId}/replies:
 *   post:
 *     tags: [Posts]
 *     summary: 대댓글 작성
 *     description: |
 *       로그인한 사용자가 댓글에 대댓글을 작성합니다.
 *       대댓글에 대한 대댓글은 불가합니다 (depth 1 제한).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: path
 *         name: commentId
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
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: 대댓글 작성 성공
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/:postId/comments/:commentId/replies',
  requireAuth,
  validateRequest({
    params: commentIdParamsSchema,
    body: createCommentBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  commentController.createReply
);

/**
 * @swagger
 * /api/posts/{postId}/comments/{commentId}:
 *   delete:
 *     tags: [Posts]
 *     summary: 댓글 삭제
 *     description: |
 *       본인 댓글을 soft delete합니다.
 *       댓글 삭제 시 해당 댓글의 대댓글도 함께 삭제됩니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       204:
 *         description: 댓글 삭제 성공
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
  '/:postId/comments/:commentId',
  requireAuth,
  validateRequest({
    params: commentIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  commentController.deleteComment
);

export default router;
