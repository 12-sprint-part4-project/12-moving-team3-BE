import { Prisma } from '@prisma/client';
import { isSupportedReportTarget } from '../constants/report-target.constants';
import type { ReportCreateBody } from '../schemas/report.schema';
import * as reportRepository from '../repositories/report.repository';
import { AppError } from '../utils/app.error';

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

export interface CreateReportInput {
  reporterId: string;
  body: ReportCreateBody;
}

export const createReport = async ({ reporterId, body }: CreateReportInput) => {
  const { target, targetId, category } = body;

  // 스키마를 우회한 직접 호출에서도 지원 대상만 Repository로 넘긴다.
  if (!isSupportedReportTarget(target)) {
    throw new AppError('INVALID_REQUEST_BODY');
  }

  const targetInfo = await reportRepository.findReportTargetOwner({
    target,
    targetId,
  });

  if (!targetInfo) {
    throw new AppError('REPORT_TARGET_NOT_FOUND');
  }

  // ownerId가 있는 대상만 자기 신고를 막는다(콘텐츠/유저).
  if (targetInfo.ownerId !== null && targetInfo.ownerId === reporterId) {
    throw new AppError('REPORT_SELF_NOT_ALLOWED');
  }

  const duplicate = await reportRepository.findDuplicateReport({
    reporterId,
    target,
    targetId,
  });

  if (duplicate) {
    throw new AppError('REPORT_ALREADY_EXISTS');
  }

  try {
    return await reportRepository.createUserReport({
      reporterId,
      target,
      targetId,
      category,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError('REPORT_ALREADY_EXISTS');
    }
    throw error;
  }
};
