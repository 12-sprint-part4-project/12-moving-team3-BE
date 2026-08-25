import type { TextRange } from './types';

/** 정규식 매칭 구간. lastIndex를 패턴마다 새로 둔다. */
export const collectMatchRanges = (
  text: string,
  patterns: RegExp[]
): TextRange[] => {
  const ranges: TextRange[] = [];

  for (const pattern of patterns) {
    const flags = pattern.flags.includes('g')
      ? pattern.flags
      : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    let match = globalPattern.exec(text);

    while (match) {
      if (match[0].length === 0) {
        globalPattern.lastIndex += 1;
        match = globalPattern.exec(text);
        continue;
      }

      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
      match = globalPattern.exec(text);
    }
  }

  return ranges;
};

export const rangesOverlap = (left: TextRange, right: TextRange): boolean =>
  left.start < right.end && right.start < left.end;

const compareRanges = (left: TextRange, right: TextRange): number =>
  left.start - right.start || left.end - right.end;

export const dedupeRanges = (ranges: TextRange[]): TextRange[] => {
  const sorted = [...ranges].sort(compareRanges);
  const result: TextRange[] = [];

  for (const range of sorted) {
    const last = result[result.length - 1];
    if (last && last.start === range.start && last.end === range.end) {
      continue;
    }
    result.push(range);
  }

  return result;
};

/** 겹치거나 이어지는 구간을 하나로 합친다. */
export const mergeOverlappingRanges = (ranges: TextRange[]): TextRange[] => {
  const sorted = dedupeRanges(ranges);
  if (sorted.length === 0) {
    return [];
  }

  const merged: TextRange[] = [{ ...sorted[0] }];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
};

export const replaceRanges = (
  text: string,
  replacements: Array<TextRange & { replacement: string }>
): string => {
  if (replacements.length === 0) {
    return text;
  }

  const sorted = [...replacements].sort(compareRanges);
  let cursor = 0;
  let result = '';

  for (const item of sorted) {
    result += text.slice(cursor, item.start);
    result += item.replacement;
    cursor = item.end;
  }

  result += text.slice(cursor);
  return result;
};

const NON_CONTENT_PATTERN = /^[\s.,!?()[\]{}"'`~:;<>/@#$%^&*+=_|\\-]*$/;

/** 독립적인 구간 판별. 문장 안 번호는 mask */
export const isStandaloneRanges = (
  text: string,
  ranges: TextRange[]
): boolean => {
  if (ranges.length === 0) {
    return false;
  }

  let cursor = 0;
  let remainder = '';

  for (const range of dedupeRanges(ranges)) {
    remainder += text.slice(cursor, range.start);
    cursor = range.end;
  }
  remainder += text.slice(cursor);

  return NON_CONTENT_PATTERN.test(remainder);
};
