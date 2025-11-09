import { useMemo } from "react";
import { FileText, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from "@/components/ui/PageHeader";
import type { QAReport } from "@/lib/types";
import { formatBitrate, formatDuration, prettyCodec, prettyContainer } from "@/lib/utils";

const MOCK_REPORTS: QAReport[] = [
  {
    id: "rpt-01",
    taskId: "wf-123",
    createdAt: new Date().toISOString(),
    summary: "4K delivery with HDR10 mastering.",
    metrics: { vmaf: 96.4, ssim: 0.985, psnr: 44.3 },
    profile: {
      outputResolution: "2160p",
      analysisResolution: "360p",
      encoder: "hevc_nvenc",
      container: "mkv",
      videoBitrateKbps: 20000,
      maxBitrateKbps: 24000,
      gopSeconds: 2,
      profile: "main10",
      level: "5.2",
      hdrMode: "pq",
      hdrMeta: {},
      colorSpace: "rec2020",
      transfer: "pq",
      toneMap: "bt2390",
      upscale: "none",
      denoise: "nlmeans",
      audioCodec: "aac",
      audioBitrateKbps: 384,
      subtitleBurnIn: false,
      subtitleMode: "soft",
      subtitleTracks: [],
      audioLoudness: "ebu-r128",
      audioChannels: "5.1",
      audioSampleRate: 48000,
      dialogueEnhance: "voice-boost-1",
    },
  },
  {
    id: "rpt-02",
    taskId: "wf-456",
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    summary: "Social cut - SDR 1080p encode for YouTube.",
    metrics: { vmaf: 90.1, ssim: 0.963, psnr: 39.5 },
    profile: {
      outputResolution: "1080p",
      analysisResolution: "360p",
      encoder: "h264_nvenc",
      container: "mp4",
      videoBitrateKbps: 6000,
      maxBitrateKbps: 7200,
      gopSeconds: 2,
      profile: "high",
      level: "4.2",
      hdrMode: "none",
      hdrMeta: {},
      colorSpace: "rec709",
      transfer: "gamma2.4",
      toneMap: "off",
      upscale: "none",
      denoise: "off",
      audioCodec: "aac",
      audioBitrateKbps: 256,
      subtitleBurnIn: false,
      subtitleMode: "off",
      subtitleTracks: [],
      audioLoudness: "off",
      audioChannels: "stereo",
      audioSampleRate: 48000,
      dialogueEnhance: "off",
    },
  },
];

function buildMarkdown(report: QAReport) {
  const lines = [
    `# QA Report ${report.id}`,
    `- Task: ${report.taskId}`,
    `- Created: ${new Date(report.createdAt).toLocaleString()}`,
    `- Summary: ${report.summary}`,
    "",
    "## Metrics",
    `- VMAF: ${report.metrics.vmaf ?? "n/a"}`,
    `- SSIM: ${report.metrics.ssim ?? "n/a"}`,
    `- PSNR: ${report.metrics.psnr ?? "n/a"}`,
    "",
    "## Profile",
    `- Resolution: ${report.profile.outputResolution}`,
    `- Encoder: ${report.profile.encoder}`,
    `- Container: ${report.profile.container}`,
    `- Bitrate: ${formatBitrate(report.profile.videoBitrateKbps ?? 0)}`,
    `- HDR: ${report.profile.hdrMode}`,
  ];
  return lines.join("\n");
}

function exportMarkdown(report: QAReport) {
  const content = buildMarkdown(report);
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.id}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ReportCenterPage() {
  const reports = useMemo(() => MOCK_REPORTS, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Report Center"
        description="Archive QA assessment packets, export markdown summaries, and prepare delivery notes."
        actions={<Badge variant="outline">Beta</Badge>}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => (
          <Card key={report.id} className="border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base text-white">
                <span>{report.id}</span>
                <Badge variant={report.metrics.vmaf && report.metrics.vmaf > 93 ? "default" : "secondary"}>
                  VMAF {report.metrics.vmaf?.toFixed(1) ?? "--"}
                </Badge>
              </CardTitle>
              <CardDescription>
                {new Date(report.createdAt).toLocaleString()} - {report.summary}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-200">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-400">Resolution</p>
                  <p>{report.profile.outputResolution}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Codec</p>
                  <p>{prettyCodec(report.profile.encoder)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Bitrate</p>
                  <p>{formatBitrate(report.profile.videoBitrateKbps ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Container</p>
                  <p>{prettyContainer(report.profile.container)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Audio</p>
                  <p>
                    {report.profile.audioCodec.toUpperCase()} 路 {report.profile.audioChannels} 路 {report.profile.audioSampleRate / 1000}kHz
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Estimated length</p>
                  <p>{formatDuration(360)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportMarkdown(report)}>
                  <FileText className="mr-2 h-3.5 w-3.5" /> Markdown
                </Button>
                <Button variant="outline" size="sm">
                  <Printer className="mr-2 h-3.5 w-3.5" /> Export PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ReportCenterPage;

