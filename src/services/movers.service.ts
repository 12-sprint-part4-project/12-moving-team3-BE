import type {
  FindMoversFilters,
  MoverListSort,
} from '../repositories/moverProfile.repository';
import moverProfileRepository from '../repositories/moverProfile.repository';
import reviewRepository from '../repositories/review.repository';
import type {
  FavoriteMoversQuery,
  MoversListQuery,
} from '../schemas/movers.schema';
import { AppError } from '../utils/app.error';

const toMoverListSort = (
  sort?: MoversListQuery['sort'],
  order?: MoversListQuery['order']
): MoverListSort | undefined => {
  if (!sort) {
    return undefined;
  }

  const resolvedOrder = order ?? (sort === 'career' ? 'asc' : 'desc');

  return `${sort}_${resolvedOrder}` as MoverListSort;
};

/**
 * 검증된 MoversListQuery → repository FindMoversFilters
 */
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
    //기사님 정보
    const movers = await moverProfileRepository.findMovers(filters);

    //리뷰 정보
    const reviews = await Promise.all(
      movers.map(async (mover) => {
        const reviewStats = await reviewRepository.getReviewStatsByMoverId(
          mover.user.id
        );
        return {
          ...mover,
          review: reviewStats,
        };
      })
    );

    //pagination 정보
    const totalCount = await moverProfileRepository.countMovers(filters);
    const totalPages = Math.ceil(totalCount / query.limit);
    const hasNextPage = query.page < totalPages;
    const hasPrevPage = query.page > 1;
    const pagination = {
      currentPage: query.page,
      pageSize: query.limit,
      totalItems: totalCount,
      totalPages: totalPages,
      hasNextPage: hasNextPage,
      hasPrevPage: hasPrevPage,
    };
    return {
      data: movers,
      meta: {
        pagination: pagination,
      },
    };
  },

  getMoverDetail: async (id: number) => {
    const moverDetail = await moverProfileRepository.findMoverProfileById(id);

    if (!moverDetail) {
      throw new AppError('MOVER_NOT_FOUND');
    }

    // TODO: 상세 응답에 리뷰/평점/찜 수 등 추가 필드가 명세에 있으면 repository include·매핑 보강
    return moverDetail;
  },

  getFavoriteMovers: async ({
    userId,
    query,
  }: {
    userId: string;
    query: FavoriteMoversQuery;
  }) => {
    const favoriteMovers = await moverProfileRepository.findFavoriteMoversById(
      userId,
      query
    );
    //pagination 정보
    const totalCount =
      await moverProfileRepository.countFavoriteMoversById(userId);
    const totalPages = Math.ceil(totalCount / query.limit);
    const hasNextPage = query.page < totalPages;
    const hasPrevPage = query.page > 1;
    const pagination = {
      currentPage: query.page,
      pageSize: query.limit,
      totalItems: totalCount,
      totalPages: totalPages,
      hasNextPage: hasNextPage,
      hasPrevPage: hasPrevPage,
    };
    return {
      data: favoriteMovers,
      meta: {
        pagination: pagination,
      },
    };
  },
};

export default moversService;
