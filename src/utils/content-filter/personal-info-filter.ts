import {
  hasLegacySplitPhoneStructure,
  isAccountCandidateDigits,
  isLandlinePhoneDigits,
  isMobilePhoneDigits,
  isPriorityPhoneDigits,
  normalizeSpanToDigits,
  PERSONAL_INFO_SEPARATOR_CLASS,
} from './digit-normalize.util';
import {
  collectMatchRanges,
  dedupeRanges,
  mergeOverlappingRanges,
  rangesOverlap,
} from './range.util';
import type { FilterHit, FilterMethod, TextRange } from './types';

/** 숫자·한글숫자·전각·구분자(ASCII·전각 하이픈·전각 공백)가 이어진 후보 span */
const PERSONAL_INFO_CANDIDATE_PATTERN = new RegExp(
  `[0-9０-９공영일이삼사오육륙칠팔구][0-9０-９공영일이삼사오육륙칠팔구${PERSONAL_INFO_SEPARATOR_CLASS}]{7,}`,
  'g'
);

/** 카드 4-4-4-4(구분자 필수) — 필터·계좌 오탐 제외용 */
const CARD_SEPARATOR = '[-\\s\\uFF0D\\u3000]';
const CARD_LIKE_EXCLUSION_PATTERNS: RegExp[] = [
  new RegExp(`\\b\\d{4}${CARD_SEPARATOR}\\d{4}${CARD_SEPARATOR}\\d{4}${CARD_SEPARATOR}\\d{4}\\b`, 'g'),
  new RegExp(
    `\\b[０-９]{4}${CARD_SEPARATOR}[０-９]{4}${CARD_SEPARATOR}[０-９]{4}${CARD_SEPARATOR}[０-９]{4}\\b`,
    'g'
  ),
];

interface SpanAnalysis {
  range: TextRange;
  method: FilterMethod;
  isPhoneCandidate: boolean;
  isAccountCandidate: boolean;
  isPriorityPhone: boolean;
}

interface CollectPersonalInfoHitsParams {
  text: string;
  maskPhone: boolean;
  maskAccount: boolean;
}

const overlapsCardLike = (
  range: TextRange,
  cardLikeRanges: TextRange[]
): boolean => cardLikeRanges.some((cardLike) => rangesOverlap(cardLike, range));

const analyzeSpan = (
  text: string,
  range: TextRange,
  cardLikeRanges: TextRange[]
): SpanAnalysis | null => {
  if (overlapsCardLike(range, cardLikeRanges)) {
    return null;
  }

  const raw = text.slice(range.start, range.end);
  const { digits, hasKoreanDigits } = normalizeSpanToDigits(raw);

  if (digits.length < 10) {
    return null;
  }

  const method: FilterMethod = hasKoreanDigits ? 'normalized' : 'regex';
  const isMobile = isMobilePhoneDigits(digits);
  const isLandline = isLandlinePhoneDigits(digits);
  const isLegacySplitPhone =
    !isPriorityPhoneDigits(digits) && hasLegacySplitPhoneStructure(raw);
  const isPhoneCandidate = isMobile || isLandline || isLegacySplitPhone;
  const isAccountCandidate =
    isAccountCandidateDigits(digits);
  const isPriorityPhone = isPriorityPhoneDigits(digits) && isPhoneCandidate;

  if (!isPhoneCandidate && !isAccountCandidate) {
    return null;
  }

  return {
    range,
    method,
    isPhoneCandidate,
    isAccountCandidate,
    isPriorityPhone,
  };
};

/**
 * 전화·계좌 구간 충돌 해소 (#349, #354).
 * - 010 휴대·0 시작 유선은 계좌(연속 digit)보다 우선
 * - 그 외 겹치면 계좌 우선 (legacy split phone 오탐 방지)
 */
const resolvePhoneAndAccountAnalyses = (
  analyses: SpanAnalysis[]
): {
  phoneAnalyses: SpanAnalysis[];
  accountAnalyses: SpanAnalysis[];
} => {
  const phoneCandidates = analyses.filter((item) => item.isPhoneCandidate);
  const accountCandidates = analyses.filter((item) => item.isAccountCandidate);

  const priorityPhones = phoneCandidates.filter((item) => item.isPriorityPhone);

  const accountAnalyses = accountCandidates.filter(
    (account) =>
      !priorityPhones.some((phone) => rangesOverlap(phone.range, account.range))
  );

  const phoneAnalyses = phoneCandidates.filter(
    (phone) =>
      !accountAnalyses.some((account) =>
        rangesOverlap(phone.range, account.range)
      )
  );

  return { phoneAnalyses, accountAnalyses };
};

/**
 * 전화·계좌 탐지: 후보 span → digits 정규화 → classifier.
 * 패턴별 변형 흡수 대신 normalizeSpanToDigits 한 경로를 사용한다.
 */
export const collectPersonalInfoHits = ({
  text,
  maskPhone,
  maskAccount,
}: CollectPersonalInfoHitsParams): FilterHit[] => {
  if (!maskPhone && !maskAccount) {
    return [];
  }

  const cardLikeRanges = mergeOverlappingRanges(
    collectMatchRanges(text, CARD_LIKE_EXCLUSION_PATTERNS)
  );

  const candidateRanges = mergeOverlappingRanges(
    dedupeRanges(collectMatchRanges(text, [PERSONAL_INFO_CANDIDATE_PATTERN]))
  );

  const analyses = candidateRanges
    .map((range) => analyzeSpan(text, range, cardLikeRanges))
    .filter((item): item is SpanAnalysis => item !== null);

  const { phoneAnalyses, accountAnalyses } =
    resolvePhoneAndAccountAnalyses(analyses);

  const hits: FilterHit[] = [];

  if (maskPhone) {
    for (const item of phoneAnalyses) {
      hits.push({
        code: 'PERSONAL_INFO_PHONE',
        method: item.method,
        range: item.range,
      });
    }
  }

  if (maskAccount) {
    for (const item of accountAnalyses) {
      hits.push({
        code: 'PERSONAL_INFO_ACCOUNT',
        method: 'regex',
        range: item.range,
      });
    }
  }

  return hits;
};
