import {
  PERSONAL_INFO_FILTER_MESSAGE,
  PROFANITY_FILTER_MESSAGE,
} from '../../constants/banned-words';
import {
  mergeOverlappingRanges,
  replaceRanges,
  isStandaloneRanges,
} from './range.util';
import type {
  FilterAction,
  FilterHit,
  FilterReason,
  FilterReasonCode,
  TextRange,
} from './types';

/**
 * reasons와 구간을 바탕으로 action을 고른다. block > mask > allow.
 * 욕설·한글 우회 전화·번호만 있는 메시지는 block, 문장 안 번호는 mask.
 */
export const decideFilterAction = (
  hits: FilterHit[],
  content: string
): FilterAction => {
  if (hits.length === 0) {
    return 'allow';
  }

  const hasProfanity = hits.some((hit) => hit.code === 'PROFANITY');
  if (hasProfanity) {
    return 'block';
  }

  const hasNormalizedPhone = hits.some((hit) => hit.method === 'normalized');
  if (hasNormalizedPhone) {
    return 'block';
  }

  const personalInfoRanges = mergeOverlappingRanges(
    hits.flatMap((hit) =>
      (hit.code === 'PERSONAL_INFO_PHONE' ||
        hit.code === 'PERSONAL_INFO_ACCOUNT') &&
      hit.range
        ? [hit.range]
        : []
    )
  );
  if (personalInfoRanges.length === 0) {
    return 'allow';
  }

  if (isStandaloneRanges(content, personalInfoRanges)) {
    return 'block';
  }

  return 'mask';
};

/** action·reasons를 기존 고정 안내 문구로 매핑한다. 욕설이 있으면 욕설 문구를 우선한다. */
export const toMaskedContent = (
  content: string,
  action: FilterAction,
  reasons: FilterReason[],
  hits: FilterHit[]
): string => {
  if (action === 'allow') {
    return content;
  }

  const hasProfanity = reasons.some((reason) => reason.code === 'PROFANITY');
  if (hasProfanity) {
    return PROFANITY_FILTER_MESSAGE;
  }

  if (action === 'mask') {
    const rangesOf = (code: FilterReasonCode): TextRange[] =>
      hits.flatMap((hit) => (hit.code === code && hit.range ? [hit.range] : []));

    const phoneReplacements = mergeOverlappingRanges(
      rangesOf('PERSONAL_INFO_PHONE')
    ).map((range) => ({ ...range, replacement: '[전화번호]' }));

    const accountReplacements = mergeOverlappingRanges(
      rangesOf('PERSONAL_INFO_ACCOUNT')
    ).map((range) => ({ ...range, replacement: '[계좌번호]' }));

    return replaceRanges(content, [...phoneReplacements, ...accountReplacements]);
  }

  return PERSONAL_INFO_FILTER_MESSAGE;
};

export const toUniqueReasons = (hits: FilterHit[]): FilterReason[] => {
  const result: FilterReason[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const reason: FilterReason = {
      code: hit.code,
      method: hit.method,
      ...(hit.similarity != null && { similarity: hit.similarity }),
    };
    const key = JSON.stringify(reason);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(reason);
  }

  return result;
};
