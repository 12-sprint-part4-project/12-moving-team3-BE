import type { FindMoversFilters, MoverListSort } from '../repositories/moverProfile.repository';
import moverProfileRepository from '../repositories/moverProfile.repository';
import type { MoversListQuery } from '../schemas/movers.schema';
import { AppError } from '../utils/app.error';

const toMoverListSort = (
  sort?: MoversListQuery['sort'],
  order?: MoversListQuery['order']
): MoverListSort | undefined => {
  if (!sort) {
    return undefined;
  }

  const resolvedOrder =
    order ?? (sort === 'career' ? 'asc' : 'desc');

  return `${sort}_${resolvedOrder}` as MoverListSort;
};

const toFindMoversFilters = (query: MoversListQuery): FindMoversFilters => {
  return {
    keyword: query.keyword,
    regions: query.region,
    moveTypes: query.moveType,
    sort: toMoverListSort(query.sort, query.order),
    page: query.page,
    limit: query.limit,
  };
};

const moversService = {
  getMovers: async (query: MoversListQuery) => {
    const filters = toFindMoversFilters(query);
    return moverProfileRepository.findMovers(filters);
  },

  getMoverDetail: async (id: number) => {
    const moverDetail =
      await moverProfileRepository.findMoverProfileById(id);

    if (!moverDetail) {
      throw new AppError('MOVER_NOT_FOUND');
    }

    // TODO: 상세 응답에 리뷰/평점/찜 수 등 추가 필드가 명세에 있으면 repository include·매핑 보강
    return moverDetail;
  },
};

export default moversService;
