import { useEffect, useState } from "react";

import { type LanguageCode } from "@/lib/languages";
import { listVoices, providerLabel, type TTSProvider, type TTSVoice } from "@/lib/tts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface TTSSelectorProps {
  provider: TTSProvider;
  onProviderChange: (provider: TTSProvider) => void;
  language: LanguageCode;
  voiceId?: string;
  onVoiceChange: (voiceId: string | undefined) => void;
}

export function TTSSelector({
  provider,
  onProviderChange,
  language,
  voiceId,
  onVoiceChange,
}: TTSSelectorProps) {
  const [loading, setLoading] = useState(false);
  const [voices, setVoices] = useState<TTSVoice[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (provider === "none") {
        setVoices([]);
        return;
      }
      setLoading(true);
      const result = await listVoices(provider, language).catch(() => []);
      if (mounted) {
        setVoices(result);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [provider, language]);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <Label className="mb-1 block">TTS provider</Label>
        <Select value={provider} onValueChange={(value) => onProviderChange(value as TTSProvider)}>
          <SelectTrigger>
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Disabled</SelectItem>
            <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
            <SelectItem value="azure">Azure TTS</SelectItem>
            <SelectItem value="google">Google TTS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-1 block">Voice ({providerLabel(provider)})</Label>
        {loading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <Select
            value={voiceId ?? ""}
            onValueChange={(value) => onVoiceChange(value || undefined)}
            disabled={provider === "none" || voices.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  provider === "none"
                    ? "Voice selection disabled"
                    : voices.length
                      ? "Select a voice"
                      : "No voices available"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name} {voice.previewUrl ? "(preview)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

export default TTSSelector;
