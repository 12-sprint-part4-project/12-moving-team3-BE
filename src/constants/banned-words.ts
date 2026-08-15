/** 금칙어 시드·DB 비어 있을 때 Exact 폴백에 쓰는 욕설 목록. 주소는 포함하지 않는다. */
export const DEFAULT_BANNED_WORDS = [
  '시발',
  '씨발',
  '병신',
  '지랄',
  '개새끼',
  '미친',
  'ㅅㅂ',
  'ㅄ',
  'ㅂㅅ',
  'ㅈㄹ',
  'ㅁㅊ'
] as const;

export const BANNED_WORD_CATEGORY_PROFANITY = 'PROFANITY';

export const DEFAULT_BANNED_WORD_SIMILARITY_THRESHOLD = 0.82; // 유사도 임계값

export const BANNED_WORD_SIMILARITY_TOP_K = 3; // 유사도 검색 결과 상위 K개

export const BANNED_WORD_EMBED_BATCH_SIZE = 50; // 벡터 인덱싱 배치 크기

export const BANNED_WORD_MAX_SIMILARITY_CANDIDATES = 20; // 유사도 검색 후보 토큰 최대 개수
