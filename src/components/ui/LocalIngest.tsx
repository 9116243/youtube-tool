import { useCallback, useEffect, useState } from "react";

import { openDialogForVideo, readText, tauriInvoke, listenJobProgress } from "@/lib/tauri";
import type { UnlistenFn } from "@/lib/tauri";
import type { Job, JobProgressEvent } from "@/lib/types";

export default function LocalIngest() {
  const [videoPath, setVideoPath] = useState<string>("");
  const [outDir, setOutDir] = useState<string>("");
  const [scriptText, setScriptText] = useState<string>("");
  const [queue, setQueue] = useState<Job[]>([]);

  const pickVideo = useCallback(async () => {
    const selected = await openDialogForVideo();
    if (selected) setVideoPath(selected);
  }, []);

  const loadScript = useCallback(async () => {
    if (!videoPath) return;
    const text = await readText(`${videoPath}.txt`).catch(() => "");
    setScriptText(text);
  }, [videoPath]);

  const submit = useCallback(async () => {
    if (!videoPath) return;
    const id = Math.random().toString(36).slice(2);
    const job: Job = { id, videoPath, scriptText, outDir, status: "queued", progress: 0 };
    setQueue((existing) => [job, ...existing]);
    await tauriInvoke("start_job", { id, videoPath, outDir, scriptText }).catch(() => {});
  }, [videoPath, outDir, scriptText]);

  useEffect(() => {
    let unlistenPromise: Promise<UnlistenFn> | null = null;
    unlistenPromise = listenJobProgress((event: { payload: JobProgressEvent }) => {
      const { id, progress, status } = event.payload;
      setQueue((items) =>
        items.map((job) => (job.id === id ? { ...job, progress, status: status ?? job.status } : job)),
      );
    });
    return () => {
      unlistenPromise?.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button className="rounded-lg bg-sky-600 px-3 py-2 text-white" onClick={pickVideo}>
          Choose video
        </button>
        <button className="rounded-lg bg-emerald-600 px-3 py-2 text-white" onClick={loadScript}>
          Load script
        </button>
        <button className="rounded-lg bg-indigo-600 px-3 py-2 text-white" onClick={submit}>
          Submit job
        </button>
      </div>

      <div className="text-sm text-slate-300">Video: {videoPath || "Not selected"}</div>
      <div className="text-sm text-slate-300">Output directory: {outDir || "Not configured"}</div>
      <div className="text-sm text-slate-300">
        Script: {scriptText ? `${scriptText.slice(0, 30)}...` : "Empty"}
      </div>

      <div className="mt-4 space-y-2">
        {queue.map((job) => (
          <div key={job.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-white">{job.id}</div>
              <div className="text-xs text-slate-300">{job.status}</div>
            </div>
            <div className="mt-2 h-2 rounded bg-white/10">
              <div
                className="h-2 rounded bg-sky-500 transition-all"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

