import { create } from "zustand";
import { persist } from "zustand/middleware";

import { BASE_RENDER_PROFILE, RECOMMENDED_BITRATES, STYLE_PRESETS } from "@/features/workflow/presets";
import { estimateDurationMinutes, estimateSizeMB } from "@/features/workflow/calc";
import type {
  AnalysisResolution,
  BrollDensity,
  RendererCapabilities,
  RenderProfile,
  SubtitleTrack,
  TransitionStyle,
  WorkflowForm,
  WorkflowLanguage,
  WorkflowTask,
  VoiceProfile,
} from "@/lib/types";

interface WorkspaceMetric {
  id: string;
  label: string;
  value: number;
  trend: "up" | "down";
  delta: number;
}

interface AppState {
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  activeWorkspace: "global" | "cn" | "intl";
  theme: "dark" | "light";
  metrics: WorkspaceMetric[];
  notifications: number;
  capabilities: RendererCapabilities | null;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setSidebarMobileOpen: (open: boolean) => void;
  toggleSidebarMobile: () => void;
  closeSidebarMobile: () => void;
  setActiveWorkspace: (workspace: AppState["activeWorkspace"]) => void;
  setMetrics: (metrics: WorkspaceMetric[]) => void;
  incrementNotifications: () => void;
  clearNotifications: () => void;
  setTheme: (theme: AppState["theme"]) => void;
  toggleTheme: () => void;
  setCapabilities: (caps: RendererCapabilities) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      activeWorkspace: "global",
      theme: "dark",
      metrics: [
        { id: "watchTime", label: "Watch Hours", value: 126_000, trend: "up", delta: 6.3 },
        { id: "subs", label: "New Subscribers", value: 1_420, trend: "up", delta: 4.8 },
        { id: "revenue", label: "Ad Revenue", value: 31_200, trend: "down", delta: 1.2 },
      ],
      notifications: 3,
      capabilities: null,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebarCollapsed: () =>
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed,
        })),
      setSidebarMobileOpen: (open) => set({ sidebarMobileOpen: open }),
      toggleSidebarMobile: () =>
        set((state) => ({
          sidebarMobileOpen: !state.sidebarMobileOpen,
        })),
      closeSidebarMobile: () => set({ sidebarMobileOpen: false }),
      setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),
      setMetrics: (metrics) => set({ metrics }),
      incrementNotifications: () =>
        set((state) => ({
          notifications: state.notifications + 1,
        })),
      clearNotifications: () => set({ notifications: 0 }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "dark" ? "light" : "dark",
        })),
      setCapabilities: (caps) => set({ capabilities: caps }),
    }),
    {
      name: "app-ui-state",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        activeWorkspace: state.activeWorkspace,
        theme: state.theme,
        metrics: state.metrics,
        notifications: state.notifications,
        capabilities: state.capabilities,
      }),
    },
  ),
);

export type { WorkspaceMetric };

type WorkflowField = keyof WorkflowForm;

interface WorkflowState {
  form: WorkflowForm;
  errors: Partial<Record<WorkflowField, string>>;
  tasks: WorkflowTask[];
  setField: <K extends WorkflowField>(field: K, value: WorkflowForm[K]) => void;
  applyPreset: (presetId: string) => void;
  reset: () => void;
  validate: () => boolean;
  clearErrors: () => void;
  addTask: () => WorkflowTask;
  applyRenderProfile: (profile: RenderProfile) => void;
  setSubtitleTracks: (tracks: SubtitleTrack[]) => void;
}

const defaultPreset = STYLE_PRESETS[0];

const createDefaultForm = (): WorkflowForm => {
  const presetDefaults = defaultPreset.defaults;
  const renderDefaults = { ...BASE_RENDER_PROFILE, ...presetDefaults };

  return {
    ...renderDefaults,
    stylePreset: defaultPreset.id,
    language: (presetDefaults.language ?? "en-US") as WorkflowLanguage,
    voice: (presetDefaults.voice ?? "narrator-pro") as VoiceProfile,
    shotCount: presetDefaults.shotCount ?? 18,
    deliveryMode: (presetDefaults.deliveryMode ?? "single") as WorkflowForm["deliveryMode"],
    ladderProfile: presetDefaults.ladderProfile
      ? {
          ...presetDefaults.ladderProfile,
          steps: presetDefaults.ladderProfile.steps.map((step) => ({ ...step })),
        }
      : undefined,
    subtitleMode: presetDefaults.subtitleMode ?? "off",
    subtitleStyle: presetDefaults.subtitleStyle ?? {
      font: "Inter",
      size: 32,
      color: "#ffffff",
      outline: "#000000",
      shadow: "rgba(0,0,0,0.45)",
      position: "bottom",
    },
    subtitleTracks: presetDefaults.subtitleTracks
      ? presetDefaults.subtitleTracks.map((track) => ({ ...track }))
      : [],
    subtitleBurnIn:
      presetDefaults.subtitleMode === "burn-in" ||
      BASE_RENDER_PROFILE.subtitleMode === "burn-in",
    segmented: presetDefaults.segmented ?? false,
    maxSegmentDuration: presetDefaults.maxSegmentDuration ?? 5,
    frameRate: presetDefaults.frameRate ?? 0.5,
    theme: presetDefaults.theme ?? "cyberwave",
    coverTemplate: presetDefaults.coverTemplate ?? "Neon Pulse Overlay",
    transitionStyle: (presetDefaults.transitionStyle ?? "cut") as TransitionStyle,
    brollDensity: (presetDefaults.brollDensity ?? "balanced") as BrollDensity,
  };
};

export const useWorkflowFormStore = create<WorkflowState>()((set, get) => ({
  form: createDefaultForm(),
  errors: {},
  tasks: [],
  setField: (field, value) =>
    set((state) => {
      const nextErrors: Partial<Record<WorkflowField, string>> = {
        ...state.errors,
        [field]: undefined,
      };
      const nextForm: WorkflowForm = { ...state.form, [field]: value } as WorkflowForm;

      if (field === "segmented" && value === false) {
        nextErrors.maxSegmentDuration = undefined;
        nextForm.maxSegmentDuration = state.form.maxSegmentDuration || 5;
      }

      if (field === "deliveryMode" && value === "single") {
        nextForm.ladderProfile = undefined;
      }

      if (field === "hdrMode") {
        if (value === "none") {
          nextForm.hdrMeta = {};
          if (state.form.colorSpace === "rec2020") {
            nextForm.toneMap = "off";
          }
        } else {
          nextForm.colorSpace = "rec2020";
          if (value === "pq") {
            nextForm.transfer = "pq";
            nextForm.toneMap = value === "pq" ? "bt2390" : nextForm.toneMap;
          } else if (value === "hlg") {
            nextForm.transfer = "hlg";
          }
        }
      }

      if (field === "outputResolution" && value === "source") {
        nextForm.videoBitrateKbps = "auto";
        nextForm.upscale = "none";
      }

      if (field === "upscale" && value !== "none" && nextForm.outputResolution === "source") {
        nextForm.outputResolution = "1080p";
      }

      if (field === "subtitleMode") {
        nextForm.subtitleBurnIn = value === "burn-in";
        if (value !== "burn-in") {
          nextErrors.subtitleStyle = undefined;
        }
      }

      if (field === "colorSpace" && state.form.hdrMode !== "none" && value === "rec709") {
        nextErrors.colorSpace = "HDR delivery requires Rec.2020 color space.";
      }

      if (field === "videoBitrateKbps") {
        const numericValue =
          nextForm.videoBitrateKbps !== "auto" ? nextForm.videoBitrateKbps : undefined;
        if (typeof numericValue === "number" && numericValue < 0) {
          nextErrors.videoBitrateKbps = "Bitrate must be greater than 0.";
        }
      }

      return {
        form: nextForm,
        errors: nextErrors,
      };
    }),
  applyPreset: (presetId) =>
    set((state) => {
      const preset = STYLE_PRESETS.find((item) => item.id === presetId);
      if (!preset) {
        return { form: { ...state.form, stylePreset: presetId } };
      }

      const merged: WorkflowForm = {
        ...state.form,
        ...preset.defaults,
        stylePreset: preset.id,
      } as WorkflowForm;

      if (preset.defaults.hdrMeta && typeof preset.defaults.hdrMeta === "object") {
        merged.hdrMeta = { ...preset.defaults.hdrMeta };
      }

      merged.transitionStyle =
        (preset.defaults.transitionStyle ?? state.form.transitionStyle) as TransitionStyle;
      merged.brollDensity = (preset.defaults.brollDensity ?? state.form.brollDensity) as BrollDensity;
      merged.frameRate = preset.defaults.frameRate ?? state.form.frameRate;
      merged.theme = preset.defaults.theme ?? state.form.theme;
      merged.coverTemplate = preset.defaults.coverTemplate ?? state.form.coverTemplate;

      return {
        form: merged,
        errors: {},
      };
    }),
  reset: () =>
    set({
      form: createDefaultForm(),
      errors: {},
    }),
  clearErrors: () => set({ errors: {} }),
  validate: () => {
    const form = get().form;
    const errors: Partial<Record<WorkflowField, string>> = {};

    if (form.shotCount < 5 || form.shotCount > 50) {
      errors.shotCount = "Shot count must stay between 5 and 50.";
    }

    if (form.segmented && (form.maxSegmentDuration <= 0 || Number.isNaN(form.maxSegmentDuration))) {
      errors.maxSegmentDuration = "Provide a valid segment duration.";
    }

    if (form.frameRate <= 0) {
      errors.frameRate = "Frame rate must be greater than 0.";
    }

    if (form.videoBitrateKbps !== "auto" && form.videoBitrateKbps <= 0) {
      errors.videoBitrateKbps = "Bitrate must be greater than 0 or set to auto.";
    }

    if (
      typeof form.maxBitrateKbps === "number" &&
      form.maxBitrateKbps > 0 &&
      form.videoBitrateKbps !== "auto" &&
      form.maxBitrateKbps < form.videoBitrateKbps
    ) {
      errors.maxBitrateKbps = "Max bitrate should exceed the target bitrate.";
    }

    if (typeof form.gopSeconds === "number" && form.gopSeconds <= 0) {
      errors.gopSeconds = "GOP must be greater than 0.";
    }

    if (
      typeof form.audioBitrateKbps === "number" &&
      form.audioCodec !== "flac" &&
      form.audioBitrateKbps <= 0
    ) {
      errors.audioBitrateKbps = "Audio bitrate must be greater than 0.";
    }

    if (!form.coverTemplate.trim()) {
      errors.coverTemplate = "Cover template name is required.";
    }

    if (form.deliveryMode === "ladder") {
      if (!form.ladderProfile) {
        errors.ladderProfile = "Select or configure a bitrate ladder.";
      } else if (!form.ladderProfile.steps.length) {
        errors.ladderProfile = "Add at least one rung to the ladder.";
      }
    }

    set({ errors });
    return Object.keys(errors).length === 0;
  },
  setSubtitleTracks: (tracks) =>
    set((state) => ({
      form: {
        ...state.form,
        subtitleTracks: tracks.map((track) => ({ ...track })),
      },
    })),
  applyRenderProfile: (profile) =>
    set((state) => ({
      form: {
        ...state.form,
        ...profile,
        subtitleTracks: profile.subtitleTracks
          ? profile.subtitleTracks.map((track) => ({ ...track }))
          : [],
      },
      errors: {},
    })),
  addTask: () => {
    const form = get().form;
    const payload: WorkflowForm = { ...form, hdrMeta: form.hdrMeta ? { ...form.hdrMeta } : {} };
    const estimateMinutes = estimateDurationMinutes(payload);
    const projectedSize = estimateSizeMB(payload);

    const task: WorkflowTask = {
      id: `wf-${Date.now()}`,
      label: `${payload.stylePreset} | ${payload.language.toUpperCase()}`,
      preset: payload.stylePreset,
      submittedAt: Date.now(),
      estimateMinutes,
      estimateSizeMB: projectedSize,
      payload,
    };

    set((state) => ({
      tasks: [task, ...state.tasks].slice(0, 20),
    }));

    return task;
  },
}));

export type {
  WorkflowForm,
  WorkflowLanguage,
  VoiceProfile,
  AnalysisResolution,
  TransitionStyle,
  BrollDensity,
};
