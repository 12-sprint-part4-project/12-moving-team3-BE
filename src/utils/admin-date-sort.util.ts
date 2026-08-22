import { Prisma } from '@prisma/client';
import { findEstimateRequestFirst } from '../repositories/admin-estimate-request.repository';
import type { SortDirection } from '../schemas/admin-list-query.schema';

export type DateSortField = 'submittedAt' | 'moveDate';

const dateWhere = (
  dateField: DateSortField,
  filter: Prisma.DateTimeNullableFilter | Date | null
): Prisma.EstimateRequestWhereInput =>
  dateField === 'submittedAt'
    ? { submittedAt: filter }
    : { moveDate: filter };

const dateOrderBy = (
  dateField: DateSortField,
  dateOrder: Prisma.SortOrderInput,
  idOrder: Prisma.SortOrder
): Prisma.EstimateRequestOrderByWithRelationInput[] =>
  dateField === 'submittedAt'
    ? [{ submittedAt: dateOrder }, { id: idOrder }]
    : [{ moveDate: dateOrder }, { id: idOrder }];

/**
 * 목록·인접 조회 공통 정렬.
 * ASC는 날짜 오름차순·null last, DESC는 날짜 내림차순·null first.
 * 같은 날짜(또는 둘 다 null)는 id desc로 보조 정렬한다.
 */
export const createDateSortOrderBy = (
  dateField: DateSortField,
  sort: SortDirection
): Prisma.EstimateRequestOrderByWithRelationInput[] =>
  sort === 'ASC'
    ? dateOrderBy(dateField, { sort: 'asc', nulls: 'last' }, 'desc')
    : dateOrderBy(dateField, { sort: 'desc', nulls: 'first' }, 'desc');

export const createDateNeighborQuery = (
  dateField: DateSortField,
  current: { id: number; date: Date | null },
  sort: SortDirection
): {
  prevWhere: Prisma.EstimateRequestWhereInput;
  nextWhere: Prisma.EstimateRequestWhereInput;
  prevOrderBy: Prisma.EstimateRequestOrderByWithRelationInput[];
  nextOrderBy: Prisma.EstimateRequestOrderByWithRelationInput[];
} => {
  const isAsc = sort === 'ASC';
  const { id: currentId, date: currentDate } = current;

  // prev는 목록 정렬의 역순에서 첫 건을 고른다.
  const prevOrderBy = isAsc
    ? dateOrderBy(dateField, { sort: 'desc', nulls: 'first' }, 'asc')
    : dateOrderBy(dateField, { sort: 'asc', nulls: 'last' }, 'asc');
  const nextOrderBy = createDateSortOrderBy(dateField, sort);

  if (currentDate == null) {
    if (isAsc) {
      return {
        prevWhere: {
          OR: [
            dateWhere(dateField, { not: null }),
            { ...dateWhere(dateField, null), id: { gt: currentId } },
          ],
        },
        nextWhere: { ...dateWhere(dateField, null), id: { lt: currentId } },
        prevOrderBy,
        nextOrderBy,
      };
    }

    return {
      prevWhere: { ...dateWhere(dateField, null), id: { gt: currentId } },
      nextWhere: {
        OR: [
          { ...dateWhere(dateField, null), id: { lt: currentId } },
          dateWhere(dateField, { not: null }),
        ],
      },
      prevOrderBy,
      nextOrderBy,
    };
  }

  if (isAsc) {
    return {
      prevWhere: {
        OR: [
          dateWhere(dateField, { lt: currentDate }),
          { ...dateWhere(dateField, currentDate), id: { gt: currentId } },
        ],
      },
      nextWhere: {
        OR: [
          dateWhere(dateField, { gt: currentDate }),
          { ...dateWhere(dateField, currentDate), id: { lt: currentId } },
          dateWhere(dateField, null),
        ],
      },
      prevOrderBy,
      nextOrderBy,
    };
  }

  return {
    prevWhere: {
      OR: [
        dateWhere(dateField, null),
        dateWhere(dateField, { gt: currentDate }),
        { ...dateWhere(dateField, currentDate), id: { gt: currentId } },
      ],
    },
    nextWhere: {
      OR: [
        dateWhere(dateField, { lt: currentDate }),
        { ...dateWhere(dateField, currentDate), id: { lt: currentId } },
      ],
    },
    prevOrderBy,
    nextOrderBy,
  };
};

export const findNeighborIds = async (
  dateField: DateSortField,
  listWhere: Prisma.EstimateRequestWhereInput,
  current: { id: number; date: Date | null },
  sort: SortDirection
): Promise<{ prevId: number | null; nextId: number | null }> => {
  const inFilter = await findEstimateRequestFirst(
    { AND: [listWhere, { id: current.id }] },
    [{ id: 'desc' }]
  );

  if (inFilter == null) {
    return { prevId: null, nextId: null };
  }

  const { prevWhere, nextWhere, prevOrderBy, nextOrderBy } =
    createDateNeighborQuery(dateField, current, sort);

  const [prev, next] = await Promise.all([
    findEstimateRequestFirst({ AND: [listWhere, prevWhere] }, prevOrderBy),
    findEstimateRequestFirst({ AND: [listWhere, nextWhere] }, nextOrderBy),
  ]);

  return {
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
};
