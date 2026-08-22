import * as moverEmbeddingRepository from '../repositories/mover-embedding.repository';
import { embed } from '../utils/embeddings.util';
import { buildMoverEmbeddingText } from '../utils/mover-embedding-text.util';

/**
 * 기사 프로필 임베딩을 다시 계산해 저장한다.
 * OpenAI 실패·키 없음 등은 throw하지 않고 로그만 남긴다 (프로필 저장과 분리).
 */
export const reindexMoverProfileEmbedding = async (
  userId: string
): Promise<void> => {
  try {
    const source =
      await moverEmbeddingRepository.findMoverProfileEmbeddingSourceByUserId(
        userId
      );

    if (!source) {
      return;
    }

    const text = buildMoverEmbeddingText(source);
    if (!text) {
      await moverEmbeddingRepository.clearMoverProfileEmbedding(source.id);
      return;
    }

    const [embedding] = await embed(text);
    if (!embedding) {
      console.error(
        '[mover-embedding] empty embedding response',
        JSON.stringify({ userId, profileId: source.id })
      );
      return;
    }

    await moverEmbeddingRepository.updateMoverProfileEmbedding({
      id: source.id,
      embedding,
    });
  } catch (error) {
    console.error(
      '[mover-embedding] reindex failed',
      error instanceof Error ? error.message : error
    );
  }
};
