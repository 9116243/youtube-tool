import { env } from '../utils/env.js';
import { prisma } from '../db/prisma.js';
import { cosineSimilarity, textToEmbedding } from './utils.js';

type MediaSearchResult = {
  similarity: number;
  assetId: string;
  path: string;
  kind: string;
  metadata?: string | null;
  license?: {
    licenseType: string;
    provider: string;
    validUntil: string | null;
    details?: string | null;
  } | null;
};

const parseVector = (value: string) => {
  try {
    return (JSON.parse(value) as number[]) ?? [];
  } catch {
    return [];
  }
};

export const searchMedia = async ({
  organizationId,
  query,
  topK
}: {
  organizationId: string;
  query: string;
  topK?: number;
}): Promise<MediaSearchResult[]> => {
  const embeddings = await prisma.mediaEmbedding.findMany({
    where: { asset: { organizationId } },
    include: {
      asset: {
        include: {
          license: true
        }
      }
    }
  });
  if (!embeddings.length) return [];
  const queryVector = textToEmbedding(query);
  type Scored = { similarity: number; asset: typeof embeddings[0]['asset'] };
  const scored = embeddings
    .map((entry): Scored => ({
      similarity: cosineSimilarity(queryVector, parseVector(entry.vector)),
      asset: entry.asset
    }))
    .sort((a, b) => b.similarity - a.similarity);
  const limit = topK ?? env.SIMILARITY_TOPK;
  return scored.slice(0, limit).map((entry) => ({
    similarity: entry.similarity,
    assetId: entry.asset.id,
    path: entry.asset.path,
    kind: entry.asset.kind,
    metadata: entry.asset.metadata,
    license: entry.asset.license
      ? {
          licenseType: entry.asset.license.licenseType,
          provider: entry.asset.license.provider,
          validUntil: entry.asset.license.validUntil?.toISOString() ?? null,
          details: entry.asset.license.details ?? null
        }
      : null
  }));
};

export const dedupMedia = async ({ organizationId, threshold }: { organizationId: string; threshold?: number }) => {
  const embeddings = await prisma.mediaEmbedding.findMany({
    where: { asset: { organizationId } },
    include: { asset: true }
  });
  const clusters: Array<{ representative: string; assets: string[] }> = [];
  const used = new Set<string>();
  const simThreshold = threshold ?? env.DEDUP_SIM_THRESHOLD;
  for (const current of embeddings) {
    if (used.has(current.assetId)) continue;
    const cluster = [current.assetId];
    used.add(current.assetId);
    const currentVector = parseVector(current.vector);
    for (const candidate of embeddings) {
      if (used.has(candidate.assetId)) continue;
      const score = cosineSimilarity(currentVector, parseVector(candidate.vector));
      if (score >= simThreshold) {
        cluster.push(candidate.assetId);
        used.add(candidate.assetId);
      }
    }
    clusters.push({ representative: current.assetId, assets: cluster });
  }
  return clusters;
};

export const recommendBroll = async ({
  organizationId,
  query,
  topK
}: {
  organizationId: string;
  query: string;
  topK?: number;
}) => {
  const results = await searchMedia({ organizationId, query, topK: topK ?? env.SIMILARITY_TOPK * 2 });
  const now = new Date();
  const filtered = results.filter((item) => {
    if (!item.license) return false;
    if (item.license.licenseType.toLowerCase() !== 'b-roll') return false;
    if (item.license.validUntil) {
      return new Date(item.license.validUntil) > now;
    }
    return true;
  });
  return filtered.slice(0, topK ?? env.SIMILARITY_TOPK);
};
