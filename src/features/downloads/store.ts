import { create } from "zustand";

import type { Task } from "@/lib/types";
import { formatBitrate, formatDuration, generatePlaceholderCover, prettyCodec } from "@/lib/utils";

export type DownloadStatus = "processing" | "ready" | "failed";

export interface DownloadItem {
  id: string;
  title: string;
  language: string;
  format: string;
  container: string;
  durationSeconds: number;
  size: string;
  status: DownloadStatus;
  cover: string;
  createdAt: string;
  tags: string[];
  resolution: string;
  codec: string;
  hdr: "none" | "pq" | "hlg";
  bitrate: string;
  profile?: Record<string, unknown>;
  subtitleLanguages?: string[];
}

export interface DownloadsStore {
  items: DownloadItem[];
  search: string;
  statusFilter: DownloadStatus | "all";
  setSearch: (value: string) => void;
  setStatusFilter: (value: DownloadsStore["statusFilter"]) => void;
  addOrUpdate: (item: DownloadItem) => void;
  addFromTask: (task: Task) => void;
  markFailed: (id: string) => void;
  remove: (id: string) => void;
}

const INITIAL_ITEMS: DownloadItem[] = [
  {
    id: "dl-4021",
    title: "Workflow Launch Trailer",
    language: "en-US",
    format: "MP4 / 4K",
    container: "MP4",
    durationSeconds: 320,
    size: "1.1 GB",
    status: "ready",
    cover: generatePlaceholderCover("dl-4021"),
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    tags: ["EN-US", "4K", formatDuration(320)],
    resolution: "2160p",
    codec: "H.265",
    hdr: "pq",
    bitrate: "20.0 Mbps",
    subtitleLanguages: ["EN-US"],
  },
  {
    id: "dl-3988",
    title: "Data Compliance Briefing",
    language: "zh-CN",
    format: "MP4 / 1080P",
    container: "MP4",
    durationSeconds: 540,
    size: "860 MB",
    status: "processing",
    cover: generatePlaceholderCover("dl-3988"),
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    tags: ["ZH-CN", "1080P", formatDuration(540)],
    resolution: "1080p",
    codec: "H.264",
    hdr: "none",
    bitrate: "8.5 Mbps",
    subtitleLanguages: ["ZH-CN"],
  },
  {
    id: "dl-3955",
    title: "EMEA Campaign Highlights",
    language: "de-DE",
    format: "MKV / 720P",
    container: "MKV",
    durationSeconds: 260,
    size: "420 MB",
    status: "failed",
    cover: generatePlaceholderCover("dl-3955"),
    createdAt: new Date(Date.now() - 1000 * 60 * 560).toISOString(),
    tags: ["DE-DE", "720P", formatDuration(260)],
    resolution: "720p",
    codec: "H.264",
    hdr: "none",
    bitrate: "4.2 Mbps",
    subtitleLanguages: ["DE-DE"],
  },
];

function inferDurationSeconds(params: Record<string, unknown>): number {
  const shotCount = Number(params.shotCount ?? 14);
  const frameRate = Number(params.frameRate ?? 0.5);
  const segmented = Boolean(params.segmented ?? false);
  const maxSegmentDuration = Number(params.maxSegmentDuration ?? 5);
  const brollDensity = (params.brollDensity as string) ?? "balanced";
  const resolution = ((params.outputResolution as string) ?? "720p").toLowerCase();

  const densityMultiplier =
    brollDensity === "rich" ? 1.4 : brollDensity === "minimal" ? 0.8 : 1.0;
  const resolutionMultiplier =
    resolution === "2160p"
      ? 1.4
      : resolution === "1440p"
        ? 1.25
        : resolution === "1080p"
          ? 1.15
          : resolution === "360p"
            ? 0.92
            : 1.0;

  let seconds = shotCount * (6 - Math.min(frameRate * 2, 3));
  seconds *= densityMultiplier * resolutionMultiplier;
  if (segmented) {
    seconds += Math.max(0, maxSegmentDuration) * 10;
  }

  return Math.max(60, Math.round(seconds));
}

export const useDownloadsStore = create<DownloadsStore>((set, get) => ({
  items: INITIAL_ITEMS,
  search: "",
  statusFilter: "all",
  setSearch: (value) => set({ search: value }),
  setStatusFilter: (value) => set({ statusFilter: value }),
  addOrUpdate: (item) =>
    set((state) => {
      const index = state.items.findIndex((existing) => existing.id === item.id);
      if (index === -1) {
        return { items: [item, ...state.items] };
      }
      const next = state.items.slice();
      next[index] = { ...next[index], ...item };
      return { items: next };
    }),
  addFromTask: (task) =>
    set((state) => {
      const existing = state.items.find((item) => item.id === task.id);
      const params = task.params ?? {};
      const language = (params.language as string) ?? "en-US";
      const outputRes = (params.outputResolution as string) ?? "1080p";
      const container = ((params.container as string) ?? "mp4").toUpperCase();
      const durationSeconds = inferDurationSeconds(params);
      const codec = prettyCodec((params.encoder as string) ?? "h264");
      const hdrMode = (params.hdrMode as string) ?? "none";
      const bitrateValue =
        typeof params.videoBitrateKbps === "number" ? params.videoBitrateKbps : undefined;
      const bitrateLabel = bitrateValue ? formatBitrate(bitrateValue) : "Auto";
      const subtitleTracks = Array.isArray(params.subtitleTracks)
        ? (params.subtitleTracks as Record<string, unknown>[])
        : [];
      const subtitleLanguages = subtitleTracks
        .map((track) => {
          const lang = track.language ?? track.lang;
          return typeof lang === "string" ? lang.toUpperCase() : undefined;
        })
        .filter((value): value is string => Boolean(value));

      const base: DownloadItem = {
        id: task.id,
        title: task.title ?? `Task ${task.id.slice(0, 6)}`,
        language,
        format: `${container} / ${outputRes.toUpperCase()}`,
        container,
        durationSeconds,
        size: `${Math.max(240, Math.round(durationSeconds * 2.5)).toLocaleString()} MB`,
        status: task.status === "failed" ? "failed" : "ready",
        cover: generatePlaceholderCover(task.id),
        createdAt: task.createdAt ?? new Date().toISOString(),
        tags: [
          language.toUpperCase(),
          outputRes.toUpperCase(),
          formatDuration(durationSeconds),
        ],
        resolution: outputRes.toUpperCase(),
        codec,
        hdr: hdrMode === "pq" ? "pq" : hdrMode === "hlg" ? "hlg" : "none",
        bitrate: bitrateLabel,
        profile: task.params,
        subtitleLanguages: subtitleLanguages.length ? subtitleLanguages : undefined,
      };

      if (!existing) {
        return { items: [base, ...state.items] };
      }

      return {
        items: state.items.map((item) => (item.id === task.id ? { ...item, ...base } : item)),
      };
    }),
  markFailed: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "failed",
            }
          : item,
      ),
    })),
  remove: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
}));
