import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDateNeighborQuery,
  createDateSortOrderBy,
} from './admin-date-sort.util';

const CURRENT_DATE = new Date('2026-07-15T00:00:00.000Z');

describe('createDateSortOrderBy', () => {
  it('ASC는 null last, DESC는 null first이고 보조 정렬은 id desc이다', () => {
    assert.deepEqual(createDateSortOrderBy('submittedAt', 'ASC'), [
      { submittedAt: { sort: 'asc', nulls: 'last' } },
      { id: 'desc' },
    ]);
    assert.deepEqual(createDateSortOrderBy('moveDate', 'DESC'), [
      { moveDate: { sort: 'desc', nulls: 'first' } },
      { id: 'desc' },
    ]);
  });
});

describe('createDateNeighborQuery', () => {
  it('DESC에서 날짜가 있으면 prev에 null을 포함하고 next에는 넣지 않는다', () => {
    const { prevWhere, nextWhere } = createDateNeighborQuery(
      'submittedAt',
      { id: 8, date: CURRENT_DATE },
      'DESC'
    );

    assert.deepEqual(prevWhere, {
      OR: [
        { submittedAt: null },
        { submittedAt: { gt: CURRENT_DATE } },
        { submittedAt: CURRENT_DATE, id: { gt: 8 } },
      ],
    });
    assert.deepEqual(nextWhere, {
      OR: [
        { submittedAt: { lt: CURRENT_DATE } },
        { submittedAt: CURRENT_DATE, id: { lt: 8 } },
      ],
    });
  });

  it('DESC에서 날짜가 null이면 다른 null(id desc)과 날짜 있는 건만 이웃이 된다', () => {
    const { prevWhere, nextWhere } = createDateNeighborQuery(
      'moveDate',
      { id: 5, date: null },
      'DESC'
    );

    assert.deepEqual(prevWhere, { moveDate: null, id: { gt: 5 } });
    assert.deepEqual(nextWhere, {
      OR: [{ moveDate: null, id: { lt: 5 } }, { moveDate: { not: null } }],
    });
  });

  it('ASC에서 날짜가 있으면 next에 null을 포함하고 prev에는 넣지 않는다', () => {
    const { prevWhere, nextWhere } = createDateNeighborQuery(
      'submittedAt',
      { id: 8, date: CURRENT_DATE },
      'ASC'
    );

    assert.deepEqual(prevWhere, {
      OR: [
        { submittedAt: { lt: CURRENT_DATE } },
        { submittedAt: CURRENT_DATE, id: { gt: 8 } },
      ],
    });
    assert.deepEqual(nextWhere, {
      OR: [
        { submittedAt: { gt: CURRENT_DATE } },
        { submittedAt: CURRENT_DATE, id: { lt: 8 } },
        { submittedAt: null },
      ],
    });
  });

  it('ASC에서 날짜가 null이면 날짜 있는 건과 다른 null(id desc)만 이웃이 된다', () => {
    const { prevWhere, nextWhere } = createDateNeighborQuery(
      'moveDate',
      { id: 5, date: null },
      'ASC'
    );

    assert.deepEqual(prevWhere, {
      OR: [{ moveDate: { not: null } }, { moveDate: null, id: { gt: 5 } }],
    });
    assert.deepEqual(nextWhere, { moveDate: null, id: { lt: 5 } });
  });
});
