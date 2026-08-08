import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createHistory } from '../repositories/history.repository';

/**
 * History 생성에 필요한 필드.
 * schema History 모델의 nullable 계약(userId/adminUserId/beforeData/afterData)을 그대로 따른다.
 * id·createdAt·관계는 DB/Prisma가 담당하므로 포함하지 않는다.
 */
export type CreateHistoryInput = Pick<
  Prisma.HistoryUncheckedCreateInput,
  | 'userId'
  | 'adminUserId'
  | 'tableName'
  | 'tableRowId'
  | 'operationType'
  | 'beforeData'
  | 'afterData'
>;

/**
 * withHistory 콜백 반환값.
 * before/after 스냅샷은 도메인 변경 결과에 의존하므로,
 * History 페이로드를 콜백 안에서 함께 구성한다.
 */
export type WithHistoryResult<T> = {
  result: T;
  history: CreateHistoryInput;
};

/**
 * 도메인 변경과 History 저장을 하나의 Prisma interactive transaction으로 묶는다.
 *
 * 흐름:
 * 1) transaction 시작
 * 2) 동일 tx를 콜백에 전달해 도메인 변경 수행
 * 3) 성공 시에만 같은 tx로 History 생성
 * 4) 콜백 또는 History 생성 실패 시 전체 rollback
 * 5) 콜백의 result를 호출부에 반환
 *
 * 전역 prisma로 도메인 변경을 실행하지 않는다.
 * 호출부가 반드시 전달받은 tx로 Repository를 호출해야 원자성이 보장된다.
 */
export const withHistory = async <T>(
  work: (tx: Prisma.TransactionClient) => Promise<WithHistoryResult<T>>
): Promise<T> => {
  return prisma.$transaction(async (tx) => {
    const { result, history } = await work(tx);

    // History도 동일 tx — 도메인만 commit되거나 History만 남는 부분 성공을 막는다.
    await createHistory(history, tx);

    return result;
  });
};
