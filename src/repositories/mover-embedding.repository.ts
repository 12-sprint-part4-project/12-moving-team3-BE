import { prisma } from '../lib/prisma';
import { toVectorLiteral } from '../utils/vector.util';

export interface MoverProfileMissingEmbedding {
  id: number;
  name: string;
  shortDescription: string | null;
  description: string | null;
}

export interface UpdateMoverProfileEmbeddingParams {
  id: number;
  embedding: number[];
}

export interface MoverProfileEmbeddingSource {
  id: number;
  name: string;
  shortDescription: string | null;
  description: string | null;
}

/** embedding이 아직 없는 기사 프로필. 인덱싱 스크립트용. */
export const findMoverProfilesMissingEmbedding = async (): Promise<
  MoverProfileMissingEmbedding[]
> => {
  return prisma.$queryRaw<MoverProfileMissingEmbedding[]>`
    SELECT
      mp.id,
      u.name,
      mp.short_description AS "shortDescription",
      mp.description
    FROM mover_profiles mp
    INNER JOIN users u ON u.id = mp.user_id
    WHERE mp.embedding IS NULL
      AND u.deleted_at IS NULL
      AND u.user_type = 'MOVER'
    ORDER BY mp.id
  `;
};

/** userId로 임베딩 문서 소스 조회. */
export const findMoverProfileEmbeddingSourceByUserId = async (
  userId: string
): Promise<MoverProfileEmbeddingSource | null> => {
  const rows = await prisma.$queryRaw<MoverProfileEmbeddingSource[]>`
    SELECT
      mp.id,
      u.name,
      mp.short_description AS "shortDescription",
      mp.description
    FROM mover_profiles mp
    INNER JOIN users u ON u.id = mp.user_id
    WHERE mp.user_id = ${userId}::uuid
    LIMIT 1
  `;

  return rows[0] ?? null;
};

/** 기사 프로필 embedding을 raw SQL로 저장한다. */
export const updateMoverProfileEmbedding = async (
  params: UpdateMoverProfileEmbeddingParams
): Promise<void> => {
  const vectorLiteral = toVectorLiteral(params.embedding);

  await prisma.$executeRawUnsafe(
    `UPDATE mover_profiles
     SET embedding = $1::vector,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    vectorLiteral,
    params.id
  );
};

/** embedding을 NULL로 비운다 (문서가 비었을 때). */
export const clearMoverProfileEmbedding = async (id: number): Promise<void> => {
  await prisma.$executeRawUnsafe(
    `UPDATE mover_profiles
     SET embedding = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    id
  );
};
