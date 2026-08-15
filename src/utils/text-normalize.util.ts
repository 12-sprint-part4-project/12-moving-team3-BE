/**
 * 금칙어 Exact 비교용 정규화.
 * 대소문자·공백·흔한 구분자만 제거한다. (과도한 축약은 오탐을 늘리므로 하지 않는다)
 */
export const normalizeBannedText = (text: string): string =>
  text.toLowerCase().replace(/[\s._\-*@#$%^&()]+/g, '');
