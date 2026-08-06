import sanitizeHtml from 'sanitize-html';

/**
 * FE sanitizeCommunityPostHtml(DOMPurify)과 동일한 허용 태그.
 * @see 12-moving-team3-FE src/lib/sanitizeCommunityPostHtml.ts
 */
const POST_CONTENT_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'h1',
  'h2',
  'ul',
  'ol',
  'li',
  'a',
] as const;

const POST_CONTENT_ALLOWED_SCHEMES = ['http', 'https', 'mailto'] as const;

const sanitizeAnchorTag = (
  _tagName: string,
  attribs: sanitizeHtml.Attributes
): sanitizeHtml.Tag => {
  const href = typeof attribs.href === 'string' ? attribs.href : undefined;
  const target =
    typeof attribs.target === 'string' ? attribs.target : undefined;

  return {
    tagName: 'a',
    attribs: {
      ...(href !== undefined ? { href } : {}),
      ...(target !== undefined ? { target } : {}),
      rel: 'noopener noreferrer',
    },
  };
};

/** Tiptap HTML content XSS 방지 — 허용 태그만 저장한다. */
export const sanitizePostContent = (content: string): string =>
  sanitizeHtml(content, {
    allowedTags: [...POST_CONTENT_ALLOWED_TAGS],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    allowedSchemes: [...POST_CONTENT_ALLOWED_SCHEMES],
    transformTags: {
      a: sanitizeAnchorTag,
    },
  });

/** sanitize 후 텍스트 본문이 비었는지 확인한다. */
export const isPostContentEmpty = (html: string): boolean => {
  const text = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\u00a0/g, ' ')
    .trim();

  return text.length === 0;
};
