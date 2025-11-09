import { create } from "zustand";

import { createTask, fetchTasks, fetchTask, retryTaskSegment, SSE_URL } from "@/lib/api";
import { createSSE, type SSEController } from "@/lib/sse";
import { useDownloadsStore } from "@/features/downloads/store";
import { STYLE_PRESETS } from "@/features/workflow/presets";
import {
  estimateRenderSeconds,
  estimateVRAM,
  type PerformanceContext,
} from "@/features/workflow/calc";
import {
  createLocalizationPipeline,
  type BaseTask as PipelineTask,
  type SubtitleTaskPayload as PipelineSubtitlePayload,
} from "@/lib/pipeline";
import type {
  PerformanceEstimate,
  ProgressEvent,
  QueueTask,
  RenderProfile,
  Task,
  TaskPayload,
  TaskStatus,
  TaskSegment,
} from "@/lib/types";

type QueueStatus = TaskStatus | "cancelled";

interface QueueStoreState {
  tasks: QueueTask[];
  fetchAll: () => Promise<void>;
  addTask: (payload: TaskPayload) => Promise<QueueTask>;
  addTasks: (payloads: TaskPayload[]) => Promise<QueueTask[]>;
  pauseTask: (id: string) => void;
  resumeTask: (id: string) => void;
  cancelTask: (id: string) => void;
  updateProgress: (event: ProgressEvent) => void;
  setStatus: (id: string, status: QueueStatus) => void;
  retrySegment: (taskId: string, segmentId: string) => Promise<void>;
  applyTemplateToTask: (taskId: string, profile: RenderProfile) => void;
  addLocalizationPipeline: (
    input: LocalizationPipelineInput,
  ) => Promise<{
    dubs: Array<{ id: string; language: string }>;
    burns: Array<{ id: string; language: string }>;
  }>;
}

const connections = new Map<string, SSEController>();
const completedSet = new Set<string>();

type LocalizationPipelineInput = {
  subtitleTasks: Array<PipelineTask<PipelineSubtitlePayload>>;
  sourceVideo: string;
  provider?: "elevenlabs" | "azure" | "google";
  voiceMap?: Record<string, string>;
  outDir?: string;
  codec?: "h264" | "h265" | "prores" | "vp9";
  resolution?: "1080p" | "2k" | "4k" | "source";
  mixDubbing?: boolean;
  speed?: number;
  pitch?: number;
};

const presetNameLookup = new Map<string, string>(
  STYLE_PRESETS.map((preset) => [preset.id, preset.name]),
);

const parseLut = (value: unknown): RenderProfile["lut"] => {
  if (!value || typeof value !== "object") return undefined;
  const lut = value as Record<string, unknown>;
  if (typeof lut.name === "string" && typeof lut.url === "string") {
    return {
      name: lut.name,
      url: lut.url,
      type: "cube",
    };
  }
  return undefined;
};

const parseSubtitleStyle = (value: unknown): RenderProfile["subtitleStyle"] => {
  if (!value || typeof value !== "object") return undefined;
  const style = value as Record<string, unknown>;
  if (
    typeof style.font === "string" &&
    typeof style.size === "number" &&
    typeof style.color === "string" &&
    typeof style.outline === "string" &&
    typeof style.shadow === "string" &&
    (style.position === "top" || style.position === "bottom")
  ) {
    return {
      font: style.font,
      size: style.size,
      color: style.color,
      outline: style.outline,
      shadow: style.shadow,
      position: style.position,
    };
  }
  return undefined;
};

const normalizeHdrMeta = (value: unknown): RenderProfile["hdrMeta"] => {
  if (!value || typeof value !== "object") return {};
  const meta = value as Record<string, unknown>;
  const result: RenderProfile["hdrMeta"] = {};
  if (typeof meta.masteringDisplay === "string") {
    result.masteringDisplay = meta.masteringDisplay;
  }
  if (typeof meta.maxCLL === "number") {
    result.maxCLL = meta.maxCLL;
  }
  if (typeof meta.maxFALL === "number") {
    result.maxFALL = meta.maxFALL;
  }
  return result;
};

const profileFromParams = (params: Record<string, unknown>): RenderProfile | null => {
  if (!params || typeof params !== "object") return null;
  if (!params.outputResolution || !params.encoder || !params.container) return null;
  const subtitleTracks = Array.isArray(params.subtitleTracks)
    ? (params.subtitleTracks as Record<string, unknown>[]).map((track, index) => ({
        id: (track.id as string) ?? `sub-${index}`,
        language: (track.language as string) ?? "und",
        path: (track.path as string) ?? "",
        label: track.label as string | undefined,
      }))
    : [];

  const profile: RenderProfile = {
    outputResolution: params.outputResolution as RenderProfile["outputResolution"],
    analysisResolution: (params.analysisResolution as RenderProfile["analysisResolution"]) ?? "360p",
    encoder: params.encoder as RenderProfile["encoder"],
    container: params.container as RenderProfile["container"],
    videoBitrateKbps:
      typeof params.videoBitrateKbps === "number" || params.videoBitrateKbps === "auto"
        ? (params.videoBitrateKbps as number | "auto")
        : "auto",
    maxBitrateKbps: params.maxBitrateKbps as number | undefined,
    gopSeconds: params.gopSeconds as number | undefined,
    profile: params.profile as string | undefined,
    level: params.level as string | undefined,
    hdrMode: (params.hdrMode as RenderProfile["hdrMode"]) ?? "none",
    hdrMeta: normalizeHdrMeta(params.hdrMeta),
    colorSpace: (params.colorSpace as RenderProfile["colorSpace"]) ?? "rec709",
    transfer: (params.transfer as RenderProfile["transfer"]) ?? "gamma2.4",
    toneMap: (params.toneMap as RenderProfile["toneMap"]) ?? "off",
    lut: parseLut(params.lut),
    upscale: (params.upscale as RenderProfile["upscale"]) ?? "none",
    denoise: (params.denoise as RenderProfile["denoise"]) ?? "off",
    audioCodec: (params.audioCodec as RenderProfile["audioCodec"]) ?? "aac",
    audioBitrateKbps: params.audioBitrateKbps as number | undefined,
    subtitleBurnIn: Boolean(params.subtitleBurnIn),
    subtitleMode:
      (params.subtitleMode as RenderProfile["subtitleMode"]) ??
      (params.subtitleBurnIn ? "burn-in" : "off"),
    subtitleStyle: parseSubtitleStyle(params.subtitleStyle),
    subtitleTracks,
    audioLoudness: (params.audioLoudness as RenderProfile["audioLoudness"]) ?? "off",
    audioChannels: (params.audioChannels as RenderProfile["audioChannels"]) ?? "stereo",
    audioSampleRate: (params.audioSampleRate as RenderProfile["audioSampleRate"]) ?? 48000,
    dialogueEnhance: (params.dialogueEnhance as RenderProfile["dialogueEnhance"]) ?? "off",
    encoderPreset: params.encoderPreset as RenderProfile["encoderPreset"] | undefined,
  };

  return profile;
};

const buildPerformanceContext = (
  params: Record<string, unknown>,
  profile: RenderProfile,
): PerformanceContext => {
  const durationMinutesCandidates = [
    params.estimateMinutes,
    params.durationMinutes,
    params.estimateDurationMinutes,
  ];
  const durationMinutes = durationMinutesCandidates.find(
    (value) => typeof value === "number" && value > 0,
  ) as number | undefined;

  const segmented = Boolean(params.segmented);
  const segmentMaxMinutes =
    segmented && typeof params.maxSegmentDuration === "number"
      ? (params.maxSegmentDuration as number)
      : undefined;

  let ladderSteps: number | undefined;
  if (params.deliveryMode === "ladder" && params.ladderProfile && typeof params.ladderProfile === "object") {
    const ladder = params.ladderProfile as { steps?: unknown[] };
    if (Array.isArray(ladder.steps) && ladder.steps.length) {
      ladderSteps = ladder.steps.length;
    }
  }

  if (profile.subtitleTracks?.length && params.subtitleMode === "off" && !profile.subtitleBurnIn) {
    // ensure soft subtitles are reflected
    profile.subtitleMode = "soft";
  }

  return {
    durationMinutes,
    segmented,
    segmentMaxMinutes,
    ladderSteps,
  };
};

const computePerformance = (params: Record<string, unknown>): PerformanceEstimate | undefined => {
  const profile = profileFromParams(params);
  if (!profile) return undefined;
  const context = buildPerformanceContext(params, profile);
  const vram = estimateVRAM(profile, context);
  const renderSeconds = estimateRenderSeconds(profile, context);
  const notes: string[] = [];
  if (profile.upscale !== "none") {
    notes.push(`Upscale: ${profile.upscale}`);
  }
  if (profile.hdrMode !== "none") {
    notes.push(`HDR: ${profile.hdrMode.toUpperCase()}`);
  }
  if (profile.subtitleMode === "burn-in") {
    notes.push("Subtitles burn-in enabled");
  } else if (profile.subtitleMode === "soft") {
    notes.push("Soft subtitles track included");
  }
  return {
    vramMB: Math.round(vram),
    renderSeconds: Math.round(renderSeconds),
    notes,
  };
};

function summaryFromParams(params: Record<string, unknown> = {}) {
  const parts: string[] = [];
  const preset = params["stylePreset"] ?? params["preset"];
  const language = params["language"];
  const shots = params["shotCount"];

  if (typeof preset === "string") {
    parts.push(presetNameLookup.get(preset) ?? preset);
  }
  if (typeof language === "string") {
    parts.push(language.toUpperCase());
  }
  if (shots !== undefined) {
    const shotCount = Number(shots);
    if (!Number.isNaN(shotCount)) {
      parts.push(`${shotCount} shots`);
    }
  }

  return parts.join(" | ") || "Custom task";
}

const toQueueTask = (task: Task): QueueTask => ({
  ...task,
  eta: task.eta ?? "--",
  summary: summaryFromParams(task.params),
  split: task.split,
  segmentMaxMinutes: task.segmentMaxMinutes,
  segments: task.segments ?? [],
  phase: task.phase,
  performance: computePerformance(task.params),
});

const closeStream = (id: string) => {
  const connection = connections.get(id);
  if (connection) {
    connection.close();
    connections.delete(id);
  }
};

const startStream = (id: string) => {
  closeStream(id);
  const controller = createSSE(
    `${SSE_URL}?taskId=${encodeURIComponent(id)}`,
    (event) => {
      if (event.data === "") return;
      try {
        const payload = JSON.parse(event.data) as ProgressEvent;
        if ((payload as { type?: string }).type === "heartbeat") {
          return;
        }
        useQueueStore.getState().updateProgress(payload);
      } catch (error) {
        console.error("[queue] failed to parse progress event", error);
      }
    },
    (error) => {
      console.warn("[queue]", error.message);
      if (error.message.includes("failed after")) {
        useQueueStore.getState().setStatus(id, "failed");
      }
    },
    {
      onOpen: () => {
        useQueueStore.setState((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, status: task.status === "queued" ? "running" : task.status } : task,
          ),
        }));
      },
      onClose: () => {
        connections.delete(id);
      },
      onHeartbeat: () => {
        // no-op hook for future metrics
      },
    },
  );
  connections.set(id, controller);
};

export const useQueueStore = create<QueueStoreState>((set, get) => ({
  tasks: [],
  fetchAll: async () => {
    try {
      const list = await fetchTasks();
      set({ tasks: list.map(toQueueTask) });
      list
        .filter((task) => task.status === "running" || task.status === "queued")
        .forEach((task) => startStream(task.id));
    } catch (error) {
      console.error("[queue] fetchAll failed", error);
    }
  },
  addTask: async (payload) => {
    const requestPayload: TaskPayload = {
      title: payload.title || `Task ${Date.now().toString(36)}`,
      preset: payload.preset,
      params: payload.params ?? {},
    };
    const created = await createTask(requestPayload);
    const queueTask = {
      ...toQueueTask(created),
      performance: computePerformance(requestPayload.params ?? {}),
    };
    set((state) => ({
      tasks: [queueTask, ...state.tasks],
    }));
    if (queueTask.status === "running" || queueTask.status === "queued") {
      startStream(queueTask.id);
    }
    return queueTask;
  },
  addTasks: async (payloads) => {
    const results: QueueTask[] = [];
    for (const payload of payloads) {
      // eslint-disable-next-line no-await-in-loop
      const created = await get().addTask(payload);
      results.push(created);
    }
    return results;
  },
  pauseTask: (id) => {
    closeStream(id);
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, status: "paused" } : task,
      ),
    }));
  },
  resumeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              status: task.progress >= 100 ? "success" : "running",
            }
          : task,
      ),
    }));
    const current = get().tasks.find((task) => task.id === id);
    if (current && current.progress < 100) {
      startStream(id);
    }
  },
  cancelTask: (id) => {
    closeStream(id);
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, status: "cancelled" } : task,
      ),
    }));
  },
  updateProgress: (event) => {
    const incomingSegments = (event as unknown as { segments?: TaskSegment[] }).segments;
    const phase = (event as unknown as { phase?: string }).phase;
    let completed: QueueTask | null = null;
    set((state) => ({
      tasks: state.tasks.map((task) => {
        if (task.id !== event.id) return task;
        const progress = Math.min(100, event.progress ?? task.progress);
        const status =
          event.status ?? (progress >= 100 ? ("success" as QueueStatus) : task.status);
        const segments = incomingSegments ?? task.segments;
        const updated: QueueTask = {
          ...task,
          progress,
          eta: event.eta ?? task.eta,
          status,
          segments,
          phase: phase ?? task.phase,
        };
        if (status === "success" || status === "failed" || status === "cancelled") {
          closeStream(task.id);
        }
        if (status === "success" && !completedSet.has(task.id)) {
          completedSet.add(task.id);
          completed = updated;
        }
        if (status === "failed") {
          useDownloadsStore.getState().markFailed(task.id);
        }
        return updated;
      }),
    }));
    if (completed) {
      useDownloadsStore.getState().addFromTask(completed);
    }
  },
  setStatus: (id, status) => {
    if (status === "success" || status === "failed" || status === "cancelled") {
      closeStream(id);
    }
    set((state) => ({
      tasks: state.tasks.map((task) => {
        if (task.id !== id) return task;
        const updated: QueueTask = { ...task, status };
        if (status === "success" && !completedSet.has(id)) {
          completedSet.add(id);
          useDownloadsStore.getState().addFromTask(updated);
        }
        if (status === "failed") {
          useDownloadsStore.getState().markFailed(id);
        }
        return updated;
      }),
    }));
  },
  retrySegment: async (taskId, segmentId) => {
    await retryTaskSegment(taskId, segmentId);
    set((state) => ({
      tasks: state.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const segments = task.segments?.map((segment) => {
          if (segment.id !== segmentId) return segment;
          const updatedSegment: TaskSegment = {
            ...segment,
            status: "queued",
            progress: 0,
            canRetry: false,
            eta: "--",
          };
          return updatedSegment;
        });
        return {
          ...task,
          status: "queued",
          segments,
        };
      }),
    }));
    startStream(taskId);
  },
  applyTemplateToTask: (taskId, profile) =>
    set((state) => ({
      tasks: state.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const mergedParams = { ...task.params, ...profile };
        const performance = computePerformance(mergedParams);
        return {
          ...task,
          params: mergedParams,
          summary: summaryFromParams(mergedParams),
          performance,
        };
      }),
    })),
  addLocalizationPipeline: async (input) => {
    const { dubbing, burnIn } = createLocalizationPipeline(input.subtitleTasks, {
      voiceMap: input.voiceMap,
      provider: input.provider,
      speed: input.speed,
      pitch: input.pitch,
      outDir: input.outDir,
      sourceVideo: input.sourceVideo,
      codec: input.codec,
      resolution: input.resolution,
      mixDubbing: input.mixDubbing,
    });

    const payloads: TaskPayload[] = [...dubbing, ...burnIn].map((task) => ({
      title: task.title,
      preset: "localization",
      params: {
        kind: task.kind,
        ...task.params,
        dependsOn: task.dependsOn,
      },
    }));

    await get().addTasks(payloads);

    return {
      dubs: dubbing.map((task) => ({ id: task.id, language: task.params.language })),
      burns: burnIn.map((task) => ({ id: task.id, language: task.params.language })),
    };
  },
}));

export async function syncTask(id: string) {
  try {
    const task = await fetchTask(id);
    useQueueStore.setState((state) => ({
      tasks: state.tasks.map((item) => (item.id === id ? toQueueTask(task) : item)),
    }));
    if (task.status === "running" || task.status === "queued") {
      startStream(task.id);
    } else {
      closeStream(task.id);
    }
  } catch (error) {
    console.error("[queue] syncTask failed", error);
  }
}

