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
  /\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g,
  /\d{2,4}[-\s]\d{3,5}[-\s]\d{4}/g,
];

/** 계좌번호: 연속 숫자 · 하이픈 구분 (카드 4-4-4-4는 필터하지 않음) */
const ACCOUNT_PATTERNS: RegExp[] = [
  /\b\d{10,14}\b/g,
  /\b[1-9]\d{1,3}[-\s]\d{2,4}[-\s]\d{5,8}\b/g,
];

/** 카드 형식(4-4-4-4, 구분자 필수) — 필터 대상은 아니며, 전화 패턴 오탐 제외용 */
const CARD_LIKE_EXCLUSION_PATTERNS: RegExp[] = [
  /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/g,
];

/** Embedding 유사도 후보 토큰. 완성형 한글·영숫자만 (자모-only ㅋㅋ·ㅎㅎ 등 제외). */
const SIMILARITY_TOKEN_PATTERN = /[가-힣a-zA-Z0-9]{2,12}/g;

/** Exact에서 글자 사이에 허용하는 우회 구분자 (! ~ 포함) */
const PROFANITY_SEPARATOR_CLASS = '[\\s._@#$%^&*()!~\\-]*';

export type FilterAction = 'allow' | 'mask' | 'block';

export type FilterReasonCode =
  | 'PROFANITY'
  | 'PERSONAL_INFO_PHONE'
  | 'PERSONAL_INFO_ACCOUNT';

export type FilterMethod = 'exact' | 'similarity' | 'regex' | 'normalized';

/** 공개 결정 근거. 매칭 단어·원문 번호는 넣지 않는다. */
export interface FilterReason {
  code: FilterReasonCode;
  method: FilterMethod;
  similarity?: number;
}

/** 필터 판정. LLM이 만들지 않고 코드가 결정한다. */
export interface FilterDecision {
  action: FilterAction;
  reasons: FilterReason[];
}

export interface FilterUserTextResult {
  maskedContent: string;
  isFiltered: boolean;
  rawContent: string;
  decision: FilterDecision;
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

interface TextRange {
  start: number;
  end: number;
}

interface FilterHit extends FilterReason {
  range?: TextRange;
}

/** 정규식 매칭 구간. lastIndex를 패턴마다 새로 둔다. */
const collectMatchRanges = (text: string, patterns: RegExp[]): TextRange[] => {
  const ranges: TextRange[] = [];

  for (const pattern of patterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    let match = globalPattern.exec(text);

    while (match) {
      if (match[0].length === 0) {
        globalPattern.lastIndex += 1;
        match = globalPattern.exec(text);
        continue;
      }

      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
      match = globalPattern.exec(text);
    }
  }

  return ranges;
};

const rangesOverlap = (left: TextRange, right: TextRange): boolean =>
  left.start < right.end && right.start < left.end;

const compareRanges = (left: TextRange, right: TextRange): number =>
  left.start - right.start || left.end - right.end;

const dedupeRanges = (ranges: TextRange[]): TextRange[] => {
  const sorted = [...ranges].sort(compareRanges);
  const result: TextRange[] = [];

  for (const range of sorted) {
    const last = result[result.length - 1];
    if (last && last.start === range.start && last.end === range.end) {
      continue;
    }
    result.push(range);
  }

  return result;
};

/** 겹치거나 이어지는 구간을 하나로 합친다. 전화 패턴 중복 매칭 방지. */
const mergeOverlappingRanges = (ranges: TextRange[]): TextRange[] => {
  const sorted = dedupeRanges(ranges);
  if (sorted.length === 0) {
    return [];
  }

  const merged: TextRange[] = [{ ...sorted[0] }];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
};

/** 숫자 뽑아내기 */
const extractDigits = (text: string, range: TextRange): string =>
  text.slice(range.start, range.end).replace(/\D/g, '');

/** 휴대폰 번호 판별 */
const isMobilePhoneRange = (text: string, range: TextRange): boolean => {
  const digits = extractDigits(text, range);
  return /^01[016789]\d{7,8}$/.test(digits);
};

const isValidAccountRange = (
  text: string,
  range: TextRange,
  cardLikeRanges: TextRange[]
): boolean => {
  const digits = extractDigits(text, range);
  if (digits.length < 10 || digits.length > 14) {
    return false;
  }

  return !cardLikeRanges.some((cardLike) => rangesOverlap(range, cardLike));
};

/**
 * 전화·계좌 구간 충돌 해소.
 * - 010 휴대폰은 계좌 패턴(연속·하이픈)보다 우선
 * - 그 외 겹치면 계좌 우선 (전화 3번 패턴 오탐 방지)
 */
const resolvePhoneAndAccountRanges = (
  text: string,
  phoneRanges: TextRange[],
  accountRanges: TextRange[]
): { phoneRanges: TextRange[]; accountRanges: TextRange[] } => {
  const mergedPhone = mergeOverlappingRanges(phoneRanges);
  const mergedAccount = mergeOverlappingRanges(accountRanges);

  const priorityPhones = mergedPhone.filter(
    (phone) =>
      isMobilePhoneRange(text, phone) ||
      extractDigits(text, phone).startsWith('0')
  );

  const accounts = mergedAccount.filter(
    (account) =>
      !priorityPhones.some((phone) => rangesOverlap(phone, account))
  );

  const phones = mergedPhone.filter(
    (phone) => !accounts.some((account) => rangesOverlap(phone, account))
  );

  return {
    phoneRanges: mergeOverlappingRanges(phones),
    accountRanges: mergeOverlappingRanges(accounts),
  };
};

const NON_CONTENT_PATTERN = /^[\s.,!?()[\]{}"'`~:;<>/@#$%^&*+=_|\\-]*$/;

/** 독립적인 구간 판별. 문장 안 번호는 mask */
const isStandaloneRanges = (text: string, ranges: TextRange[]): boolean => {
  if (ranges.length === 0) {
    return false;
  }

  let cursor = 0;
  let remainder = '';

  for (const range of dedupeRanges(ranges)) {
    remainder += text.slice(cursor, range.start);
    cursor = range.end;
  }
  remainder += text.slice(cursor);

  return NON_CONTENT_PATTERN.test(remainder);
};

const replaceRanges = (
  text: string,
  replacements: Array<TextRange & { replacement: string }>
): string => {
  if (replacements.length === 0) {
    return text;
  }

  const sorted = [...replacements].sort(compareRanges);
  let cursor = 0;
  let result = '';

  for (const item of sorted) {
    result += text.slice(cursor, item.start);
    result += item.replacement;
    cursor = item.end;
  }

  result += text.slice(cursor);
  return result;
};

const KOREAN_DIGIT_MAP: Record<string, string> = {
  공: '0',
  영: '0',
  일: '1',
  이: '2',
  삼: '3',
  사: '4',
  오: '5',
  육: '6',
  륙: '6',
  칠: '7',
  팔: '8',
  구: '9',
};

const createPhoneCandidatePattern = (): RegExp =>
  /[공영일이삼사오육륙칠팔구0-9\s-]{10,}/g;

const NORMALIZED_MOBILE_PATTERN = /01[016789]\d{7,8}/;

const normalizePhoneCandidate = (value: string): string =>
  [...value]
    .map((char) => KOREAN_DIGIT_MAP[char] ?? (/\d/.test(char) ? char : ''))
    .join('');

const collectNormalizedPhoneRanges = (text: string): TextRange[] => {
  const ranges: TextRange[] = [];
  const pattern = createPhoneCandidatePattern();
  let match = pattern.exec(text);

  while (match) {
    const value = match[0];
    const normalized = normalizePhoneCandidate(value);
    const hasKoreanDigits = /[공영일이삼사오육륙칠팔구]/.test(value);

    if (hasKoreanDigits && NORMALIZED_MOBILE_PATTERN.test(normalized)) {
      ranges.push({
        start: match.index,
        end: match.index + value.length,
      });
    }

    match = pattern.exec(text);
  }

  return dedupeRanges(ranges);
};

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

const toUniqueReasons = (hits: FilterHit[]): FilterReason[] => {
  const result: FilterReason[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const reason: FilterReason = {
      code: hit.code,
      method: hit.method,
      ...(hit.similarity != null && { similarity: hit.similarity }),
    };
    const key = JSON.stringify(reason);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(reason);
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

/** 유사도 검사 후보 토큰. 자모-only·한 글자는 패턴에서 제외된다. */
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

/**
 * Embedding 유사도 검색. 임계값 이상 hit 중 최고 점수 하나만 reason으로 반환한다.
 * 매칭 단어는 공개 JSON에 넣지 않는다.
 */
const findSimilarityProfanity = async (
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

/**
 * reasons와 구간을 바탕으로 action을 고른다. block > mask > allow.
 * 욕설·한글 우회 전화·번호만 있는 메시지는 block, 문장 안 번호는 mask.
 */
export const decideFilterAction = (
  hits: FilterHit[],
  content: string
): FilterAction => {
  if (hits.length === 0) {
    return 'allow';
  }

  const hasProfanity = hits.some((hit) => hit.code === 'PROFANITY');
  if (hasProfanity) {
    return 'block';
  }

  const hasNormalizedPhone = hits.some((hit) => hit.method === 'normalized');
  if (hasNormalizedPhone) {
    return 'block';
  }

  const personalInfoRanges = mergeOverlappingRanges(
    hits.flatMap((hit) =>
      (hit.code === 'PERSONAL_INFO_PHONE' ||
        hit.code === 'PERSONAL_INFO_ACCOUNT') &&
      hit.range
        ? [hit.range]
        : []
    )
  );
  if (personalInfoRanges.length === 0) {
    return 'allow';
  }

  if (isStandaloneRanges(content, personalInfoRanges)) {
    return 'block';
  }

  return 'mask';
};

/** action·reasons를 기존 고정 안내 문구로 매핑한다. 욕설이 있으면 욕설 문구를 우선한다. */
const toMaskedContent = (
  content: string,
  action: FilterAction,
  reasons: FilterReason[],
  hits: FilterHit[]
): string => {
  if (action === 'allow') {
    return content;
  }

  const hasProfanity = reasons.some((reason) => reason.code === 'PROFANITY');
  if (hasProfanity) {
    return PROFANITY_FILTER_MESSAGE;
  }

  if (action === 'mask') {
    const rangesOf = (code: FilterReasonCode): TextRange[] =>
      hits.flatMap((hit) => (hit.code === code && hit.range ? [hit.range] : []));

    const phoneReplacements = mergeOverlappingRanges(
      rangesOf('PERSONAL_INFO_PHONE')
    ).map((range) => ({ ...range, replacement: '[전화번호]' }));

    const accountReplacements = mergeOverlappingRanges(
      rangesOf('PERSONAL_INFO_ACCOUNT')
    ).map((range) => ({ ...range, replacement: '[계좌번호]' }));

    return replaceRanges(content, [...phoneReplacements, ...accountReplacements]);
  }

  return PERSONAL_INFO_FILTER_MESSAGE;
};

/**
 * 사용자 입력 텍스트 클린 필터.
 * 전화/계좌는 정규식, 한글 우회 전화는 전처리 탐지, 욕설은 Exact 후 Embedding 유사도.
 * LLM은 호출하지 않는다. 탐지 결과는 decision(action/reasons)으로 남기고,
 * 문장 안 번호는 span 치환(mask), 번호만 있는 메시지와 우회 번호는 block으로 매핑한다.
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
  const hits: FilterHit[] = [];

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

    if (containsExactProfanity(content, words)) {
      hits.push({ code: 'PROFANITY', method: 'exact' });
    } else {
      const similarityReason = await findSimilarityProfanity(
        content,
        deps,
        resolveThreshold(deps)
      );
      if (similarityReason) {
        hits.push(similarityReason);
      }
    }
  }

  const cardLikeRanges = mergeOverlappingRanges(
    collectMatchRanges(content, CARD_LIKE_EXCLUSION_PATTERNS)
  );

  const rawPhoneRanges = maskPhone
    ? collectMatchRanges(content, PHONE_PATTERNS).filter(
        (phone) =>
          !cardLikeRanges.some((cardLike) => rangesOverlap(phone, cardLike))
      )
    : [];
  const rawAccountRanges = maskAccount
    ? mergeOverlappingRanges(
        collectMatchRanges(content, ACCOUNT_PATTERNS).filter((range) =>
          isValidAccountRange(content, range, cardLikeRanges)
        )
      )
    : [];

  const { phoneRanges, accountRanges } = resolvePhoneAndAccountRanges(
    content,
    rawPhoneRanges,
    rawAccountRanges
  );

  for (const range of phoneRanges) {
    hits.push({ code: 'PERSONAL_INFO_PHONE', method: 'regex', range });
  }

  const normalizedPhoneRanges =
    maskPhone ? collectNormalizedPhoneRanges(content) : [];
  for (const range of normalizedPhoneRanges) {
    hits.push({ code: 'PERSONAL_INFO_PHONE', method: 'normalized', range });
  }

  for (const range of accountRanges) {
    hits.push({ code: 'PERSONAL_INFO_ACCOUNT', method: 'regex', range });
  }

  const action = decideFilterAction(hits, content);
  const reasons = toUniqueReasons(hits);
  const decision: FilterDecision = { action, reasons };
  const maskedContent = toMaskedContent(content, action, reasons, hits);

  return {
    rawContent,
    maskedContent,
    isFiltered: action !== 'allow',
    decision,
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
