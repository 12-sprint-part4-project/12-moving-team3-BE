/**
 * 채팅 클린봇 필터. 구현은 `content-filter/` 모듈을 재사용한다.
 */
export {
  decideFilterAction,
  filterChatContent,
  filterUserText,
  containsExactProfanity,
  collectSimilarityCandidates,
  type FilterAction,
  type FilterChatContentResult,
  type FilterDecision,
  type FilterMethod,
  type FilterReason,
  type FilterReasonCode,
  type FilterUserTextOptions,
  type FilterUserTextResult,
} from './content-filter';
