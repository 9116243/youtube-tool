import { RECOMMENDED_BITRATES } from "@/features/workflow/presets";
import type {
  AnalysisResolution,
  AudioCodec,
  AudioLoudness,
  DialogueEnhance,
  DenoiseMode,
  EncoderId,
  OutputResolution,
  RenderProfile,
  ToneMap,
  UpscaleMode,
  WorkflowForm,
} from "@/lib/types";

const RESOLUTION_COST: Record<OutputResolution, number> = {
  "360p": 0.85,
  "480p": 0.95,
  "720p": 1,
  "1080p": 1.25,
  "1440p": 1.55,
  "2160p": 1.9,
  source: 1.4,
};

const RESOLUTION_PIXELS: Record<OutputResolution, number> = {
  "360p": 640 * 360,
  "480p": 854 * 480,
  "720p": 1280 * 720,
  "1080p": 1920 * 1080,
  "1440p": 2560 * 1440,
  "2160p": 3840 * 2160,
  source: 1920 * 1080,
};

const ANALYSIS_COST: Record<AnalysisResolution, number> = {
  "360p": 0.95,
  "480p": 1,
  "720p": 1.1,
};

const ENCODER_COST: Record<EncoderId, number> = {
  h264: 1.2,
  libx264: 1.2,
  h264_nvenc: 0.8,
  hevc: 1.35,
  libx265: 1.35,
  hevc_nvenc: 0.95,
  av1: 1.6,
  av1_nvenc: 1.1,
  h264_qsv: 0.9,
  hevc_qsv: 1.0,
  hevc_amf: 1.05,
};

const ENCODER_SPEED_FACTOR: Record<EncoderId, number> = {
  h264: 1.15,
  libx264: 1.35,
  h264_nvenc: 0.78,
  hevc: 1.4,
  libx265: 1.55,
  hevc_nvenc: 0.92,
  av1: 1.65,
  av1_nvenc: 1.08,
  h264_qsv: 0.85,
  hevc_qsv: 0.97,
  hevc_amf: 1.05,
};

const ENCODER_VRAM_BASE: Record<EncoderId, number> = {
  h264: 900,
  libx264: 850,
  h264_nvenc: 700,
  hevc: 1050,
  libx265: 1100,
  hevc_nvenc: 780,
  av1: 1200,
  av1_nvenc: 900,
  h264_qsv: 820,
  hevc_qsv: 900,
  hevc_amf: 900,
};

const UPSCALE_COST: Record<UpscaleMode, number> = {
  none: 1,
  fsrcnnx: 1.18,
  "realesrgan-x2": 1.35,
  "realesrgan-x4": 1.6,
};

const UPSCALE_VRAM_BONUS: Record<UpscaleMode, number> = {
  none: 0,
  fsrcnnx: 320,
  "realesrgan-x2": 480,
  "realesrgan-x4": 640,
};

const DENOISE_COST: Record<DenoiseMode, number> = {
  off: 1,
  nlmeans: 1.25,
  hqdn3d: 1.1,
};

const DENOISE_VRAM_BONUS: Record<DenoiseMode, number> = {
  off: 0,
  nlmeans: 220,
  hqdn3d: 120,
};

const COLOR_SPACE_COST = {
  rec709: 1,
  rec2020: 1.08,
  p3: 1.05,
} as const;

const TONE_MAP_COST: Record<ToneMap, number> = {
  off: 1,
  hable: 1.04,
  mobius: 1.06,
  reinhard: 1.03,
  bt2390: 1.08,
};

const TONE_MAP_VRAM_BONUS: Record<ToneMap, number> = {
  off: 0,
  hable: 120,
  mobius: 160,
  reinhard: 90,
  bt2390: 220,
};

const AUDIO_LOUDNESS_COST = {
  off: 1,
  "ebu-r128": 1.05,
} as const;

const DIALOGUE_COST = {
  off: 1,
  "voice-boost-1": 1.02,
  "voice-boost-2": 1.04,
} as const;

const AUDIO_CODEC_DEFAULT: Record<AudioCodec, number> = {
  aac: 256,
  opus: 192,
  flac: 1000,
};

interface PerformanceContext {
  durationMinutes?: number;
  segmented?: boolean;
  segmentMaxMinutes?: number;
  ladderSteps?: number;
}

export function resolveVideoBitrate(profile: RenderProfile): number {
  if (profile.videoBitrateKbps !== "auto" && profile.videoBitrateKbps > 0) {
    return profile.videoBitrateKbps;
  }

  const fallback = RECOMMENDED_BITRATES[profile.outputResolution];
  if (fallback.target > 0) {
    return fallback.target;
  }

  return RECOMMENDED_BITRATES["1080p"].target;
}

export function estimateDurationMinutes(form: WorkflowForm): number {
  const baseSecondsPerShot = 6 - Math.min(form.frameRate * 2, 3);
  let totalSeconds = baseSecondsPerShot * Math.max(form.shotCount, 1);

  if (form.segmented) {
    const extraSegments = Math.ceil(totalSeconds / (form.maxSegmentDuration * 60 || 1));
    totalSeconds += extraSegments * 12;
  }

  let multiplier = 1;
  multiplier *= RESOLUTION_COST[form.outputResolution];
  multiplier *= ANALYSIS_COST[form.analysisResolution];
  multiplier *= ENCODER_COST[form.encoder] ?? 1.2;
  multiplier *= UPSCALE_COST[form.upscale];
  multiplier *= DENOISE_COST[form.denoise];
  multiplier *= COLOR_SPACE_COST[form.colorSpace];
  multiplier *= TONE_MAP_COST[form.toneMap];
  multiplier *= AUDIO_LOUDNESS_COST[form.audioLoudness as AudioLoudness] ?? 1;
  multiplier *= DIALOGUE_COST[form.dialogueEnhance as DialogueEnhance] ?? 1;

  if (form.subtitleBurnIn) {
    multiplier *= 1.05;
  }

  if (form.hdrMode !== "none") {
    multiplier *= 1.1;
  }

  const minutes = (totalSeconds / 60) * multiplier;
  return Number(minutes.toFixed(2));
}

export function estimateSizeMB(form: WorkflowForm): number {
  const minutes = estimateDurationMinutes(form);
  const seconds = minutes * 60;

  const videoBitrate = resolveVideoBitrate(form);
  const audioBitrate =
    form.audioBitrateKbps && form.audioBitrateKbps > 0
      ? form.audioBitrateKbps
      : AUDIO_CODEC_DEFAULT[form.audioCodec] ?? 256;

  const videoMegabytes = (videoBitrate * seconds) / 8 / 1024;
  const audioMegabytes = (audioBitrate * seconds) / 8 / 1024;
  const containerOverhead = form.container === "mkv" ? 1.04 : 1.02;

  const total = (videoMegabytes + audioMegabytes) * containerOverhead;
  return Number(total.toFixed(1));
}

function resolveDurationMinutesFromContext(
  profile: RenderProfile,
  context: PerformanceContext,
): number {
  if (context.durationMinutes && context.durationMinutes > 0) {
    return context.durationMinutes;
  }

  const resolutionHint = RESOLUTION_COST[profile.outputResolution] ?? 1.2;
  return 8 * resolutionHint;
}

function computeSegmentCount(context: PerformanceContext, durationMinutes: number) {
  if (!context.segmented) {
    return 1;
  }
  const maxSegment = Math.max(context.segmentMaxMinutes ?? 5, 2);
  return Math.max(1, Math.ceil(durationMinutes / maxSegment));
}

export function estimateRenderSeconds(
  profile: RenderProfile,
  context: PerformanceContext = {},
): number {
  const durationMinutes = resolveDurationMinutesFromContext(profile, context);
  const baseSeconds = durationMinutes * 60;
  const pixelRelative = RESOLUTION_PIXELS[profile.outputResolution] / RESOLUTION_PIXELS["1080p"];
  const encoderSpeed = ENCODER_SPEED_FACTOR[profile.encoder] ?? 1.2;
  const upscaleCost = UPSCALE_COST[profile.upscale];
  const denoiseCost = DENOISE_COST[profile.denoise];
  const toneMapCost = TONE_MAP_COST[profile.toneMap] ?? 1;
  const hdrCost = profile.hdrMode !== "none" ? 1.12 : 1;
  const ladderMultiplier = context.ladderSteps && context.ladderSteps > 1 ? context.ladderSteps : 1;
  const segmentMultiplier = computeSegmentCount(context, durationMinutes);

  const totalSeconds =
    baseSeconds *
    pixelRelative *
    encoderSpeed *
    upscaleCost *
    denoiseCost *
    toneMapCost *
    hdrCost *
    ladderMultiplier *
    segmentMultiplier;

  return Math.max(120, Number(totalSeconds.toFixed(0)));
}

export function estimateVRAM(
  profile: RenderProfile,
  context: PerformanceContext = {},
): number {
  const pixelRelative =
    Math.pow(RESOLUTION_PIXELS[profile.outputResolution] / RESOLUTION_PIXELS["1080p"], 0.85) || 1;
  const encoderBase = ENCODER_VRAM_BASE[profile.encoder] ?? 900;
  const upscaleBonus = UPSCALE_VRAM_BONUS[profile.upscale];
  const denoiseBonus = DENOISE_VRAM_BONUS[profile.denoise];
  const toneMapBonus = TONE_MAP_VRAM_BONUS[profile.toneMap] ?? 0;
  const hdrBonus = profile.hdrMode !== "none" ? 220 : 0;
  const subtitleBonus =
    profile.subtitleMode === "burn-in"
      ? 180
      : profile.subtitleMode === "soft" && profile.subtitleTracks?.length
        ? 90
        : 0;
  const lutBonus = profile.lut ? 160 : 0;
  const audioBonus = profile.audioCodec === "flac" ? 60 : 30;
  const ladderBonus =
    context.ladderSteps && context.ladderSteps > 1 ? Math.min(context.ladderSteps * 180, 720) : 0;

  const segmentMultiplier = computeSegmentCount(
    context,
    resolveDurationMinutesFromContext(profile, context),
  );

  const vram =
    encoderBase * pixelRelative +
    upscaleBonus +
    denoiseBonus +
    toneMapBonus +
    hdrBonus +
    subtitleBonus +
    lutBonus +
    audioBonus +
    ladderBonus;

  return Math.round(vram * Math.max(segmentMultiplier, 1));
}

export type { PerformanceContext };
