import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BookmarkCheck,
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Palette,
  SlidersHorizontal,
  Upload,
  Wand2,
} from "lucide-react";

import PageHeader from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TemplateManager from "@/features/templates/TemplateManager";
import { THEME_SWATCHES, STYLE_PRESETS, getRecommendedBitrate } from "@/features/workflow/presets";
import { cloneLadderProfile, LADDER_PRESETS } from "@/features/workflow/ladder";
import {
  estimateDurationMinutes,
  estimateRenderSeconds,
  estimateSizeMB,
  estimateVRAM,
  resolveVideoBitrate,
} from "@/features/workflow/calc";
import { useQueueStore } from "@/features/queue/store";
import { useToast } from "@/hooks/use-toast";
import {
  type AnalysisResolution,
  type AudioChannels,
  type AudioCodec,
  type AudioLoudness,
  type AudioSampleRate,
  type BrollDensity,
  type DialogueEnhance,
  type DenoiseMode,
  type EncoderId,
  type HdrMode,
  type LadderProfile,
  type LadderResolution,
  type OutputResolution,
  type ColorSpace,
  type Transfer,
  type ToneMap,
  type TransitionStyle,
  type UpscaleMode,
  type WorkflowForm,
  type WorkflowLanguage,
  type WorkflowPreset,
  type WorkflowTask,
  type VoiceProfile,
  type SubtitleMode,
  type SubtitleStyle,
  type SubtitleTrack,
} from "@/lib/types";
import { useAppStore, useWorkflowFormStore } from "@/lib/store";
import {
  formatDuration,
  formatBitrate,
  prettyCodec,
  prettyContainer,
  splitPlan,
} from "@/lib/utils";
import { fetchRendererCapabilities } from "@/lib/api";
const LANGUAGE_OPTIONS: Array<{ value: WorkflowLanguage; label: string }> = [
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "en-US", label: "English (US)" },
  { value: "de-DE", label: "German" },
  { value: "es-ES", label: "Spanish" },
];

const VOICE_OPTIONS: Array<{ value: VoiceProfile; label: string }> = [
  { value: "male-a", label: "Voice - Male A" },
  { value: "female-b", label: "Voice - Female B" },
  { value: "narrator-pro", label: "Narrator - Pro" },
];

const ANALYSIS_OPTIONS: Array<{ value: AnalysisResolution; label: string }> = [
  { value: "360p", label: "360p - Fastest" },
  { value: "480p", label: "480p - Balanced" },
  { value: "720p", label: "720p - Highest fidelity" },
];

const OUTPUT_OPTIONS: Array<{ value: OutputResolution; label: string }> = [
  { value: "360p", label: "360p - Proxy" },
  { value: "720p", label: "720p - Web HD" },
  { value: "1080p", label: "1080p - Full HD" },
  { value: "1440p", label: "1440p - 2K delivery" },
  { value: "2160p", label: "2160p - 4K master" },
  { value: "source", label: "Source - Match input" },
];
const ENCODER_OPTIONS: Array<{ value: EncoderId; label: string }> = [
  { value: "h264_nvenc", label: "H.264 (NVENC)" },
  { value: "h264", label: "H.264 (CPU)" },
  { value: "libx264", label: "libx264 (CPU)" },
  { value: "hevc_nvenc", label: "H.265 (NVENC)" },
  { value: "hevc", label: "H.265 (CPU)" },
  { value: "libx265", label: "libx265 (CPU)" },
  { value: "av1_nvenc", label: "AV1 (NVENC)" },
  { value: "av1", label: "AV1 (CPU)" },
  { value: "h264_qsv", label: "H.264 (Intel QSV)" },
  { value: "hevc_qsv", label: "H.265 (Intel QSV)" },
  { value: "hevc_amf", label: "H.265 (AMD AMF)" },
];

const CONTAINER_OPTIONS = [
  { value: "mp4", label: "MP4" },
  { value: "mkv", label: "Matroska (MKV)" },
  { value: "mov", label: "QuickTime (MOV)" },
] as const;

const UPSCALE_OPTIONS: Array<{ value: UpscaleMode; label: string }> = [
  { value: "none", label: "No upscaling" },
  { value: "fsrcnnx", label: "FSRCNNX" },
  { value: "realesrgan-x2", label: "Real-ESRGAN x2" },
  { value: "realesrgan-x4", label: "Real-ESRGAN x4" },
];

const DENOISE_OPTIONS: Array<{ value: DenoiseMode; label: string }> = [
  { value: "off", label: "Off" },
  { value: "hqdn3d", label: "HQDN3D" },
  { value: "nlmeans", label: "Non-local Means" },
];

const HDR_OPTIONS: Array<{ value: HdrMode; label: string }> = [
  { value: "none", label: "Disabled" },
  { value: "pq", label: "PQ (HDR10)" },
  { value: "hlg", label: "HLG" },
];

const AUDIO_CODEC_OPTIONS: Array<{ value: AudioCodec; label: string }> = [
  { value: "aac", label: "AAC" },
  { value: "opus", label: "Opus" },
  { value: "flac", label: "FLAC" },
];
const AUDIO_CHANNEL_OPTIONS: Array<{ value: AudioChannels; label: string }> = [
  { value: "mono", label: "Mono" },
  { value: "stereo", label: "Stereo" },
  { value: "5.1", label: "5.1 Surround" },
];

const AUDIO_SAMPLE_OPTIONS: Array<{ value: AudioSampleRate; label: string }> = [
  { value: 44100, label: "44.1 kHz" },
  { value: 48000, label: "48 kHz" },
];

const AUDIO_LOUDNESS_OPTIONS: Array<{ value: AudioLoudness; label: string }> = [
  { value: "off", label: "Off" },
  { value: "ebu-r128", label: "EBU R128 (-23 LUFS)" },
];

const DIALOGUE_ENHANCE_OPTIONS: Array<{ value: DialogueEnhance; label: string }> = [
  { value: "off", label: "Disabled" },
  { value: "voice-boost-1", label: "Voice boost +3dB" },
  { value: "voice-boost-2", label: "Voice boost +6dB" },
];

const COLOR_SPACE_OPTIONS = [
  { value: "rec709", label: "Rec.709" },
  { value: "rec2020", label: "Rec.2020" },
  { value: "p3", label: "Display P3" },
] as const;

const TRANSFER_OPTIONS = [
  { value: "gamma2.2", label: "Gamma 2.2" },
  { value: "gamma2.4", label: "Gamma 2.4" },
  { value: "hlg", label: "HLG" },
  { value: "pq", label: "PQ" },
] as const;

const TONE_MAP_OPTIONS: Array<{ value: ToneMap; label: string }> = [
  { value: "off", label: "Off" },
  { value: "hable", label: "Hable" },
  { value: "mobius", label: "Mobius" },
  { value: "reinhard", label: "Reinhard" },
  { value: "bt2390", label: "BT.2390" },
];

const LUT_PRESETS = [
  { value: "none", label: "None" },
  { value: "neon-bloom.cube", label: "Neon Bloom" },
  { value: "film-soft.cube", label: "Film Soft" },
  { value: "teal-orange.cube", label: "Teal & Orange" },
];
function findPreset(id: string): WorkflowPreset | undefined {
  return STYLE_PRESETS.find((preset) => preset.id === id);
}

function serializeWorkflowForm(form: WorkflowForm): Record<string, unknown> {
  return Object.entries(form).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value === undefined) return acc;
    if (Array.isArray(value)) {
      acc[key] = value.map((item) =>
        typeof item === "object" && item !== null ? { ...item } : item,
      );
      return acc;
    }
    if (value !== null && typeof value === "object") {
      acc[key] = { ...(value as Record<string, unknown>) };
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
}

interface FieldProps {
  label: string;
  description?: string;
  error?: string;
  children: ReactNode;
}

function Field({ label, description, error, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-white">{label}</span>
        {description ? <span className="text-xs text-slate-400">{description}</span> : null}
      </div>
      {children}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

function SwitchControl({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative flex h-9 w-16 items-center rounded-full border border-white/15 bg-white/10 px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
      aria-label={label}
    >
      <motion.span
        layout
        className="h-7 w-7 rounded-full bg-white shadow-[0_0_18px_rgba(34,211,238,0.55)]"
        initial={false}
        animate={{ x: checked ? 28 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
      />
    </button>
  );
}

function LadderStepRow({
  index,
  res,
  bitrate,
  maxrate,
  onChange,
  onRemove,
}: {
  index: number;
  res: LadderResolution;
  bitrate: number;
  maxrate?: number;
  onChange: (part: Partial<{ res: LadderResolution; bitrateKbps: number; maxrateKbps?: number }>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
      <Select
        value={res}
        onValueChange={(value) => onChange({ res: value as LadderResolution })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Resolution" />
        </SelectTrigger>
        <SelectContent>
          {["480p", "720p", "1080p", "1440p", "2160p"].map((option) => (
            <SelectItem key={option} value={option}>
              {option.toUpperCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="number"
        min="1"
        value={bitrate}
        onChange={(event) => onChange({ bitrateKbps: Number(event.target.value) })}
        placeholder="Bitrate (kbps)"
      />
      <Input
        type="number"
        min="0"
        value={maxrate ?? ""}
        onChange={(event) =>
          onChange({
            maxrateKbps: event.target.value ? Number(event.target.value) : undefined,
          })
        }
        placeholder="Maxrate (kbps)"
      />
      <Button
        variant="ghost"
        size="sm"
        className="justify-self-end text-rose-300 hover:text-rose-100"
        onClick={onRemove}
        aria-label={`Remove ladder step ${index + 1}`}
      >
        Remove
      </Button>
    </div>
  );
}
export function AiWorkflowPage() {
  const { toast } = useToast();
  const form = useWorkflowFormStore((state) => state.form);
  const errors = useWorkflowFormStore((state) => state.errors);
  const setField = useWorkflowFormStore((state) => state.setField);
  const applyPreset = useWorkflowFormStore((state) => state.applyPreset);
  const validate = useWorkflowFormStore((state) => state.validate);
  const addLocalTask = useWorkflowFormStore((state) => state.addTask);
  const tasks = useWorkflowFormStore((state) => state.tasks);
  const setSubtitleTracks = useWorkflowFormStore((state) => state.setSubtitleTracks);
  const queueAddTask = useQueueStore((state) => state.addTask);

  const capabilities = useAppStore((state) => state.capabilities);
  const setCapabilities = useAppStore((state) => state.setCapabilities);

  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hdrPanelOpen, setHdrPanelOpen] = useState(false);
  const [bitrateMode, setBitrateMode] = useState<"auto" | "recommend" | "custom">(
    form.videoBitrateKbps === "auto" ? "auto" : "custom",
  );
  const [ladderPresetId, setLadderPresetId] = useState<string>("YouTube-like");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const subtitleTracks = form.subtitleTracks ?? [];

  useEffect(() => {
    if (!capabilities && !capabilityLoading) {
      setCapabilityLoading(true);
      void fetchRendererCapabilities()
        .then((caps) => setCapabilities(caps))
        .catch(() => {
          toast({
            title: "Capabilities unavailable",
            description: "Falling back to default hardware assumptions.",
          });
        })
        .finally(() => setCapabilityLoading(false));
    }
  }, [capabilities, capabilityLoading, setCapabilities, toast]);

  useEffect(() => {
    if (form.deliveryMode === "ladder" && !form.ladderProfile) {
      const preset = LADDER_PRESETS[0];
      setField("ladderProfile", cloneLadderProfile(preset));
    }
  }, [form.deliveryMode, form.ladderProfile, setField]);

  useEffect(() => {
    if (bitrateMode === "recommend") {
      const recommendation = getRecommendedBitrate(form.outputResolution);
      setField("videoBitrateKbps", recommendation.target);
    } else if (bitrateMode === "auto") {
      setField("videoBitrateKbps", "auto");
    }
  }, [bitrateMode, form.outputResolution, setField]);

  const selectedPreset = useMemo(
    () => findPreset(form.stylePreset) ?? STYLE_PRESETS[0],
    [form.stylePreset],
  );
  const subtitleStyle = useMemo<SubtitleStyle>(
    () => ({
      font: form.subtitleStyle?.font ?? "Inter",
      size: form.subtitleStyle?.size ?? 32,
      color: form.subtitleStyle?.color ?? "#ffffff",
      outline: form.subtitleStyle?.outline ?? "#000000",
      shadow: form.subtitleStyle?.shadow ?? "rgba(0,0,0,0.45)",
      position: form.subtitleStyle?.position ?? "bottom",
    }),
    [form.subtitleStyle],
  );
  const durationMinutes = useMemo(() => estimateDurationMinutes(form), [form]);
  const estimatedSizeMB = useMemo(() => estimateSizeMB(form), [form]);
  const resolvedBitrate = useMemo(() => resolveVideoBitrate(form), [form]);
  const recommendedBitrate = useMemo(
    () => getRecommendedBitrate(form.outputResolution),
    [form.outputResolution],
  );
  const splitPlanInfo = useMemo(
    () => splitPlan(durationMinutes, form.maxSegmentDuration),
    [durationMinutes, form.maxSegmentDuration],
  );
  const performanceContext = useMemo(
    () => ({
      durationMinutes,
      segmented: form.segmented,
      segmentMaxMinutes: form.segmented ? form.maxSegmentDuration : undefined,
      ladderSteps:
        form.deliveryMode === "ladder" && form.ladderProfile
          ? form.ladderProfile.steps.length
          : undefined,
    }),
    [
      durationMinutes,
      form.deliveryMode,
      form.ladderProfile,
      form.maxSegmentDuration,
      form.segmented,
    ],
  );
  const estimatedRenderSeconds = useMemo(
    () => estimateRenderSeconds(form, performanceContext),
    [form, performanceContext],
  );
  const estimatedVRAM = useMemo(
    () => estimateVRAM(form, performanceContext),
    [form, performanceContext],
  );
  const renderTimeFormatted = useMemo(
    () => formatDuration(estimatedRenderSeconds),
    [estimatedRenderSeconds],
  );
  const performanceNotes = useMemo(() => {
    const notes: string[] = [];
    if (form.upscale !== "none") {
      notes.push(`Upscale ${form.upscale}`);
    }
    if (form.hdrMode !== "none") {
      notes.push(`HDR ${form.hdrMode.toUpperCase()}`);
    }
    if (form.subtitleMode === "burn-in") {
      notes.push("Subtitles burn-in");
    } else if (form.subtitleMode === "soft" && subtitleTracks.length) {
      notes.push(`${subtitleTracks.length} subtitle tracks`);
    }
    if (form.deliveryMode === "ladder" && form.ladderProfile) {
      notes.push(`${form.ladderProfile.steps.length} rung ladder`);
    }
    if (form.denoise !== "off") {
      notes.push(`Denoise ${form.denoise}`);
    }
    return notes;
  }, [form.deliveryMode, form.denoise, form.hdrMode, form.ladderProfile, form.subtitleMode, form.upscale, subtitleTracks.length]);
  const warnings = useMemo(() => {
    const list: string[] = [];

    if (
      form.outputResolution === "2160p" &&
      (form.encoder === "libx264" || form.encoder === "h264")
    ) {
      list.push(
        "libx264 at 4K is extremely slow. Prefer HEVC or AV1 hardware encoders for UHD delivery.",
      );
    }
    if (
      form.hdrMode !== "none" &&
      form.container === "mp4" &&
      (form.encoder.includes("h264") || form.encoder.includes("libx264"))
    ) {
      list.push(
        "HDR inside MP4 with H.264 is not widely supported. Consider HEVC or Matroska container.",
      );
    }
    if (form.outputResolution === "source" && form.upscale !== "none") {
      list.push("Upscaling is disabled when output is set to source resolution.");
    }
    if (form.colorSpace === "rec709" && form.hdrMode !== "none") {
      list.push("HDR workflows require Rec.2020 color space. Switch color space accordingly.");
    }
    if (form.encoder === "av1_nvenc" && capabilities && !capabilities.av1) {
      list.push("This hardware profile does not expose AV1 NVENC. Fallback to CPU encoding is expected.");
    }
    if (form.toneMap !== "off" && form.hdrMode === "none") {
      list.push("Tone mapping is enabled without HDR input. Confirm this is intentional.");
    }
    if (capabilities?.vramMB && estimatedVRAM > capabilities.vramMB) {
      list.push(
        `Estimated VRAM consumption (${estimatedVRAM} MB) exceeds detected capacity (${capabilities.vramMB} MB). Reduce resolution, filters, or ladder rungs.`,
      );
    } else if (!capabilities?.vramMB && estimatedVRAM > 12000) {
      list.push(
        `Configuration may require ~${estimatedVRAM} MB of VRAM. Ensure your GPU has sufficient memory.`,
      );
    }
    if (form.upscale === "realesrgan-x4" && capabilities?.vramMB && capabilities.vramMB < 10000) {
      list.push("Real-ESRGAN x4 is heavy on VRAM. Consider x2 or disable upscaling on this GPU.");
    }
    if (form.subtitleMode === "burn-in" && subtitleTracks.length === 0) {
      list.push("Burn-in selected but no subtitle tracks attached. Add captions or switch modes.");
    }
    if (form.deliveryMode === "ladder" && form.ladderProfile && form.ladderProfile.steps.length > 4) {
      list.push("Large bitrate ladders will extend render time. Ensure downstream needs every rung.");
    }
    return list;
  }, [
    capabilities,
    estimatedVRAM,
    form.colorSpace,
    form.container,
    form.deliveryMode,
    form.encoder,
    form.hdrMode,
    form.ladderProfile,
    form.outputResolution,
    form.toneMap,
    form.upscale,
    subtitleTracks.length,
  ]);

  const handleBitrateModeChange = (mode: "auto" | "recommend" | "custom") => {
    setBitrateMode(mode);
    if (mode === "custom" && form.videoBitrateKbps === "auto") {
      const recommendation = getRecommendedBitrate(form.outputResolution);
      setField("videoBitrateKbps", recommendation.target);
    }
  };

  const handleLadderPreset = (value: string) => {
    setLadderPresetId(value);
    const preset = LADDER_PRESETS.find((item) => item.name === value);
    if (preset) {
      setField("ladderProfile", cloneLadderProfile(preset));
    }
  };
  const updateLadderStep = (
    index: number,
    part: Partial<{ res: LadderResolution; bitrateKbps: number; maxrateKbps?: number }>,
  ) => {
    const ladder = form.ladderProfile;
    if (!ladder) return;
    const updated: LadderProfile = {
      ...ladder,
      steps: ladder.steps.map((step, idx) =>
        idx === index ? { ...step, ...part } : { ...step },
      ),
    };
    setField("ladderProfile", updated);
  };

  const addLadderStep = () => {
    const ladder = form.ladderProfile;
    if (!ladder) return;
    const last = ladder.steps[ladder.steps.length - 1];
    const nextStep: LadderResolution =
      last?.res === "1080p"
        ? "1440p"
        : last?.res === "1440p"
          ? "2160p"
          : "1080p";
    const updated: LadderProfile = {
      ...ladder,
      steps: [
        ...ladder.steps,
        {
          res: nextStep,
          bitrateKbps: last ? Math.round(last.bitrateKbps * 1.6) : 6000,
          maxrateKbps: last?.maxrateKbps ? Math.round(last.maxrateKbps * 1.6) : undefined,
        },
      ],
    };
    setField("ladderProfile", updated);
  };

  const removeLadderStep = (index: number) => {
    const ladder = form.ladderProfile;
    if (!ladder) return;
    const updated: LadderProfile = {
      ...ladder,
      steps: ladder.steps.filter((_, idx) => idx !== index),
    };
    setField("ladderProfile", updated);
  };

  const exportLadder = () => {
    if (!form.ladderProfile) return;
    void navigator.clipboard
      .writeText(JSON.stringify(form.ladderProfile, null, 2))
      .then(() =>
        toast({
          title: "Ladder copied",
          description: "JSON payload copied to clipboard.",
        }),
      )
      .catch(() =>
        toast({
          title: "Copy failed",
          description: "Unable to copy. Please check clipboard permissions.",
          variant: "destructive",
        }),
      );
  };

  const importLadder = () => {
    const raw = window.prompt("Paste ladder JSON");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as LadderProfile;
      if (!parsed?.steps?.length) throw new Error("Invalid ladder");
      setField("ladderProfile", cloneLadderProfile(parsed));
      setLadderPresetId(parsed.name ?? "Custom");
      toast({ title: "Ladder imported", description: parsed.name ?? "Custom profile" });
    } catch (error) {
      toast({
        title: "Import failed",
        description: (error as Error).message ?? "Invalid ladder JSON",
        variant: "destructive",
      });
    }
  };

  const handleSubtitleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (!files || files.length === 0) return;
    const additions: SubtitleTrack[] = Array.from(files).map((file, index) => ({
      id: `sub-${Date.now().toString(36)}-${index}`,
      language: form.language,
      path: file.name,
      label: file.name.replace(/\.[^/.]+$/, ""),
    }));
    setSubtitleTracks([...subtitleTracks, ...additions]);
    // clear value to allow re-selecting same file
    event.target.value = "";
  };

  const handleSubtitleLanguageChange = (id: string, language: string) => {
    setSubtitleTracks(
      subtitleTracks.map((track) => (track.id === id ? { ...track, language } : track)),
    );
  };

  const handleSubtitleLabelChange = (id: string, label: string) => {
    setSubtitleTracks(
      subtitleTracks.map((track) => (track.id === id ? { ...track, label } : track)),
    );
  };

  const handleSubtitleRemove = (id: string) => {
    setSubtitleTracks(subtitleTracks.filter((track) => track.id !== id));
  };

  const updateSubtitleStyle = (patch: Partial<SubtitleStyle>) => {
    const next: SubtitleStyle = {
      ...subtitleStyle,
      ...patch,
    };
    setField("subtitleStyle", next);
  };

  const handleLutChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.trim();
    if (!value) {
      setField("lut", undefined);
      return;
    }
    setField("lut", { name: value.split("/").pop() ?? "Custom LUT", type: "cube", url: value });
  };
  const handleSubmit = async () => {
    setIsSubmitting(true);
    const isValid = validate();
    if (!isValid) {
      toast({
        title: "Validation failed",
        description: "Check highlighted fields before submitting.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      const workflowTask: WorkflowTask = addLocalTask();
      await queueAddTask({
        title: workflowTask.label,
        preset: workflowTask.preset,
        params: serializeWorkflowForm(workflowTask.payload),
      });
      toast({
        title: "Task submitted",
        description: "Queued for rendering. Track progress in the live queue.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to submit task",
        description: "Check the developer console for details.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="space-y-8">
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-lg text-white">Template Manager</DialogTitle>
          </DialogHeader>
          <TemplateManager />
        </DialogContent>
      </Dialog>
      <PageHeader
        title="AI Workflow Builder"
        description="Curate presets, tune expert parameters, and submit production-ready jobs."
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <BookmarkCheck className="h-4 w-4 text-cyan-300" aria-hidden />
            <span>{selectedPreset.name} preset loaded</span>
            {capabilityLoading ? (
              <span className="flex items-center gap-1 text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking hardware
              </span>
            ) : capabilities ? (
              <span className="text-slate-400">
                NVENC {capabilities.nvenc ? "supported" : "missing"} - AV1 {capabilities.av1 ? "supported" : "missing"}
              </span>
            ) : (
              <span className="text-slate-400">Capabilities unknown</span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-2 border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/10"
              onClick={() => setTemplateDialogOpen(true)}
            >
              Templates
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Card className="bg-white/5 backdrop-blur-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4 text-cyan-300" />
              Workflow configuration
            </CardTitle>
            <CardDescription>
              Base settings for narration, pacing, segmentation, and render intent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="base" className="space-y-6">
              <TabsList className="bg-slate-900/50">
                <TabsTrigger value="base">Base parameters</TabsTrigger>
                <TabsTrigger value="expert">Expert mode</TabsTrigger>
              </TabsList>

              <TabsContent value="base" className="space-y-6 focus:outline-none">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Style preset" description="Select a design and motion profile.">
                    <Select value={form.stylePreset} onValueChange={applyPreset}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select preset" />
                      </SelectTrigger>
                      <SelectContent>
                        {STYLE_PRESETS.map((preset) => (
                          <SelectItem key={preset.id} value={preset.id}>
                            {preset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Language" description="Primary narration language.">
                    <Select
                      value={form.language}
                      onValueChange={(value) => setField("language", value as WorkflowLanguage)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Voice profile" description="Match the desired narration persona.">
                    <Select
                      value={form.voice}
                      onValueChange={(value) => setField("voice", value as VoiceProfile)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select voice" />
                      </SelectTrigger>
                      <SelectContent>
                        {VOICE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Transition style" description="Choose pacing between cuts.">
                    <Select
                      value={form.transitionStyle}
                      onValueChange={(value) =>
                        setField("transitionStyle", value as TransitionStyle)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select transition" />
                      </SelectTrigger>
                      <SelectContent>
                        {["cut", "crossfade", "zoom", "glitch"].map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="B-roll density" description="Supplementary footage intensity.">
                    <Select
                      value={form.brollDensity}
                      onValueChange={(value) =>
                        setField("brollDensity", value as BrollDensity)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select density" />
                      </SelectTrigger>
                      <SelectContent>
                        {["minimal", "balanced", "rich"].map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Delivery mode" description="Single encode or bitrate ladder.">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={form.deliveryMode === "single" ? "default" : "outline"}
                        onClick={() => setField("deliveryMode", "single")}
                      >
                        Single target
                      </Button>
                      <Button
                        type="button"
                        variant={form.deliveryMode === "ladder" ? "default" : "outline"}
                        onClick={() => setField("deliveryMode", "ladder")}
                      >
                        Bitrate ladder
                      </Button>
                    </div>
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Shot count"
                    description="Controls pacing and total runtime."
                    error={errors.shotCount}
                  >
                    <div className="space-y-2">
                      <input
                        type="range"
                        min={5}
                        max={50}
                        value={form.shotCount}
                        onChange={(event) => setField("shotCount", Number(event.target.value))}
                        className="w-full accent-cyan-400"
                      />
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>{form.shotCount} shots</span>
                        <span>~ {durationMinutes.toFixed(2)} min runtime</span>
                      </div>
                    </div>
                  </Field>
                  <Field
                    label="Frame-rate analysis"
                    description="Sampling frequency for motion detection."
                    error={errors.frameRate}
                  >
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={form.frameRate}
                      onChange={(event) => setField("frameRate", Number(event.target.value))}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Analysis resolution"
                    description="Lower values speed up cut detection without hurting output quality."
                  >
                    <Select
                      value={form.analysisResolution}
                      onValueChange={(value) =>
                        setField("analysisResolution", value as AnalysisResolution)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select analysis resolution" />
                      </SelectTrigger>
                      <SelectContent>
                        {ANALYSIS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Output resolution" description="Final delivery resolution.">
                    <Select
                      value={form.outputResolution}
                      onValueChange={(value) =>
                        setField("outputResolution", value as OutputResolution)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select output resolution" />
                      </SelectTrigger>
                      <SelectContent>
                        {OUTPUT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-[auto_1fr]">
                  <div className="space-y-2">
                    <span className="text-sm font-medium text-white">Segmented delivery</span>
                    <span className="text-xs text-slate-400">
                      Split renders for episodic uploads.
                    </span>
                    <SwitchControl
                      checked={form.segmented}
                      onChange={(value) => setField("segmented", value)}
                      label="Enable segmented delivery"
                    />
                  </div>
                  {form.segmented ? (
                    <Field
                      label="Max segment length (minutes)"
                      description="Upper bound for each output chunk."
                      error={errors.maxSegmentDuration}
                    >
                      <Input
                        type="number"
                        min="1"
                        value={form.maxSegmentDuration}
                        onChange={(event) =>
                          setField("maxSegmentDuration", Number(event.target.value))
                        }
                      />
                    </Field>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Cover template"
                    description="Name the visual frame used for cover art automation."
                    error={errors.coverTemplate}
                  >
                    <Input
                      value={form.coverTemplate}
                      onChange={(event) => setField("coverTemplate", event.target.value)}
                      placeholder="Neon Pulse Overlay"
                    />
                  </Field>
                  <Field label="Creative notes" description="Optional directions for editors.">
                    <Textarea
                      rows={3}
                      placeholder="Highlight product callouts, social handles, or compliance reminders."
                      value={form.notes ?? ""}
                      onChange={(event) => setField("notes", event.target.value || undefined)}
                    />
                  </Field>
                </div>

                <Field label="Theme skin" description="Pick a color token for overlays and UI chrome.">
                  <div className="flex flex-wrap gap-3">
                    {THEME_SWATCHES.map((swatch) => (
                      <button
                        key={swatch.id}
                        type="button"
                        onClick={() => setField("theme", swatch.id)}
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                          form.theme === swatch.id
                            ? "border-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.45)]"
                            : "border-white/10"
                        }`}
                        aria-label={swatch.label}
                      >
                        <span
                          className="h-8 w-8 rounded-xl"
                          style={{ background: swatch.value }}
                          aria-hidden
                        />
                      </button>
                    ))}
                  </div>
                </Field>
              </TabsContent>
              <TabsContent value="expert" className="space-y-6 focus:outline-none">
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-slate-200">
                    <SlidersHorizontal className="h-4 w-4 text-cyan-300" />
                    Advanced encoding controls
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAdvancedOpen((prev) => !prev)}
                    className="flex items-center gap-2 text-xs text-slate-300"
                  >
                    {advancedOpen ? "Hide" : "Show"} parameters
                    <motion.span animate={{ rotate: advancedOpen ? 180 : 0 }}>
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </motion.span>
                  </Button>
                </div>

                {advancedOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/50 p-4"
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Encoder" description="Select codec and hardware acceleration.">
                        <Select
                          value={form.encoder}
                          onValueChange={(value) => setField("encoder", value as EncoderId)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select encoder" />
                          </SelectTrigger>
                          <SelectContent>
                            {ENCODER_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Encoding preset" description="Speed versus quality trade-off.">
                        <Select
                          value={form.encoderPreset ?? "medium"}
                          onValueChange={(value) =>
                            setField(
                              "encoderPreset",
                              value as WorkflowForm["encoderPreset"],
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Preset" />
                          </SelectTrigger>
                          <SelectContent>
                            {["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"].map((preset) => (
                              <SelectItem key={preset} value={preset}>
                                {preset}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Container">
                        <Select
                          value={form.container}
                          onValueChange={(value) =>
                            setField("container", value as WorkflowForm["container"])
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select container" />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTAINER_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-white">Subtitles</p>
                          <p className="text-xs text-slate-400">
                            Attach caption tracks and control delivery mode.
                          </p>
                        </div>
                        <Select
                          value={form.subtitleMode}
                          onValueChange={(value) => setField("subtitleMode", value as SubtitleMode)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Subtitle mode" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="off">Off</SelectItem>
                            <SelectItem value="soft">Soft subtitles</SelectItem>
                            <SelectItem value="burn-in">Burn-in</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {form.subtitleMode === "off" && subtitleTracks.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          Subtitles are disabled. Switch mode to soft or burn-in to include caption
                          files.
                        </p>
                      ) : (
                        <>
                          <div className="space-y-3">
                            {subtitleTracks.map((track) => (
                              <div
                                key={track.id}
                                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-900/40 p-3 text-xs text-slate-200"
                              >
                                <div className="min-w-[160px]">
                                  <Label
                                    htmlFor={`subtitle-lang-${track.id}`}
                                    className="text-[11px] uppercase text-slate-400"
                                  >
                                    Language
                                  </Label>
                                  <Select
                                    value={track.language}
                                    onValueChange={(value) =>
                                      handleSubtitleLanguageChange(track.id, value)
                                    }
                                  >
                                    <SelectTrigger id={`subtitle-lang-${track.id}`} className="mt-1">
                                      <SelectValue placeholder="Language" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {LANGUAGE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex-1 min-w-[160px]">
                                  <Label
                                    htmlFor={`subtitle-label-${track.id}`}
                                    className="text-[11px] uppercase text-slate-400"
                                  >
                                    Label
                                  </Label>
                                  <Input
                                    id={`subtitle-label-${track.id}`}
                                    value={track.label ?? ""}
                                    onChange={(event) =>
                                      handleSubtitleLabelChange(track.id, event.target.value)
                                    }
                                    className="mt-1"
                                    placeholder="Subtitle label"
                                  />
                                </div>
                                <div className="flex items-center gap-2 text-slate-400">
                                  <span className="font-mono text-[11px]">{track.path}</span>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="ml-auto text-rose-300 hover:text-rose-100"
                                  onClick={() => handleSubtitleRemove(track.id)}
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                          </div>
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 transition hover:border-cyan-400/70 hover:bg-cyan-500/20">
                            <Upload className="h-3.5 w-3.5" />
                            Upload captions
                            <input
                              type="file"
                              accept=".srt,.ass,.vtt"
                              multiple
                              hidden
                              onChange={handleSubtitleUpload}
                            />
                          </label>
                          {form.subtitleMode === "burn-in" ? (
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label className="text-[11px] uppercase text-slate-400">Font</Label>
                                <Input
                                  value={subtitleStyle.font}
                                  onChange={(event) =>
                                    updateSubtitleStyle({ font: event.target.value })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[11px] uppercase text-slate-400">
                                  Font size
                                </Label>
                                <Input
                                  type="number"
                                  min={8}
                                  value={subtitleStyle.size}
                                  onChange={(event) =>
                                    updateSubtitleStyle({ size: Number(event.target.value) })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[11px] uppercase text-slate-400">
                                  Text color
                                </Label>
                                <Input
                                  type="color"
                                  value={subtitleStyle.color}
                                  onChange={(event) =>
                                    updateSubtitleStyle({ color: event.target.value })
                                  }
                                  className="h-10"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[11px] uppercase text-slate-400">
                                  Outline
                                </Label>
                                <Input
                                  type="color"
                                  value={subtitleStyle.outline}
                                  onChange={(event) =>
                                    updateSubtitleStyle({ outline: event.target.value })
                                  }
                                  className="h-10"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[11px] uppercase text-slate-400">
                                  Shadow
                                </Label>
                                <Input
                                  value={subtitleStyle.shadow}
                                  onChange={(event) =>
                                    updateSubtitleStyle({ shadow: event.target.value })
                                  }
                                  placeholder="rgba(0,0,0,0.45)"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[11px] uppercase text-slate-400">
                                  Position
                                </Label>
                                <Select
                                  value={subtitleStyle.position}
                                  onValueChange={(value) =>
                                    updateSubtitleStyle({ position: value as SubtitleStyle["position"] })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Position" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="bottom">Bottom</SelectItem>
                                    <SelectItem value="top">Top</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                          Video bitrate strategy
                        </span>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={bitrateMode === "auto" ? "default" : "outline"}
                            onClick={() => handleBitrateModeChange("auto")}
                          >
                            Auto
                          </Button>
                          <Button
                            type="button"
                            variant={bitrateMode === "recommend" ? "default" : "outline"}
                            onClick={() => handleBitrateModeChange("recommend")}
                          >
                            Recommend
                          </Button>
                          <Button
                            type="button"
                            variant={bitrateMode === "custom" ? "default" : "outline"}
                            onClick={() => handleBitrateModeChange("custom")}
                          >
                            Custom
                          </Button>
                        </div>
                        <Field
                          label="Video bitrate (kbps)"
                          description={`Recommended range: ${recommendedBitrate.min}-${recommendedBitrate.max} kbps`}
                          error={errors.videoBitrateKbps}
                        >
                          <Input
                            type="number"
                            min="1"
                            value={form.videoBitrateKbps === "auto" ? "" : form.videoBitrateKbps}
                            disabled={bitrateMode !== "custom"}
                            onChange={(event) =>
                              setField("videoBitrateKbps", Number(event.target.value))
                            }
                            placeholder="Enter kbps"
                          />
                        </Field>
                        <Field label="Max bitrate (kbps)" error={errors.maxBitrateKbps}>
                          <Input
                            type="number"
                            min="0"
                            value={form.maxBitrateKbps ?? ""}
                            onChange={(event) =>
                              setField(
                                "maxBitrateKbps",
                                event.target.value ? Number(event.target.value) : undefined,
                              )
                            }
                            placeholder="Optional VBV ceiling"
                          />
                        </Field>
                      </div>

                      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                        <Field label="GOP (seconds)" error={errors.gopSeconds}>
                          <Input
                            type="number"
                            min="1"
                            value={form.gopSeconds ?? ""}
                            onChange={(event) =>
                              setField(
                                "gopSeconds",
                                event.target.value ? Number(event.target.value) : undefined,
                              )
                            }
                          />
                        </Field>
                        <Field label="Profile">
                          <Input
                            value={form.profile ?? ""}
                            onChange={(event) => setField("profile", event.target.value || undefined)}
                            placeholder="high, main10..."
                          />
                        </Field>
                        <Field label="Level">
                          <Input
                            value={form.level ?? ""}
                            onChange={(event) => setField("level", event.target.value || undefined)}
                            placeholder="4.2, 5.1..."
                          />
                        </Field>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="HDR mode">
                        <Select
                          value={form.hdrMode}
                          onValueChange={(value) => {
                            setField("hdrMode", value as HdrMode);
                            if (value === "none") {
                              setHdrPanelOpen(false);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="HDR configuration" />
                          </SelectTrigger>
                          <SelectContent>
                            {HDR_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Upscale" description="AI upscaling before render.">
                        <Select
                          value={form.upscale}
                          onValueChange={(value) => setField("upscale", value as UpscaleMode)}
                          disabled={form.outputResolution === "source"}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Upscale method" />
                          </SelectTrigger>
                          <SelectContent>
                            {UPSCALE_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                                disabled={form.outputResolution === "source" && option.value !== "none"}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    {form.hdrMode !== "none" ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between text-xs text-slate-300"
                          onClick={() => setHdrPanelOpen((prev) => !prev)}
                        >
                          <span>HDR metadata</span>
                          <motion.span animate={{ rotate: hdrPanelOpen ? 180 : 0 }}>
                            <Palette className="h-3.5 w-3.5" />
                          </motion.span>
                        </button>
                        {hdrPanelOpen ? (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="mt-3 grid gap-3 md:grid-cols-3"
                          >
                            <Input
                              placeholder="Mastering display"
                              value={form.hdrMeta?.masteringDisplay ?? ""}
                              onChange={(event) =>
                                setField("hdrMeta", {
                                  ...(form.hdrMeta ?? {}),
                                  masteringDisplay: event.target.value,
                                })
                              }
                            />
                            <Input
                              type="number"
                              placeholder="MaxCLL"
                              value={form.hdrMeta?.maxCLL ?? ""}
                              onChange={(event) =>
                                setField("hdrMeta", {
                                  ...(form.hdrMeta ?? {}),
                                  maxCLL: event.target.value ? Number(event.target.value) : undefined,
                                })
                              }
                            />
                            <Input
                              type="number"
                              placeholder="MaxFALL"
                              value={form.hdrMeta?.maxFALL ?? ""}
                              onChange={(event) =>
                                setField("hdrMeta", {
                                  ...(form.hdrMeta ?? {}),
                                  maxFALL: event.target.value ? Number(event.target.value) : undefined,
                                })
                              }
                            />
                          </motion.div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Color space">
                        <Select
                          value={form.colorSpace}
                          onValueChange={(value) => setField("colorSpace", value as ColorSpace)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Colour primaries" />
                          </SelectTrigger>
                          <SelectContent>
                            {COLOR_SPACE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Transfer curve">
                        <Select
                          value={form.transfer}
                          onValueChange={(value) => setField("transfer", value as Transfer)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Transfer function" />
                          </SelectTrigger>
                          <SelectContent>
                            {TRANSFER_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Tone mapping">
                        <Select
                          value={form.toneMap}
                          onValueChange={(value) => setField("toneMap", value as ToneMap)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Tone map operator" />
                          </SelectTrigger>
                          <SelectContent>
                            {TONE_MAP_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Look-up table (LUT)">
                        <div className="space-y-2">
                          <Select
                            value={form.lut?.name ?? "none"}
                            onValueChange={(value) => {
                              if (value === "none") {
                                setField("lut", undefined);
                                return;
                              }
                              const preset = LUT_PRESETS.find((item) => item.value === value);
                              if (preset) {
                                setField("lut", {
                                  name: preset.value,
                                  type: "cube",
                                  url: `/luts/${preset.value}`,
                                });
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose LUT preset" />
                            </SelectTrigger>
                            <SelectContent>
                              {LUT_PRESETS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="Custom LUT URL (.cube)"
                              defaultValue={form.lut?.url ?? ""}
                              onBlur={handleLutChange}
                            />
                            <Button type="button" variant="ghost" size="sm">
                              <Upload className="mr-1.5 h-3.5 w-3.5" />
                              Link
                            </Button>
                          </div>
                        </div>
                      </Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Denoise" description="Reduce grain or sensor noise.">
                        <Select
                          value={form.denoise}
                          onValueChange={(value) => setField("denoise", value as DenoiseMode)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select denoise" />
                          </SelectTrigger>
                          <SelectContent>
                            {DENOISE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Audio codec">
                        <Select
                          value={form.audioCodec}
                          onValueChange={(value) => setField("audioCodec", value as AudioCodec)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select audio codec" />
                          </SelectTrigger>
                          <SelectContent>
                            {AUDIO_CODEC_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Audio channels">
                        <Select
                          value={form.audioChannels}
                          onValueChange={(value) => setField("audioChannels", value as AudioChannels)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Channels" />
                          </SelectTrigger>
                          <SelectContent>
                            {AUDIO_CHANNEL_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Sample rate">
                        <Select
                          value={String(form.audioSampleRate)}
                          onValueChange={(value) =>
                            setField("audioSampleRate", Number(value) as AudioSampleRate)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sample rate" />
                          </SelectTrigger>
                          <SelectContent>
                            {AUDIO_SAMPLE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={String(option.value)}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Audio loudness">
                        <Select
                          value={form.audioLoudness}
                          onValueChange={(value) => setField("audioLoudness", value as AudioLoudness)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Loudness" />
                          </SelectTrigger>
                          <SelectContent>
                            {AUDIO_LOUDNESS_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Dialogue enhance">
                        <Select
                          value={form.dialogueEnhance}
                          onValueChange={(value) =>
                            setField("dialogueEnhance", value as DialogueEnhance)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Dialogue enhancement" />
                          </SelectTrigger>
                          <SelectContent>
                            {DIALOGUE_ENHANCE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  </motion.div>
                ) : null}

                {form.deliveryMode === "ladder" && form.ladderProfile ? (
                  <div className="space-y-3 rounded-2xl border border-cyan-400/30 bg-cyan-500/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        Bitrate ladder
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Select value={ladderPresetId} onValueChange={handleLadderPreset}>
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Preset" />
                          </SelectTrigger>
                          <SelectContent>
                            {LADDER_PRESETS.map((preset) => (
                              <SelectItem key={preset.name} value={preset.name}>
                                {preset.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="secondary" size="sm" onClick={exportLadder}>
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Export
                        </Button>
                        <Button variant="secondary" size="sm" onClick={importLadder}>
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          Import
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      {form.ladderProfile.steps.map((step, index) => (
                        <LadderStepRow
                          key={`${step.res}-${index}`}
                          index={index}
                          res={step.res}
                          bitrate={step.bitrateKbps}
                          maxrate={step.maxrateKbps}
                          onChange={(part) => updateLadderStep(index, part)}
                          onRemove={() => removeLadderStep(index)}
                        />
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={addLadderStep}>
                      Add rung
                    </Button>
                  </div>
                ) : null}
              </TabsContent>
            </Tabs>
            {warnings.length ? (
              <div className="mt-6 space-y-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-xs text-amber-200">
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  Warnings
                </div>
                <ul className="space-y-1">
                  {warnings.map((warning) => (
                    <li key={warning}>- {warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-slate-200">
                <Info className="h-4 w-4 text-cyan-300" />
                Estimated duration: {durationMinutes.toFixed(2)} minutes
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  className="rounded-2xl"
                  onClick={() => setTemplateDialogOpen(true)}
                >
                  Manage templates
                </Button>
                <Button
                  className="rounded-2xl bg-cyan-400 text-slate-950 shadow-[0_0_32px_rgba(14,165,233,0.6)] hover:bg-cyan-300"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Queue task
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4 text-cyan-300" />
                Render estimation
              </CardTitle>
              <CardDescription>
                Preview the expected encoding profile, duration, and approximate file size.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <div className="flex items-center justify-between">
                <span>Output resolution</span>
                <span>{form.outputResolution}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Analysis resolution</span>
                <span>{form.analysisResolution}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Encoder</span>
                <span>{prettyCodec(form.encoder)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Container</span>
                <span>{prettyContainer(form.container)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Encoder preset</span>
                <span>{(form.encoderPreset ?? "medium").toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Color / transfer</span>
                <span>
                  {form.colorSpace.toUpperCase()} / {form.transfer.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Target bitrate</span>
                <span>{formatBitrate(resolvedBitrate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated duration</span>
                <span>{durationMinutes.toFixed(2)} minutes</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated render time</span>
                <span>{renderTimeFormatted}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated size</span>
                <span>{estimatedSizeMB.toFixed(1)} MB</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated VRAM</span>
                <span>{estimatedVRAM} MB</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Segments planned</span>
                <span>
                  {splitPlanInfo.segments} x {form.maxSegmentDuration}m (last {splitPlanInfo.lastSegmentMinutes.toFixed(1)}m)
                </span>
              </div>
              {performanceNotes.length ? (
                <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3 text-xs text-slate-300">
                  <p className="mb-1 font-medium text-slate-200">Performance notes</p>
                  <ul className="space-y-1">
                    {performanceNotes.map((note) => (
                      <li key={note}>- {note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                Recommended bitrate range for {form.outputResolution.toUpperCase()}: {formatBitrate(recommendedBitrate.min)} - {formatBitrate(recommendedBitrate.max)} (target {formatBitrate(recommendedBitrate.target)}).
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Recent submissions
              </CardTitle>
              <CardDescription>Local history of the last 5 workflow requests.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              {tasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/50 px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-medium text-white">{task.label}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(task.submittedAt).toLocaleTimeString()} - est. {task.estimateMinutes.toFixed(2)} mins - {task.estimateSizeMB.toFixed(1)} MB
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {task.payload.outputResolution.toUpperCase()}
                  </Badge>
                </div>
              ))}
              {!tasks.length ? (
                <p className="text-xs text-slate-400">Submit a task to populate history.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default AiWorkflowPage;


