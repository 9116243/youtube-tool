export type TaskStatus = "queued" | "running" | "paused" | "success" | "failed" | "cancelled";

export interface TaskPayload {
  title: string;
  preset: string;
  params: Record<string, unknown>;
}

export interface Task {
  id: string;
  title: string;
  preset: string;
  status: TaskStatus;
  progress: number;
  eta?: string;
  params: Record<string, unknown>;
  createdAt: string;
  split?: boolean;
  segmentMaxMinutes?: number;
  segments?: TaskSegment[];
  phase?: string;
}

export interface ProgressEvent {
  id: string;
  progress: number;
  eta?: string;
  status?: TaskStatus;
}

export type OutputResolution = "360p" | "480p" | "720p" | "1080p" | "1440p" | "2160p" | "source";

export type AnalysisResolution = "360p" | "480p" | "720p";

export type EncoderId =
  | "h264"
  | "h264_nvenc"
  | "hevc"
  | "hevc_nvenc"
  | "av1"
  | "av1_nvenc"
  | "h264_qsv"
  | "hevc_qsv"
  | "hevc_amf"
  | "libx264"
  | "libx265";

export type ContainerFormat = "mp4" | "mkv" | "mov";

export type HdrMode = "none" | "pq" | "hlg";

export type ColorSpace = "rec709" | "rec2020" | "p3";

export type Transfer = "gamma2.2" | "gamma2.4" | "hlg" | "pq";

export type ToneMap = "off" | "hable" | "mobius" | "reinhard" | "bt2390";

export interface HdrMetadata {
  masteringDisplay?: string;
  maxCLL?: number;
  maxFALL?: number;
}

export interface LUT {
  name: string;
  type: "cube";
  url: string;
}

export type UpscaleMode = "none" | "fsrcnnx" | "realesrgan-x2" | "realesrgan-x4";

export type DenoiseMode = "off" | "nlmeans" | "hqdn3d";

export type AudioCodec = "aac" | "opus" | "flac";

export type SubtitleMode = "off" | "soft" | "burn-in";

export interface SubtitleStyle {
  font: string;
  size: number;
  color: string;
  outline: string;
  shadow: string;
  position: "top" | "bottom";
}

export interface SubtitleTrack {
  id: string;
  language: string;
  path: string;
  label?: string;
}

export type AudioLoudness = "off" | "ebu-r128";

export type AudioChannels = "mono" | "stereo" | "5.1";

export type AudioSampleRate = 44100 | 48000;

export type DialogueEnhance = "off" | "voice-boost-1" | "voice-boost-2";

export interface RenderProfile {
  outputResolution: OutputResolution;
  analysisResolution: AnalysisResolution;
  encoder: EncoderId;
  container: ContainerFormat;
  videoBitrateKbps: number | "auto";
  maxBitrateKbps?: number;
  gopSeconds?: number;
  profile?: string;
  level?: string;
  hdrMode: HdrMode;
  hdrMeta?: HdrMetadata;
  colorSpace: ColorSpace;
  transfer: Transfer;
  toneMap: ToneMap;
  lut?: LUT;
  upscale: UpscaleMode;
  denoise: DenoiseMode;
  audioCodec: AudioCodec;
  audioBitrateKbps?: number;
  subtitleBurnIn: boolean;
  subtitleMode: SubtitleMode;
  subtitleStyle?: SubtitleStyle;
  subtitleTracks?: SubtitleTrack[];
  audioLoudness: AudioLoudness;
  audioChannels: AudioChannels;
  audioSampleRate: AudioSampleRate;
  dialogueEnhance: DialogueEnhance;
  encoderPreset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
}

export type WorkflowLanguage = "zh-CN" | "en-US" | "de-DE" | "es-ES";

export type VoiceProfile = "male-a" | "female-b" | "narrator-pro";

export type TransitionStyle = "cut" | "crossfade" | "zoom" | "glitch";

export type BrollDensity = "minimal" | "balanced" | "rich";

export interface WorkflowForm extends RenderProfile {
  stylePreset: string;
  language: WorkflowLanguage;
  voice: VoiceProfile;
  shotCount: number;
  deliveryMode: "single" | "ladder";
  ladderProfile?: LadderProfile;
  segmented: boolean;
  maxSegmentDuration: number;
  frameRate: number;
  theme: string;
  coverTemplate: string;
  transitionStyle: TransitionStyle;
  brollDensity: BrollDensity;
  notes?: string;
}

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  accent: string;
  defaults: Partial<WorkflowForm>;
}

export interface WorkflowTemplateVersion {
  id: string;
  version: number;
  createdAt: string;
  changelog: string;
  profile: RenderProfile;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  current: WorkflowTemplateVersion;
  history: WorkflowTemplateVersion[];
}

export interface WorkflowTask {
  id: string;
  label: string;
  preset: string;
  submittedAt: number;
  estimateMinutes: number;
  estimateSizeMB: number;
  payload: WorkflowForm;
}

export interface RecommendedBitrate {
  target: number;
  min: number;
  max: number;
}

export interface TaskSegment {
  id: string;
  index: number;
  durationMinutes: number;
  progress: number;
  status: TaskStatus;
  eta?: string;
  canRetry?: boolean;
}

export interface QueueTask extends Task {
  eta: string;
  summary: string;
  split?: boolean;
  segmentMaxMinutes?: number;
  segments?: TaskSegment[];
  performance?: PerformanceEstimate;
}

export type JobStatus = "queued" | "running" | "paused" | "success" | "failed" | "cancelled";

export interface Job {
  id: string;
  videoPath: string;
  scriptText?: string;
  outDir?: string;
  status: JobStatus;
  progress: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface JobProgressEvent {
  id: string;
  progress: number;
  status?: JobStatus;
  eta?: string;
  message?: string;
}

export type QAMetric = "vmaf" | "ssim" | "psnr";

export interface QAChartPoint {
  t: number;
  score: number;
}

export interface QAJobResult {
  vmaf?: number;
  ssim?: number;
  psnr?: number;
  chart?: QAChartPoint[];
}

export interface QAJob {
  id: string;
  srcUrl: string;
  refUrl?: string;
  metric: QAMetric[];
  window: "full" | "first-60s" | "sample-10x1s";
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  result?: QAJobResult;
}

export interface RendererCapabilities {
  nvenc: boolean;
  av1: boolean;
  qsv: boolean;
  amf: boolean;
  gpuVendor: "nvidia" | "intel" | "amd" | null;
  vramMB: number;
}

export type LadderResolution = "480p" | "720p" | "1080p" | "1440p" | "2160p";

export interface LadderStep {
  res: LadderResolution;
  bitrateKbps: number;
  maxrateKbps?: number;
}

export interface LadderProfile {
  name: string;
  codec: "h264" | "hevc" | "av1";
  steps: LadderStep[];
  mode: "two-pass" | "crf";
  crf?: number;
  preset?: RenderProfile["encoderPreset"];
}

export interface QAReport {
  id: string;
  taskId: string;
  createdAt: string;
  summary: string;
  metrics: {
    vmaf?: number;
    ssim?: number;
    psnr?: number;
  };
  ladder?: LadderProfile;
  profile: RenderProfile;
}

export interface PerformanceEstimate {
  vramMB: number;
  renderSeconds: number;
  notes: string[];
}
