import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UserType } from '@prisma/client';
import { resolveIsProfileCompleted } from './profile.util';

describe('resolveIsProfileCompleted', () => {
  it('CUSTOMER는 service가 1개 이상이면 완료다', () => {
    assert.equal(
      resolveIsProfileCompleted(UserType.CUSTOMER, { service: ['SMALL'] }, null),
      true
    );
    assert.equal(
      resolveIsProfileCompleted(UserType.CUSTOMER, { service: [] }, null),
      false
    );
    assert.equal(
      resolveIsProfileCompleted(UserType.CUSTOMER, null, { service: ['HOME'] }),
      false
    );
  });

  it('MOVER는 service가 1개 이상이면 완료다', () => {
    assert.equal(
      resolveIsProfileCompleted(UserType.MOVER, null, { service: ['HOME'] }),
      true
    );
    assert.equal(
      resolveIsProfileCompleted(UserType.MOVER, { service: ['SMALL'] }, null),
      false
    );
  });
});
