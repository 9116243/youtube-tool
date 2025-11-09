import type { RenderProfile } from "@/lib/types";

export interface MockQaResult {
  vmaf: number;
  ssim: number;
  psnr: number;
  chart: Array<{ t: number; score: number }>;
  notes: string[];
}

export function runQaMock(profile: RenderProfile): MockQaResult {
  const resolutionScore =
    profile.outputResolution === "2160p"
      ? 96
      : profile.outputResolution === "1440p"
        ? 93
        : profile.outputResolution === "1080p"
          ? 88
          : profile.outputResolution === "720p"
            ? 82
            : profile.outputResolution === "480p"
              ? 78
              : 74;

  const bitrate = typeof profile.videoBitrateKbps === "number" ? profile.videoBitrateKbps : 8000;
  const bitrateScore = Math.min(12, Math.max(0, Math.log10((bitrate || 1) / 900) * 8));
  const encoderBonus = profile.encoder.includes("av1")
    ? 4
    : profile.encoder.includes("hevc")
      ? 2.5
      : profile.encoder.includes("h264")
        ? 0
        : 1;
  const upscalePenalty = profile.upscale !== "none" ? -2 : 0;
  const denoiseBoost = profile.denoise === "nlmeans" ? 1.5 : profile.denoise === "hqdn3d" ? 0.8 : 0;

  const vmaf = Math.min(99, resolutionScore + bitrateScore + encoderBonus + upscalePenalty + denoiseBoost);
  const ssim = Math.min(1, 0.78 + (vmaf - 65) / 110);
  const psnr = Math.min(55, 32 + (vmaf - 60) * 0.35);

  const chart = Array.from({ length: 12 }, (_, index) => ({
    t: index * 10,
    score: Math.max(60, vmaf - Math.sin(index / 1.5) * 5 + Math.random() * 2),
  }));

  const notes: string[] = [];
  if (profile.hdrMode !== "none") {
    notes.push("HDR render detected. Ensure display pipeline supports PQ/HLG metadata.");
  }
  if (profile.upscale !== "none") {
    notes.push("Upscaling adds about 2% processing overhead in this estimate.");
  }
  if (profile.denoise !== "off") {
    notes.push("Denoise enabled, expect smoother low-light segments.");
  }

  return {
    vmaf: Number(vmaf.toFixed(2)),
    ssim: Number(ssim.toFixed(4)),
    psnr: Number(psnr.toFixed(2)),
    chart,
    notes,
  };
}
