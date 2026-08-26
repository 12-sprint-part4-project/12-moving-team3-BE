import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { favoriteMoverIdParamSchema } from './favorites.schema';

describe('favoriteMoverIdParamSchema', () => {
  it('유효한 UUID면 통과한다', () => {
    const moverId = '11111111-1111-4111-8111-111111111111';
    const result = favoriteMoverIdParamSchema.parse({ moverId });

    assert.equal(result.moverId, moverId);
  });

  it('잘못된 moverId면 검증에 실패한다', () => {
    const result = favoriteMoverIdParamSchema.safeParse({
      moverId: 'not-a-uuid',
    });

    assert.equal(result.success, false);
  });
});
