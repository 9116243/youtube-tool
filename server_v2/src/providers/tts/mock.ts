import type { TtsLine, TtsProvider, TtsSynthesizeOptions, TtsSynthesizeResult } from './index.js';
import { buffersToWav } from './utils.js';

const generateMockTone = (text: string, sampleRate: number) => {
  const duration = Math.min(8, Math.max(1, Math.ceil(text.length / 20)));
  const samples = Math.max(1, duration * sampleRate);
  const buffer = Buffer.alloc(samples * 2);
  const freq = 220;
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const sample = Math.round(Math.sin(2 * Math.PI * freq * t) * 0.1 * 32767);
    buffer.writeInt16LE(sample, i * 2);
  }
  return buffer;
};

const synthesizeMock = (lines: TtsLine[], options: TtsSynthesizeOptions) => {
  const chunks = lines.map((line) => generateMockTone(line.text, options.sampleRate));
  return buffersToWav(chunks, options.sampleRate, options.outputPath);
};

export const mockTtsProvider: TtsProvider = {
  name: 'mock-tts',
  async synthesize(lines: TtsLine[], options: TtsSynthesizeOptions): Promise<TtsSynthesizeResult> {
    for (let i = 0; i < lines.length; i += 1) {
      await options.onSegment?.({ index: i + 1, total: lines.length });
    }
    const result = await synthesizeMock(lines, options);
    return {
      ...result,
      metrics: {
        provider: 'mock-tts',
        segments: lines.length
      }
    };
  }
};
