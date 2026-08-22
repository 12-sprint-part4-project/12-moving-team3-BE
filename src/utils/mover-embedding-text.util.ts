export interface MoverEmbeddingTextSource {
  name: string | null | undefined;
  shortDescription: string | null | undefined;
  description: string | null | undefined;
}

/**
 * 기사 임베딩용 문서 문자열.
 * name + shortDescription + description. 공백만 있으면 null.
 */
export const buildMoverEmbeddingText = (
  source: MoverEmbeddingTextSource
): string | null => {
  const text = [source.name, source.shortDescription, source.description]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join('\n')
    .trim();

  return text.length > 0 ? text : null;
};
