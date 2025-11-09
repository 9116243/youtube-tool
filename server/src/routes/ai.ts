import { Router } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { appEnv } from '../utils/env';
import { HttpError } from '../utils/http-error';

const aiSchema = z
  .object({
    topic: z.string().min(1),
    language: z.string().min(1),
    count: z.number().int().min(1).max(10).default(5),
  })
  .strict();

const openaiClient = appEnv.OPENAI_API_KEY ? new OpenAI({ apiKey: appEnv.OPENAI_API_KEY }) : null;

export const aiRouter = Router();

aiRouter.post('/ai/titles', async (req, res, next) => {
  try {
    const result = aiSchema.safeParse(req.body);
    if (!result.success) {
      throw new HttpError(400, 'Invalid AI payload', 'VALIDATION_ERROR', result.error.flatten());
    }

    if (!openaiClient) {
      res.json({
        ok: true,
        titles: buildMockTitles(result.data),
        mock: true,
      });
      return;
    }

    const completion = await openaiClient.chat.completions.create({
      model: appEnv.OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert YouTube strategist who crafts catchy, concise titles.',
        },
        {
          role: 'user',
          content: `Generate ${result.data.count} unique video titles in ${result.data.language} for the topic "${result.data.topic}". Provide each title on its own line without numbering.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? '';
    const titles = content
      .split('\n')
      .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean)
      .slice(0, result.data.count);

    res.json({
      ok: true,
      titles: titles.length ? titles : buildMockTitles(result.data),
      mock: titles.length ? undefined : true,
    });
  } catch (error) {
    next(error);
  }
});

const buildMockTitles = (input: z.infer<typeof aiSchema>) =>
  Array.from({ length: input.count }, (_, idx) => `${input.topic} - Idea ${idx + 1} (${input.language})`);
