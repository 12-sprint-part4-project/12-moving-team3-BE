import 'dotenv/config';

import {
  BANNED_WORD_CATEGORY_PROFANITY,
  DEFAULT_BANNED_WORDS,
} from '../src/constants/banned-words';
import { prisma } from '../src/lib/prisma';
import { upsertBannedWord } from '../src/repositories/banned-word.repository';
import { normalizeBannedText } from '../src/utils/text-normalize.util';

const main = async () => {
  for (const word of DEFAULT_BANNED_WORDS) {
    await upsertBannedWord({
      word,
      normalizedWord: normalizeBannedText(word),
      category: BANNED_WORD_CATEGORY_PROFANITY,
    });
  }

  console.log(`Banned words seeded: ${DEFAULT_BANNED_WORDS.length}`);
};

main()
  .catch((error: unknown) => {
    console.error('Banned word seed failed');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
