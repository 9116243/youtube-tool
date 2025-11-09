import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Eye, Filter, Image as ImageIcon, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/ui/PageHeader";
import { formatDuration, prettyContainer, timeAgo } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  useDownloadsStore,
  type DownloadItem,
  type DownloadStatus,
} from "@/features/downloads/store";
import PreviewPlayer from "@/features/downloads/PreviewPlayer";
import { generateSpriteSheet } from "@/features/downloads/ThumbWorker";
const STATUS_LABEL: Record<DownloadStatus, string> = {
  processing: "Rendering",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_TONE: Record<DownloadStatus, string> = {
  processing: "bg-cyan-400",
  ready: "bg-emerald-400",
  failed: "bg-rose-500",
};

const statusOptions: Array<{ value: DownloadStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "processing", label: "Rendering" },
  { value: "ready", label: "Ready to deliver" },
  { value: "failed", label: "Failed" },
];

const resolutionOptions = ["all", "480p", "720p", "1080p", "1440p", "2160p", "source"];
const codecOptions = ["all", "H.264", "H.265", "AV1", "AAC", "OPUS"];
const hdrOptions = [
  { value: "all", label: "All HDR" },
  { value: "none", label: "SDR" },
  { value: "pq", label: "PQ" },
  { value: "hlg", label: "HLG" },
];

function matchesSearch(item: DownloadItem, query: string) {
  if (!query.trim()) return true;
  const value = query.trim().toLowerCase();
  return (
    item.title.toLowerCase().includes(value) ||
    item.language.toLowerCase().includes(value) ||
    item.tags.some((tag) => tag.toLowerCase().includes(value))
  );
}

function matchesFilters(
  item: DownloadItem,
  status: DownloadStatus | "all",
  resolution: string,
  codec: string,
  hdr: string,
) {
  const statusMatch = status === "all" ? true : item.status === status;
  const resolutionMatch = resolution === "all" ? true : item.resolution.toLowerCase() === resolution;
  const codecMatch =
    codec === "all"
      ? true
      : item.codec.toLowerCase().includes(codec.toLowerCase());
  const hdrMatch = hdr === "all" ? true : item.hdr === hdr;
  return statusMatch && resolutionMatch && codecMatch && hdrMatch;
}
export function DownloadsPage() {
  const { toast } = useToast();
  const items = useDownloadsStore((state) => state.items);
  const search = useDownloadsStore((state) => state.search);
  const statusFilter = useDownloadsStore((state) => state.statusFilter);
  const setSearch = useDownloadsStore((state) => state.setSearch);
  const setStatusFilter = useDownloadsStore((state) => state.setStatusFilter);
  const remove = useDownloadsStore((state) => state.remove);

  const [resolutionFilter, setResolutionFilter] = useState<string>("all");
  const [codecFilter, setCodecFilter] = useState<string>("all");
  const [hdrFilter, setHdrFilter] = useState<string>("all");
  const [previewItem, setPreviewItem] = useState<DownloadItem | null>(null);

  const filteredItems = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesSearch(item, search) &&
          matchesFilters(item, statusFilter, resolutionFilter, codecFilter, hdrFilter),
      ),
    [items, search, statusFilter, resolutionFilter, codecFilter, hdrFilter],
  );

  const handlePreview = (item: DownloadItem) => {
    setPreviewItem(item);
  };

  const handleDownload = (item: DownloadItem) => {
    toast({
      title: "Download queued",
      description: `Download for ${item.title} will start shortly.`,
    });
  };

  const handleDelete = (item: DownloadItem) => {
    remove(item.id);
    toast({
      title: "Removed from downloads",
      description: `${item.title} has been removed.`,
      variant: "default",
    });
  };

  const handleStoryboard = async (item: DownloadItem) => {
    const result = await generateSpriteSheet(item.id);
    toast({
      title: "Storyboard ready",
      description: `Sprite sheet generated at ${result.sheetUrl}`,
    });
  };
  return (
    <div className="space-y-8">
      <PageHeader
        title="Delivery Library"
        description="Monitor rendered assets, filter by delivery quality, and perform quick actions."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-cyan-300" aria-hidden />
            <span className="text-xs text-slate-300">
              {filteredItems.length} of {items.length} items
            </span>
          </div>
        }
      />

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-white">Search & filter</CardTitle>
          <CardDescription>
            Narrow by status, resolution, codec, or HDR characteristics.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor="download-search" className="flex items-center gap-2 text-xs uppercase">
              <Search className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
              Quick search
            </Label>
            <Input
              id="download-search"
              placeholder="Search by title, language, or tag"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="download-status" className="text-xs uppercase">
              Status
            </Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
            >
              <SelectTrigger id="download-status">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label className="text-xs uppercase" htmlFor="resolution-filter">
              Resolution
            </Label>
            <Select value={resolutionFilter} onValueChange={setResolutionFilter}>
              <SelectTrigger id="resolution-filter">
                <SelectValue placeholder="Resolution" />
              </SelectTrigger>
              <SelectContent>
                {resolutionOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "all" ? "All" : option.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label className="text-xs uppercase" htmlFor="codec-filter">
              Codec/HDR
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={codecFilter} onValueChange={setCodecFilter}>
                <SelectTrigger id="codec-filter">
                  <SelectValue placeholder="Codec" />
                </SelectTrigger>
                <SelectContent>
                  {codecOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "All" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={hdrFilter} onValueChange={setHdrFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="HDR" />
                </SelectTrigger>
                <SelectContent>
                  {hdrOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filteredItems.map((item) => {
          const durationLabel = formatDuration(item.durationSeconds);
          const hdrLabel = item.hdr === "none" ? "SDR" : item.hdr.toUpperCase();
          const subtitleLanguages = item.subtitleLanguages ?? [];
          return (
            <motion.div
              key={item.id}
              layout
              whileHover={{ y: -4 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="group rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_60px_-45px_rgba(14,165,233,0.55)] backdrop-blur-xl"
            >
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40">
              <motion.img
                src={item.cover}
                alt={item.title}
                className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent" />
              <div className="absolute right-4 top-4 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_TONE[item.status]}`} aria-hidden />
                <span className="text-xs font-medium text-white">
                  {STATUS_LABEL[item.status]}
                </span>
              </div>
              <div className="absolute left-4 top-4 flex flex-col gap-1 text-xs">
                <span className="w-fit rounded-full bg-slate-950/70 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
                  {item.resolution}
                </span>
                <span className="w-fit rounded-full bg-slate-950/70 px-2 py-0.5 text-[11px] text-slate-200">
                  {item.codec}
                </span>
                <span className="w-fit rounded-full bg-slate-950/70 px-2 py-0.5 text-[11px] text-slate-200">
                  {hdrLabel}
                </span>
              </div>
              <div className="absolute right-4 bottom-4 text-right text-xs text-slate-200">
                <div>{item.size}</div>
                <div>{item.bitrate}</div>
                <div>{prettyContainer(item.container.toLowerCase())}</div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center gap-3 bg-slate-950/65 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-xl bg-white/10"
                  onClick={() => handlePreview(item)}
                >
                  <Eye className="mr-2 h-3.5 w-3.5" />
                  Preview
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="rounded-xl shadow-[0_0_24px_rgba(34,211,238,0.35)]"
                  onClick={() => handleDownload(item)}
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Download
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-xl bg-white/10"
                  onClick={() => handleStoryboard(item)}
                >
                  <ImageIcon className="mr-2 h-3.5 w-3.5" />
                  Storyboard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-rose-200 hover:text-rose-100"
                  onClick={() => handleDelete(item)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                <p className="text-xs text-slate-300">
                  {item.format} | {durationLabel} | {item.size}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{item.language.toUpperCase()}</Badge>
                <Badge variant="secondary">{item.resolution}</Badge>
                <Badge variant="secondary">{hdrLabel}</Badge>
                <Badge variant="outline">{item.codec}</Badge>
                <Badge variant="outline">{item.bitrate}</Badge>
                <Badge variant="outline">{durationLabel}</Badge>
                {subtitleLanguages.map((lang) => (
                  <Badge
                    key={`${item.id}-sub-${lang}`}
                    variant="outline"
                    className="border-cyan-400/40 text-cyan-200"
                  >
                    SUB {lang}
                  </Badge>
                ))}
                {item.tags
                  .filter(
                    (tag) =>
                      ![
                        item.language.toUpperCase(),
                        item.resolution,
                        durationLabel,
                        item.codec,
                        hdrLabel,
                      ].includes(tag),
                  )
                  .map((tag) => (
                    <Badge key={`${item.id}-${tag}`} variant="outline">
                      {tag}
                    </Badge>
                  ))}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Added {timeAgo(new Date(item.createdAt))}</span>
                <span>{prettyContainer(item.container.toLowerCase())}</span>
              </div>
            </div>
            </motion.div>
          );
        })}
      </div>

      {!filteredItems.length ? (
        <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 py-16 text-center text-sm text-slate-300 backdrop-blur-xl">
          No downloads match the current filters. Adjust the filters or clear the search query.
        </div>
      ) : null}

      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-xl bg-slate-950/90 text-slate-100">
          <DialogHeader>
            <DialogTitle>Render profile</DialogTitle>
          </DialogHeader>
          {previewItem ? (
            <div className="space-y-4 text-sm">
              <PreviewPlayer
                src={
                  (previewItem.profile?.testUrl as string) ??
                  "https://samplelib.com/lib/preview/mp4/sample-5s.mp4"
                }
                poster={previewItem.cover}
                thumbnails={{ sheetUrl: "https://placehold.co/640x360/png?text=thumbnails", vttUrl: "https://example.com/thumbs.vtt" }}
              />
              <div>
                <p className="text-base font-semibold text-white">{previewItem.title}</p>
                <p className="text-xs text-slate-400">{previewItem.format}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-400">Resolution</p>
                  <p className="text-sm text-slate-200">{previewItem.resolution}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Codec</p>
                  <p className="text-sm text-slate-200">{previewItem.codec}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Bitrate</p>
                  <p className="text-sm text-slate-200">{previewItem.bitrate}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">HDR</p>
                  <p className="text-sm text-slate-200">
                    {previewItem.hdr === "none" ? "SDR" : previewItem.hdr.toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Container</p>
                  <p className="text-sm text-slate-200">
                    {prettyContainer(previewItem.container.toLowerCase())}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Size</p>
                  <p className="text-sm text-slate-200">{previewItem.size}</p>
                </div>
              </div>
              {previewItem.subtitleLanguages && previewItem.subtitleLanguages.length ? (
                <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="text-slate-400">Subtitles</span>
                  {previewItem.subtitleLanguages.map((lang) => (
                    <Badge
                      key={`preview-sub-${lang}`}
                      variant="outline"
                      className="border-cyan-400/40 text-cyan-200"
                    >
                      {lang}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase text-slate-400">Source parameters</p>
                <pre className="mt-2 max-h-60 overflow-auto rounded bg-slate-950/60 p-3 text-[11px] text-slate-200">
                  {JSON.stringify(previewItem.profile ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DownloadsPage;
