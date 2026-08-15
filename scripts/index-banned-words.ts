import 'dotenv/config';

import { BANNED_WORD_EMBED_BATCH_SIZE } from '../src/constants/banned-words';
import { prisma } from '../src/lib/prisma';
import {
  findBannedWordsMissingEmbedding,
  updateBannedWordEmbedding,
} from '../src/repositories/banned-word.repository';
import { embed } from '../src/utils/embeddings.util';

const main = async () => {
  const rows = await findBannedWordsMissingEmbedding();
  if (rows.length === 0) {
    console.log('No banned words missing embeddings');
    return;
  }

  for (
    let index = 0;
    index < rows.length;
    index += BANNED_WORD_EMBED_BATCH_SIZE
  ) {
    const batch = rows.slice(index, index + BANNED_WORD_EMBED_BATCH_SIZE);
    const vectors = await embed(batch.map((row) => row.word));

    for (let offset = 0; offset < batch.length; offset += 1) {
      const row = batch[offset];
      const embedding = vectors[offset];
      if (!row || !embedding) {
        throw new Error('Embedding batch size mismatch');
      }

      await updateBannedWordEmbedding({
        id: row.id,
        embedding,
      });
    }

    console.log(
      `Indexed ${Math.min(index + BANNED_WORD_EMBED_BATCH_SIZE, rows.length)}/${rows.length}`
    );
  }
};

main()
  .catch((error: unknown) => {
    console.error('Banned word indexing failed');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
