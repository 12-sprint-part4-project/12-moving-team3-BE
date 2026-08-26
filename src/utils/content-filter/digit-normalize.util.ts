import type { NormalizedSpanDigits } from './types';

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

const KOREAN_DIGIT_PATTERN = /[공영일이삼사오육륙칠팔구]/;
const FULLWIDTH_DIGIT_PATTERN = /[０-９]/;

/** 후보 span regex character class용 (ASCII·전각 하이픈 U+FF0D·전각 공백 U+3000) */
export const PERSONAL_INFO_SEPARATOR_CLASS = '\\s\\-_.\\uFF0D\\u3000';

/** 전각 숫자(０-９)를 ASCII 숫자로 변환한다. */
export const toAsciiDigitChar = (char: string): string => {
  const code = char.charCodeAt(0);
  if (code >= 0xff10 && code <= 0xff19) {
    return String.fromCharCode(code - 0xff10 + 0x30);
  }

  return KOREAN_DIGIT_MAP[char] ?? char;
};

/**
 * 후보 span에서 순수 digits 문자열을 만든다.
 * - 전각 숫자 → ASCII
 * - 한글 숫자 → digit
 * - 구분자(공백·하이픈 등) 제거
 * 메시지 전체 NFKC는 사용하지 않는다.
 */
export const normalizeSpanToDigits = (value: string): NormalizedSpanDigits => {
  let hasKoreanDigits = false;
  let hasFullwidthDigits = false;
  let digits = '';

  for (const char of value) {
    if (KOREAN_DIGIT_PATTERN.test(char)) {
      hasKoreanDigits = true;
      digits += KOREAN_DIGIT_MAP[char] ?? '';
      continue;
    }

    if (FULLWIDTH_DIGIT_PATTERN.test(char)) {
      hasFullwidthDigits = true;
      digits += toAsciiDigitChar(char);
      continue;
    }

    if (/\d/.test(char)) {
      digits += char;
    }
  }

  return { digits, hasKoreanDigits, hasFullwidthDigits };
};

/** 휴대폰 번호(010·011·016·017·018·019) digits 판별 */
export const isMobilePhoneDigits = (digits: string): boolean =>
  /^01[016789]\d{7,8}$/.test(digits);

/** 0으로 시작하는 유선 번호 digits 판별 (휴대 제외) */
export const isLandlinePhoneDigits = (digits: string): boolean => {
  if (!digits.startsWith('0') || isMobilePhoneDigits(digits)) {
    return false;
  }

  if (/^02\d{7,8}$/.test(digits)) {
    return true;
  }

  return /^0[3-9]\d{1,2}\d{7,8}$/.test(digits);
};

/** 010 휴대·0 시작 유선 등 계좌보다 우선하는 전화 digits */
export const isPriorityPhoneDigits = (digits: string): boolean =>
  isMobilePhoneDigits(digits) || digits.startsWith('0');

/** 계좌 후보 digits (10~14자리, 카드 4-4-4-4 제외는 호출부에서 span overlap으로 처리) */
export const isAccountCandidateDigits = (digits: string): boolean =>
  digits.length >= 10 && digits.length <= 14;

/** 하이픈·공백 구분 3분할 전화 형태(0 미포함). 구 account·phone 패턴 3 대응 */
export const hasLegacySplitPhoneStructure = (raw: string): boolean => {
  const sep = '[\\s\\-_.\\uFF0D\\u3000]';
  return new RegExp(`\\d{2,4}${sep}\\d{3,5}${sep}\\d{4}`).test(raw);
};
