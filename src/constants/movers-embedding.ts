/** 기사 임베딩 배치 크기 (금칙어 인덱싱과 동일 계열) */
export const MOVER_EMBED_BATCH_SIZE = 50;

/**
 * keyword 벡터 매칭용 코사인 유사도 하한 (1 - 거리).
 * 검색 연동 단계에서 사용. 금칙어 threshold(0.55)와 용도가 달라 분리한다.
 */
export const DEFAULT_MOVER_KEYWORD_SIMILARITY_THRESHOLD = 0.35;
//0.35: 매칭을 더 느슨하게 하여 더 많은 후보를 포함하게 함
