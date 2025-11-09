import { env } from '../../utils/env.js';

export type SafeAreaOptions = {
  width: number;
  height: number;
  marginPct?: number;
};

const wrapText = (text: string, maxChars: number) => {
  const tokens = text.split(' ');
  const lines = [];
  let currentLine = '';
  for (const token of tokens) {
    if ((currentLine + ' ' + token).trim().length > maxChars) {
      lines.push(currentLine.trim());
      currentLine = token;
    } else {
      currentLine = `${currentLine} ${token}`.trim();
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.join('\n');
};

export const adjustSubtitleForSafeArea = (text: string, options: SafeAreaOptions) => {
  const margin = Math.max(0, Math.min(0.5, (options.marginPct ?? env.SUBSAFE_MARGIN_PCT) / 100));
  const safeWidth = Math.round(options.width * (1 - margin));
  const safeHeight = Math.round(options.height * (1 - margin));
  return {
    safeBounds: {
      x: Math.round(options.width * margin * 0.5),
      y: Math.round(options.height * margin * 0.5),
      width: safeWidth,
      height: safeHeight
    },
    text: wrapText(text, Math.max(20, Math.floor(safeWidth / 10)))
  };
};
