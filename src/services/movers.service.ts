import {
  countMoverFavorited,
  countMoverFavoritedByMoverIds,
  findFavoriteByUserAndMover,
  findFavoritedMoverIdsByUser,
} from '../repositories/favorite.repository';
import type {
  FindMoversFilters,
  MoverListSort,
} from '../repositories/movers.repository';
import moversRepository from '../repositories/movers.repository';
import {
  countConfirmedQuotesByMoverId,
  countConfirmedQuotesByMoverIds,
} from '../repositories/quote.repository';
import reviewRepository from '../repositories/review.repository';
import * as reviewService from './review.service';
import type {
  FavoriteMoversQuery,
  MoversListQuery,
} from '../schemas/movers.schema';
import { AppError } from '../utils/app.error';
import { toPresignedViewUrl } from './s3.service';
import {
  decodeFavoriteListCursor,
  decodeMoverListCursor,
  encodeFavoriteListCursor,
  encodeMoverListCursor,
  getFavoriteListCursorValue,
  getMoverListCursorValue,
} from '../utils/movers-cursor.util';

const DEFAULT_MOVER_LIST_SORT: MoverListSort = 'reviewCount';

const toFindMoversFilters = (query: MoversListQuery): FindMoversFilters => {
  const sort = query.sort ?? DEFAULT_MOVER_LIST_SORT;

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
const mapUserProfileImage = async <
  T extends { profileImageKey: string | null },
>(
  user: T
): Promise<Omit<T, 'profileImageKey'> & { profileImageUrl: string | null }> => {
  const { profileImageKey, ...rest } = user;

  return {
    ...rest,
    profileImageUrl: await toPresignedViewUrl(profileImageKey),
  };
};

const moversService = {
  /**
   * 기사 목록
   * - 항상 isFavorited(boolean) 포함
   * - customerId가 있을 때만 DB에서 찜 여부 조회, 없으면 거짓
   * - 항상 favoritedCount(number) 포함 — 해당 기사가 받은 총 찜 수 (로그인 여부와 무관)
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

    // 이후 배치 조회용으로 이번 페이지 기사들의 User UUID만 모은다.
    const moverIds = movers.map((mover) => mover.user.id);

    const [favoritedMoverIds, reviewStatsByMoverId, favoritedCountByMoverId] =
      await Promise.all([
        customerId
          ? findFavoritedMoverIdsByUser(customerId, moverIds)
          : Promise.resolve(new Set<string>()),
        reviewRepository.getReviewStatsByMoverIds(moverIds),
        countMoverFavoritedByMoverIds(moverIds),
      ]);

    const moversWithReviews = await Promise.all(
      movers.map(async (mover) => ({
        ...mover,
        user: await mapUserProfileImage(mover.user),
        review: reviewStatsByMoverId.get(mover.user.id) ?? EMPTY_REVIEW_STATS,
        isFavorited: favoritedMoverIds.has(mover.user.id),
        favoritedCount: favoritedCountByMoverId.get(mover.user.id) ?? 0,
      }))
    );

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
   * - 항상 favoritedCount / confirmedCount 포함 (로그인 여부와 무관)
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

    // ── favoritedCount / confirmedCount 추가 ────────────────────────
    const [reviewStats, favorite, favoritedCount, confirmedCount] =
      await Promise.all([
        reviewRepository.getReviewStatsByMoverId(moverId),
        customerId
          ? findFavoriteByUserAndMover(customerId, moverId)
          : Promise.resolve(null),
        countMoverFavorited(moverId),
        countConfirmedQuotesByMoverId(moverId),
      ]);

    return {
      data: {
        moverDetail: {
          ...moverDetail,
          user: await mapUserProfileImage(moverDetail.user),
        },
        reviewStats,
        isFavorited: favorite != null,
        // FE toMoverCardModelFromDetail → favoritedCount/confirmedCount ?? null
        favoritedCount,
        confirmedCount,
      },
    };
  },

  /**
   * 찜한 기사님 목록 (CUSTOMER)
   * - reviewStats, favoritedCount
   * - service: 이사유형 배열 (MoveType[])
   * - confirmedCount: 확정 견적 건수
   */
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

    const [
      reviewStatsByMoverId,
      favoritedCountByMoverId,
      confirmedCountByMoverId,
    ] = await Promise.all([
      reviewRepository.getReviewStatsByMoverIds(moverIds),
      countMoverFavoritedByMoverIds(moverIds),
      countConfirmedQuotesByMoverIds(moverIds),
    ]);

    const favoritesWithDetails = await Promise.all(
      favorites.map(async (favorite) => {
        // 프로필에 등록된 이사유형. 없으면 빈 배열 → FE 「서비스 미등록」
        const service = favorite.mover?.moverProfile?.service ?? [];

        if (!favorite.moverId) {
          return {
            ...favorite,
            mover: favorite.mover
              ? await mapUserProfileImage(favorite.mover)
              : favorite.mover,
            reviewStats: EMPTY_REVIEW_STATS,
            favoritedCount: 0,
            service,
            confirmedCount: 0,
          };
        }

        return {
          ...favorite,
          mover: favorite.mover
            ? await mapUserProfileImage(favorite.mover)
            : favorite.mover,
          reviewStats:
            reviewStatsByMoverId.get(favorite.moverId) ?? EMPTY_REVIEW_STATS,
          favoritedCount: favoritedCountByMoverId.get(favorite.moverId) ?? 0,
          // FE toMoverCardModelFromFavorite: item.service ?? moverProfile.service
          service,
          confirmedCount: confirmedCountByMoverId.get(favorite.moverId) ?? 0,
        };
      })
    );

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

  /**
   * 기사 상세용 공개 리뷰 목록
   * - path의 moverId(User UUID)로 조회. 인증 불필요.
   * - 응답 형태는 본인용 GET /api/review/mover 와 동일 (reviewService 재사용).
   */
  getMoverPublicReviews: async ({
    moverId,
    page,
    limit,
  }: {
    moverId: string;
    page: number;
    limit: number;
  }) => {
    // ── 공개 리뷰 API 과정 ───────────────────────────────────────────────
    //getMoverReviews와의차이점은 moverId 출처뿐: 본인 API=토큰 userId, 공개 API=path :id
    const moverDetail = await moversRepository.findMoverProfileById({
      moverId,
      onlyActiveMovers: true,
    });

    if (!moverDetail) {
      throw new AppError('MOVER_NOT_FOUND');
    }

    return reviewService.getMoverReviews({ moverId, page, limit });
  },
};

export default moversService;
