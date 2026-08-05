import type { DesignatedEstimateExistenceDto } from '../dtos/designated-estimate-request.dto';
import * as designatedEstimateRequestRepository from '../repositories/designated-estimate-request.repository';
import * as estimateRequestRepository from '../repositories/estimate-request.repository';
import { AppError } from '../utils/app.error';

/**
 * 지정 견적 존재 여부 조회 (고객 본인 견적요청만)
 */
export const checkDesignatedEstimateExistence = async (params: {
  userId: string;
  estimateRequestId: number;
  moverId: string;
}): Promise<DesignatedEstimateExistenceDto> => {
  const { userId, estimateRequestId, moverId } = params;

  //견적 요청이 존재하는지
  const estimateRequest =
    await estimateRequestRepository.findEstimateRequestById(estimateRequestId);

  //견적 요청이 존재하지 않으면 에러
  if (!estimateRequest) {
    throw new AppError(
      'ESTIMATE_REQUEST_NOT_FOUND',
      '일반 견적 요청이 존재하지 않습니다.'
    );
  }
  //본인의 견적 요청이 아니라면
  if (estimateRequest.userId !== userId) {
    throw new AppError('FORBIDDEN', '본인의 견적 요청만 조회할 수 있습니다.');
  }
  //지정 견적 존재 여부 조회
  const designatedEstimateRequest =
    await designatedEstimateRequestRepository.findByEstimateIdAndMoverId(
      estimateRequestId,
      moverId
    );
  //지정 견적이 존재하지 않는다면
  if (!designatedEstimateRequest) {
    return { exists: false, designatedEstimateRequest: null };
  }
  //지정 견적이 존재한다면
  return {
    exists: true,
    designatedEstimateRequest: {
      id: designatedEstimateRequest.id,
      estimateId: designatedEstimateRequest.estimateId,
      moverId: designatedEstimateRequest.moverId,
    },
  };
};
