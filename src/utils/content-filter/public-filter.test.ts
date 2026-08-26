import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toPublicFilterFields } from './public-filter.util.js';

describe('toPublicFilterFields', () => {
  it('maps action and dedupes reason codes', () => {
    const result = toPublicFilterFields({
      action: 'block',
      reasons: [
        { code: 'PROFANITY', method: 'exact' },
        { code: 'PERSONAL_INFO_PHONE', method: 'regex' },
        { code: 'PERSONAL_INFO_PHONE', method: 'normalized' },
      ],
    });

    assert.equal(result.filterAction, 'block');
    assert.deepEqual(result.filterReasonCodes, [
      'PROFANITY',
      'PERSONAL_INFO_PHONE',
    ]);
  });

  it('returns empty reason codes for allow', () => {
    const result = toPublicFilterFields({
      action: 'allow',
      reasons: [],
    });

    assert.equal(result.filterAction, 'allow');
    assert.deepEqual(result.filterReasonCodes, []);
  });
});
