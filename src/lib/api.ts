import axios from "axios";

import { buildFfmpegArgs, buildLadderCommands } from "@/features/workflow/ffmpegMap";
import type {
  ProgressEvent,
  RenderProfile,
  Task,
  TaskPayload,
  TaskStatus,
  RendererCapabilities,
  QAJob,
  LadderProfile,
  SubtitleTrack,
} from "@/lib/types";
import { resolveVideoBitrate } from "@/features/workflow/calc";
import { RECOMMENDED_BITRATES } from "@/features/workflow/presets";

const API_BASE =
  import.meta.env.VITE_API_BASE && typeof import.meta.env.VITE_API_BASE === "string"
    ? import.meta.env.VITE_API_BASE
    : "http://localhost:4000/api";

export const SSE_URL = `${API_BASE.replace(/\/$/, "")}/sse/progress`;

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      console.error(
        "[API]",
        error.response?.status ?? "ERR",
        error.response?.data ?? error.message,
      );
    }
    return Promise.reject(error);
  },
);

function maybeExtractRenderProfile(params: Record<string, unknown>): RenderProfile | null {
  const {
    outputResolution,
    analysisResolution,
    encoder,
    container,
    videoBitrateKbps,
    maxBitrateKbps,
    gopSeconds,
    profile,
    level,
    hdrMode,
    hdrMeta,
    upscale,
    denoise,
    audioCodec,
    audioBitrateKbps,
    subtitleBurnIn,
    colorSpace,
    transfer,
    toneMap,
    audioLoudness,
    audioChannels,
    audioSampleRate,
    dialogueEnhance,
    encoderPreset,
    subtitleMode,
    subtitleStyle,
    subtitleTracks,
    lut,
  } = params;

  if (
    typeof outputResolution !== "string" ||
    typeof analysisResolution !== "string" ||
    typeof encoder !== "string" ||
    typeof container !== "string" ||
    (typeof videoBitrateKbps !== "number" && videoBitrateKbps !== "auto") ||
    typeof hdrMode !== "string" ||
    typeof colorSpace !== "string" ||
    typeof transfer !== "string" ||
    typeof toneMap !== "string" ||
    typeof upscale !== "string" ||
    typeof denoise !== "string" ||
    typeof audioCodec !== "string" ||
    typeof subtitleBurnIn !== "boolean"
  ) {
    return null;
  }

  const normalizedHdrMeta: RenderProfile["hdrMeta"] = {};
  if (typeof hdrMeta === "object" && hdrMeta !== null) {
    const input = hdrMeta as Record<string, unknown>;
    if (typeof input.masteringDisplay === "string") {
      normalizedHdrMeta.masteringDisplay = input.masteringDisplay;
    }
    if (typeof input.maxCLL === "number") {
      normalizedHdrMeta.maxCLL = input.maxCLL;
    }
    if (typeof input.maxFALL === "number") {
      normalizedHdrMeta.maxFALL = input.maxFALL;
    }
  }

  const normalizedSubtitleTracks: RenderProfile["subtitleTracks"] = Array.isArray(subtitleTracks)
    ? (subtitleTracks as Record<string, unknown>[]).reduce<SubtitleTrack[]>(
        (acc, track, index) => {
          if (typeof track !== "object" || track === null) return acc;
          const id = typeof track.id === "string" ? track.id : `sub-${index}`;
          const language =
            typeof track.language === "string" ? track.language : (track.lang as string | undefined);
          const path = typeof track.path === "string" ? track.path : undefined;
          if (!language || !path) return acc;
          acc.push({
            id,
            language,
            path,
            label: typeof track.label === "string" ? track.label : undefined,
          });
          return acc;
        },
        [],
      )
    : [];

  const normalizedSubtitleStyle = (() => {
    if (typeof subtitleStyle !== "object" || subtitleStyle === null) {
      return undefined;
    }
    const style = subtitleStyle as Record<string, unknown>;
    if (
      typeof style.font === "string" &&
      typeof style.size === "number" &&
      typeof style.color === "string" &&
      typeof style.outline === "string" &&
      typeof style.shadow === "string"
    ) {
      const position: "top" | "bottom" = style.position === "top" ? "top" : "bottom";
      return {
        font: style.font,
        size: style.size,
        color: style.color,
        outline: style.outline,
        shadow: style.shadow,
        position,
      };
    }
    return undefined;
  })();

  const normalizedLut =
    typeof lut === "object" &&
    lut !== null &&
    typeof (lut as Record<string, unknown>).name === "string" &&
    typeof (lut as Record<string, unknown>).url === "string"
      ? {
          name: (lut as Record<string, unknown>).name as string,
          url: (lut as Record<string, unknown>).url as string,
          type: "cube" as const,
        }
      : undefined;

  const profileResult: RenderProfile = {
    outputResolution: outputResolution as RenderProfile["outputResolution"],
    analysisResolution: analysisResolution as RenderProfile["analysisResolution"],
    encoder: encoder as RenderProfile["encoder"],
    container: container as RenderProfile["container"],
    videoBitrateKbps:
      videoBitrateKbps === "auto" ? "auto" : (videoBitrateKbps as number | "auto"),
    hdrMode: hdrMode as RenderProfile["hdrMode"],
    hdrMeta: normalizedHdrMeta,
    colorSpace: (colorSpace as RenderProfile["colorSpace"]) ?? "rec709",
    transfer: (transfer as RenderProfile["transfer"]) ?? "gamma2.4",
    toneMap: (toneMap as RenderProfile["toneMap"]) ?? "off",
    upscale: upscale as RenderProfile["upscale"],
    denoise: denoise as RenderProfile["denoise"],
    audioCodec: audioCodec as RenderProfile["audioCodec"],
    subtitleBurnIn,
    subtitleMode:
      (subtitleMode as RenderProfile["subtitleMode"]) ??
      (subtitleBurnIn ? "burn-in" : "off"),
    subtitleTracks: normalizedSubtitleTracks,
    subtitleStyle: normalizedSubtitleStyle,
    lut: normalizedLut,
    audioLoudness: (audioLoudness as RenderProfile["audioLoudness"]) ?? "off",
    audioChannels: (audioChannels as RenderProfile["audioChannels"]) ?? "stereo",
    audioSampleRate: (audioSampleRate as RenderProfile["audioSampleRate"]) ?? 48000,
    dialogueEnhance: (dialogueEnhance as RenderProfile["dialogueEnhance"]) ?? "off",
  };

  if (typeof maxBitrateKbps === "number") {
    profileResult.maxBitrateKbps = maxBitrateKbps;
  }
  if (typeof gopSeconds === "number") {
    profileResult.gopSeconds = gopSeconds;
  }
  if (typeof profile === "string") {
    profileResult.profile = profile;
  }
  if (typeof level === "string") {
    profileResult.level = level;
  }
  if (typeof audioBitrateKbps === "number") {
    profileResult.audioBitrateKbps = audioBitrateKbps;
  }
  if (typeof encoderPreset === "string") {
    profileResult.encoderPreset = encoderPreset as RenderProfile["encoderPreset"];
  }

  return profileResult;
}

export async function createTask(payload: TaskPayload): Promise<Task> {
  const profile = maybeExtractRenderProfile(payload.params);
  if (profile) {
    const ffmpegArgs = buildFfmpegArgs(profile);
    const resolvedBitrate =
      profile.videoBitrateKbps === "auto"
        ? RECOMMENDED_BITRATES[profile.outputResolution].target || resolveVideoBitrate(profile)
        : profile.videoBitrateKbps;

    // eslint-disable-next-line no-console
    console.groupCollapsed(`[mock-render] ${payload.title}`);
    // eslint-disable-next-line no-console
    console.log("profile", { ...profile, videoBitrateKbps: resolvedBitrate });
    // eslint-disable-next-line no-console
    console.log("ffmpeg", ffmpegArgs.join(" "));
    const ladder = payload.params?.ladderProfile as LadderProfile | undefined;
    if (ladder && payload.params?.deliveryMode === "ladder") {
      const ladderCommands = buildLadderCommands(profile, ladder);
      // eslint-disable-next-line no-console
      console.log("ladder", ladderCommands);
    }
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  const { data } = await apiClient.post<Task>("/tasks", payload);
  return data;
}

export async function fetchTasks(): Promise<Task[]> {
  const { data } = await apiClient.get<Task[]>("/tasks");
  return data;
}

export async function fetchTask(id: string): Promise<Task> {
  const { data } = await apiClient.get<Task>(`/tasks/${id}`);
  return data;
}

export async function retryTaskSegment(taskId: string, segmentId: string) {
  const { data } = await apiClient.post(`/tasks/${taskId}/retry`, { segmentId });
  return data;
}

export async function fetchRendererCapabilities(): Promise<RendererCapabilities> {
  const { data } = await apiClient.get<RendererCapabilities>("/capabilities");
  return data;
}

export async function startQaJob(payload: {
  srcUrl: string;
  refUrl?: string;
  metric: string[];
  window: "full" | "first-60s" | "sample-10x1s";
  profile?: RenderProfile;
}): Promise<QAJob> {
  const { data } = await apiClient.post<QAJob>("/qa/start", payload);
  return data;
}

export async function fetchQaStatus(id: string): Promise<QAJob> {
  const { data } = await apiClient.get<QAJob>(`/qa/status/${id}`);
  return data;
}

