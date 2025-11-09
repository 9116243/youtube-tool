import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/ui/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { fetchQaStatus, startQaJob } from "@/lib/api";
import type { QAJob, QAMetric } from "@/lib/types";
import { runQaMock } from "@/lib/qaMock";

const METRIC_OPTIONS: Array<{ value: QAMetric; label: string }> = [
  { value: "vmaf", label: "VMAF" },
  { value: "ssim", label: "SSIM" },
  { value: "psnr", label: "PSNR" },
];

const WINDOW_OPTIONS = [
  { value: "full", label: "Full duration" },
  { value: "first-60s", label: "First 60 seconds" },
  { value: "sample-10x1s", label: "10x1s samples" },
];

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function QALabPage() {
  const { toast } = useToast();
  const [testUrl, setTestUrl] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [metrics, setMetrics] = useState<QAMetric[]>(["vmaf", "ssim", "psnr"]);
  const [windowSize, setWindowSize] = useState<QAJob["window"]>("full");
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<QAJob | null>(null);
  const [mockNotes, setMockNotes] = useState<string[]>([]);

  const toggleMetric = (metric: QAMetric) => {
    setMetrics((prev) =>
      prev.includes(metric) ? prev.filter((item) => item !== metric) : [...prev, metric],
    );
  };

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const interval = window.setInterval(() => {
      void fetchQaStatus(job.id)
        .then((result) => {
          setJob(result);
          if (result.status !== "running") {
            clearInterval(interval);
            toast({ title: "QA analysis", description: "Quality metrics ready." });
          }
        })
        .catch(() => {
          clearInterval(interval);
        });
    }, 1000);
    return () => clearInterval(interval);
  }, [job, toast]);

  const handleSubmit = async () => {
    if (!testUrl.trim()) {
      toast({
        title: "Test source required",
        description: "Provide a sample (local path or URL) for analysis.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setMockNotes([]);
    try {
      const payload = {
        srcUrl: testUrl,
        refUrl: refUrl.trim() || undefined,
        metric: metrics.length ? metrics : ["vmaf"],
        window: windowSize,
      };
      const created = await startQaJob({ ...payload });
      if (created.status === "running") {
        setJob(created);
      } else {
        setJob(created);
      }
      toast({ title: "QA job queued", description: "Mock server is computing metrics." });
    } catch (error) {
      const mock = runQaMock({
        outputResolution: "1080p",
        analysisResolution: "360p",
        encoder: "h264",
        container: "mp4",
        videoBitrateKbps: 8000,
        maxBitrateKbps: 12000,
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
      });
      setMockNotes(mock.notes);
      setJob({
        id: "mock",
        srcUrl: testUrl,
        refUrl: refUrl,
        metric: metrics,
        window: windowSize,
        status: "success",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        result: {
          vmaf: mock.vmaf,
          ssim: mock.ssim,
          psnr: mock.psnr,
          chart: mock.chart,
        },
      });
      toast({
        title: "QA mock",
        description: (error as Error).message ?? "Backend unavailable, mock results generated.",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportJson = () => {
    if (!job?.result) return;
    downloadFile(
      `qa-report-${Date.now()}.json`,
      JSON.stringify(job.result, null, 2),
      "application/json",
    );
  };

  const exportCsv = () => {
    if (!job?.result?.chart) return;
    const header = "time,score";
    const rows = job.result.chart.map((point) => `${point.t},${point.score.toFixed(2)}`);
    downloadFile(`qa-chart-${Date.now()}.csv`, [header, ...rows].join("\n"), "text/csv");
  };

  const overall = useMemo(() => {
    if (!job?.result) return null;
    return {
      vmaf: job.result.vmaf,
      ssim: job.result.ssim,
      psnr: job.result.psnr,
    };
  }, [job]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="QA Laboratory"
        description="Compare encodes against references, inspect metrics, and archive QA evidence."
        actions={
          <Badge variant="secondary" className="text-xs">
            Experimental
          </Badge>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-white">Inputs</CardTitle>
          <CardDescription>Provide the test encode and optional reference source.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="test-input" className="text-xs uppercase">
                Test sample
              </Label>
              <Input
                id="test-input"
                placeholder="file:///path/to/test.mp4 or https://..."
                value={testUrl}
                onChange={(event) => setTestUrl(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref-input" className="flex items-center gap-2 text-xs uppercase">
                <Upload className="h-3.5 w-3.5 text-cyan-300" />
                Reference (optional)
              </Label>
              <Input
                id="ref-input"
                placeholder="Leave blank for no-reference estimate"
                value={refUrl}
                onChange={(event) => setRefUrl(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase">Metrics</Label>
              <div className="flex flex-wrap gap-3">
                {METRIC_OPTIONS.map((metric) => (
                  <div key={metric.value} className="flex items-center gap-2 text-sm text-slate-200">
                    <Checkbox
                      id={`metric-${metric.value}`}
                      checked={metrics.includes(metric.value)}
                      onCheckedChange={() => toggleMetric(metric.value)}
                    />
                    <Label htmlFor={`metric-${metric.value}`}>{metric.label}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase">Window</Label>
              <Select
                value={windowSize}
                onValueChange={(value: string) => setWindowSize(value as QAJob["window"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select analysis window" />
                </SelectTrigger>
                <SelectContent>
                  {WINDOW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-2xl bg-cyan-400 text-slate-950 shadow-[0_0_28px_rgba(14,165,233,0.6)] hover:bg-cyan-300"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Run QA
          </Button>
        </CardContent>
      </Card>

      {job ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Results</CardTitle>
            <CardDescription>
              {job.refUrl ? "Reference-based analysis" : "No-reference estimate"} - Window: {job.window}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {job.status === "running" ? (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </div>
            ) : null}

            {overall ? (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                  <p className="text-xs text-slate-400">VMAF</p>
                  <p className="text-3xl font-semibold text-white">{overall.vmaf?.toFixed(2) ?? "--"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                  <p className="text-xs text-slate-400">SSIM</p>
                  <p className="text-3xl font-semibold text-white">{overall.ssim?.toFixed(3) ?? "--"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                  <p className="text-xs text-slate-400">PSNR</p>
                  <p className="text-3xl font-semibold text-white">{overall.psnr?.toFixed(2) ?? "--"}</p>
                </div>
              </div>
            ) : null}

            {job.result?.chart ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase text-slate-400">Time series</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={exportJson}>
                      Export JSON
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportCsv}>
                      Export CSV
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {job.result.chart.map((point) => (
                    <div key={point.t} className="flex items-center gap-3 text-xs text-slate-300">
                      <span className="w-16">{point.t}s</span>
                      <div className="h-2 flex-1 overflow-hidden rounded bg-white/10">
                        <div
                          className="h-full rounded bg-cyan-400"
                          style={{ width: `${Math.min(100, (point.score / 100) * 100)}%` }}
                        />
                      </div>
                      <span>{point.score.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {mockNotes.length ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-200">
                <p className="mb-2 font-semibold">Mock notes</p>
                <ul className="space-y-1">
                  {mockNotes.map((note) => (
                    <li key={note}>- {note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default QALabPage;

