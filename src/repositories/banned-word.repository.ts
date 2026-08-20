import { prisma } from '../lib/prisma';
import { BANNED_WORD_SIMILARITY_TOP_K } from '../constants/banned-words';

export interface ActiveBannedWord {
  id: number;
  word: string;
  normalizedWord: string | null;
}

export interface SimilarBannedWord {
  id: number;
  word: string;
  similarity: number;
}

export interface SearchSimilarBannedWordsParams {
  queryEmbedding: number[];
  limit?: number;
}

export interface UpdateBannedWordEmbeddingParams {
  id: number;
  embedding: number[];
}

export interface UpsertBannedWordParams {
  word: string;
  normalizedWord: string;
  category: string;
}

interface SimilarBannedWordRow {
  id: number;
  word: string;
  similarity: unknown;
}

/** 숫자 배열을 pgvector 리터럴로 만든다. 유한 숫자가 아니면 거부한다. */
export const toVectorLiteral = (embedding: number[]): string => {
  if (
    embedding.length === 0 ||
    embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Invalid embedding vector');
  }

  return `[${embedding.join(',')}]`;
};

/** 활성 금칙어 목록. embedding은 Unsupported 타입이라 조회하지 않는다. */
export const findActiveBannedWords = async (): Promise<ActiveBannedWord[]> => {
  return prisma.bannedWord.findMany({
    where: { isActive: true },
    select: {
      id: true,
      word: true,
      normalizedWord: true,
    },
    orderBy: { id: 'asc' },
  });
};

/** embedding이 아직 없는 활성 금칙어. 인덱싱 스크립트용. */
export const findBannedWordsMissingEmbedding = async (): Promise<
  Array<{ id: number; word: string }>
> => {
  return prisma.$queryRaw<Array<{ id: number; word: string }>>`
    SELECT id, word
    FROM banned_words
    WHERE embedding IS NULL AND is_active = true
    ORDER BY id
  `;
};

/** 금칙어 행의 embedding을 raw SQL로 저장한다. */
export const updateBannedWordEmbedding = async (
  params: UpdateBannedWordEmbeddingParams
): Promise<void> => {
  const vectorLiteral = toVectorLiteral(params.embedding);

  await prisma.$executeRawUnsafe(
    `UPDATE banned_words
     SET embedding = $1::vector,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    vectorLiteral,
    params.id
  );
};

/**
 * 질문 벡터와 코사인 거리가 가까운 활성 금칙어를 반환한다.
 * similarity는 1 - 거리 (1에 가까울수록 유사).
 */
export const searchSimilarBannedWords = async (
  params: SearchSimilarBannedWordsParams
): Promise<SimilarBannedWord[]> => {
  const limit = params.limit ?? BANNED_WORD_SIMILARITY_TOP_K;
  const vectorLiteral = toVectorLiteral(params.queryEmbedding);

  const rows = await prisma.$queryRawUnsafe<SimilarBannedWordRow[]>(
    `SELECT
       id,
       word,
       1 - (embedding <=> $1::vector) AS similarity
     FROM banned_words
     WHERE embedding IS NOT NULL
       AND is_active = true
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vectorLiteral,
    limit
  );

  return rows.map((row) => ({
    id: row.id,
    word: row.word,
    similarity: Number(row.similarity),
  }));
};

/** 시드용 upsert. embedding은 건드리지 않는다. */
export const upsertBannedWord = async (
  params: UpsertBannedWordParams
): Promise<void> => {
  await prisma.bannedWord.upsert({
    where: { word: params.word },
    create: {
      word: params.word,
      normalizedWord: params.normalizedWord,
      category: params.category,
      isActive: true,
    },
    update: {
      normalizedWord: params.normalizedWord,
      category: params.category,
      isActive: true,
    },
  });
};
