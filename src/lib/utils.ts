import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number): string {
  if (value < 1000) {
    return value.toString();
  }
  if (value < 1_000_000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const two = (n: number) => n.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${two(minutes)}:${two(seconds)}`;
  }
  return `${two(minutes)}:${two(seconds)}`;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

const FALLBACK_PALETTE = [
  ["#0ea5e9", "#6366f1"],
  ["#22d3ee", "#16a34a"],
  ["#f97316", "#ec4899"],
  ["#a855f7", "#3b82f6"],
  ["#facc15", "#ef4444"],
];

export function generatePlaceholderCover(seed: string, accent?: string): string {
  const hash = hashString(seed);
  const palette = FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
  const primary = accent ?? palette[0];
  const secondary = palette[1];
  const angle = (hash % 360).toString();
  const blobX = 20 + (hash % 60);
  const blobY = 30 + ((hash >> 3) % 40);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="grad-${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${primary}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="${secondary}" stop-opacity="0.9"/>
      </linearGradient>
      <radialGradient id="glow-${hash}" cx="70%" cy="25%" r="65%">
        <stop offset="0%" stop-color="${secondary}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${secondary}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="320" height="180" fill="url(#grad-${hash})" transform="rotate(${angle} 160 90)"/>
    <ellipse cx="${blobX}%" cy="${blobY}%" rx="120" ry="90" fill="url(#glow-${hash})"/>
    <rect x="24" y="120" width="220" height="18" rx="9" fill="rgba(15,23,42,0.45)" />
    <rect x="24" y="144" width="140" height="12" rx="6" fill="rgba(15,23,42,0.35)" />
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function splitPlan(totalMinutes: number, segmentMaxMinutes: number) {
  if (segmentMaxMinutes <= 0) {
    return { segments: 1, lastSegmentMinutes: totalMinutes };
  }
  const segments = Math.max(1, Math.ceil(totalMinutes / segmentMaxMinutes));
  const fullSegmentMinutes = Math.max(segmentMaxMinutes, 1);
  const lastSegmentMinutes =
    segments > 1 ? totalMinutes - fullSegmentMinutes * (segments - 1) : totalMinutes;
  return {
    segments,
    lastSegmentMinutes: Number(lastSegmentMinutes.toFixed(2)),
  };
}

export function formatBitrate(valueKbps: number | "auto") {
  if (valueKbps === "auto") return "Auto";
  if (!Number.isFinite(valueKbps)) return "n/a";
  if (valueKbps >= 1000) {
    return `${(valueKbps / 1000).toFixed(2)} Mbps`;
  }
  return `${Math.round(valueKbps)} Kbps`;
}

export function prettyCodec(codec: string) {
  const map: Record<string, string> = {
    h264: "H.264",
    h264_nvenc: "H.264 NVENC",
    h264_qsv: "H.264 QSV",
    hevc: "H.265",
    hevc_nvenc: "H.265 NVENC",
    hevc_qsv: "H.265 QSV",
    hevc_amf: "H.265 AMF",
    av1: "AV1",
    av1_nvenc: "AV1 NVENC",
    libx264: "H.264 (CPU)",
    libx265: "H.265 (CPU)",
  };
  return map[codec] ?? codec.toUpperCase();
}

export function prettyContainer(container: string) {
  switch (container) {
    case "mp4":
      return "MP4";
    case "mkv":
      return "Matroska";
    case "mov":
      return "QuickTime";
    default:
      return container.toUpperCase();
  }
}
