/** 마스킹에 사용하는 대체 문자 */
const MASK = '***';

/**
 * BE 관리 금칙어 사전 (욕설).
 * 주소는 필터 대상이 아니다.
 */
const PROFANITY_WORDS = [
  '시발',
  '씨발',
  '병신',
  '지랄',
  '개새끼',
  'ㅅㅂ',
  'ㅄ',
  'ㅂㅅ',
  'ㅈㄹ',
] as const;

/** 휴대폰·유선 전화번호 패턴 */
const PHONE_PATTERNS: RegExp[] = [
  /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,
  /0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g,
];

/** 카드번호(4-4-4-4) · 계좌번호로 보이는 연속 숫자 패턴 */
const ACCOUNT_CARD_PATTERNS: RegExp[] = [
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  /\b\d{10,14}\b/g,
];

export interface FilterChatContentResult {
  maskedContent: string;
  isFiltered: boolean;
  rawContent: string;
}

/** 정규식으로 매칭된 구간을 MASK로 치환한다. */
const applyPatterns = (text: string, patterns: RegExp[]): string => {
  let result = text;

  for (const pattern of patterns) {
    result = result.replace(pattern, MASK);
  }

  return result;
};

/** 금칙어를 MASK로 치환한다. */
const applyProfanity = (text: string): string => {
  let result = text;

  for (const word of PROFANITY_WORDS) {
    result = result.split(word).join(MASK);
  }

  return result;
};

/**
 * 채팅 텍스트에 클린봇(전화·계좌/카드·욕설) 마스킹을 적용한다.
 * 주소는 필터하지 않는다. 원문은 rawContent로 반환한다.
 */
export const filterChatContent = (content: string): FilterChatContentResult => {
  const rawContent = content;
  let maskedContent = content;

  maskedContent = applyPatterns(maskedContent, PHONE_PATTERNS);
  maskedContent = applyPatterns(maskedContent, ACCOUNT_CARD_PATTERNS);
  maskedContent = applyProfanity(maskedContent);

  return {
    rawContent,
    maskedContent,
    isFiltered: maskedContent !== rawContent,
  };
};
