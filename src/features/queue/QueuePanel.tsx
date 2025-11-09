import { useEffect } from "react";
import { motion } from "framer-motion";
import { PauseOctagon, Play, RefreshCw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDuration, splitPlan } from "@/lib/utils";
import { useQueueStore } from "@/features/queue/store";

const STATUS_LABEL: Record<string, string> = {
  running: "In Progress",
  queued: "Queued",
  paused: "Paused",
  success: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<string, string> = {
  running: "border-cyan-400/50 bg-cyan-500/15 text-cyan-100",
  queued: "border-indigo-400/40 bg-indigo-500/15 text-indigo-100",
  paused: "border-amber-400/45 bg-amber-500/15 text-amber-100",
  success: "border-emerald-400/45 bg-emerald-500/15 text-emerald-100",
  failed: "border-rose-400/45 bg-rose-500/15 text-rose-100",
  cancelled: "border-rose-400/45 bg-rose-500/15 text-rose-100",
};

const BAR_GLOW: Record<string, string> = {
  success: "shadow-[0_0_24px_rgba(34,197,94,0.55)]",
  failed: "shadow-[0_0_24px_rgba(248,113,113,0.5)]",
  cancelled: "shadow-[0_0_24px_rgba(248,113,113,0.5)]",
  default: "shadow-[0_0_24px_rgba(56,189,248,0.55)]",
};

const SEGMENT_FILL: Record<string, string> = {
  queued: "bg-slate-500/35",
  running: "bg-cyan-400/70",
  success: "bg-emerald-400/80",
  failed: "bg-rose-500/80",
  cancelled: "bg-rose-400/70",
  paused: "bg-amber-400/70",
  retrying: "bg-indigo-400/70",
};

export function QueuePanel() {
  const tasks = useQueueStore((state) => state.tasks);
  const fetchAll = useQueueStore((state) => state.fetchAll);
  const pause = useQueueStore((state) => state.pauseTask);
  const resume = useQueueStore((state) => state.resumeTask);
  const cancel = useQueueStore((state) => state.cancelTask);
  const retrySegment = useQueueStore((state) => state.retrySegment);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  if (!tasks.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-12 text-center text-sm text-slate-300 backdrop-blur-xl">
        Queue is clear. Submit a workflow from the AI Workflow page and progress will appear here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {tasks.map((task) => {
        const statusClass =
          STATUS_TONE[task.status] ?? "border-slate-500/40 bg-slate-500/15 text-slate-100";
        const isRunning = task.status === "running" || task.status === "queued";
        const isPaused = task.status === "paused";
        const isFinished =
          task.status === "success" || task.status === "failed" || task.status === "cancelled";
        const barGlow =
          BAR_GLOW[task.status as keyof typeof BAR_GLOW] ?? BAR_GLOW.default;
        const params = task.params as Record<string, unknown>;
        const estimatedMinutesParam =
          typeof params?.["estimateMinutes"] === "number"
            ? (params["estimateMinutes"] as number)
            : typeof params?.["estimateDurationMinutes"] === "number"
              ? (params["estimateDurationMinutes"] as number)
              : typeof params?.["durationMinutes"] === "number"
                ? (params["durationMinutes"] as number)
                : undefined;
        const hasRealSegments = (task.segments?.length ?? 0) > 0;
        let displaySegments = hasRealSegments ? task.segments ?? [] : [];
        if (!displaySegments.length && task.split && task.segmentMaxMinutes) {
          const totalMinutes =
            estimatedMinutesParam && estimatedMinutesParam > 0
              ? estimatedMinutesParam
              : (task.segmentMaxMinutes ?? 5) * 3;
          const plan = splitPlan(totalMinutes, task.segmentMaxMinutes ?? 5);
          displaySegments = Array.from({ length: plan.segments }, (_, index) => {
            const status =
              index === 0
                ? (task.status === "failed"
                    ? "failed"
                    : task.status === "success"
                      ? "success"
                      : "running")
                : "queued";
            const duration =
              index === plan.segments - 1
                ? plan.lastSegmentMinutes
                : task.segmentMaxMinutes ?? plan.lastSegmentMinutes;
            return {
              id: `${task.id}-derived-${index}`,
              index,
              durationMinutes: Number(duration.toFixed(2)),
              progress: index === 0 ? task.progress : 0,
              status,
              eta: "--",
              canRetry: status === "failed",
            };
          });
        }
        const hasSegments = displaySegments.length > 0;

        return (
          <motion.div
            key={task.id}
            layout
            className="rounded-3xl border border-white/10 bg-white/5/80 p-6 shadow-[0_18px_48px_-28px_rgba(14,116,233,0.55)] backdrop-blur-xl transition-colors"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-white">{task.title}</p>
                <p className="text-xs text-slate-300">
                  {task.summary || "Custom task"} | Started {new Date(task.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <Badge
                className={cn(
                  "border px-2.5 py-1 text-xs font-medium uppercase tracking-wide",
                  statusClass,
                )}
              >
                {STATUS_LABEL[task.status] ?? task.status}
              </Badge>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>{Math.round(task.progress)}%</span>
                <span>
                  {task.phase === "stitch" ? "Stitching segments..." : "ETA:"}{" "}
                  {task.eta && task.eta !== "--" ? task.eta : "calculating..."}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className={cn("absolute inset-y-0 left-0 rounded-full", barGlow)}
                  style={{
                    background:
                      task.status === "success"
                        ? "linear-gradient(90deg, rgba(34,197,94,0.95), rgba(16,185,129,0.85))"
                        : task.status === "failed" || task.status === "cancelled"
                        ? "linear-gradient(90deg, rgba(248,113,113,0.95), rgba(239,68,68,0.85))"
                        : "linear-gradient(90deg, rgba(14,165,233,0.95), rgba(14,116,233,0.85), rgba(168,85,247,0.8))",
                    backgroundSize: "200% 100%",
                    backgroundPosition: "0% 0%",
                  }}
                  animate={{
                    width: `${Math.max(5, task.progress)}%`,
                    backgroundPosition: ["0% 0%", "200% 0%"],
                  }}
                  transition={{
                    width: { duration: 0.4, ease: "easeOut" },
                    backgroundPosition: { repeat: Infinity, duration: 1.8, ease: "linear" },
                  }}
                />
              </div>
            </div>

            {task.performance ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                <span>≈ {formatDuration(task.performance.renderSeconds)} render</span>
                <span>{task.performance.vramMB} MB VRAM</span>
                {task.performance.notes?.map((note) => (
                  <Badge
                    key={note}
                    variant="secondary"
                    className="border border-white/10 bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200"
                  >
                    {note}
                  </Badge>
                ))}
              </div>
            ) : null}

            {hasSegments ? (
              <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                <p className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                  Segments
                </p>
                <div className="flex items-center gap-1" role="list" aria-label="Segment progress">
                  {displaySegments.map((segment) => {
                    const fill =
                      SEGMENT_FILL[segment.status as keyof typeof SEGMENT_FILL] ??
                      "bg-slate-500/35";
                    const width =
                      segment.status === "success"
                        ? "100%"
                        : segment.status === "failed"
                          ? "100%"
                          : `${Math.max(8, Math.round(segment.progress))}%`;
                    return (
                      <div
                        key={`${segment.id}-bar`}
                        role="listitem"
                        className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10"
                        aria-label={`Segment ${segment.index + 1} ${segment.status}`}
                      >
                        <span
                          className={cn("absolute inset-y-0 left-0 rounded-full transition-all", fill)}
                          style={{ width }}
                        />
                        <span className="sr-only">
                          Segment {segment.index + 1} {segment.status} {Math.round(segment.progress)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {displaySegments.map((segment) => {
                    const segmentTone =
                      STATUS_TONE[segment.status] ??
                      "border-slate-500/40 bg-slate-500/15 text-slate-100";
                    const segmentGlow =
                      BAR_GLOW[segment.status as keyof typeof BAR_GLOW] ?? BAR_GLOW.default;
                    const canRetry = hasRealSegments && segment.status === "failed";
                    return (
                      <div
                        key={segment.id}
                        className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-200">
                          <span>
                            Segment {segment.index + 1} ({segment.durationMinutes}m)
                          </span>
                          <Badge
                            className={cn("border px-2 py-0.5 text-[10px] uppercase tracking-wide", segmentTone)}
                          >
                            {STATUS_LABEL[segment.status] ?? segment.status}
                          </Badge>
                        </div>
                        <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                          <motion.div
                            className={cn("absolute inset-y-0 left-0 rounded-full", segmentGlow)}
                            style={{
                              background:
                                segment.status === "success"
                                  ? "linear-gradient(90deg, rgba(34,197,94,0.95), rgba(16,185,129,0.85))"
                                  : segment.status === "failed"
                                    ? "linear-gradient(90deg, rgba(248,113,113,0.95), rgba(239,68,68,0.85))"
                                    : "linear-gradient(90deg, rgba(14,165,233,0.95), rgba(14,116,233,0.85), rgba(168,85,247,0.8))",
                            }}
                            animate={{
                              width: `${Math.max(5, segment.progress)}%`,
                            }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>{Math.round(segment.progress)}%</span>
                          <span>{segment.eta ?? "--"}</span>
                        </div>
                        {canRetry ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1 text-amber-200 hover:text-amber-100"
                            onClick={() => retrySegment(task.id, segment.id)}
                          >
                            <RefreshCw className="h-3 w-3" />
                            Retry segment
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {isRunning ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => pause(task.id)}
                    aria-label={`Pause task ${task.title}`}
                  >
                    <PauseOctagon className="mr-1.5 h-3.5 w-3.5" />
                    Pause
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-300 hover:text-rose-100"
                    onClick={() => cancel(task.id)}
                    aria-label={`Cancel task ${task.title}`}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Cancel
                  </Button>
                </>
              ) : null}
              {isPaused ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resume(task.id)}
                    aria-label={`Resume task ${task.title}`}
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Resume
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-300 hover:text-rose-100"
                    onClick={() => cancel(task.id)}
                    aria-label={`Cancel task ${task.title}`}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Cancel
                  </Button>
                </>
              ) : null}
              {isFinished ? (
                <Button variant="ghost" size="sm" className="text-slate-400" disabled>
                  Completed
                </Button>
              ) : null}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default QueuePanel;
