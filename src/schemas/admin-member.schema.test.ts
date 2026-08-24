import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adminMemberDetailQuerySchema,
  adminMemberListQuerySchema,
} from './admin-member.schema';

describe('adminMemberListQuerySchema', () => {
  it('sort가 없으면 DESC를 기본값으로 둔다', () => {
    const result = adminMemberListQuerySchema.parse({});

    assert.equal(result.sort, 'DESC');
  });

  it('userType과 status를 그대로 보존한다', () => {
    const result = adminMemberListQuerySchema.parse({
      userType: 'MOVER',
      status: 'SUSPENDED',
    });

    assert.equal(result.userType, 'MOVER');
    assert.equal(result.status, 'SUSPENDED');
  });
});

describe('adminMemberDetailQuerySchema', () => {
  it('userType 없이 파싱하면 실패한다', () => {
    const result = adminMemberDetailQuerySchema.safeParse({});

    assert.equal(result.success, false);
  });

  it('page/pageSize 없이 파싱하고 sort 기본값은 DESC다', () => {
    const result = adminMemberDetailQuerySchema.parse({
      userType: 'CUSTOMER',
    });

    assert.equal(result.userType, 'CUSTOMER');
    assert.equal(result.sort, 'DESC');
    assert.equal('page' in result, false);
  });

  it('endDate만 있으면 검증에 실패한다', () => {
    const result = adminMemberDetailQuerySchema.safeParse({
      userType: 'CUSTOMER',
      endDate: '2026-08-31',
    });

    assert.equal(result.success, false);
  });
});
