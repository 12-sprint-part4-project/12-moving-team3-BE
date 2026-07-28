import { Router } from 'express';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';

const router = Router();

router.post(
  '/:estimateId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    body: reviewBodySchema,
    errorCode: 'INVALID_REQUEST',
  })
); //리뷰 등록
router.patch(
  '/:reviewId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    body: reviewBodySchema,
    errorCode: 'INVALID_REQUEST',
  })
); //리뷰 수정
router.delete('/:reviewId', requireAuth, allowUserTypes('CUSTOMER')); //리뷰 삭제 (소프트 딜리트)
router.get(
  '/mover',
  requireAuth,
  allowUserTypes('MOVER'),
  validateRequest({
    query: reviewListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  })
); //기사님의 리뷰 목록 조회
router.get(
  '/customer',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    query: reviewListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  })
); //고객의 리뷰 목록 조회
router.get(
  '/customer/writeable',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    query: reviewListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  })
); //리뷰 작성 가능한 견적 조회
//리뷰 통계 정보 가져오기 (movers할 때 구현한..)

export default router;
