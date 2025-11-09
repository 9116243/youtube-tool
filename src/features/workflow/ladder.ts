import type { LadderProfile } from "@/lib/types";

export const LADDER_PRESETS: LadderProfile[] = [
  {
    name: "YouTube-like",
    codec: "h264",
    mode: "two-pass",
    preset: "slow",
    steps: [
      { res: "480p", bitrateKbps: 1800, maxrateKbps: 2200 },
      { res: "720p", bitrateKbps: 3500, maxrateKbps: 4200 },
      { res: "1080p", bitrateKbps: 6000, maxrateKbps: 7200 },
      { res: "1440p", bitrateKbps: 10000, maxrateKbps: 12000 },
      { res: "2160p", bitrateKbps: 20000, maxrateKbps: 24000 },
    ],
  },
  {
    name: "Twitch-like",
    codec: "h264",
    mode: "crf",
    crf: 20,
    preset: "fast",
    steps: [
      { res: "720p", bitrateKbps: 4500 },
      { res: "1080p", bitrateKbps: 6500 },
    ],
  },
  {
    name: "Archival Master",
    codec: "hevc",
    mode: "two-pass",
    preset: "slower",
    steps: [
      { res: "1080p", bitrateKbps: 10000, maxrateKbps: 12000 },
      { res: "2160p", bitrateKbps: 35000, maxrateKbps: 42000 },
    ],
  },
];

export function cloneLadderProfile(profile: LadderProfile): LadderProfile {
  return {
    ...profile,
    steps: profile.steps.map((step) => ({ ...step })),
  };
}

