import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { AppError } from '../utils/app.error';
import { createReport } from './report.service';

interface MutableReportRepository {
  findReportTargetOwner: (input: {
    target: string;
    targetId: string;
  }) => Promise<{ ownerId: string | null } | null>;
  findDuplicateReport: (input: {
    reporterId: string;
    target: string;
    targetId: string;
  }) => Promise<{ id: number } | null>;
  createUserReport: (input: unknown) => Promise<unknown>;
}

const reportRepository =
  require('../repositories/report.repository') as MutableReportRepository;

const REPORTER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

describe('createReport', () => {
  const originalFindReportTargetOwner = reportRepository.findReportTargetOwner;
  const originalFindDuplicateReport = reportRepository.findDuplicateReport;
  const originalCreateUserReport = reportRepository.createUserReport;

  after(() => {
    reportRepository.findReportTargetOwner = originalFindReportTargetOwner;
    reportRepository.findDuplicateReport = originalFindDuplicateReport;
    reportRepository.createUserReport = originalCreateUserReport;
  });

  it('대상이 없으면 REPORT_TARGET_NOT_FOUND를 던진다', async () => {
    reportRepository.findReportTargetOwner = async () => null;

    await assert.rejects(
      () =>
        createReport({
          reporterId: REPORTER_ID,
          body: {
            target: 'REVIEW',
            targetId: '1',
            category: 'ABUSIVE_LANGUAGE',
          },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === 'REPORT_TARGET_NOT_FOUND'
    );
  });

  it('자기 자신을 신고하면 REPORT_SELF_NOT_ALLOWED를 던진다', async () => {
    reportRepository.findReportTargetOwner = async () => ({
      ownerId: REPORTER_ID,
    });

    await assert.rejects(
      () =>
        createReport({
          reporterId: REPORTER_ID,
          body: {
            target: 'USER',
            targetId: REPORTER_ID,
            category: 'ABUSIVE_LANGUAGE',
          },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === 'REPORT_SELF_NOT_ALLOWED'
    );
  });

  it('이미 신고한 대상이면 REPORT_ALREADY_EXISTS를 던진다', async () => {
    reportRepository.findReportTargetOwner = async () => ({
      ownerId: OTHER_USER_ID,
    });
    reportRepository.findDuplicateReport = async () => ({ id: 1 });

    await assert.rejects(
      () =>
        createReport({
          reporterId: REPORTER_ID,
          body: {
            target: 'REVIEW',
            targetId: '10',
            category: 'INAPPROPRIATE_PROFILE',
          },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === 'REPORT_ALREADY_EXISTS'
    );
  });
});
