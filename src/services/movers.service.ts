import {
  countMoverFavoritedByMoverIds,
  findFavoriteByUserAndMover,
  findFavoritedMoverIdsByUser,
} from '../repositories/favorite.repository';
import type {
  FindMoversFilters,
  MoverListSort,
} from '../repositories/movers.repository';
import moversRepository from '../repositories/movers.repository';
import reviewRepository from '../repositories/review.repository';
import type {
  FavoriteMoversQuery,
  MoversListQuery,
} from '../schemas/movers.schema';
import { AppError } from '../utils/app.error';
import { toProfileImageUrl } from '../utils/profile-image.util';
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
    onlyActiveMovers: true,
  };
};

const EMPTY_REVIEW_STATS = {
  ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  totalCount: 0,
  averageRating: null,
};

/** profileImageKey → profileImageUrl (클라이언트용) */
const mapUserProfileImage = <T extends { profileImageKey: string | null }>(
  user: T
): Omit<T, 'profileImageKey'> & { profileImageUrl: string | null } => {
  const { profileImageKey, ...rest } = user;

  return {
    ...rest,
    profileImageUrl: toProfileImageUrl(profileImageKey),
  };
};

const moversService = {
  /**
   * 기사 목록
   * - 항상 isFavorited(boolean) 포함
   * - customerId가 있을 때만 DB에서 찜 여부 조회, 없으면 전부
   */
  getMovers: async ({
    query,
    customerId,
  }: {
    query: MoversListQuery;
    customerId?: string;
  }) => {
    const filters = toFindMoversFilters(query);
    const {
      items: movers,
      hasNextPage,
      sort,
    } = await moversRepository.findMovers(filters);

    const moverIds = movers.map((mover) => mover.user.id);

    // 찜 여부·리뷰 통계를 병렬 배치 조회
    const [favoritedMoverIds, reviewStatsByMoverId] = await Promise.all([
      customerId
        ? findFavoritedMoverIdsByUser(customerId, moverIds)
        : Promise.resolve(new Set<string>()),
      reviewRepository.getReviewStatsByMoverIds(moverIds),
    ]);

    const moversWithReviews = movers.map((mover) => ({
      ...mover,
      user: mapUserProfileImage(mover.user),
      review: reviewStatsByMoverId.get(mover.user.id) ?? EMPTY_REVIEW_STATS,
      isFavorited: favoritedMoverIds.has(mover.user.id),
    }));

    const lastMover = movers.length > 0 ? movers[movers.length - 1] : undefined;

    return {
      data: { items: moversWithReviews },
      meta: {
        nextCursor:
          hasNextPage && lastMover
            ? encodeMoverListCursor(getMoverListCursorValue(sort, lastMover))
            : null,
        hasNextPage,
      },
    };
  },

  /**
   * 기사 상세
   * - 항상 isFavorited(boolean) 포함 (비회원·비고객은 false)
   */
  getMoverDetail: async ({
    moverId,
    customerId,
  }: {
    moverId: string;
    customerId?: string;
  }) => {
    const moverDetail = await moversRepository.findMoverProfileById({
      moverId,
      onlyActiveMovers: true,
    });

    if (!moverDetail) {
      throw new AppError('MOVER_NOT_FOUND');
    }

    const [reviewStats, favorite] = await Promise.all([
      reviewRepository.getReviewStatsByMoverId(moverId),
      customerId
        ? findFavoriteByUserAndMover(customerId, moverId)
        : Promise.resolve(null),
    ]);

    return {
      data: {
        moverDetail: {
          ...moverDetail,
          user: mapUserProfileImage(moverDetail.user),
        },
        reviewStats,
        isFavorited: favorite != null,
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
      await moversRepository.findFavoriteMoversById({
        userId,
        cursor: query.cursor
          ? decodeFavoriteListCursor(query.cursor)
          : undefined,
        limit: query.limit,
        onlyActiveMovers: true,
      });

    const moverIds = favorites
      .map((favorite) => favorite.moverId)
      .filter((moverId): moverId is string => moverId != null);

    const [reviewStatsByMoverId, favoritedCountByMoverId] = await Promise.all([
      reviewRepository.getReviewStatsByMoverIds(moverIds),
      countMoverFavoritedByMoverIds(moverIds),
    ]);

    const favoritesWithDetails = favorites.map((favorite) => {
      if (!favorite.moverId) {
        return {
          ...favorite,
          mover: favorite.mover
            ? mapUserProfileImage(favorite.mover)
            : favorite.mover,
          reviewStats: EMPTY_REVIEW_STATS,
          favoritedCount: 0,
        };
      }

      return {
        ...favorite,
        mover: favorite.mover
          ? mapUserProfileImage(favorite.mover)
          : favorite.mover,
        reviewStats:
          reviewStatsByMoverId.get(favorite.moverId) ?? EMPTY_REVIEW_STATS,
        favoritedCount: favoritedCountByMoverId.get(favorite.moverId) ?? 0,
      };
    });

    const lastFavorite =
      favorites.length > 0 ? favorites[favorites.length - 1] : undefined;

    return {
      data: { items: favoritesWithDetails },
      meta: {
        nextCursor:
          hasNextPage && lastFavorite
            ? encodeFavoriteListCursor(getFavoriteListCursorValue(lastFavorite))
            : null,
        hasNextPage,
      },
    };
  },
};

export default moversService;
