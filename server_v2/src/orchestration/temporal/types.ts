import type { BurnPipelineResult } from '../../pipeline/burn.js';
import type { QCResult, QCFix, QCIssue } from '../../qc/video.js';
import type { AsrSegment } from '../../providers/asr/index.js';

export type WatermarkConfig = {
  path: string;
  opacity?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
};

export type TemporalPipelineShot = {
  id: string;
  inputVideo: string;
  inputAudio?: string;
  language?: string;
  voiceId?: string;
  provider?: string;
  resolution?: '1080p' | '1440p' | '2160p' | 'source';
  bitrate?: number;
  watermark?: WatermarkConfig | null;
  useGpu?: boolean;
  metadata?: Record<string, unknown>;
};

export type TemporalPipelineInput = {
  taskId: string;
  organizationId: string;
  title: string;
  description?: string | null;
  preset?: string | null;
  shots: TemporalPipelineShot[];
  language?: string;
  voiceId?: string;
  provider?: string;
};

export type TemporalPipelineResult = {
  taskId: string;
  shots: Record<string, ShotArtifacts>;
};

export type ShotStage = 'asr' | 'tts' | 'burn' | 'qc' | 'upload' | 'publish';

export const SHOT_STAGES: readonly ShotStage[] = ['asr', 'tts', 'burn', 'qc', 'upload', 'publish'];

export type AsrResult = {
  srtPath: string;
  segments: AsrSegment[];
  metrics: Record<string, unknown>;
};

export type TtsResult = {
  wavPath: string;
  durationSeconds?: number;
  sampleRate: number;
  cacheKey?: string;
  metrics: Record<string, unknown>;
};

export type QcStageResult = QCResult & {
  appliedFixes: boolean;
};

export type UploadResult = {
  storagePath: string;
  sizeBytes: number;
};

export type PublishResult = {
  externalUrl: string | null;
  publishedAt: string;
};

export type ShotArtifacts = {
  asr: AsrResult;
  tts: TtsResult;
  burn: BurnPipelineResult;
  qc: QcStageResult;
  upload: UploadResult;
  publish: PublishResult;
};

export type ShotActivityInput = {
  taskId: string;
  shot: TemporalPipelineShot;
  workspace: string;
};

export type BurnActivityInput = ShotActivityInput & {
  subtitlePath: string;
  audioPath: string;
  resolution?: TemporalPipelineShot['resolution'];
  bitrate?: number;
  watermark?: WatermarkConfig | null;
  provider?: string;
  hwaccel?: 'auto' | 'none';
};

export type QcActivityInput = ShotActivityInput & {
  burnedVideo: string;
};

export type UploadActivityInput = ShotActivityInput & {
  burnedVideo: string;
};

export type PublishActivityInput = ShotActivityInput & {
  storagePath: string;
};

export type CpuShotActivities = {
  asrShot(input: ShotActivityInput & { audioSource?: string }): Promise<AsrResult>;
  ttsShot(input: ShotActivityInput & { srtPath: string }): Promise<TtsResult>;
  qcShot(input: QcActivityInput): Promise<QcStageResult>;
  uploadShot(input: UploadActivityInput): Promise<UploadResult>;
  publishShot(input: PublishActivityInput): Promise<PublishResult>;
};

export type GpuShotActivities = {
  burnShot(input: BurnActivityInput): Promise<BurnPipelineResult>;
};
