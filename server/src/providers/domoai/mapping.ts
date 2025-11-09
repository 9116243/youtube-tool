export type EffectKind = 'zoom' | 'reframe' | 'kenburns';

export type DomoAiEffectRequest = {
  effect: EffectKind;
  width: number;
  height: number;
  fps: number;
};

export type DomoAiEffectPayload = {
  effect_type: EffectKind;
  width: number;
  height: number;
  fps: number;
};

export const buildDomoAiEffectPayload = (request: DomoAiEffectRequest): DomoAiEffectPayload => {
  const width = ensureEvenDimension(request.width);
  const height = ensureEvenDimension(request.height);
  const fps = clampFps(request.fps);
  return {
    effect_type: request.effect,
    width,
    height,
    fps,
  };
};

const ensureEvenDimension = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 1920;
  }
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded - 1;
};

const clampFps = (value: number) => {
  if (!Number.isFinite(value)) return 24;
  return Math.min(60, Math.max(12, Math.round(value)));
};
