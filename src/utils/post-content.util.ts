/**
 * 마크다운 → plain text (미리보기·빈 본문 검증용).
 * @see 12-moving-team3-FE src/lib/stripCommunityPostMarkdown.ts
 */
export const stripPostMarkdown = (markdown: string): string =>
  markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

export const isPostContentEmpty = (content: string): boolean =>
  stripPostMarkdown(content).length === 0;
