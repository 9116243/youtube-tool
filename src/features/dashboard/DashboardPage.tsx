import { motion } from "framer-motion";
import { Brain, Flame, Sparkles, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

const fadeIn = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

const insights = [
  {
    title: "Collaboration index",
    description: "AI suggests seven workflow pairings to accelerate delivery.",
    icon: Sparkles,
    metric: "+18%",
    detail: "Versus last week",
  },
  {
    title: "Narration confidence",
    description: "Auto-QC on subtitles and timing is trending upward.",
    icon: Brain,
    metric: "92%",
    detail: "Completion quality",
  },
  {
    title: "Engagement driver",
    description: "Watch time across regions improved by 11.6%.",
    icon: TrendingUp,
    metric: "+11.6%",
    detail: "Week-on-week growth",
  },
];

const realtimeQueue = [
  { id: "WK-2025-1123", title: "AI workflow - product launch", status: "Rendering", eta: "02:15" },
  { id: "WK-2025-1124", title: "Subtitle localisation", status: "Waiting", eta: "05:20" },
  { id: "WK-2025-1125", title: "Podcast recap - episode 07", status: "Encoding", eta: "Done" },
];

export function DashboardPage() {
  const metrics = useAppStore((state) => state.metrics);

  return (
    <div className="space-y-8">
      <motion.section
        initial="hidden"
        animate="visible"
        variants={fadeIn}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="grid grid-cols-1 gap-6 md:grid-cols-3"
      >
        {metrics.map((metric) => (
          <Card key={metric.id} className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm text-slate-300">{metric.label}</CardTitle>
                <p className="mt-2 text-3xl font-semibold text-white">{formatNumber(metric.value)}</p>
              </div>
              <Badge
                variant={metric.trend === "up" ? "default" : "secondary"}
                className="bg-cyan-500/15 text-cyan-200"
              >
                {metric.trend === "up" ? "+" : "-"}
                {metric.delta}%
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-400">Live data from orchestration analytics.</p>
            </CardContent>
          </Card>
        ))}
      </motion.section>

      <Tabs defaultValue="insights">
        <TabsList>
          <TabsTrigger value="insights">Highlights</TabsTrigger>
          <TabsTrigger value="queue">Live queue</TabsTrigger>
          <TabsTrigger value="status">System status</TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="grid gap-6 md:grid-cols-3">
          {insights.map((item) => (
            <motion.div
              key={item.title}
              variants={fadeIn}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.26, ease: "easeOut" }}
            >
              <Card className="h-full border border-white/10 bg-white/5 backdrop-blur-xl">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-200">
                      <item.icon size={20} strokeWidth={1.7} />
                    </span>
                    <div>
                      <CardTitle className="text-base text-white">{item.title}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-white">{item.metric}</p>
                  <p className="text-xs text-slate-400">{item.detail}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="queue">
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Live queue <Badge variant="secondary">Auto refresh - 3s</Badge>
              </CardTitle>
              <CardDescription>Overview of tasks currently processing through the pipeline.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {realtimeQueue.map((task) => (
                <div
                  key={task.id}
                  className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">{task.title}</p>
                      <p className="text-xs text-slate-400">{task.id}</p>
                    </div>
                    <Badge variant="secondary">{task.status}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>Target ETA</span>
                    <span>{task.eta}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status">
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Platform status <Flame className="h-4 w-4 text-amber-300" />
              </CardTitle>
              <CardDescription>
                This dashboard aggregates compute, storage, and localisation health checks.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
                <p className="text-xs text-slate-400">GPU cluster</p>
                <p className="mt-2 text-xl font-semibold text-white">Operational</p>
                <p className="text-xs text-slate-400">5/64 nodes on standby</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
                <p className="text-xs text-slate-400">Storage cache</p>
                <p className="mt-2 text-xl font-semibold text-white">Healthy</p>
                <p className="text-xs text-slate-400">483 GB free - auto purge enabled</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
                <p className="text-xs text-slate-400">Localisation services</p>
                <p className="mt-2 text-xl font-semibold text-white">Degraded</p>
                <p className="text-xs text-slate-400">Spanish dubbing retrying (ETA 6m)</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

