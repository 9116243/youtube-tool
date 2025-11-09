import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { RenderProfile, WorkflowTemplate, WorkflowTemplateVersion } from "@/lib/types";

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tmpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const cloneProfile = (profile: RenderProfile): RenderProfile => ({
  ...profile,
  hdrMeta: profile.hdrMeta ? { ...profile.hdrMeta } : undefined,
  subtitleTracks: profile.subtitleTracks ? profile.subtitleTracks.map((track) => ({ ...track })) : [],
  subtitleStyle: profile.subtitleStyle ? { ...profile.subtitleStyle } : undefined,
});

interface TemplateStoreState {
  templates: WorkflowTemplate[];
  activeTemplateId?: string;
  createTemplate: (name: string, changelog: string, profile: RenderProfile, description?: string) => void;
  updateTemplate: (id: string, changelog: string, profile: RenderProfile) => void;
  deleteTemplate: (id: string) => void;
  setActiveTemplate: (id: string | undefined) => void;
  importTemplates: (templates: WorkflowTemplate[]) => void;
  exportTemplates: () => string;
}

export const useTemplateStore = create<TemplateStoreState>()(
  persist(
    (set, get) => ({
      templates: [],
      activeTemplateId: undefined,
      createTemplate: (name, changelog, profile, description) =>
        set((state) => {
          const version: WorkflowTemplateVersion = {
            id: generateId(),
            version: 1,
            createdAt: new Date().toISOString(),
            changelog,
            profile: cloneProfile(profile),
          };
          const template: WorkflowTemplate = {
            id: generateId(),
            name,
            description,
            tags: [],
            createdAt: version.createdAt,
            updatedAt: version.createdAt,
            current: version,
            history: [],
          };
          return {
            templates: [template, ...state.templates],
            activeTemplateId: template.id,
          };
        }),
      updateTemplate: (id, changelog, profile) =>
        set((state) => {
          const templates = state.templates.map((template) => {
            if (template.id !== id) return template;
            const nextVersionNumber = template.current.version + 1;
            const timestamp = new Date().toISOString();
            const version: WorkflowTemplateVersion = {
              id: generateId(),
              version: nextVersionNumber,
              createdAt: timestamp,
              changelog,
              profile: cloneProfile(profile),
            };
            return {
              ...template,
              current: version,
              history: [{ ...template.current }, ...template.history],
              updatedAt: timestamp,
            };
          });
          return { templates };
        }),
      deleteTemplate: (id) =>
        set((state) => ({
          templates: state.templates.filter((template) => template.id !== id),
          activeTemplateId: state.activeTemplateId === id ? undefined : state.activeTemplateId,
        })),
      setActiveTemplate: (id) => set({ activeTemplateId: id }),
      importTemplates: (templates) =>
        set(() => ({
          templates: templates.map((template) => ({
            ...template,
            current: {
              ...template.current,
              profile: cloneProfile(template.current.profile),
            },
            history: template.history.map((version) => ({
              ...version,
              profile: cloneProfile(version.profile),
            })),
          })),
        })),
      exportTemplates: () => JSON.stringify(get().templates, null, 2),
    }),
    {
      name: "workflow-templates",
    },
  ),
);

