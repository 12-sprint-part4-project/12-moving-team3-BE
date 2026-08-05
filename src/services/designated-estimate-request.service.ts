import { EstimateRequestStatus, Prisma } from '@prisma/client';
import type {
  CreateDesignatedEstimateDto,
  DesignatedEstimateExistenceDto,
  DesignatedEstimateMoverDto,
} from '../dtos/designated-estimate-request.dto';
import * as designatedEstimateRequestRepository from '../repositories/designated-estimate-request.repository';
import * as estimateRequestRepository from '../repositories/estimate-request.repository';
import { findUserById } from '../repositories/user.repository';
import { AppError } from '../utils/app.error';

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

const toDto = (row: {
  id: number;
  estimateId: number;
  moverId: string;
}): DesignatedEstimateMoverDto => ({
  id: row.id,
  estimateId: row.estimateId,
  moverId: row.moverId,
});

/**
 * 지정 견적 존재 여부 조회 (고객 본인 견적요청만)
 */
export const checkDesignatedEstimateExistence = async (params: {
  userId: string;
  estimateRequestId: number;
  moverId: string;
}): Promise<DesignatedEstimateExistenceDto> => {
  const { userId, estimateRequestId, moverId } = params;

  const estimateRequest =
    await estimateRequestRepository.findEstimateRequestById(estimateRequestId);

  if (!estimateRequest) {
    throw new AppError(
      'ESTIMATE_REQUEST_NOT_FOUND',
      '일반 견적 요청이 존재하지 않습니다.'
    );
  }

  if (estimateRequest.userId !== userId) {
    throw new AppError('FORBIDDEN', '본인의 견적 요청만 조회할 수 있습니다.');
  }

  const designatedEstimateRequest =
    await designatedEstimateRequestRepository.findByEstimateIdAndMoverId(
      estimateRequestId,
      moverId
    );

  if (!designatedEstimateRequest) {
    return { exists: false, designatedEstimateRequest: null };
  }

  return {
    exists: true,
    designatedEstimateRequest: toDto(designatedEstimateRequest),
  };
};

/**
 * 지정 견적 요청 생성 — SUBMITTED 상태의 본인 견적요청에만 가능
 */
export const createDesignatedEstimateRequest = async (params: {
  userId: string;
  estimateRequestId: number;
  moverId: string;
}): Promise<CreateDesignatedEstimateDto> => {
  const { userId, estimateRequestId, moverId } = params;

  const estimateRequest =
    await estimateRequestRepository.findEstimateRequestById(estimateRequestId);

  if (!estimateRequest) {
    throw new AppError(
      'ESTIMATE_REQUEST_NOT_FOUND',
      '일반 견적 요청이 존재하지 않습니다.'
    );
  }

  if (estimateRequest.userId !== userId) {
    throw new AppError('FORBIDDEN', '본인의 견적 요청만 지정할 수 있습니다.');
  }

  if (estimateRequest.status !== EstimateRequestStatus.SUBMITTED) {
    throw new AppError('ESTIMATE_REQUEST_NOT_SUBMITTED');
  }

  const mover = await findUserById(moverId);

  if (!mover || mover.deletedAt || mover.userType !== 'MOVER') {
    throw new AppError('MOVER_NOT_FOUND');
  }

  const existing =
    await designatedEstimateRequestRepository.findByEstimateIdAndMoverId(
      estimateRequestId,
      moverId
    );

  if (existing) {
    throw new AppError('DESIGNATED_ALREADY_EXISTS');
  }

  try {
    return toDto(
      await designatedEstimateRequestRepository.create(
        estimateRequestId,
        moverId
      )
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError('DESIGNATED_ALREADY_EXISTS');
    }

    throw error;
  }
};
