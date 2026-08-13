import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS: string[] = [
  'p', 'br', 'strong', 'em',
  'h1', 'h2', 'ul', 'ol', 'li',
  'a', 'blockquote', 'code', 'pre',
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'target'],
};

export const isHtmlContent = (content: string): boolean =>
  content.trimStart().startsWith('<');

/** HTML sanitize — 허용 태그·속성만 남기고 javascript: URL 차단 */
export const sanitizePostHtml = (html: string): string =>
  sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
  });

const stripHtml = (html: string): string =>
  sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();

const stripMarkdown = (markdown: string): string =>
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

/** HTML·Markdown 모두 plain text로 변환 (미리보기·빈 본문 검증용) */
export const stripPostContent = (content: string): string =>
  isHtmlContent(content) ? stripHtml(content) : stripMarkdown(content);

/** 목록 미리보기용 — 첫 단락만 추출 후 plain text 변환 */
export const stripPostContentPreview = (content: string): string => {
  if (isHtmlContent(content)) {
    const firstBlock = content.split(/<\/p>|<br/i)[0] ?? content;
    return stripHtml(firstBlock);
  }
  const firstLine = content.split('\n')[0] ?? content;
  return stripMarkdown(firstLine);
};

export const isPostContentEmpty = (content: string): boolean =>
  stripPostContent(content).length === 0;
