import { Prisma } from '@prisma/client';
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

  const targetInfo = await reportRepository.findReportTargetOwner({
    target,
    targetId,
  });

  if (!targetInfo) {
    throw new AppError('REPORT_TARGET_NOT_FOUND');
  }

  // CHAT_ROOM은 ownerId가 null — 자기 신고 검사 스킵
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
