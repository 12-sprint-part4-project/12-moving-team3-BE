import { countMoverFavorited } from '../repositories/favorite.repository';
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
  //TODO: 로그인한 사용자에겐 찜 유무 필드 추가
  getMovers: async (query: MoversListQuery) => {
    const filters = toFindMoversFilters(query);
    //기사님 정보
    const movers = await moverProfileRepository.findMovers(filters);

    //리뷰 정보를 합한 객체로 변환
    const moversWithReviews = await Promise.all(
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
      data: moversWithReviews,
      meta: {
        pagination: pagination,
      },
    };
  },

  //TODO: 로그인한 사용자에겐 찜 유무 필드 추가
  getMoverDetail: async (moverId: string) => {
    //기사님 상세 정보
    const moverDetail =
      await moverProfileRepository.findMoverProfileById(moverId);
    //TODO: moverDetail이 존재하지 않는다면 에러반환
    //리뷰 통계
    const reviewStats = await reviewRepository.getReviewStatsByMoverId(moverId);
    //리뷰 전체
    const reviews = await reviewRepository.getReviewsByMoverId(moverId);

    if (!moverDetail) {
      throw new AppError('MOVER_NOT_FOUND');
    }

    return {
      data: {
        moverDetail,
        reviewStats,
        reviews,
      },
    };
  },

  getFavoriteMovers: async ({
    userId,
    query,
  }: {
    userId: string;
    query: FavoriteMoversQuery;
  }) => {
    //찜한 기사님 목록
    const movers = await moverProfileRepository.findFavoriteMoversById(
      userId,
      query
    );

    //리뷰 통계 + 찜 수
    const emptyReviewStats = {
      ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      totalCount: 0,
      averageRating: null,
    };

    const moversWithReviewAndCount = await Promise.all(
      movers.map(async (mover) => {
        if (!mover.moverId) {
          return {
            ...mover,
            reviewStats: emptyReviewStats,
            favoritedCount: 0,
          };
        }

        const [reviewStats, favoritedCount] = await Promise.all([
          reviewRepository.getReviewStatsByMoverId(mover.moverId),
          countMoverFavorited(mover.moverId),
        ]);

        return {
          ...mover,
          reviewStats,
          favoritedCount,
        };
      })
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
      data: moversWithReviewAndCount,
      meta: {
        pagination: pagination,
      },
    };
  },
};

export default moversService;
