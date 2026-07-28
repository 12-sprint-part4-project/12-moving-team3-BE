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
import {
  decodeFavoriteListCursor,
  decodeMoverListCursor,
  encodeFavoriteListCursor,
  encodeMoverListCursor,
  getFavoriteListCursorValue,
  getMoverListCursorValue,
} from '../utils/movers-cursor.util';

const DEFAULT_MOVER_LIST_SORT: MoverListSort = 'createdAt_desc';

const toMoverListSort = (
  sort?: MoversListQuery['sort'],
  order?: MoversListQuery['order']
): MoverListSort => {
  if (!sort) {
    return DEFAULT_MOVER_LIST_SORT;
  }

  const resolvedOrder = order ?? (sort === 'career' ? 'asc' : 'desc');

  return `${sort}_${resolvedOrder}` as MoverListSort;
};

const toFindMoversFilters = (query: MoversListQuery): FindMoversFilters => {
  const sort = toMoverListSort(query.sort, query.order);

  return {
    keyword: query.keyword,
    regions: query.region,
    moveTypes: query.moveType,
    sort,
    cursor: query.cursor
      ? decodeMoverListCursor(query.cursor, sort)
      : undefined,
    limit: query.limit,
  };
};

const EMPTY_REVIEW_STATS = {
  ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  totalCount: 0,
  averageRating: null,
};

const moversService = {
  //TODO: 로그인한 사용자에겐 찜 유무 필드 추가
  getMovers: async (query: MoversListQuery) => {
    const filters = toFindMoversFilters(query);
    const { items: movers, hasNextPage, sort } =
      await moverProfileRepository.findMovers(filters);

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

    const lastMover = movers.length > 0 ? movers[movers.length - 1] : undefined;

    return {
      data: moversWithReviews,
      meta: {
        nextCursor:
          hasNextPage && lastMover
            ? encodeMoverListCursor(getMoverListCursorValue(sort, lastMover))
            : null,
        hasNextPage,
      },
    };
  },

  //TODO: 로그인한 사용자에겐 찜 유무 필드 추가
  getMoverDetail: async (moverId: string) => {
    const moverDetail =
      await moverProfileRepository.findMoverProfileById(moverId);

    if (!moverDetail) {
      throw new AppError('MOVER_NOT_FOUND');
    }

    const [reviewStats, reviews] = await Promise.all([
      reviewRepository.getReviewStatsByMoverId(moverId),
      reviewRepository.getReviewsByMoverId(moverId),
    ]);

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
    const { items: favorites, hasNextPage } =
      await moverProfileRepository.findFavoriteMoversById({
        userId,
        cursor: query.cursor
          ? decodeFavoriteListCursor(query.cursor)
          : undefined,
        limit: query.limit,
      });

    const favoritesWithDetails = await Promise.all(
      favorites.map(async (favorite) => {
        if (!favorite.moverId) {
          return {
            ...favorite,
            reviewStats: EMPTY_REVIEW_STATS,
            favoritedCount: 0,
          };
        }

        const [reviewStats, favoritedCount] = await Promise.all([
          reviewRepository.getReviewStatsByMoverId(favorite.moverId),
          countMoverFavorited(favorite.moverId),
        ]);

        return {
          ...favorite,
          reviewStats,
          favoritedCount,
        };
      })
    );

    const lastFavorite =
      favorites.length > 0 ? favorites[favorites.length - 1] : undefined;

    return {
      data: favoritesWithDetails,
      meta: {
        nextCursor:
          hasNextPage && lastFavorite
            ? encodeFavoriteListCursor(
                getFavoriteListCursorValue(lastFavorite)
              )
            : null,
        hasNextPage,
      },
    };
  },
};

export default moversService;
