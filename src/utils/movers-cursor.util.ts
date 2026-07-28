import type { MoverListSort } from '../repositories/moverProfile.repository';
import { AppError } from './app.error';

/** 기사 목록 커서 (정렬 기준값 + id) */
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

  return decoded;
};

export const getMoverListCursorValue = (
  sort: MoverListSort,
  mover: { id: number; createdAt: Date; career: number | null }
): MoverListCursor => {
  if (sort.startsWith('career')) {
    return {
      sort,
      value: String(mover.career ?? 0),
      id: mover.id,
    };
  }

  return {
    sort,
    value: mover.createdAt.toISOString(),
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
