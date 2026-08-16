import {
  BANNED_WORD_MAX_SIMILARITY_CANDIDATES,
  BANNED_WORD_SIMILARITY_TOP_K,
  DEFAULT_BANNED_WORDS,
  DEFAULT_BANNED_WORD_SIMILARITY_THRESHOLD,
  PERSONAL_INFO_FILTER_MESSAGE,
  PROFANITY_FILTER_MESSAGE,
} from '../constants/banned-words';
import env from '../config/env';
import * as bannedWordRepository from '../repositories/banned-word.repository';
import type {
  ActiveBannedWord,
  SimilarBannedWord,
} from '../repositories/banned-word.repository';
import { embed } from './embeddings.util';

/** 휴대폰·유선 + 구분자 있는 전화 형태(111-1111-1111 등) */
const PHONE_PATTERNS: RegExp[] = [
  /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,
  /0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g,
  /\d{2,4}[-\s]\d{3,5}[-\s]\d{4}/g,
];

/** 카드번호(4-4-4-4) · 계좌번호로 보이는 연속 숫자 패턴 */
const ACCOUNT_CARD_PATTERNS: RegExp[] = [
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  /\b\d{10,14}\b/g,
];

const SIMILARITY_TOKEN_PATTERN = /[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z]{2,12}/g;

/** Exact에서 글자 사이에 허용하는 우회 구분자 (! ~ 포함) */
const PROFANITY_SEPARATOR_CLASS = '[\\s._@#$%^&*()!~\\-]*';

export interface FilterUserTextResult {
  maskedContent: string;
  isFiltered: boolean;
  rawContent: string;
}

export type FilterChatContentResult = FilterUserTextResult;

export interface FilterUserTextOptions {
  maskPhone?: boolean;
  maskAccount?: boolean;
  maskProfanity?: boolean;
}

export interface FilterUserTextDeps {
  findActiveBannedWords?: () => Promise<ActiveBannedWord[]>;
  searchSimilarBannedWords?: (
    queryEmbedding: number[]
  ) => Promise<SimilarBannedWord[]>;
  embed?: (texts: string | string[]) => Promise<number[][]>;
  similarityThreshold?: number;
  hasEmbeddingApiKey?: boolean;
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const matchesAnyPattern = (text: string, patterns: RegExp[]): boolean =>
  patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });

/** 단어 글자 사이에 공백·구분자 삽입을 허용하는 Exact 패턴 */
const toFlexibleProfanityPattern = (word: string): RegExp => {
  const chars = [...word].map(escapeRegExp);
  return new RegExp(chars.join(PROFANITY_SEPARATOR_CLASS), 'gi');
};

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

/** 유사도 검사 후보 토큰. 숫자·한 글자는 제외한다. */
export const collectSimilarityCandidates = (text: string): string[] => {
  const matches = text.match(SIMILARITY_TOKEN_PATTERN) ?? [];
  const unique = uniqueNonEmpty(matches);

  return unique.slice(0, BANNED_WORD_MAX_SIMILARITY_CANDIDATES);
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

const hasSimilarityProfanity = async (
  text: string,
  deps: FilterUserTextDeps,
  threshold: number
): Promise<boolean> => {
  const hasKey = deps.hasEmbeddingApiKey ?? Boolean(env.openaiApiKey);
  if (!hasKey) {
    return false;
  }

  const candidates = collectSimilarityCandidates(text);
  if (candidates.length === 0) {
    return false;
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
    return false;
  }

  if (vectors.length !== candidates.length) {
    return false;
  }

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

    const shouldMask = hits.some(
      (hit) => Number.isFinite(hit.similarity) && hit.similarity >= threshold
    );
    if (shouldMask) {
      return true;
    }
  }

  return false;
};

/**
 * 사용자 입력 텍스트 클린 필터.
 * 전화/계좌는 정규식, 욕설은 Exact 후 Embedding 유사도. LLM은 호출하지 않는다.
 * 감지 시 메시지 전체를 유형별 안내 문구로 바꾼다. 욕설이 있으면 욕설 문구를 우선한다.
 */
export const filterUserText = async (
  content: string,
  options: FilterUserTextOptions = {},
  deps: FilterUserTextDeps = {}
): Promise<FilterUserTextResult> => {
  const maskPhone = options.maskPhone ?? true;
  const maskAccount = options.maskAccount ?? true;
  const maskProfanity = options.maskProfanity ?? true;

  const rawContent = content;

  const hasPersonalInfo =
    (maskPhone && matchesAnyPattern(content, PHONE_PATTERNS)) ||
    (maskAccount && matchesAnyPattern(content, ACCOUNT_CARD_PATTERNS));

  let hasProfanity = false;

  if (maskProfanity) {
    const findWords =
      deps.findActiveBannedWords ?? bannedWordRepository.findActiveBannedWords;

    let words: ActiveBannedWord[];
    try {
      words = await findWords();
    } catch (error) {
      console.error(
        '[content-filter] banned word lookup failed; use fallback',
        error
      );
      words = fallbackBannedWords();
    }

    if (words.length === 0) {
      words = fallbackBannedWords();
    }

    hasProfanity = containsExactProfanity(content, words);
    if (!hasProfanity) {
      hasProfanity = await hasSimilarityProfanity(
        content,
        deps,
        resolveThreshold(deps)
      );
    }
  }

  let maskedContent = content;
  if (hasProfanity) {
    maskedContent = PROFANITY_FILTER_MESSAGE;
  } else if (hasPersonalInfo) {
    maskedContent = PERSONAL_INFO_FILTER_MESSAGE;
  }

  return {
    rawContent,
    maskedContent,
    isFiltered: maskedContent !== rawContent,
  };
};

/**
 * 채팅 텍스트 필터. 전화·계좌·욕설을 모두 적용한다.
 * 주소는 필터하지 않는다. 원문은 rawContent로 반환한다.
 */
export const filterChatContent = async (
  content: string
): Promise<FilterChatContentResult> =>
  filterUserText(content, {
    maskPhone: true,
    maskAccount: true,
    maskProfanity: true,
  });
