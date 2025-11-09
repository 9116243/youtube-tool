import { motion } from "framer-motion";
import { ArrowRight, Layers3, Sparkles, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueuePanel } from "@/features/queue/QueuePanel";

const workflowStages = [
  {
    name: "Ingest & clean",
    description: "Automatic capture of source files, smart dedupe, and compliance screening.",
    eta: "~ 3 minutes",
    icon: Layers3,
  },
  {
    name: "AI analysis",
    description: "Scene detection, product taxonomy tagging, and voiceover alignment.",
    eta: "~ 8 minutes",
    icon: Sparkles,
  },
  {
    name: "Render & QC",
    description: "Motion graphics, sound mix, localisation overlays, and final checks.",
    eta: "~ 5 minutes",
    icon: Wand2,
  },
];

const templateHints = [
  {
    name: "Product launch spotlight",
    description: "15/30/45 second variants, neon overlay, KPI chapter markers.",
  },
  {
    name: "Customer story documentary",
    description: "Warm gradient, subtitles baked in, B-roll auto-suggestions.",
  },
  {
    name: "Vertical shorts pack",
    description: "9:16 reframe, autotune hooks, Shorts/TikTok metadata ready.",
  },
  {
    name: "Livestream recap",
    description: "Highlights reel, time-coded CTAs, recap blog copy stub.",
  },
];

export function WorkflowPage() {
  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="rounded-3xl border border-white/10 bg-cyan-500/10 p-8 shadow-[0_32px_120px_-60px_rgba(14,165,233,0.8)]"
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-200">
              Workflow v3.2
            </Badge>
            <h2 className="mt-4 text-3xl font-semibold text-white">AI workflow orchestration</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-200">
              Automate ingest, analysis, and rendering in one control plane. Collaborative queues keep
              post-production, localisation, and compliance teams aligned.
            </p>
          </div>
          <Button variant="default" size="lg" className="gap-2 rounded-2xl">
            Create workflow
            <ArrowRight size={16} />
          </Button>
        </div>
      </motion.div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="queue">Live queue</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <div className="grid gap-6 md:grid-cols-3">
            {workflowStages.map((stage) => (
              <Card key={stage.name} className="relative overflow-hidden border-white/10 bg-white/5 backdrop-blur-xl">
                <div className="absolute -right-6 top-6 h-20 w-20 rounded-full bg-cyan-500/15" />
                <CardHeader>
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-200">
                    <stage.icon size={20} />
                  </span>
                  <CardTitle className="mt-4 text-base text-white">{stage.name}</CardTitle>
                  <CardDescription>{stage.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-cyan-200">{stage.eta}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="queue">
          <Card className="bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Live render queue</CardTitle>
              <CardDescription>Streaming progress for active tasks with pause, resume, and cancel control.</CardDescription>
            </CardHeader>
            <CardContent>
              <QueuePanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card className="bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Template library</CardTitle>
              <CardDescription>
                Save preset configurations to accelerate campaign launch and localisation.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {templateHints.map((template) => (
                <div
                  key={template.name}
                  className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                >
                  <p className="text-sm font-semibold text-white">{template.name}</p>
                  <p className="mt-1 text-xs text-slate-300">{template.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
