import { createHash } from 'node:crypto';
import { env } from '../utils/env.js';

const normalizeText = (value?: string) =>
  (value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const vectorDim = env.EMBED_MODEL_DIM;

export const textToEmbedding = (text: string) => {
  const normalized = normalizeText(text);
  const hash = createHash('sha256').update(normalized).digest();
  const vector: number[] = new Array(vectorDim).fill(0);
  for (let index = 0; index < vectorDim; index += 1) {
    const value = hash[index % hash.length] ?? 0;
    vector[index] = ((value / 255 - 0.5) * 2 + Math.sin(index + value)) / 2;
  }
  return vector;
};

export const cosineSimilarity = (a: number[], b: number[]) => {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};
