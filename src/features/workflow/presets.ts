import type {
  BrollDensity,
  RecommendedBitrate,
  RenderProfile,
  TransitionStyle,
  WorkflowForm,
  WorkflowLanguage,
  WorkflowPreset,
  VoiceProfile,
} from "@/lib/types";
import type { OutputResolution } from "@/lib/types";

export interface ThemeSwatch {
  id: string;
  label: string;
  value: string;
}

export const RECOMMENDED_BITRATES: Record<OutputResolution, RecommendedBitrate> = {
  "360p": { min: 800, target: 1500, max: 2200 },
  "480p": { min: 1200, target: 2200, max: 3200 },
  "720p": { min: 3500, target: 5000, max: 6500 },
  "1080p": { min: 8000, target: 12000, max: 15000 },
  "1440p": { min: 15000, target: 20000, max: 28000 },
  "2160p": { min: 28000, target: 35000, max: 45000 },
  source: { min: 0, target: 0, max: 0 },
};

export const BASE_RENDER_PROFILE: RenderProfile = {
  outputResolution: "1080p",
  analysisResolution: "360p",
  encoder: "h264_nvenc",
  container: "mp4",
  videoBitrateKbps: RECOMMENDED_BITRATES["1080p"].target,
  maxBitrateKbps: RECOMMENDED_BITRATES["1080p"].max,
  gopSeconds: 2,
  profile: "high",
  level: "4.2",
  hdrMode: "none",
  hdrMeta: {},
  colorSpace: "rec709",
  transfer: "gamma2.4",
  toneMap: "off",
  upscale: "none",
  denoise: "off",
  audioCodec: "aac",
  audioBitrateKbps: 320,
  subtitleBurnIn: false,
  subtitleMode: "off",
  subtitleStyle: {
    font: "Inter",
    size: 32,
    color: "#ffffff",
    outline: "#000000",
    shadow: "rgba(0,0,0,0.45)",
    position: "bottom",
  },
  subtitleTracks: [],
  audioLoudness: "off",
  audioChannels: "stereo",
  audioSampleRate: 48000,
  dialogueEnhance: "off",
  encoderPreset: "medium",
};

const baseForm: Pick<
  WorkflowForm,
  | "stylePreset"
  | "language"
  | "voice"
  | "deliveryMode"
  | "shotCount"
  | "segmented"
  | "maxSegmentDuration"
  | "frameRate"
  | "theme"
  | "coverTemplate"
  | "transitionStyle"
  | "brollDensity"
> = {
  stylePreset: "neon",
  language: "en-US" satisfies WorkflowLanguage,
  voice: "narrator-pro" satisfies VoiceProfile,
  shotCount: 18,
  deliveryMode: "single",
  segmented: false,
  maxSegmentDuration: 5,
  frameRate: 0.5,
  theme: "cyberwave",
  coverTemplate: "Neon Pulse Overlay",
  transitionStyle: "cut" satisfies TransitionStyle,
  brollDensity: "balanced" satisfies BrollDensity,
};

export const THEME_SWATCHES: ThemeSwatch[] = [
  { id: "cyberwave", label: "Cyberwave", value: "#0ea5e9" },
  { id: "glassmorphism", label: "Glassmorphism", value: "#8b5cf6" },
  { id: "minimal-dark", label: "Minimal Dark", value: "#1e293b" },
  { id: "noir", label: "Noir", value: "#111827" },
  { id: "sunset", label: "Sunset", value: "#f97316" },
  { id: "aurora", label: "Aurora", value: "#14b8a6" },
];

export const STYLE_PRESETS: WorkflowPreset[] = [
  {
    id: "neon",
    name: "Neon Pulse",
    description:
      "High-energy gradients with kinetic light trails tailored to product launches and tech explainers.",
    accent: "#22d3ee",
    defaults: {
      ...baseForm,
      stylePreset: "neon",
      transitionStyle: "glitch",
      brollDensity: "rich",
      frameRate: 0.75,
      theme: "cyberwave",
      coverTemplate: "Neon Pulse Overlay",
      encoder: "h264_nvenc",
      container: "mp4",
      outputResolution: "1080p",
      analysisResolution: "360p",
      videoBitrateKbps: RECOMMENDED_BITRATES["1080p"].target,
      maxBitrateKbps: RECOMMENDED_BITRATES["1080p"].max,
      gopSeconds: 2,
      profile: "high",
      level: "4.2",
      hdrMode: "none",
      hdrMeta: {},
      colorSpace: "rec709",
      transfer: "gamma2.4",
      toneMap: "off",
      lut: undefined,
      upscale: "none",
      denoise: "off",
      audioCodec: "aac",
      audioBitrateKbps: 320,
      subtitleBurnIn: false,
      audioLoudness: "off",
      audioChannels: "stereo",
      audioSampleRate: 48000,
      dialogueEnhance: "off",
      encoderPreset: "medium",
    },
  },
  {
    id: "glass",
    name: "Glass Whisper",
    description:
      "Soft glassmorphism panes and diffused glow that frame premium product walkthroughs.",
    accent: "#8b5cf6",
    defaults: {
      ...baseForm,
      stylePreset: "glass",
      transitionStyle: "crossfade",
      brollDensity: "balanced",
      frameRate: 0.55,
      theme: "glassmorphism",
      coverTemplate: "Frosted Glass Board",
      encoder: "hevc_nvenc",
      container: "mp4",
      outputResolution: "1080p",
      analysisResolution: "360p",
      videoBitrateKbps: RECOMMENDED_BITRATES["1080p"].target - 2000,
      maxBitrateKbps: RECOMMENDED_BITRATES["1080p"].max - 2000,
      gopSeconds: 2,
      profile: "main10",
      level: "5.1",
      hdrMode: "none",
      hdrMeta: {},
      colorSpace: "rec709",
      transfer: "gamma2.4",
      toneMap: "off",
      upscale: "none",
      denoise: "off",
      audioCodec: "aac",
      audioBitrateKbps: 256,
      subtitleBurnIn: false,
      audioLoudness: "off",
      audioChannels: "stereo",
      audioSampleRate: 48000,
      dialogueEnhance: "off",
      encoderPreset: "slow",
    },
  },
  {
    id: "minimal",
    name: "Minimal Focus",
    description:
      "Editorial contrast and purposeful negative space to spotlight metrics and narration.",
    accent: "#22c55e",
    defaults: {
      ...baseForm,
      stylePreset: "minimal",
      transitionStyle: "cut",
      brollDensity: "minimal",
      frameRate: 0.4,
      theme: "minimal-dark",
      coverTemplate: "Minimal Spotlight",
      encoder: "h264",
      container: "mp4",
      outputResolution: "720p",
      analysisResolution: "360p",
      videoBitrateKbps: RECOMMENDED_BITRATES["720p"].target,
      maxBitrateKbps: RECOMMENDED_BITRATES["720p"].max,
      gopSeconds: 2,
      profile: "high",
      level: "4.1",
      hdrMode: "none",
      hdrMeta: {},
      colorSpace: "rec709",
      transfer: "gamma2.2",
      toneMap: "off",
      upscale: "none",
      denoise: "off",
      audioCodec: "aac",
      audioBitrateKbps: 192,
      subtitleBurnIn: false,
      audioLoudness: "off",
      audioChannels: "stereo",
      audioSampleRate: 48000,
      dialogueEnhance: "off",
      encoderPreset: "fast",
    },
  },
  {
    id: "dark-pro",
    name: "Dark Pro",
    description:
      "Executive noir palette with controlled neon edges for authority-driven storytelling.",
    accent: "#64748b",
    defaults: {
      ...baseForm,
      stylePreset: "dark-pro",
      transitionStyle: "zoom",
      brollDensity: "balanced",
      frameRate: 0.6,
      theme: "noir",
      coverTemplate: "Executive Slate",
      encoder: "hevc_nvenc",
      container: "mkv",
      outputResolution: "1440p",
      analysisResolution: "480p",
      videoBitrateKbps: RECOMMENDED_BITRATES["1440p"].target,
      maxBitrateKbps: RECOMMENDED_BITRATES["1440p"].max,
      gopSeconds: 2,
      profile: "main10",
      level: "5.2",
      hdrMode: "pq",
      hdrMeta: { masteringDisplay: "G(13200,3450)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1)", maxCLL: 1000, maxFALL: 400 },
      colorSpace: "rec2020",
      transfer: "pq",
      toneMap: "bt2390",
      upscale: "none",
      denoise: "nlmeans",
      audioCodec: "aac",
      audioBitrateKbps: 384,
      subtitleBurnIn: false,
      audioLoudness: "ebu-r128",
      audioChannels: "5.1",
      audioSampleRate: 48000,
      dialogueEnhance: "voice-boost-1",
      encoderPreset: "slow",
    },
  },
];

export function getRecommendedBitrate(resolution: OutputResolution): RecommendedBitrate {
  return RECOMMENDED_BITRATES[resolution];
}

