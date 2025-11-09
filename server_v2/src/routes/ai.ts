import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../utils/env.js';
import { HttpError } from '../utils/http-error.js';

const router = Router();
const client = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

const bodySchema = z
  .object({
    topic: z.string().min(1),
    language: z.string().default('en-US'),
    count: z.number().int().min(1).max(10).default(5)
  })
  .strict();

const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.post('/ai/titles', asyncHandler(async (req, res) => {
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, 'INVALID_AI_REQUEST', 'Invalid AI payload', parsed.error.flatten());
  }
  const { topic, language, count } = parsed.data;
  if (!client) {
    const mock = Array.from({ length: count }).map((_, index) =>
      `${language.toUpperCase()} :: ${topic} (mock #${index + 1})`
    );
    res.json({ mock: true, titles: mock });
    return;
  }
  const completion = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: `Generate ${count} compelling YouTube titles in ${language} about "${topic}". Return a JSON array of strings.`
  });
  const text = completion.output
    .map((chunk) => ('content' in chunk && chunk.content[0]?.type === 'output_text' ? chunk.content[0].text : ''))
    .join('')
    .trim();
  let titles: string[] = [];
  try {
    titles = JSON.parse(text);
  } catch {
    titles = text
      .split('\n')
      .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
      .filter(Boolean);
  }
  if (!titles.length) {
    throw new HttpError(502, 'AI_EMPTY_RESPONSE', 'AI service returned no titles');
  }
  res.json({ mock: false, titles: titles.slice(0, count) });
}));

export const aiRouter = router;
