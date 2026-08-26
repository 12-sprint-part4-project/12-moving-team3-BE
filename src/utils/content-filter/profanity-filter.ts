import {
  BANNED_WORD_MAX_SIMILARITY_CANDIDATES,
  BANNED_WORD_SIMILARITY_TOP_K,
  DEFAULT_BANNED_WORDS,
  DEFAULT_BANNED_WORD_SIMILARITY_THRESHOLD,
} from '../../constants/banned-words';
import env from '../../config/env';
import * as bannedWordRepository from '../../repositories/banned-word.repository';
import type {
  ActiveBannedWord,
  SimilarBannedWord,
} from '../../repositories/banned-word.repository';
import { embed } from '../embeddings.util';
import type { FilterReason, FilterUserTextDeps } from './types';

/** Embedding 유사도 후보 토큰. 완성형 한글·영숫자만 (자모-only ㅋㅋ·ㅎㅎ 등 제외). */
const SIMILARITY_TOKEN_PATTERN = /[가-힣a-zA-Z0-9]{2,12}/g;

/** Exact에서 글자 사이에 허용하는 우회 구분자 (! ~ 포함) */
const PROFANITY_SEPARATOR_CLASS = '[\\s._@#$%^&*()!~\\-]*';

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const uniqueNonEmpty = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
};

/** 단어 글자 사이에 공백·구분자 삽입을 허용하는 Exact 패턴 */
const toFlexibleProfanityPattern = (word: string): RegExp => {
  const chars = [...word].map(escapeRegExp);
  return new RegExp(chars.join(PROFANITY_SEPARATOR_CLASS), 'gi');
};

const fallbackBannedWords = (): ActiveBannedWord[] =>
  DEFAULT_BANNED_WORDS.map((word, index) => ({
    id: -(index + 1),
    word,
    normalizedWord: word,
  }));

const resolveThreshold = (deps?: FilterUserTextDeps): number => {
  if (deps?.similarityThreshold != null) {
    return deps.similarityThreshold;
  }

  const fromEnv = env.bannedWordSimilarityThreshold;
  if (Number.isFinite(fromEnv) && fromEnv > 0 && fromEnv <= 1) {
    return fromEnv;
  }

  return DEFAULT_BANNED_WORD_SIMILARITY_THRESHOLD;
};

/** 금칙어 Exact 매칭. 원문 포함 + 글자 사이 구분자 변형. */
export const containsExactProfanity = (
  text: string,
  words: ActiveBannedWord[]
): boolean => {
  const targets = uniqueNonEmpty(
    words.flatMap((item) => [item.word, item.normalizedWord])
  );

  return targets.some((word) => {
    const pattern = toFlexibleProfanityPattern(word);
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
};

/** 유사도 검사 후보 토큰. 자모-only·한 글자는 패턴에서 제외된다. */
export const collectSimilarityCandidates = (text: string): string[] => {
  const matches = text.match(SIMILARITY_TOKEN_PATTERN) ?? [];
  const unique = uniqueNonEmpty(matches);

  return unique.slice(0, BANNED_WORD_MAX_SIMILARITY_CANDIDATES);
};

/**
 * Embedding 유사도 검색. 임계값 이상 hit 중 최고 점수 하나만 reason으로 반환한다.
 * 매칭 단어는 공개 JSON에 넣지 않는다.
 */
export const findSimilarityProfanity = async (
  text: string,
  deps: FilterUserTextDeps,
  threshold: number
): Promise<FilterReason | null> => {
  const hasKey = deps.hasEmbeddingApiKey ?? Boolean(env.openaiApiKey);
  if (!hasKey) {
    return null;
  }

  const candidates = collectSimilarityCandidates(text);
  if (candidates.length === 0) {
    return null;
  }

  const embedFn = deps.embed ?? embed;
  const searchFn =
    deps.searchSimilarBannedWords ??
    ((queryEmbedding: number[]) =>
      bannedWordRepository.searchSimilarBannedWords({
        queryEmbedding,
        limit: BANNED_WORD_SIMILARITY_TOP_K,
      }));

  let vectors: number[][];
  try {
    vectors = await embedFn(candidates);
  } catch (error) {
    console.error('[content-filter] embedding failed; skip similarity', error);
    return null;
  }

  if (vectors.length !== candidates.length) {
    return null;
  }

  let bestSimilarity: number | null = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const queryEmbedding = vectors[index];
    if (!candidate || !queryEmbedding) {
      continue;
    }

    let hits: SimilarBannedWord[];
    try {
      hits = await searchFn(queryEmbedding);
    } catch (error) {
      console.error(
        '[content-filter] similarity search failed; skip token',
        error
      );
      continue;
    }

    for (const hit of hits) {
      if (!Number.isFinite(hit.similarity) || hit.similarity < threshold) {
        continue;
      }
      if (bestSimilarity == null || hit.similarity > bestSimilarity) {
        bestSimilarity = hit.similarity;
      }
    }
  }

  if (bestSimilarity == null) {
    return null;
  }

  return {
    code: 'PROFANITY',
    method: 'similarity',
    similarity: bestSimilarity,
  };
};

export const loadBannedWordsWithFallback = async (
  deps: FilterUserTextDeps
): Promise<ActiveBannedWord[]> => {
  const findWords =
    deps.findActiveBannedWords ?? bannedWordRepository.findActiveBannedWords;

  try {
    const words = await findWords();
    return words.length > 0 ? words : fallbackBannedWords();
  } catch (error) {
    console.error(
      '[content-filter] banned word lookup failed; use fallback',
      error
    );
    return fallbackBannedWords();
  }
};

export { resolveThreshold };
