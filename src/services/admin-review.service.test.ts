import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { AdminReviewListQuery } from '../schemas/admin-review.schema';
import { getAdminReviewList } from './admin-review.service';

interface MutableAdminReviewRepository {
  findAdminReviewsWithCount: (
    params: AdminReviewListQuery
  ) => ReturnType<
    typeof import('../repositories/admin-review.repository').findAdminReviewsWithCount
  >;
}

const adminReviewRepository =
  require('../repositories/admin-review.repository') as MutableAdminReviewRepository;

describe('getAdminReviewList', () => {
  const originalFindAdminReviewsWithCount =
    adminReviewRepository.findAdminReviewsWithCount;

  after(() => {
    adminReviewRepository.findAdminReviewsWithCount =
      originalFindAdminReviewsWithCount;
  });

  it('전체 조회 조건의 totalCount와 페이지네이션을 같은 목록 결과로 반환한다', async () => {
    let receivedParams: AdminReviewListQuery | undefined;
    adminReviewRepository.findAdminReviewsWithCount = async (params) => {
      receivedParams = params;
      return { items: [], totalCount: 21 };
    };

    const params: AdminReviewListQuery = {
      page: 2,
      pageSize: 10,
    };
    const result = await getAdminReviewList(params);

    assert.deepEqual(receivedParams, params);
    assert.deepEqual(result, {
      items: [],
      pagination: {
        page: 2,
        pageSize: 10,
        totalCount: 21,
        totalPages: 3,
      },
    });
  });
});
