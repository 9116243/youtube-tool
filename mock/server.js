/* eslint-disable no-console */
import http from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

const PORT = process.env.MOCK_PORT ? Number(process.env.MOCK_PORT) : 4000;
const HOST = process.env.MOCK_HOST ?? "localhost";
const DEFAULT_FAIL_RATE = process.env.MOCK_SEGMENT_FAIL
  ? Number(process.env.MOCK_SEGMENT_FAIL)
  : 0.08;

const tasks = new Map();
const qaJobs = new Map();
const activeStreams = new Map();

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

function handleOptions(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end();
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function inferDurationSeconds(params = {}) {
  const shotCount = Number(params.shotCount ?? 14);
  const frameRate = Number(params.frameRate ?? 0.5);
  const segmented = Boolean(params.segmented ?? false);
  const maxSegmentDuration = Number(params.maxSegmentDuration ?? 5);
  const density = (params.brollDensity ?? "balanced").toString();
  const resolution = (params.outputResolution ?? "1080p").toString().toLowerCase();

  const densityMultiplier =
    density === "rich" ? 1.35 : density === "minimal" ? 0.85 : 1.0;
  const resolutionMultiplier =
    resolution === "2160p"
      ? 1.45
      : resolution === "1440p"
        ? 1.25
        : resolution === "1080p"
          ? 1.1
          : resolution === "720p"
            ? 0.95
            : 0.9;

  let seconds = shotCount * (6 - Math.min(frameRate * 2, 3));
  seconds *= densityMultiplier * resolutionMultiplier;
  if (segmented) {
    seconds += Math.max(0, maxSegmentDuration) * 6;
  }

  return Math.max(60, Math.round(seconds));
}

function buildInitialSegments(taskId, totalMinutes, segmentMaxMinutes, split) {
  if (!split) {
    return [
      {
        id: `${taskId}-segment-1`,
        index: 0,
        durationMinutes: Number(Math.max(totalMinutes, 1).toFixed(2)),
        progress: 0,
        status: "running",
        eta: "--",
        canRetry: false,
      },
    ];
  }

  const maxMinutes = Math.max(4, segmentMaxMinutes || 6);
  const count = Math.max(2, Math.ceil(totalMinutes / maxMinutes));
  const segments = [];
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    const durationMinutes = isLast
      ? Math.max(2, totalMinutes - maxMinutes * (count - 1))
      : maxMinutes;
    segments.push({
      id: `${taskId}-segment-${index + 1}`,
      index,
      durationMinutes: Number(durationMinutes.toFixed(2)),
      progress: 0,
      status: index === 0 ? "running" : "queued",
      eta: "--",
      canRetry: false,
    });
  }
  return segments;
}

function startProgressStream(res, taskId) {
  const task = tasks.get(taskId);
  if (!task) {
    res.writeHead(404);
    res.end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  if (activeStreams.has(taskId)) {
    const previous = activeStreams.get(taskId);
    previous.cleanup();
  }

  const state = {
    interval: null,
    heartbeat: null,
  };

  const writeEvent = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const selectNextSegment = () => {
    const next = task.segments.find(
      (segment) => segment.status === "queued" || segment.status === "retrying",
    );
    if (next) {
      next.status = "running";
      next.progress = 0;
      next.eta = `${Math.max(8, Math.round(next.durationMinutes * 30))}s`;
    }
    return next;
  };

  const updateOverall = () => {
    if (task.phase === "stitch") {
      task.status = "running";
      task.progress = Math.min(99, 95 + task.stitchProgress * 0.05);
      task.eta = task.stitchProgress >= 100 ? "completed" : `${Math.max(1, 5 - task.stitchProgress)}s`;
      return;
    }

    if (task.segments.every((segment) => segment.status === "success")) {
      task.phase = "stitch";
      task.stitchProgress = 0;
      return;
    }

    if (task.segments.some((segment) => segment.status === "failed")) {
      task.status = "failed";
      task.eta = "--";
      return;
    }

    const running = task.segments.find((segment) => segment.status === "running");
    task.status = running ? "running" : "queued";
    const completed = task.segments.filter((segment) => segment.status === "success").length;
    task.progress = Math.min(95, Math.round((completed / task.segments.length) * 100));
    task.eta = running?.eta ?? "--";
  };

  const emit = () => {
    updateOverall();
    writeEvent({
      id: taskId,
      progress: task.progress,
      eta: task.eta,
      status: task.status,
      segments: task.segments,
      phase: task.phase,
    });
  };

  const tick = () => {
    if (task.status === "failed") {
      emit();
      return;
    }

    if (task.phase === "stitch") {
      task.stitchProgress = Math.min(100, task.stitchProgress + Math.floor(Math.random() * 15) + 10);
      if (task.stitchProgress >= 100) {
        task.status = "success";
        task.progress = 100;
        task.eta = "completed";
        emit();
        clearInterval(state.interval);
        clearInterval(state.heartbeat);
        setTimeout(() => res.end(), 250);
        return;
      }
      emit();
      return;
    }

    let current = task.segments.find((segment) => segment.status === "running");
    if (!current) {
      current = selectNextSegment();
      if (!current) {
        task.phase = "stitch";
        emit();
        return;
      }
    }

    current.progress = Math.min(100, current.progress + Math.floor(Math.random() * 12) + 6);
    current.eta = `${Math.max(2, Math.round((100 - current.progress) / 8))}s`;

    const failRate = Number.isFinite(task.failRate) ? task.failRate : DEFAULT_FAIL_RATE;
    if (
      current.progress > 30 &&
      current.progress < 90 &&
      !current.canRetry &&
      Math.random() < failRate
    ) {
      current.status = "failed";
      current.canRetry = true;
      task.status = "failed";
      task.eta = "--";
      emit();
      return;
    }

    if (current.progress >= 100) {
      current.status = "success";
      current.progress = 100;
      current.eta = "completed";
      current.canRetry = false;
      selectNextSegment();
    }

    emit();
  };

  state.interval = setInterval(tick, 1000);
  state.heartbeat = setInterval(() => {
    writeEvent({ id: taskId, type: "heartbeat", ts: Date.now() });
  }, 15_000);

  emit();

  const cleanup = () => {
    clearInterval(state.interval);
    clearInterval(state.heartbeat);
    activeStreams.delete(taskId);
  };

  res.on("close", cleanup);
  res.on("finish", cleanup);
  res.on("error", cleanup);

  activeStreams.set(taskId, { cleanup });
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    handleOptions(res);
    return;
  }

  if (url.pathname === "/api/tasks" && req.method === "GET") {
    sendJson(res, 200, Array.from(tasks.values()));
    return;
  }

  if (url.pathname === "/api/tasks" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const id = randomUUID();
      const now = new Date().toISOString();
      const params = body.params ?? {};
      const totalSeconds = inferDurationSeconds(params);
      const totalMinutes = totalSeconds / 60;
      const segmentMaxMinutes = Number(params.maxSegmentDuration ?? 6);
      const split =
        Boolean(params.segmented) ||
        (Number.isFinite(totalMinutes) && totalMinutes > segmentMaxMinutes + 0.1);
      const failRate =
        typeof body.failRate === "number" && !Number.isNaN(body.failRate)
          ? body.failRate
          : DEFAULT_FAIL_RATE;

      const segments = buildInitialSegments(id, totalMinutes, segmentMaxMinutes, split);

      const task = {
        id,
        title: body.title ?? `Task ${id.slice(0, 6)}`,
        preset: body.preset ?? "custom",
        status: segments[0]?.status ?? "running",
        progress: 0,
        eta: "--",
        params,
        createdAt: now,
        split,
        segmentMaxMinutes,
        segments,
        phase: "segments",
        stitchProgress: 0,
        failRate,
      };

      tasks.set(id, task);
      sendJson(res, 201, task);
    } catch (error) {
      sendJson(res, 400, { message: error.message ?? "Invalid payload" });
    }
    return;
  }

  if (url.pathname.startsWith("/api/tasks/") && req.method === "GET") {
    const id = url.pathname.split("/").pop() ?? "";
    const task = tasks.get(id);
    if (!task) {
      sendJson(res, 404, { message: "Task not found" });
      return;
    }
    sendJson(res, 200, task);
    return;
  }

  if (url.pathname.endsWith("/retry") && req.method === "POST") {
    const [, , , taskId] = url.pathname.split("/");
    const task = tasks.get(taskId);
    if (!task) {
      sendJson(res, 404, { message: "Task not found" });
      return;
    }
    try {
      const body = await parseBody(req);
      const segment = task.segments.find((item) => item.id === body.segmentId);
      if (!segment) {
        sendJson(res, 404, { message: "Segment not found" });
        return;
      }
      segment.status = "retrying";
      segment.progress = 0;
      segment.canRetry = false;
      segment.eta = "--";
      task.status = "queued";
      task.phase = "segments";
      sendJson(res, 200, { ok: true, task });
    } catch (error) {
      sendJson(res, 400, { message: error.message ?? "Invalid payload" });
    }
    return;
  }

  if (url.pathname === "/api/sse/progress" && req.method === "GET") {
    const taskId = url.searchParams.get("taskId");
    if (!taskId) {
      res.writeHead(400);
      res.end("Missing taskId");
      return;
    }
    startProgressStream(res, taskId);
    return;
  }

  if (url.pathname === "/api/capabilities" && req.method === "GET") {
    sendJson(res, 200, {
      nvenc: true,
      av1: true,
      qsv: false,
      amf: false,
      gpuVendor: "nvidia",
      vramMB: 8192,
    });
    return;
  }

  if (url.pathname === "/api/qa/start" && req.method === "POST") {
    try {
      const payload = await parseBody(req);
      const id = randomUUID();
      const now = new Date().toISOString();
      const metrics = Array.isArray(payload.metric) && payload.metric.length
        ? payload.metric
        : ["vmaf", "ssim", "psnr"];

      const job = {
        id,
        srcUrl: payload.srcUrl ?? "",
        refUrl: payload.refUrl ?? "",
        metric: metrics,
        window: payload.window ?? "full",
        status: "running",
        createdAt: now,
        updatedAt: now,
        result: null,
      };

      qaJobs.set(id, job);

      setTimeout(() => {
        const resolution = (payload.profile?.outputResolution ?? "1080p").toString().toLowerCase();
        const bitrate = Number(payload.profile?.videoBitrateKbps ?? 8000);
        const encoder = (payload.profile?.encoder ?? "h264").toString();
        const upscale = (payload.profile?.upscale ?? "none").toString();
        const denoise = (payload.profile?.denoise ?? "off").toString();

        const resolutionScore =
          resolution === "2160p"
            ? 96
            : resolution === "1440p"
              ? 93
              : resolution === "1080p"
                ? 88
                : resolution === "720p"
                  ? 81
                  : 74;

        const bitrateScore = Math.min(12, Math.max(0, Math.log10((bitrate || 1) / 900) * 8));
        const encoderBonus =
          encoder.includes("av1") ? 4 : encoder.includes("hevc") ? 2.5 : encoder.includes("h264") ? 0 : 1;
        const upscalePenalty = upscale !== "none" ? -2 : 0;
        const denoiseBoost = denoise === "nlmeans" ? 1.5 : denoise === "hqdn3d" ? 0.8 : 0;

        const vmaf = Math.min(
          99,
          resolutionScore + bitrateScore + encoderBonus + upscalePenalty + denoiseBoost,
        );
        const ssim = Math.min(1, 0.78 + (vmaf - 65) / 110);
        const psnr = Math.min(55, 32 + (vmaf - 60) * 0.35);

        const chart = Array.from({ length: 12 }, (_, index) => ({
          t: index * 10,
          score: Math.max(60, vmaf - Math.sin(index / 1.5) * 5 + Math.random() * 2),
        }));

        job.status = "success";
        job.updatedAt = new Date().toISOString();
        job.result = {
          vmaf: metrics.includes("vmaf") ? Number(vmaf.toFixed(2)) : undefined,
          ssim: metrics.includes("ssim") ? Number(ssim.toFixed(4)) : undefined,
          psnr: metrics.includes("psnr") ? Number(psnr.toFixed(2)) : undefined,
          chart,
        };
      }, 1400);

      sendJson(res, 202, job);
    } catch (error) {
      sendJson(res, 400, { message: error.message ?? "Invalid payload" });
    }
    return;
  }

  if (url.pathname.startsWith("/api/qa/status/") && req.method === "GET") {
    const id = url.pathname.split("/").pop() ?? "";
    const job = qaJobs.get(id);
    if (!job) {
      sendJson(res, 404, { message: "QA job not found" });
      return;
    }
    sendJson(res, 200, job);
    return;
  }

  res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({ message: "Not Found" }));
});

server.listen(PORT, HOST, () => {
  console.log(`Mock API listening on http://${HOST}:${PORT}`);
});
