import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UserStatus, UserType } from '@prisma/client';
import { createDateRange } from '../utils/admin-date-range.util';
import { buildAdminMemberListWhere } from './admin-member.repository';

const AUG_01 = new Date('2026-08-01T00:00:00.000Z');
const AUG_26 = new Date('2026-08-26T00:00:00.000Z');

describe('buildAdminMemberListWhere', () => {
  it('검색 조건이 없으면 삭제되지 않은 회원만 조회한다', () => {
    const where = buildAdminMemberListWhere({});

    assert.deepEqual(where, { deletedAt: null });
  });

  it('userType=CUSTOMER이면 회원 유형 조건을 추가한다', () => {
    const where = buildAdminMemberListWhere({ userType: UserType.CUSTOMER });

    assert.deepEqual(where, {
      deletedAt: null,
      userType: UserType.CUSTOMER,
    });
  });

  it('userType=MOVER이면 기사 유형 조건을 추가한다', () => {
    const where = buildAdminMemberListWhere({ userType: UserType.MOVER });

    assert.deepEqual(where, {
      deletedAt: null,
      userType: UserType.MOVER,
    });
  });

  it('status=ACTIVE이면 userStatus가 없거나 ACTIVE인 회원을 포함한다', () => {
    const where = buildAdminMemberListWhere({ status: UserStatus.ACTIVE });

    assert.deepEqual(where, {
      deletedAt: null,
      AND: [
        {
          OR: [
            { userStatus: { is: null } },
            { userStatus: { is: { status: UserStatus.ACTIVE } } },
          ],
        },
      ],
    });
  });

  it('status=SUSPENDED이면 정지 상태 row가 있는 회원만 조회한다', () => {
    const where = buildAdminMemberListWhere({ status: UserStatus.SUSPENDED });

    assert.deepEqual(where, {
      deletedAt: null,
      AND: [
        {
          userStatus: {
            is: {
              status: UserStatus.SUSPENDED,
            },
          },
        },
      ],
    });
  });

  it('userName은 이름·닉네임 OR 검색으로 AND에 묶는다', () => {
    const where = buildAdminMemberListWhere({ userName: '홍길동' });

    assert.deepEqual(where, {
      deletedAt: null,
      AND: [
        {
          OR: [
            { name: { contains: '홍길동', mode: 'insensitive' } },
            { nickname: { contains: '홍길동', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('email은 대소문자 구분 없이 contains로 검색한다', () => {
    const where = buildAdminMemberListWhere({ email: 'test@example.com' });

    assert.deepEqual(where, {
      deletedAt: null,
      AND: [
        {
          email: { contains: 'test@example.com', mode: 'insensitive' },
        },
      ],
    });
  });

  it('phoneNumber는 숫자만 남긴 뒤 contains로 검색한다', () => {
    const where = buildAdminMemberListWhere({ phoneNumber: '010-1234-5678' });

    assert.deepEqual(where, {
      deletedAt: null,
      AND: [
        {
          phoneNumber: { contains: '01012345678' },
        },
      ],
    });
  });

  it('startDate가 있으면 createdAt 범위를 추가한다', () => {
    const where = buildAdminMemberListWhere({
      startDate: AUG_01,
      endDate: AUG_26,
    });

    assert.deepEqual(where, {
      deletedAt: null,
      createdAt: createDateRange(AUG_01, AUG_26),
    });
  });

  it('여러 필터를 AND로 결합하고 userType·날짜 범위는 최상위에 둔다', () => {
    const where = buildAdminMemberListWhere({
      userType: UserType.MOVER,
      status: UserStatus.SUSPENDED,
      userName: '김기사',
      email: 'mover@example.com',
      phoneNumber: '01099998888',
      startDate: AUG_01,
      endDate: AUG_26,
    });

    assert.deepEqual(where, {
      deletedAt: null,
      userType: UserType.MOVER,
      createdAt: createDateRange(AUG_01, AUG_26),
      AND: [
        {
          userStatus: {
            is: {
              status: UserStatus.SUSPENDED,
            },
          },
        },
        {
          OR: [
            { name: { contains: '김기사', mode: 'insensitive' } },
            { nickname: { contains: '김기사', mode: 'insensitive' } },
          ],
        },
        {
          email: { contains: 'mover@example.com', mode: 'insensitive' },
        },
        {
          phoneNumber: { contains: '01099998888' },
        },
      ],
    });
  });
});
