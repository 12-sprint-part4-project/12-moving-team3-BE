import type {
  FilterAction,
  FilterDecision,
  FilterReasonCode,
} from './types';

export interface PublicFilterFields {
  filterAction: FilterAction;
  filterReasonCodes: FilterReasonCode[];
}

/**
 * API·소켓에 노출할 필터 판별 필드로 변환한다.
 * reason code만 포함하며 method/similarity/원문은 내리지 않는다.
 */
export const toPublicFilterFields = (
  decision: FilterDecision
): PublicFilterFields => ({
  filterAction: decision.action,
  filterReasonCodes: [
    ...new Set(decision.reasons.map((reason) => reason.code)),
  ],
});

/** 필터 없음(allow) — IMAGE 등 비텍스트 전송 응답용 */
export const ALLOW_PUBLIC_FILTER_FIELDS: PublicFilterFields = {
  filterAction: 'allow',
  filterReasonCodes: [],
};
