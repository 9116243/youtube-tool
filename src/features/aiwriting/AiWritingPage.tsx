import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardCopy, Lightbulb, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/ui/PageHeader";
import { useToast } from "@/hooks/use-toast";

type Tone = "energetic" | "professional" | "playful" | "insightful";
type Channel = "youtube" | "shorts" | "tiktok" | "linkedin";

const TONE_OPTIONS: Array<{ value: Tone; label: string }> = [
  { value: "energetic", label: "Energetic" },
  { value: "professional", label: "Professional" },
  { value: "playful", label: "Playful" },
  { value: "insightful", label: "Insightful" },
];

const CHANNEL_OPTIONS: Array<{ value: Channel; label: string }> = [
  { value: "youtube", label: "YouTube Long-form" },
  { value: "shorts", label: "YouTube Shorts" },
  { value: "tiktok", label: "TikTok Vertical" },
  { value: "linkedin", label: "LinkedIn Thought Leadership" },
];

function buildTitles(topic: string, tone: Tone, channel: Channel): string[] {
  const base = topic || "AI workflow automation";
  const toneTail = {
    energetic: ["Unlocked", "in Record Time", "Supercharged", "Like a Pro"],
    professional: ["for Enterprise Teams", "that Scales", "Playbook", "Executive Brief"],
    playful: ["You Need to Try", "that Actually Works", "No One Told You About", "Before Coffee"],
    insightful: ["You Should Know", "Analytics Deep-Dive", "Strategic Edition", "Leaders Follow"],
  }[tone];

  const channelTag = {
    youtube: "2025",
    shorts: "Under 60s",
    tiktok: "Viral",
    linkedin: "Boardroom",
  }[channel];

  const list: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const suffix = toneTail[i % toneTail.length];
    list.push(`${base} ${suffix} (${channelTag} ${i + 1})`);
  }
  return list;
}

function buildDescriptions(topic: string, keywords: string[]): string[] {
  const focus = topic || "AI workflow automation";
  const joinedKeywords = keywords.length ? keywords.join(", ") : "workflow, automation, productivity";
  return [
    `Discover how ${focus.toLowerCase()} teams ship twice as fast with coordinated scripting, localized narration, and compliance-ready review loops.`,
    `We unpack the lifecycle from ideation to render, highlight the tools that matter, and show how to align stakeholders without bloating headcount. Keywords: ${joinedKeywords}.`,
    `Stay until the end for an action checklist and benchmark metrics you can adopt this quarter. Ideal for marketing, product education, and ops enablement squads.`,
  ];
}

function buildHashtags(topic: string): string[] {
  const base = topic
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((chunk) => chunk.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);

  const defaults = ["AIWorkflow", "CreatorOps", "EnterpriseYT", "Automation"];
  return [...new Set([...base.map((token) => token.charAt(0).toUpperCase() + token.slice(1)), ...defaults])].map(
    (tag) => `#${tag}`,
  );
}

export function AiWritingPage() {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("energetic");
  const [channel, setChannel] = useState<Channel>("youtube");
  const [keywords, setKeywords] = useState("");
  const [callToAction, setCallToAction] = useState("Subscribe for weekly automation drops.");
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);

  const keywordList = useMemo(
    () =>
      keywords
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [keywords],
  );

  const titles = useMemo(() => buildTitles(topic, tone, channel), [topic, tone, channel]);
  const descriptions = useMemo(() => buildDescriptions(topic, keywordList), [topic, keywordList]);
  const hashtags = useMemo(() => buildHashtags(topic || "AI Workflow"), [topic]);

  const handleGenerate = () => {
    setGeneratedAt(Date.now());
    toast({
      title: "Content refreshed",
      description: "Draft titles, descriptions, and hashtags are ready for review.",
    });
  };

  const handleCopy = (content: string) => {
    void navigator.clipboard.writeText(content).then(() => {
      toast({
        title: "Copied to clipboard",
        description: "Share with your creative team or paste directly into the publisher.",
      });
    });
  };

  const combinedCopy = [
    `Topic: ${topic || "AI workflow automation"}`,
    `Tone: ${tone}`,
    `Channel: ${channel}`,
    "",
    "Titles:",
    ...titles.map((title, index) => `${index + 1}. ${title}`),
    "",
    "Descriptions:",
    ...descriptions.map((desc, index) => `${index + 1}. ${desc}`),
    "",
    `CTA: ${callToAction}`,
    "",
    `Hashtags: ${hashtags.join(" ")}`,
  ].join("\n");

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI Writing Studio"
        description="Spin up channel-ready titles, hook lines, and descriptions tuned to your brand voice."
        actions={
          <Button
            variant="secondary"
            className="rounded-2xl"
            onClick={() => handleCopy(combinedCopy)}
            disabled={!generatedAt}
          >
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copy all
          </Button>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="grid gap-6 xl:grid-cols-[1.4fr_1fr]"
      >
        <Card className="bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Prompt builder</CardTitle>
            <CardDescription>Define the creative brief that powers the copy suggestions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="channel">Channel</Label>
                <Select value={channel} onValueChange={(value) => setChannel(value as Channel)}>
                  <SelectTrigger id="channel">
                    <SelectValue placeholder="Choose a channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tone">Tone</Label>
                <Select value={tone} onValueChange={(value) => setTone(value as Tone)}>
                  <SelectTrigger id="tone">
                    <SelectValue placeholder="Select tone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="topic">Topic</Label>
                <Input
                  id="topic"
                  placeholder="Example: Automating the enterprise YouTube workflow"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="keywords">Keywords (comma separated)</Label>
                <Input
                  id="keywords"
                  placeholder="workflow, automation, enterprise video"
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cta">Call to action</Label>
              <Textarea
                id="cta"
                maxLength={160}
                value={callToAction}
                onChange={(event) => setCallToAction(event.target.value)}
                className="min-h-[90px]"
              />
              <p className="text-right text-xs text-slate-400">{callToAction.length}/160</p>
            </div>

            <Button className="w-full rounded-2xl" onClick={handleGenerate}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate copy
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-cyan-300" />
              Guidance hints
            </CardTitle>
            <CardDescription>
              Data-backed suggestions tuned to the channel algorithm and tonal guard rails.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-200">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              Keep the hook within the first 50 characters for Shorts, and front-load a single benefit.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              Mention two keywords within the opening line to boost semantic pairing in recommendations.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              CTA ideas: invite reply with a metric, tease a downloadable checklist, or link to the workflow demo.
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Tabs defaultValue="titles" className="space-y-5">
        <TabsList>
          <TabsTrigger value="titles">Titles (10)</TabsTrigger>
          <TabsTrigger value="descriptions">Descriptions</TabsTrigger>
          <TabsTrigger value="hashtags">Hashtags</TabsTrigger>
        </TabsList>

        <TabsContent value="titles" className="focus:outline-none">
          <Card className="bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Headline ideas</CardTitle>
              <CardDescription>
                Remix or drag into your publishing suite. Content regenerates each time you hit generate.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {titles.map((title, index) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs font-semibold text-cyan-300">#{index + 1}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleCopy(title)}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-white">{title}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="descriptions" className="focus:outline-none">
          <Card className="bg-white/5 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Channel description</CardTitle>
                <CardDescription>
                  String together your summary, CTA, and timing cues for chaptering or long-form copy.
                </CardDescription>
              </div>
              <Button variant="secondary" onClick={() => handleCopy(descriptions.join("\n\n"))}>
                Copy block
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed text-slate-200">
              {descriptions.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-cyan-200">
                CTA: {callToAction}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hashtags" className="focus:outline-none">
          <Card className="bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Hashtag kit</CardTitle>
              <CardDescription>Balanced mix of branded, campaign, and discovery-friendly tags.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {hashtags.map((tag) => (
                <Badge key={tag} variant="secondary" className="cursor-pointer">
                  {tag}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AiWritingPage;

