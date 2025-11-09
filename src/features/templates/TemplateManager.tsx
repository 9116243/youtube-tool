import { useMemo, useState } from "react";
import { Download, Flame, Import, PlusCircle, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowFormStore } from "@/lib/store";
import type { RenderProfile, WorkflowTemplate } from "@/lib/types";
import { useTemplateStore } from "@/features/templates/store";
import { useQueueStore } from "@/features/queue/store";

const cloneProfile = (profile: RenderProfile): RenderProfile => ({
  ...profile,
  hdrMeta: profile.hdrMeta ? { ...profile.hdrMeta } : undefined,
  subtitleTracks: profile.subtitleTracks ? profile.subtitleTracks.map((track) => ({ ...track })) : [],
  subtitleStyle: profile.subtitleStyle ? { ...profile.subtitleStyle } : undefined,
});

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function TemplateManager() {
  const { toast } = useToast();
  const form = useWorkflowFormStore((state) => state.form);
  const applyRenderProfile = useWorkflowFormStore((state) => state.applyRenderProfile);
  const templates = useTemplateStore((state) => state.templates);
  const createTemplate = useTemplateStore((state) => state.createTemplate);
  const updateTemplate = useTemplateStore((state) => state.updateTemplate);
  const deleteTemplate = useTemplateStore((state) => state.deleteTemplate);
  const exportTemplates = useTemplateStore((state) => state.exportTemplates);
  const importTemplates = useTemplateStore((state) => state.importTemplates);
  const activeTemplateId = useTemplateStore((state) => state.activeTemplateId);
  const setActiveTemplate = useTemplateStore((state) => state.setActiveTemplate);

  const queueTasks = useQueueStore((state) => state.tasks);
  const applyTemplateToTask = useQueueStore((state) => state.applyTemplateToTask);

  const [templateName, setTemplateName] = useState("");
  const [changelog, setChangelog] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("all");

  const currentProfile = useMemo(() => cloneProfile(form), [form]);

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      toast({ title: "Template name required", description: "Please provide a template name.", variant: "destructive" });
      return;
    }
    createTemplate(templateName.trim(), changelog.trim() || "Initial snapshot", currentProfile);
    setTemplateName("");
    setChangelog("");
    toast({ title: "Template saved", description: "Render profile captured successfully." });
  };

  const handleUpdateTemplate = (template: WorkflowTemplate) => {
    updateTemplate(template.id, changelog.trim() || "Profile updated", currentProfile);
    setChangelog("");
    toast({ title: "Template updated", description: "Version history appended." });
  };

  const handleApplyToWorkflow = (template: WorkflowTemplate) => {
    applyRenderProfile(template.current.profile);
    setActiveTemplate(template.id);
    toast({ title: "Template applied", description: `Workflow form updated from ${template.name}.` });
  };

  const handleApplyToQueue = (template: WorkflowTemplate) => {
    if (!queueTasks.length) {
      toast({ title: "Queue empty", description: "Submit a workflow before applying templates.", variant: "destructive" });
      return;
    }

    const targetIds =
      selectedTaskId === "all" ? queueTasks.map((task) => task.id) : queueTasks.filter((task) => task.id === selectedTaskId).map((task) => task.id);

    targetIds.forEach((taskId) => {
      applyTemplateToTask(taskId, template.current.profile);
    });
    toast({
      title: "Template pushed to queue",
      description:
        selectedTaskId === "all"
          ? `Applied ${template.name} to ${targetIds.length} tasks.`
          : `Applied ${template.name} to task ${selectedTaskId}.`,
    });
  };

  const handleExport = () => {
    const payload = exportTemplates();
    downloadTextFile(`workflow-templates-${Date.now()}.json`, payload);
    toast({ title: "Templates exported", description: "JSON downloaded to your machine." });
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as WorkflowTemplate[];
        importTemplates(parsed);
        toast({ title: "Templates imported", description: `${parsed.length} templates loaded.` });
      })
      .catch((error) => {
        toast({
          title: "Import failed",
          description: (error as Error).message ?? "Invalid template file.",
          variant: "destructive",
        });
      });
  };

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base text-white">
          <span>Template Manager</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-3.5 w-3.5" />
              Export
            </Button>
            <Label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <Import className="h-3.5 w-3.5" />
              Import
              <input type="file" accept="application/json" hidden onChange={handleImport} />
            </Label>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-sm text-slate-200">
        <div className="grid gap-3 md:grid-cols-[1.5fr_1fr]">
          <div className="space-y-2">
            <Label htmlFor="template-name" className="text-xs uppercase">
              Template name
            </Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="e.g. 4K HDR Master"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-changelog" className="text-xs uppercase">
              Changelog
            </Label>
            <Input
              id="template-changelog"
              value={changelog}
              onChange={(event) => setChangelog(event.target.value)}
              placeholder="Document recent adjustments"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSaveTemplate} className="rounded-xl bg-cyan-400 text-slate-950 shadow-[0_0_24px_rgba(14,165,233,0.45)] hover:bg-cyan-300">
            <PlusCircle className="mr-2 h-4 w-4" />
            Save template
          </Button>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Flame className="h-3.5 w-3.5 text-amber-300" />
            {templates.length} templates stored
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-xs uppercase text-slate-400">Apply to task</Label>
            <select
              value={selectedTaskId}
              onChange={(event) => setSelectedTaskId(event.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 text-xs text-slate-200"
            >
              <option value="all">All running</option>
              {queueTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {templates.length === 0 ? (
            <p className="text-xs text-slate-400">No templates saved yet. Capture the current render configuration to get started.</p>
          ) : (
            templates.map((template) => (
              <div
                key={template.id}
                className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-400/40 hover:shadow-[0_0_20px_rgba(14,165,233,0.2)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold text-white">{template.name}</span>
                    <span className="text-xs text-slate-400">
                      v{template.current.version} · Updated {new Date(template.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => handleApplyToWorkflow(template)}>
                      Apply to workflow
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleApplyToQueue(template)}>
                      Push to queue
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleUpdateTemplate(template)}>
                      Update version
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-300 hover:text-rose-100"
                      onClick={() => deleteTemplate(template.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300">
                  <span>{template.current.profile.outputResolution}</span>
                  <span>{template.current.profile.hdrMode === "none" ? "SDR" : `HDR ${template.current.profile.hdrMode.toUpperCase()}`}</span>
                  <span>{template.current.profile.encoder.toUpperCase()}</span>
                  <span>{template.current.profile.toneMap !== "off" ? `Tone map: ${template.current.profile.toneMap}` : "No tone map"}</span>
                  <span>{template.current.profile.subtitleMode === "off" ? "Subtitles off" : `Subtitles ${template.current.profile.subtitleMode}`}</span>
                </div>
                {template.history.length ? (
                  <div className="mt-2 text-[11px] text-slate-400">
                    Previous versions: v{template.history[0].version} · {template.history.length} entries
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default TemplateManager;
