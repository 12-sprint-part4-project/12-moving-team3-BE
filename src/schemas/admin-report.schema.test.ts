import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adminReportListQuerySchema,
  adminReportProcessBodySchema,
} from './admin-report.schema';

describe('adminReportListQuerySchema', () => {
  it('sort가 없으면 DESC를 기본값으로 둔다', () => {
    const result = adminReportListQuerySchema.parse({});

    assert.equal(result.sort, 'DESC');
  });

  it('id를 숫자로 변환하고 userName을 trim한다', () => {
    const result = adminReportListQuerySchema.parse({
      id: '26',
      userName: '  김민수  ',
    });

    assert.equal(result.id, 26);
    assert.equal(result.userName, '김민수');
  });

  it('userName이 공백만 있으면 검증에 실패한다', () => {
    const result = adminReportListQuerySchema.safeParse({ userName: '   ' });

    assert.equal(result.success, false);
  });

  it('sort ASC와 DESC를 그대로 보존한다', () => {
    assert.equal(adminReportListQuerySchema.parse({ sort: 'ASC' }).sort, 'ASC');
    assert.equal(
      adminReportListQuerySchema.parse({ sort: 'DESC' }).sort,
      'DESC'
    );
  });
});

describe('adminReportProcessBodySchema', () => {
  it('정지 Action 하나를 전달하면 성공한다', () => {
    const result = adminReportProcessBodySchema.safeParse({
      actions: ['SUSPEND_TARGET_USER'],
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data.actions, ['SUSPEND_TARGET_USER']);
    }
  });

  it('삭제 Action 하나를 전달하면 성공한다', () => {
    const result = adminReportProcessBodySchema.safeParse({
      actions: ['DELETE_REPORTED_CONTENT'],
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data.actions, ['DELETE_REPORTED_CONTENT']);
    }
  });

  it('두 Action을 함께 전달하면 성공한다', () => {
    const result = adminReportProcessBodySchema.safeParse({
      actions: ['SUSPEND_TARGET_USER', 'DELETE_REPORTED_CONTENT'],
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data.actions, [
        'SUSPEND_TARGET_USER',
        'DELETE_REPORTED_CONTENT',
      ]);
    }
  });

  it('빈 배열이면 실패한다', () => {
    const result = adminReportProcessBodySchema.safeParse({
      actions: [],
    });

    assert.equal(result.success, false);
  });

  it('actions가 없으면 실패한다', () => {
    const result = adminReportProcessBodySchema.safeParse({});

    assert.equal(result.success, false);
  });

  it('잘못된 Action이면 실패한다', () => {
    const result = adminReportProcessBodySchema.safeParse({
      actions: ['UNKNOWN_ACTION'],
    });

    assert.equal(result.success, false);
  });

  it('같은 Action이 중복되면 실패한다', () => {
    const result = adminReportProcessBodySchema.safeParse({
      actions: ['SUSPEND_TARGET_USER', 'SUSPEND_TARGET_USER'],
    });

    assert.equal(result.success, false);
  });

  it('배열이 아니면 실패한다', () => {
    const result = adminReportProcessBodySchema.safeParse({
      actions: 'SUSPEND_TARGET_USER',
    });

    assert.equal(result.success, false);
  });
});
