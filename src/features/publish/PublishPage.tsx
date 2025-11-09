import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { CheckCircle2, Clock3, Globe2, RefreshCcw, Send } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import PageHeader from "@/components/ui/PageHeader"
import { useToast } from "@/hooks/use-toast"
import { timeAgo } from "@/lib/utils"

// 璇█ & 闃熷垪 & 娴佹按绾?import { LANGUAGES, type LanguageCode } from "@/lib/languages"
import { LANGUAGES, type LanguageCode } from "@/lib/languages"
import { useQueueStore } from "@/features/queue/store"
import type { BaseTask, SubtitleTaskPayload } from "@/lib/pipeline"

type PublishStatus = "draft" | "scheduled" | "published" | "failed"

interface PublishRow {
  id: string
  platform: string
  language: string // BCP-47锛屽 en-US
  region: string
  scheduledFor: string
  status: PublishStatus
  owner: string
}

const REGIONS = ["North America", "EMEA", "APAC"] as const

const INITIAL_ROWS: PublishRow[] = [
  {
    id: "pub-1",
    platform: "YouTube",
    language: "en-US",
    region: "North America",
    scheduledFor: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
    status: "scheduled",
    owner: "M. Chen",
  },
  {
    id: "pub-2",
    platform: "YouTube",
    language: "es-ES",
    region: "EMEA",
    scheduledFor: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
    status: "draft",
    owner: "A. Ramirez",
  },
  {
    id: "pub-3",
    platform: "TikTok",
    language: "en-GB",
    region: "EMEA",
    scheduledFor: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    status: "published",
    owner: "K. Singh",
  },
  {
    id: "pub-4",
    platform: "Bilibili",
    language: "zh-CN",
    region: "APAC",
    scheduledFor: new Date(Date.now() + 1000 * 60 * 60 * 10).toISOString(),
    status: "failed",
    owner: "Y. Zhao",
  },
]

const STATUS_LABEL: Record<PublishStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
}

const STATUS_BADGE: Record<PublishStatus, string> = {
  draft: "border-slate-400/40 bg-slate-500/10 text-slate-200",
  scheduled: "border-cyan-400/40 bg-cyan-500/15 text-cyan-100",
  published: "border-emerald-400/45 bg-emerald-500/15 text-emerald-100",
  failed: "border-rose-400/45 bg-rose-500/15 text-rose-100",
}

const statusOrder: Record<PublishStatus, number> = {
  draft: 1,
  scheduled: 2,
  published: 3,
  failed: 0,
}

// 灏?"en-US" 鏄剧ず涓?"馃嚭馃嚫 English (US) 路 en-US"
function renderLanguageCell(code: string) {
  const meta = LANGUAGES.find((l) => l.code === code)
  if (!meta) return <span className="font-mono">{code.toUpperCase()}</span>
  return (
    <div className="flex items-start gap-2">
      <span className="text-lg leading-none">{meta.flag}</span>
      <div className="flex flex-col leading-tight">
        <span className="text-sm">{meta.name}</span>
        <span className="text-xs text-slate-400">
          {meta.englishName} 路 {meta.code}
        </span>
      </div>
    </div>
  )
}

// 鐢熸垚涓€涓?id
const nid = (p: string) => `${p}_${Math.random().toString(36).slice(2)}`

export function PublishPage() {
  const { toast } = useToast()
  const queue = useQueueStore()

  const [rows, setRows] = useState<PublishRow[]>(INITIAL_ROWS)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<PublishStatus | "all">("all")
  const [regionFilter, setRegionFilter] = useState<string>("all")

  // Pipeline inputs (video title + source URL)
  const [videoTitle, setVideoTitle] = useState("Sample Title")
  const [sourceUrl, setSourceUrl] = useState("/media/demo.mp4")
  // Row selections for campaign actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => {
        const q = search.trim().toLowerCase()
        const matchesSearch =
          !q ||
          row.platform.toLowerCase().includes(q) ||
          row.language.toLowerCase().includes(q) ||
          row.owner.toLowerCase().includes(q)
        const matchesStatus = statusFilter === "all" || row.status === statusFilter
        const matchesRegion = regionFilter === "all" || row.region === regionFilter
        return matchesSearch && matchesStatus && matchesRegion
      })
      .sort((a, b) => statusOrder[b.status] - statusOrder[a.status])
  }, [rows, search, statusFilter, regionFilter])

  const allVisibleIds = filteredRows.map((r) => r.id)
  const allSelectedVisible = allVisibleIds.every((id) => selectedIds.has(id)) && allVisibleIds.length > 0

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelectedVisible) {
        // 鍙栨秷閫変腑鎵€鏈夊彲瑙?        allVisibleIds.forEach((id) => next.delete(id))
      } else {
        // 閫変腑鎵€鏈夊彲瑙?        allVisibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const updateStatus = (id: string, status: PublishStatus) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, status, scheduledFor: new Date().toISOString() } : row,
      ),
    )
    toast({
      title: `Status updated to ${STATUS_LABEL[status]}`,
      description: "Downstream audit logs have been refreshed.",
    })
  }

  // Build a localization pipeline from the highlighted rows
  const createPipelineFromSelection = async () => {
    const selectedRows = filteredRows.filter((r) => selectedIds.has(r.id))
    if (!selectedRows.length) {
      toast({
        title: "Select at least one row",
        description: "Please pick a row before building a pipeline.",
        variant: "destructive" as any,
      })
      return
    }
    if (!sourceUrl.trim()) {
      toast({
        title: "Source video missing",
        description: "Fill in the Source Video URL before submitting.",
        variant: "destructive" as any,
      })
      return
    }

    const subTasks: BaseTask<SubtitleTaskPayload>[] = selectedRows.map((r) => {
      const lang = r.language as LanguageCode
      const meta = LANGUAGES.find((l) => l.code === lang)
      if (!meta) {
        throw new Error(`Unsupported language: ${lang}`)
      }
      return {
        id: nid(`sub_${lang}`),
        kind: "subtitle",
        title: `字幕 · ${lang}`,
        params: {
          kind: "subtitle",
          sourceUrl,
          language: lang,
          engine: "auto",
          translate: true,
          format: "srt",
          meta: {
            videoTitle,
            subtitlePath: `./outputs/${lang}.srt`,
          },
        },
      }
    })

    await queue.addTasks(
      subTasks.map((t) => ({
        title: t.title,
        preset: "subtitle-generation",
        params: {
          kind: t.kind,
          ...t.params,
          meta: t.params.meta,
        } as Record<string, unknown>,
      })),
    )

    const { dubs, burns } = await queue.addLocalizationPipeline({
      subtitleTasks: subTasks,
      sourceVideo: sourceUrl,
      provider: "elevenlabs",
      voiceMap: {},
      outDir: "./outputs",
      codec: "h264",
      resolution: "1080p",
      mixDubbing: true,
    })

    toast({
      title: `Pipeline created`,
      description: `Subtitles ${subTasks.length} · Dubs ${dubs.length} · Burns ${burns.length}`,
    })
  }


  return (
    <div className="space-y-8">
      <PageHeader
        title="Publishing Control"
        description="Coordinate multi-language releases, monitor scheduling drift, and trigger retries."
        actions={
          <Button variant="secondary" className="rounded-2xl" onClick={() => setRows(INITIAL_ROWS)}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reset view
          </Button>
        }
      />

      {/* 娴佹按绾胯緭鍏ュ尯 */}
      <Card className="bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-base">Pipeline Inputs</CardTitle>
          <CardDescription>
            Select rows, fill the inputs, and launch the subtitle → dub → burn pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="video-title">Video Title</Label>
            <Input
              id="video-title"
              placeholder="鐢ㄤ簬浠诲姟鏍囬灞曠ず"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="video-src">Source Video URL / Path</Label>
            <Input
              id="video-src"
              placeholder="/path/to/video.mp4 鎴?https://.../video.mp4"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </div>
          <div className="lg:col-span-2">
            <Button
              className="rounded-2xl bg-brand-DEFAULT text-slate-950"
              onClick={createPipelineFromSelection}
              disabled={!selectedIds.size}
            >
              鐢熸垚瀛楀箷 鈫?閰嶉煶 鈫?鐑у綍锛堝凡閫?{selectedIds.size}锛?            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/5 backdrop-blur-xl">
                <CardHeader>
          <CardTitle className="text-base">Pipeline Inputs</CardTitle>
          <CardDescription>
            Select rows, fill the inputs, and launch the subtitle → dub → burn pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="publish-search">Search</Label>
            <Input
              id="publish-search"
              placeholder="Search platform, language or owner"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="publish-status">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as PublishStatus | "all")}
            >
              <SelectTrigger id="publish-status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="publish-region">Region</Label>
            <Select value={regionFilter} onValueChange={(value) => setRegionFilter(value)}>
              <SelectTrigger id="publish-region">
                <SelectValue placeholder="All regions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {REGIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 琛ㄦ牸 */}
      <Card className="bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle>Publishing matrix</CardTitle>
          <CardDescription>Select rows and generate a localization pipeline.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-300">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-cyan-400"
                    checked={allSelectedVisible}
                    onChange={toggleAllVisible}
                  />
                </th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-200">
              {filteredRows.map((row) => {
                const checked = selectedIds.has(row.id)
                return (
                  <motion.tr
                    key={row.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={`hover:bg-white/5 ${checked ? "bg-white/5" : ""}`}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-cyan-400"
                        checked={checked}
                        onChange={() => toggleOne(row.id)}
                        aria-label="select row"
                      />
                    </td>

                    <td className="px-4 py-4 font-semibold text-white">{row.platform}</td>

                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        {renderLanguageCell(row.language)}
                        <span className="text-xs text-slate-400">
                          {timeAgo(new Date(row.scheduledFor))}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4">{row.region}</td>

                    <td className="px-4 py-4">
                      {new Date(row.scheduledFor).toLocaleString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>

                    <td className="px-4 py-4">{row.owner}</td>

                    <td className="px-4 py-4">
                      <Badge className={`border px-2 py-1 ${STATUS_BADGE[row.status]}`}>
                        {STATUS_LABEL[row.status]}
                      </Badge>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-cyan-200 hover:text-cyan-100"
                          onClick={() => updateStatus(row.id, "scheduled")}
                        >
                          <Clock3 className="mr-1.5 h-3.5 w-3.5" />
                          Schedule
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-emerald-200 hover:text-emerald-100"
                          onClick={() => updateStatus(row.id, "published")}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          Mark live
                        </Button>

                        {/* Retry later 鈫?閲嶆柊鎺掓湡锛坰cheduled锛?*/}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-200 hover:text-rose-100"
                          onClick={() => updateStatus(row.id, "scheduled")}
                        >
                          <Send className="mr-1.5 h-3.5 w-3.5 rotate-180" />
                          Retry later
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>

          {!filteredRows.length ? (
            <div className="py-12 text-center text-sm text-slate-300">
              No entries match the current filters. Relax the filters or reset the view.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default PublishPage

