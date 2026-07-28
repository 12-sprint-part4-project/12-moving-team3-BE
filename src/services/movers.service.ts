import moverProfileRepository, {
  type FindMoversFilters,
  type MoverListSort,
} from '../repositories/moverProfile.repository';
import { AppError } from '../utils/app.error';

// TODO: schemas/movers.schema.ts 등으로 분리하고, route의 validateRequest에서 검증하도록 이전
const REGION_VALUES = [
  'SEOUL',
  'GYEONGGI',
  'INCHEON',
  'GANGWON',
  'CHUNGBUK',
  'CHUNGNAM',
  'SEJONG',
  'DAEJEON',
  'JEONBUK',
  'GWANGJU_JEONNAM',
  'GYEONGBUK',
  'DAEGU',
  'ULSAN',
  'GYEONGNAM',
  'BUSAN',
  'JEJU',
] as const;

const MOVE_TYPE_VALUES = ['SMALL', 'HOME', 'OFFICE'] as const;
const SORT_FIELDS = ['career', 'createdAt'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;

type SortField = (typeof SORT_FIELDS)[number];
type SortOrder = (typeof SORT_ORDERS)[number];

const toStringArray = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  return [String(value)];
};

const parseEnumArray = (
  value: unknown,
  validValues: readonly string[],
  errorCode: 'INVALID_REGION' | 'INVALID_SERVICE_TYPE'
): string[] | undefined => {
  const items = toStringArray(value);
  if (!items) {
    return undefined;
  }

  const invalid = items.some((item) => !validValues.includes(item));

  if (invalid) {
    throw new AppError(errorCode);
  }

  return items;
};

const parseSort = (
  sort?: unknown,
  order?: unknown
): MoverListSort | undefined => {
  if (sort === undefined || sort === null || sort === '') {
    return undefined;
  }

  const sortField = String(sort) as SortField;
  if (!SORT_FIELDS.includes(sortField)) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  const sortOrder =
    order === undefined || order === null || order === ''
      ? sortField === 'career'
        ? 'asc'
        : 'desc'
      : (String(order) as SortOrder);

  if (!SORT_ORDERS.includes(sortOrder)) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return `${sortField}_${sortOrder}` as MoverListSort;
};

const parsePositiveInt = (value: unknown, fallback: number): number => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return parsed;
};

const buildMoverListFilters = (
  queryParams: Record<string, unknown>
): FindMoversFilters => {
  const { keyword, sort, order, region, moveType, page, limit } = queryParams;

  const filters: FindMoversFilters = {
    sort: parseSort(sort, order),
    regions: parseEnumArray(region, REGION_VALUES, 'INVALID_REGION') as
      FindMoversFilters['regions'] | undefined,
    moveTypes: parseEnumArray(
      moveType,
      MOVE_TYPE_VALUES,
      'INVALID_SERVICE_TYPE'
    ) as FindMoversFilters['moveTypes'] | undefined,
    page: parsePositiveInt(page, 1),
    limit: Math.min(parsePositiveInt(limit, 20), 100),
  };

  if (keyword !== undefined && keyword !== null && String(keyword).trim()) {
    filters.keyword = String(keyword).trim();
  }

  return filters;
};

const moversService = {
  // TODO: query 파싱이 zod로 옮겨지면 FindMoversFilters를 바로 받도록 시그니처 변경
  getMovers: async (queryParams: Record<string, unknown>) => {
    const filters = buildMoverListFilters(queryParams);
    return moverProfileRepository.findMovers(filters);
  },

  getMoverDetail: async (id: string) => {
    const moverId = Number(id);

    if (!Number.isInteger(moverId) || moverId < 1) {
      throw new AppError('INVALID_QUERY_PARAM');
    }

    const moverDetail =
      await moverProfileRepository.findMoverProfileById(moverId);

    if (!moverDetail) {
      throw new AppError('MOVER_NOT_FOUND');
    }

    // TODO: 상세 응답에 리뷰/평점/찜 수 등 추가 필드가 명세에 있으면 repository include·매핑 보강
    return moverDetail;
  },
};

export default moversService;
