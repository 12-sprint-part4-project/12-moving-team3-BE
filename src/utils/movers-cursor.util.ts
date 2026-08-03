import type { MoverListSort } from '../repositories/movers.repository';
import { AppError } from './app.error';

/** 기사 목록 커서 (정렬 기준값 + id) — 정렬은 모두 숫자·내림차순 */
export interface MoverListCursor {
  sort: MoverListSort;
  value: string;
  id: number;
}

/** 찜 목록 커서 (찜한 시각 + favorite id) */
export interface FavoriteListCursor {
  value: string;
  id: number;
}

const encode = (cursor: object): string =>
  Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url');

const decode = (encoded: string): unknown => {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
  } catch {
    throw new AppError('INVALID_QUERY_PARAM');
  }
};

const isMoverListCursor = (value: unknown): value is MoverListCursor =>
  typeof value === 'object' &&
  value !== null &&
  'sort' in value &&
  'value' in value &&
  'id' in value &&
  typeof (value as MoverListCursor).value === 'string' &&
  typeof (value as MoverListCursor).id === 'number';

const isFavoriteListCursor = (value: unknown): value is FavoriteListCursor =>
  typeof value === 'object' &&
  value !== null &&
  'value' in value &&
  'id' in value &&
  typeof (value as FavoriteListCursor).value === 'string' &&
  typeof (value as FavoriteListCursor).id === 'number';

/** 커서에 넣을 숫자 정렬값 (평점은 소수 1자리) */
const formatNumericCursorValue = (value: number): string => {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Math.round(value * 10) / 10);
};

export const encodeMoverListCursor = (cursor: MoverListCursor): string =>
  encode(cursor);

export const decodeMoverListCursor = (
  encoded: string,
  expectedSort: MoverListSort
): MoverListCursor => {
  const decoded = decode(encoded);

  if (!isMoverListCursor(decoded) || decoded.sort !== expectedSort) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  if (!/^\d+(\.\d+)?$/.test(decoded.value)) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return decoded;
};

export const encodeFavoriteListCursor = (cursor: FavoriteListCursor): string =>
  encode(cursor);

export const decodeFavoriteListCursor = (
  encoded: string
): FavoriteListCursor => {
  const decoded = decode(encoded);

  if (!isFavoriteListCursor(decoded)) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  if (new Date(decoded.value).toISOString() !== decoded.value) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return decoded;
};

export const getMoverListCursorValue = (
  sort: MoverListSort,
  mover: {
    id: number;
    career: number | null;
    /** 집계 정렬(reviewCount/averageRating/confirmedCount)용 */
    listSortValue?: number;
  }
): MoverListCursor => {
  if (sort === 'career') {
    return {
      sort,
      value: String(mover.career ?? 0),
      id: mover.id,
    };
  }

  return {
    sort,
    value: formatNumericCursorValue(mover.listSortValue ?? 0),
    id: mover.id,
  };
};

export const getFavoriteListCursorValue = (favorite: {
  id: number;
  createdAt: Date;
}): FavoriteListCursor => ({
  value: favorite.createdAt.toISOString(),
  id: favorite.id,
});
