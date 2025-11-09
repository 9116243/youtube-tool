import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, ImagePlus, Palette } from "lucide-react";

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
import PageHeader from "@/components/ui/PageHeader";
import { useToast } from "@/hooks/use-toast";

type ThemeToken = "cyberwave" | "glass" | "sunset" | "aurora" | "noir";

const THEME_PRESETS: Record<
  ThemeToken,
  { label: string; primary: string; secondary: string; accent: string }
> = {
  cyberwave: {
    label: "Cyberwave",
    primary: "#0ea5e9",
    secondary: "#6366f1",
    accent: "#22d3ee",
  },
  glass: {
    label: "Glass Frost",
    primary: "#8b5cf6",
    secondary: "#a855f7",
    accent: "#f8fafc",
  },
  sunset: {
    label: "Tropical Sunset",
    primary: "#f97316",
    secondary: "#ef4444",
    accent: "#facc15",
  },
  aurora: {
    label: "Aurora",
    primary: "#14b8a6",
    secondary: "#22d3ee",
    accent: "#bbf7d0",
  },
  noir: {
    label: "Noir",
    primary: "#0f172a",
    secondary: "#1f2937",
    accent: "#f1f5f9",
  },
};

type LayoutVariant = "hero" | "split" | "spotlights";

const LAYOUTS: Array<{ id: LayoutVariant; label: string; description: string }> = [
  { id: "hero", label: "Hero Focus", description: "Large headline, gradient halo, single CTA band." },
  { id: "split", label: "Split Duo", description: "Left copy, right mosaic, accent split line." },
  { id: "spotlights", label: "Spotlights", description: "Grid highlights and icon markers." },
];

function createPosterDataUrl(
  layout: LayoutVariant,
  title: string,
  subtitle: string,
  theme: ThemeToken,
): string {
  const palette = THEME_PRESETS[theme];
  const safeTitle = title || "Enterprise Workflow Launch";
  const safeSubtitle = subtitle || "AI-assisted editing, localisation, and compliance in one hub.";

  const sharedDefs = `
    <defs>
      <linearGradient id="grad-base" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${palette.primary}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${palette.secondary}" stop-opacity="0.85"/>
      </linearGradient>
      <radialGradient id="glow" cx="70%" cy="20%" r="60%">
        <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
  `;

  const layerHero = `
    <rect width="100%" height="100%" fill="url(#grad-base)"/>
    <ellipse cx="72%" cy="28%" rx="180" ry="140" fill="url(#glow)"/>
    <rect x="40" y="48" width="520" height="220" rx="28" fill="rgba(15,23,42,0.55)" />
    <text x="64" y="140" font-size="42" font-family="Inter, Arial" font-weight="700" fill="#f8fafc">${safeTitle}</text>
    <text x="64" y="190" font-size="20" font-family="Inter, Arial" fill="rgba(226,232,240,0.85)">${safeSubtitle}</text>
    <rect x="64" y="220" width="220" height="12" rx="6" fill="rgba(226,232,240,0.35)" />
    <rect x="64" y="240" width="180" height="12" rx="6" fill="rgba(226,232,240,0.25)" />
  `;

  const layerSplit = `
    <rect width="100%" height="100%" fill="${palette.secondary}"/>
    <path d="M0,0 L320,0 L240,400 L0,400 Z" fill="url(#grad-base)" opacity="0.9"/>
    <circle cx="480" cy="96" r="64" fill="url(#glow)"/>
    <rect x="360" y="140" width="220" height="8" rx="4" fill="rgba(15,23,42,0.3)"/>
    <rect x="360" y="160" width="190" height="8" rx="4" fill="rgba(15,23,42,0.2)"/>
    <text x="56" y="150" font-size="40" font-family="Inter, Arial" font-weight="700" fill="#f8fafc">${safeTitle}</text>
    <text x="56" y="198" font-size="20" font-family="Inter, Arial" fill="rgba(226,232,240,0.85)">${safeSubtitle}</text>
    <rect x="56" y="228" width="160" height="10" rx="5" fill="rgba(226,232,240,0.5)" />
  `;

  const layerSpotlights = `
    <rect width="100%" height="100%" fill="#0f172a"/>
    <rect x="0" y="0" width="640" height="400" fill="url(#grad-base)" opacity="0.8"/>
    <circle cx="140" cy="240" r="72" fill="rgba(255,255,255,0.08)"/>
    <circle cx="520" cy="120" r="90" fill="url(#glow)" opacity="0.8"/>
    <text x="60" y="120" font-size="38" font-family="Inter, Arial" font-weight="700" fill="#f8fafc">${safeTitle}</text>
    <text x="60" y="166" font-size="20" font-family="Inter, Arial" fill="rgba(226,232,240,0.85)">${safeSubtitle}</text>
    <rect x="60" y="206" width="220" height="80" rx="18" fill="rgba(15,23,42,0.58)" stroke="rgba(248,250,252,0.12)" stroke-width="2"/>
    <rect x="320" y="206" width="220" height="80" rx="18" fill="rgba(15,23,42,0.48)" stroke="rgba(248,250,252,0.1)" stroke-width="2"/>
  `;

  const layoutLayers: Record<LayoutVariant, string> = {
    hero: layerHero,
    split: layerSplit,
    spotlights: layerSpotlights,
  };

  const svg = `
    <svg width="640" height="400" viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg">
      ${sharedDefs}
      ${layoutLayers[layout]}
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function CoverPage() {
  const { toast } = useToast();
  const [title, setTitle] = useState("Enterprise Workflow Launch");
  const [subtitle, setSubtitle] = useState("AI-assisted editing, localisation, and compliance in one hub.");
  const [theme, setTheme] = useState<ThemeToken>("cyberwave");

  const posters = useMemo(
    () => LAYOUTS.map((layout) => ({ ...layout, preview: createPosterDataUrl(layout.id, title, subtitle, theme) })),
    [title, subtitle, theme],
  );

  const handleDownload = (layout: LayoutVariant) => {
    toast({
      title: "Export queued",
      description: `The ${layout} layout export will be available in the downloads panel.`,
    });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cover Design Lab"
        description="Auto-compose channel artwork using your copy, theme palettes, and reusable layout presets."
        actions={
          <Badge variant="secondary" className="rounded-full px-4 py-1 text-xs uppercase tracking-wide text-cyan-200">
            SVG templates
          </Badge>
        }
      />

      <Card className="bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-cyan-300" />
            Brand inputs
          </CardTitle>
          <CardDescription>
            Control the headline, supporting copy, and theme palette. Variations update instantly.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cover-title">Title</Label>
              <Input
                id="cover-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Enterprise Workflow Launch"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cover-subtitle">Subtitle</Label>
              <Input
                id="cover-subtitle"
                value={subtitle}
                onChange={(event) => setSubtitle(event.target.value)}
                placeholder="AI-assisted editing, localisation, and compliance in one hub."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cover-theme">Theme</Label>
              <Select value={theme} onValueChange={(value) => setTheme(value as ThemeToken)}>
                <SelectTrigger id="cover-theme">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(THEME_PRESETS).map(([id, token]) => (
                    <SelectItem key={id} value={id}>
                      {token.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <Badge variant="secondary">Auto gradients</Badge>
              <Badge variant="secondary">Localized text lanes</Badge>
              <Badge variant="secondary">Ready for motion</Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="rounded-2xl">
                <ImagePlus className="mr-2 h-4 w-4" />
                Regenerate
              </Button>
              <Button variant="secondary" className="rounded-2xl">
                <Download className="mr-2 h-4 w-4" />
                Export all
              </Button>
            </div>
          </div>
          <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-900/50 p-5">
            <p className="text-xs uppercase text-slate-400">Palette preview</p>
            <div className="flex gap-3">
              <div
                className="h-12 flex-1 rounded-2xl"
                style={{ background: THEME_PRESETS[theme].primary }}
                aria-hidden
              />
              <div
                className="h-12 flex-1 rounded-2xl"
                style={{ background: THEME_PRESETS[theme].secondary }}
                aria-hidden
              />
              <div
                className="h-12 flex-1 rounded-2xl border border-white/30"
                style={{ background: THEME_PRESETS[theme].accent }}
                aria-hidden
              />
            </div>
            <p className="text-xs text-slate-400">
              Colours adapt across layout presets and can be exported as tokens for your design system.
            </p>
          </div>
        </CardContent>
      </Card>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: "easeOut" }}
        className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        {posters.map((poster) => (
          <Card key={poster.id} className="bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base text-white">
                {poster.label}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleDownload(poster.id)}
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export
                </Button>
              </CardTitle>
              <CardDescription>{poster.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <motion.img
                src={poster.preview}
                alt={poster.label}
                loading="lazy"
                className="w-full rounded-2xl border border-white/10 object-cover shadow-[0_24px_64px_-40px_rgba(14,165,233,0.65)]"
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              />
              <p className="text-xs text-slate-300">
                Outputs SVG by default; export to PNG, JPG, or hand off to motion templates.
              </p>
            </CardContent>
          </Card>
        ))}
      </motion.div>
    </div>
  );
}

export default CoverPage;

