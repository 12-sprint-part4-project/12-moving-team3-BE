import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isUserAuthRole,
  parseAdminTokenSub,
  toAdminTokenSub,
} from './auth-role.util';

describe('isUserAuthRole', () => {
  it('CUSTOMER와 MOVER만 허용한다', () => {
    assert.equal(isUserAuthRole('CUSTOMER'), true);
    assert.equal(isUserAuthRole('MOVER'), true);
    assert.equal(isUserAuthRole('ADMIN'), false);
    assert.equal(isUserAuthRole(''), false);
    assert.equal(isUserAuthRole(null), false);
  });
});

describe('toAdminTokenSub / parseAdminTokenSub', () => {
  it('adminId를 admin:{id} 형식으로 만들고 다시 파싱한다', () => {
    assert.equal(toAdminTokenSub(12), 'admin:12');
    assert.equal(parseAdminTokenSub('admin:12'), 12);
  });

  it('prefix가 없거나 숫자가 아니면 null을 반환한다', () => {
    assert.equal(parseAdminTokenSub('12'), null);
    assert.equal(parseAdminTokenSub('admin:'), null);
    assert.equal(parseAdminTokenSub('admin:01'), null);
    assert.equal(parseAdminTokenSub('admin:0'), null);
    assert.equal(parseAdminTokenSub('admin:-1'), null);
    assert.equal(parseAdminTokenSub(1), null);
  });
});
