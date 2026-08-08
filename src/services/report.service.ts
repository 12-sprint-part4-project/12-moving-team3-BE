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

/** 공개 신고 생성에서 허용하는 대상. Prisma enum과 분리해 레거시 CHAT_ROOM 접수를 막는다. */
const CREATABLE_REPORT_TARGETS = new Set([
  'USER',
  'REVIEW',
  'MESSAGE',
  'ARTICLE',
  'COMMENT',
]);

export const createReport = async ({ reporterId, body }: CreateReportInput) => {
  const { target, targetId, category } = body;

  // 스키마 검증을 우회한 직접 호출에서도 CHAT_ROOM이 Repository까지 내려가지 않게 한다.
  if (!CREATABLE_REPORT_TARGETS.has(target)) {
    throw new AppError('INVALID_REQUEST_BODY');
  }

  const targetInfo = await reportRepository.findReportTargetOwner({
    target,
    targetId,
  });

  if (!targetInfo) {
    throw new AppError('REPORT_TARGET_NOT_FOUND');
  }

  // ownerId가 있는 대상만 자기 신고를 막는다(콘텐츠/유저). ownerId가 null이면 검사하지 않는다.
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
