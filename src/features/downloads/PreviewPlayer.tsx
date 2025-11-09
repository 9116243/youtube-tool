import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PreviewPlayerProps {
  src: string;
  poster?: string;
  thumbnails?: { sheetUrl: string; vttUrl: string };
}

export function PreviewPlayer({ src, poster, thumbnails }: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const togglePlay = () => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) {
      void element.play();
      setPlaying(true);
    } else {
      element.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <div className="relative overflow-hidden rounded-xl">
        <video
          ref={videoRef}
          className="w-full rounded-xl"
          poster={poster}
          preload="metadata"
          controls
        >
          <source src={src} />
          {thumbnails ? <track kind="metadata" src={thumbnails.vttUrl} label="thumbnails" /> : null}
        </video>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="absolute left-3 bottom-3"
          onClick={togglePlay}
        >
          {playing ? <Pause className="mr-2 h-3.5 w-3.5" /> : <Play className="mr-2 h-3.5 w-3.5" />}
          {playing ? "Pause" : "Play"}
        </Button>
      </div>
      {thumbnails ? (
        <div className="text-xs text-slate-400">
          Thumbnail sheet: <a href={thumbnails.sheetUrl} className="text-cyan-300">Download</a>
        </div>
      ) : null}
    </div>
  );
}

export default PreviewPlayer;

