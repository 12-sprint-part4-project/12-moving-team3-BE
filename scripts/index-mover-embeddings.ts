import 'dotenv/config';

import { MOVER_EMBED_BATCH_SIZE } from '../src/constants/movers-embedding';
import { prisma } from '../src/lib/prisma';
import {
  findMoverProfilesMissingEmbedding,
  updateMoverProfileEmbedding,
} from '../src/repositories/mover-embedding.repository';
import { embed } from '../src/utils/embeddings.util';
import { buildMoverEmbeddingText } from '../src/utils/mover-embedding-text.util';

/*
 기사 프로필 백터 임베딩 값 백필
*/
const main = async () => {
  const rows = await findMoverProfilesMissingEmbedding();
  if (rows.length === 0) {
    console.log('No mover profiles missing embeddings');
    return;
  }

  let indexed = 0;
  let skipped = 0;

  for (let index = 0; index < rows.length; index += MOVER_EMBED_BATCH_SIZE) {
    const batch = rows.slice(index, index + MOVER_EMBED_BATCH_SIZE);
    const texts: string[] = [];
    const textOwners: Array<{ id: number }> = [];

    for (const row of batch) {
      const text = buildMoverEmbeddingText(row);
      if (!text) {
        skipped += 1;
        continue;
      }
      texts.push(text);
      textOwners.push({ id: row.id });
    }

    if (texts.length === 0) {
      continue;
    }

    const vectors = await embed(texts);
    if (vectors.length !== texts.length) {
      throw new Error('Embedding batch size mismatch');
    }

    for (let offset = 0; offset < textOwners.length; offset += 1) {
      const owner = textOwners[offset];
      const embedding = vectors[offset];
      if (!owner || !embedding) {
        throw new Error('Embedding batch size mismatch');
      }

      await updateMoverProfileEmbedding({
        id: owner.id,
        embedding,
      });
      indexed += 1;
    }

    console.log(
      `Processed ${Math.min(index + MOVER_EMBED_BATCH_SIZE, rows.length)}/${rows.length} (indexed=${indexed}, skippedEmpty=${skipped})`
    );
  }

  console.log(
    `Done. indexed=${indexed}, skippedEmpty=${skipped}, totalMissing=${rows.length}`
  );
};

main()
  .catch((error: unknown) => {
    console.error('Mover profile embedding indexing failed');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
