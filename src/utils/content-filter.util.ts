import {
  BANNED_WORD_MAX_SIMILARITY_CANDIDATES,
  BANNED_WORD_SIMILARITY_TOP_K,
  DEFAULT_BANNED_WORDS,
  DEFAULT_BANNED_WORD_SIMILARITY_THRESHOLD,
} from '../constants/banned-words';
import env from '../config/env';
import * as bannedWordRepository from '../repositories/banned-word.repository';
import type {
  ActiveBannedWord,
  SimilarBannedWord,
} from '../repositories/banned-word.repository';
import { embed } from './embeddings.util';

/** 마스킹에 사용하는 대체 문자 */
export const CONTENT_FILTER_MASK = '***';

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

const applyPatterns = (text: string, patterns: RegExp[]): string => {
  let result = text;

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, CONTENT_FILTER_MASK);
  }

  return result;
};

/** 단어 글자 사이에 공백·구분자 삽입을 허용하는 Exact 패턴 */
const toFlexibleProfanityPattern = (word: string): RegExp => {
  const chars = [...word].map(escapeRegExp);
  return new RegExp(chars.join('[\\s._\\-*@#$%^&()]*'), 'g');
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

/**
 * 금칙어 Exact 치환. 원문 포함 + 글자 사이 구분자 변형을 마스킹한다.
 */
export const applyExactProfanity = (
  text: string,
  words: ActiveBannedWord[]
): string => {
  const targets = uniqueNonEmpty(
    words.flatMap((item) => [item.word, item.normalizedWord])
  );

  let result = text;

  for (const word of targets) {
    result = result.replace(
      toFlexibleProfanityPattern(word),
      CONTENT_FILTER_MASK
    );
  }

  return result;
};

/** 유사도 검사 후보 토큰. MASK·숫자·과한 길이는 제외한다. */
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

const applySimilarityProfanity = async (
  text: string,
  deps: FilterUserTextDeps,
  threshold: number
): Promise<string> => {
  const hasKey = deps.hasEmbeddingApiKey ?? Boolean(env.openaiApiKey);
  if (!hasKey) {
    return text;
  }

  const candidates = collectSimilarityCandidates(text);
  if (candidates.length === 0) {
    return text;
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
    return text;
  }

  if (vectors.length !== candidates.length) {
    return text;
  }

  let result = text;

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
    if (!shouldMask) {
      continue;
    }

    result = result.split(candidate).join(CONTENT_FILTER_MASK);
  }

  return result;
};

/**
 * 사용자 입력 텍스트 클린 필터.
 * 전화/계좌는 정규식, 욕설은 Exact 후 Embedding 유사도(threshold). LLM은 호출하지 않는다.
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
  let maskedContent = content;

  if (maskPhone) {
    maskedContent = applyPatterns(maskedContent, PHONE_PATTERNS);
  }

  if (maskAccount) {
    maskedContent = applyPatterns(maskedContent, ACCOUNT_CARD_PATTERNS);
  }

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

    maskedContent = applyExactProfanity(maskedContent, words);
    maskedContent = await applySimilarityProfanity(
      maskedContent,
      deps,
      resolveThreshold(deps)
    );
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
