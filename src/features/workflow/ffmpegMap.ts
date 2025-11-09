import { RECOMMENDED_BITRATES } from "@/features/workflow/presets";
import { resolveVideoBitrate } from "@/features/workflow/calc";
import type { LadderProfile, RenderProfile, OutputResolution, UpscaleMode } from "@/lib/types";

interface BuildOptions {
  outputName?: string;
  metadata?: Record<string, string>;
}

const ENCODER_MAP: Record<string, string> = {
  h264: "libx264",
  libx264: "libx264",
  h264_nvenc: "h264_nvenc",
  hevc: "libx265",
  libx265: "libx265",
  hevc_nvenc: "hevc_nvenc",
  av1: "libaom-av1",
  av1_nvenc: "av1_nvenc",
  h264_qsv: "h264_qsv",
  hevc_qsv: "hevc_qsv",
  hevc_amf: "hevc_amf",
};

const RESOLUTION_SCALE: Record<OutputResolution, string | null> = {
  "360p": "scale=-2:360",
  "480p": "scale=-2:480",
  "720p": "scale=-2:720",
  "1080p": "scale=-2:1080",
  "1440p": "scale=-2:1440",
  "2160p": "scale=-2:2160",
  source: null,
};

const UPSCALE_FILTER: Record<UpscaleMode, string | null> = {
  none: null,
  fsrcnnx: "fsrcnnx=weights=fsrcnnx_best",
  "realesrgan-x2": "realesrgan=model=anime_x2plus",
  "realesrgan-x4": "realesrgan=model=anime_x4plus",
};

const CONTAINER_EXTENSION = {
  mp4: "mp4",
  mkv: "mkv",
  mov: "mov",
};

const COLOR_FLAGS = {
  rec709: { space: "bt709", primaries: "bt709", trc: "bt709" },
  rec2020: { space: "bt2020nc", primaries: "bt2020", trc: "smpte2084" },
  p3: { space: "bt2020nc", primaries: "smpte432", trc: "gamma22" },
};

const TRANSFER_FLAGS = {
  "gamma2.2": "gamma22",
  "gamma2.4": "gamma24",
  hlg: "arib-std-b67",
  pq: "smpte2084",
};

export function buildFfmpegArgs(profile: RenderProfile, options: BuildOptions = {}): string[] {
  const encoder = ENCODER_MAP[profile.encoder] ?? "libx264";
  const videoFilters: string[] = [];

  const upscaleFilter = UPSCALE_FILTER[profile.upscale];
  if (upscaleFilter) {
    videoFilters.push(upscaleFilter);
  }

  const scaleFilter = RESOLUTION_SCALE[profile.outputResolution];
  if (scaleFilter) {
    videoFilters.push(scaleFilter);
  }

  if (profile.subtitleBurnIn) {
    videoFilters.push("subtitles=burn_in_placeholder.ass");
  }

  if (profile.toneMap !== "off") {
    videoFilters.push(`tonemap=${profile.toneMap}`);
  }

  if (profile.lut) {
    videoFilters.push(`lut3d='file=${profile.lut.url}'`);
  }

  const args: string[] = ["-y", "-i", "input-placeholder.mp4", "-c:v", encoder];

  if (profile.encoderPreset) {
    args.push("-preset", profile.encoderPreset);
  }

  if (videoFilters.length) {
    args.push("-vf", videoFilters.join(","));
  }

  const videoBitrate = resolveVideoBitrate(profile);
  if (videoBitrate > 0) {
    args.push("-b:v", `${videoBitrate}k`);
  } else if (profile.outputResolution !== "source") {
    const fallback = RECOMMENDED_BITRATES[profile.outputResolution];
    args.push("-b:v", `${fallback.target}k`);
  }

  if (typeof profile.maxBitrateKbps === "number" && profile.maxBitrateKbps > 0) {
    args.push("-maxrate", `${profile.maxBitrateKbps}k`);
  }

  if (typeof profile.gopSeconds === "number" && profile.gopSeconds > 0) {
    const gopFrames = Math.max(12, Math.round(profile.gopSeconds * 30));
    args.push("-g", `${gopFrames}`);
  }

  if (profile.profile) {
    args.push("-profile:v", profile.profile);
  }

  if (profile.level) {
    args.push("-level", profile.level);
  }

  const colorMeta = COLOR_FLAGS[profile.colorSpace] ?? COLOR_FLAGS.rec709;
  args.push("-colorspace", colorMeta.space);
  args.push("-color_primaries", colorMeta.primaries);
  const transferValue = TRANSFER_FLAGS[profile.transfer] ?? colorMeta.trc;
  args.push("-color_trc", transferValue);

  if (profile.hdrMode === "hlg") {
    args.push("-color_trc", "arib-std-b67");
  }

  if (profile.hdrMode === "pq") {
    args.push("-color_trc", "smpte2084");
  }

  if (profile.hdrMeta?.masteringDisplay) {
    args.push("-master_display", profile.hdrMeta.masteringDisplay);
  }

  if (
    typeof profile.hdrMeta?.maxCLL === "number" &&
    typeof profile.hdrMeta?.maxFALL === "number"
  ) {
    args.push("-max_cll", `${profile.hdrMeta.maxCLL},${profile.hdrMeta.maxFALL}`);
  }

  const audioFilters: string[] = [];
  if (profile.audioLoudness === "ebu-r128") {
    audioFilters.push("loudnorm=I=-23:LRA=7:TP=-2");
  }
  if (profile.dialogueEnhance === "voice-boost-1") {
    audioFilters.push("firequalizer=gain_entry='entry(200,2);entry(1500,1.5);entry(4000,-1)'");
  } else if (profile.dialogueEnhance === "voice-boost-2") {
    audioFilters.push("firequalizer=gain_entry='entry(150,3);entry(1200,2);entry(3500,-1)'");
  }

  args.push("-c:a", profile.audioCodec ?? "aac");
  if (profile.audioCodec !== "flac") {
    const audioBitrate =
      profile.audioBitrateKbps && profile.audioBitrateKbps > 0
        ? profile.audioBitrateKbps
        : 256;
    args.push("-b:a", `${audioBitrate}k`);
  }

  const channelMap = { mono: 1, stereo: 2, "5.1": 6 } as const;
  args.push("-ac", String(channelMap[profile.audioChannels] ?? 2));
  args.push("-ar", String(profile.audioSampleRate));

  if (audioFilters.length) {
    args.push("-filter:a", audioFilters.join(","));
  }

  args.push("-metadata", "title=AI Workflow Export");
  args.push("-metadata", "artist=Enterprise YouTube Suite");

  const outputExt = CONTAINER_EXTENSION[profile.container] ?? "mp4";
  const outputName = options.outputName ?? "output/task-id-placeholder";
  args.push(`${outputName}.${outputExt}`);

  return args;
}

export function buildLadderCommands(profile: RenderProfile, ladder: LadderProfile) {
  return ladder.steps.map((step, index) => {
    const stepProfile: RenderProfile = {
      ...profile,
      outputResolution: step.res as OutputResolution,
      videoBitrateKbps: ladder.mode === "crf" ? profile.videoBitrateKbps : step.bitrateKbps,
      maxBitrateKbps: step.maxrateKbps ?? profile.maxBitrateKbps,
    };

    const outputBase = `output/ladder-${index + 1}-${step.res}`;
    const pass2 = buildFfmpegArgs(stepProfile, { outputName: outputBase });

    if (ladder.mode === "two-pass") {
      const pass1 = [
        "-y",
        "-i",
        "input-placeholder.mp4",
        "-c:v",
        ENCODER_MAP[stepProfile.encoder] ?? "libx264",
        "-b:v",
        `${step.bitrateKbps}k`,
        "-pass",
        "1",
        "-an",
        "-f",
        "null",
        "NUL",
      ];
      pass2.splice(4, 0, "-pass", "2");
      pass2.splice(6, 0, "-passlogfile", outputBase);
      return { step, passes: [pass1, pass2] };
    }

    if (ladder.mode === "crf" && typeof ladder.crf === "number") {
      const insertIndex = pass2.length - 2;
      pass2.splice(insertIndex, 0, "-crf", String(ladder.crf));
      if (ladder.preset) {
        pass2.splice(insertIndex, 0, "-preset", ladder.preset);
      }
    }

    return { step, passes: [pass2] };
  });
}

