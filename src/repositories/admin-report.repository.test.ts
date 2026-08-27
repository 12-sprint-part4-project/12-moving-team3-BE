import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UserReportStatus, UserReportTarget } from '@prisma/client';
import { createDateRange } from '../utils/admin-date-range.util';
import {
  buildAdminReportListWhere,
  parseNumericTargetId,
} from './admin-report.repository';

const AUG_01 = new Date('2026-08-01T00:00:00.000Z');
const AUG_26 = new Date('2026-08-26T00:00:00.000Z');

describe('buildAdminReportListWhere', () => {
  it('빈 query면 기본 where를 반환한다', () => {
    const where = buildAdminReportListWhere({});

    assert.deepEqual(where, {});
  });

  it('신고 ID, 상태, target을 반영한다', () => {
    const where = buildAdminReportListWhere({
      id: 26,
      status: UserReportStatus.PENDING,
      target: UserReportTarget.REVIEW,
    });

    assert.deepEqual(where, {
      id: 26,
      status: UserReportStatus.PENDING,
      target: UserReportTarget.REVIEW,
    });
  });

  it('reportedFrom이 있으면 createdAt 범위를 추가한다', () => {
    const where = buildAdminReportListWhere({
      reportedFrom: AUG_01,
      reportedTo: AUG_26,
    });

    assert.deepEqual(where, {
      createdAt: createDateRange(AUG_01, AUG_26),
    });
  });

  it('대상 사용자 검색 결과가 없으면 id in []로 0건을 만든다', () => {
    const where = buildAdminReportListWhere({
      targetIds: {
        userIds: [],
        reviewIds: [],
        messageIds: [],
        articleIds: [],
        commentIds: [],
      },
    });

    assert.deepEqual(where, { id: { in: [] } });
  });

  it('대상 사용자 검색 결과를 target별 OR 조건으로 결합한다', () => {
    const where = buildAdminReportListWhere({
      target: UserReportTarget.REVIEW,
      targetIds: {
        userIds: ['11111111-1111-4111-8111-111111111111'],
        reviewIds: ['10', '20'],
        messageIds: ['30'],
        articleIds: ['40'],
        commentIds: ['50'],
      },
    });

    assert.deepEqual(where, {
      target: UserReportTarget.REVIEW,
      OR: [
        {
          target: UserReportTarget.USER,
          targetId: { in: ['11111111-1111-4111-8111-111111111111'] },
        },
        {
          target: UserReportTarget.REVIEW,
          targetId: { in: ['10', '20'] },
        },
        {
          target: UserReportTarget.MESSAGE,
          targetId: { in: ['30'] },
        },
        {
          target: UserReportTarget.ARTICLE,
          targetId: { in: ['40'] },
        },
        {
          target: UserReportTarget.COMMENT,
          targetId: { in: ['50'] },
        },
      ],
    });
  });
});

describe('parseNumericTargetId', () => {
  it('정상 양의 정수 문자열을 number로 변환한다', () => {
    assert.equal(parseNumericTargetId('42'), 42);
    assert.equal(parseNumericTargetId('2147483647'), 2147483647);
  });

  it('0, 음수, 소수, 지수·16진수 표기는 null을 반환한다', () => {
    assert.equal(parseNumericTargetId('0'), null);
    assert.equal(parseNumericTargetId('-1'), null);
    assert.equal(parseNumericTargetId('1.5'), null);
    assert.equal(parseNumericTargetId('1e3'), null);
    assert.equal(parseNumericTargetId('0x10'), null);
  });

  it('앞뒤 공백이나 숫자와 문자가 섞인 값은 null을 반환한다', () => {
    assert.equal(parseNumericTargetId(' 42'), null);
    assert.equal(parseNumericTargetId('42abc'), null);
  });

  it('Prisma Int 범위를 벗어나거나 안전 정수가 아니면 null을 반환한다', () => {
    assert.equal(parseNumericTargetId('2147483648'), null);
    assert.equal(parseNumericTargetId('9007199254740992'), null);
  });
});
