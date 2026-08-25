import {
  decideFilterAction,
  toMaskedContent,
  toUniqueReasons,
} from './decide-action.util';
import { collectPersonalInfoHits } from './personal-info-filter';
import {
  collectSimilarityCandidates,
  containsExactProfanity,
  findSimilarityProfanity,
  loadBannedWordsWithFallback,
  resolveThreshold,
} from './profanity-filter';
import type {
  FilterChatContentResult,
  FilterDecision,
  FilterHit,
  FilterUserTextDeps,
  FilterUserTextOptions,
  FilterUserTextResult,
} from './types';

export type {
  FilterAction,
  FilterChatContentResult,
  FilterDecision,
  FilterMethod,
  FilterReason,
  FilterReasonCode,
  FilterUserTextDeps,
  FilterUserTextOptions,
  FilterUserTextResult,
} from './types';

export {
  collectSimilarityCandidates,
  containsExactProfanity,
} from './profanity-filter';
export { decideFilterAction } from './decide-action.util';

/**
 * 사용자 입력 텍스트 클린 필터.
 * 전화/계좌: 후보 span → digits 정규화(전각·한글 숫자·구분자) → classifier.
 * 욕설: Exact 후 Embedding 유사도. LLM 없음.
 * 문장 안 번호(전각 포함)는 span 치환(mask), 번호만·한글 우회 번호는 block.
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
    const words = await loadBannedWordsWithFallback(deps);

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

  hits.push(
    ...collectPersonalInfoHits({
      text: content,
      maskPhone,
      maskAccount,
    })
  );

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
