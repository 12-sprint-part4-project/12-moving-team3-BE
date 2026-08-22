/**
 * 숫자 배열을 pgvector 리터럴로 만든다.
 * 금칙어·기사 임베딩 등 raw SQL (`$1::vector`)에 공통으로 쓴다.
 */
export const toVectorLiteral = (embedding: number[]): string => {
  if (
    embedding.length === 0 ||
    embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Invalid embedding vector');
  }

  return `[${embedding.join(',')}]`;
};
