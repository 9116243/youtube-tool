import type { LanguageCode } from "@/lib/languages";

export type TaskKind = "subtitle" | "dubbing" | "burnin";
export type TaskStatus = "queued" | "running" | "success" | "failed";

export interface SubtitleTaskMeta {
  subtitlePath?: string;
}

export interface SubtitleTaskPayload {
  language: LanguageCode;
  meta?: SubtitleTaskMeta;
}

export interface BaseTask<TParams = Record<string, unknown>> {
  id: string;
  kind: TaskKind;
  title: string;
  params: TParams;
  dependsOn?: string[];
}

export interface DubbingParams {
  language: LanguageCode;
  subtitlePath: string;
  voiceId?: string;
  provider?: "elevenlabs" | "azure" | "google";
  speed?: number;
  pitch?: number;
  outAudioPath: string;
}

export interface BurnInParams {
  language: LanguageCode;
  videoPath: string;
  subtitlePath: string;
  dubAudioPath?: string;
  codec?: "h264" | "h265" | "prores" | "vp9";
  resolution?: "1080p" | "2k" | "4k" | "source";
  outVideoPath: string;
}

const nid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2)}`;

export function createDubbingTasks(
  subtitleTasks: Array<BaseTask<SubtitleTaskPayload>>,
  opts: {
    voiceMap?: Partial<Record<LanguageCode, string>>;
    provider?: "elevenlabs" | "azure" | "google";
    speed?: number;
    pitch?: number;
    outDir?: string;
  } = {},
): Array<BaseTask<DubbingParams>> {
  const {
    voiceMap = {},
    provider = "elevenlabs",
    speed = 1.0,
    pitch = 0,
    outDir = "./outputs",
  } = opts;

  return subtitleTasks.map((task) => {
    const lang = task.params.language;
    const subtitlePath = task.params.meta?.subtitlePath ?? `${outDir}/${lang}.srt`;
    const audioPath = `${outDir}/${lang}.wav`;

    return {
      id: nid("dub"),
      kind: "dubbing",
      title: `Dubbing - ${lang}`,
      params: {
        language: lang,
        subtitlePath,
        voiceId: voiceMap[lang],
        provider,
        speed,
        pitch,
        outAudioPath: audioPath,
      },
      dependsOn: [task.id],
    };
  });
}

export function createBurnInTasks(
  subtitleTasks: Array<BaseTask<SubtitleTaskPayload>>,
  dubbingTasks: Array<BaseTask<DubbingParams>>,
  opts: {
    sourceVideo: string;
    codec?: BurnInParams["codec"];
    resolution?: BurnInParams["resolution"];
    outDir?: string;
    mixDubbing?: boolean;
  },
): Array<BaseTask<BurnInParams>> {
  const { sourceVideo, codec = "h264", resolution = "1080p", outDir = "./outputs", mixDubbing = true } =
    opts;

  return subtitleTasks.map((task) => {
    const lang = task.params.language;
    const relatedDub = dubbingTasks.find((dub) => dub.params.language === lang);
    const subtitlePath = task.params.meta?.subtitlePath ?? `${outDir}/${lang}.srt`;
    const dubPath = relatedDub?.params.outAudioPath;
    const outVideoPath = `${outDir}/burnin_${lang}.mp4`;

    return {
      id: nid("burn"),
      kind: "burnin",
      title: `Burn-in - ${lang}`,
      params: {
        language: lang,
        videoPath: sourceVideo,
        subtitlePath,
        dubAudioPath: mixDubbing ? dubPath : undefined,
        codec,
        resolution,
        outVideoPath,
      },
      dependsOn: relatedDub ? [task.id, relatedDub.id] : [task.id],
    };
  });
}

export function createLocalizationPipeline(
  subtitleTasks: Array<BaseTask<SubtitleTaskPayload>>,
  opts: {
    voiceMap?: Partial<Record<LanguageCode, string>>;
    provider?: "elevenlabs" | "azure" | "google";
    speed?: number;
    pitch?: number;
    outDir?: string;
    sourceVideo: string;
    codec?: BurnInParams["codec"];
    resolution?: BurnInParams["resolution"];
    mixDubbing?: boolean;
  },
) {
  const dubbing = createDubbingTasks(subtitleTasks, opts);
  const burnIn = createBurnInTasks(subtitleTasks, dubbing, {
    sourceVideo: opts.sourceVideo,
    codec: opts.codec,
    resolution: opts.resolution,
    outDir: opts.outDir,
    mixDubbing: opts.mixDubbing,
  });

  return { dubbing, burnIn };
}
