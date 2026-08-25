import type {
  ActiveBannedWord,
  SimilarBannedWord,
} from '../../repositories/banned-word.repository';

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

export interface TextRange {
  start: number;
  end: number;
}

export interface FilterHit extends FilterReason {
  range?: TextRange;
}

/** 후보 span 정규화 결과 */
export interface NormalizedSpanDigits {
  digits: string;
  hasKoreanDigits: boolean;
  hasFullwidthDigits: boolean;
}
