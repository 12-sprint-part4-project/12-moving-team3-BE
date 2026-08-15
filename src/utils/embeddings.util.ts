import OpenAI from 'openai';
import env from '../config/env';

export const EMBED_MODEL = 'text-embedding-3-small'; // 벡터 모델(숫자 벡터로 변환)

let client: OpenAI | null = null;

const getClient = (): OpenAI => {
  if (!env.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  if (!client) {
    client = new OpenAI({ apiKey: env.openaiApiKey });
  }

  return client;
};

/**
 * 텍스트를 text-embedding-3-small 벡터로 변환한다.
 * 인덱싱(금칙어)과 검색(입력 토큰)에 같은 모델을 쓴다.
 */
export const embed = async (texts: string | string[]): Promise<number[][]> => {
  const input = Array.isArray(texts) ? texts : [texts];
  if (input.length === 0) {
    return [];
  }

  const response = await getClient().embeddings.create({
    model: EMBED_MODEL,
    input,
  });

  return response.data
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding);
};
