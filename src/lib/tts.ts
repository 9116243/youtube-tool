import type { LanguageCode } from "./languages";

export type TTSProvider = "none" | "elevenlabs" | "azure" | "google";

export interface TTSVoice {
  id: string;
  name: string;
  language: string;
  previewUrl?: string;
}

const ELEVEN_API = "https://api.elevenlabs.io/v1";

export async function listVoices(
  provider: TTSProvider,
  language?: LanguageCode,
): Promise<TTSVoice[]> {
  if (provider === "elevenlabs") {
    const key = import.meta.env.VITE_ELEVEN_API_KEY;
    if (!key) return [];
    try {
      const response = await fetch(`${ELEVEN_API}/voices`, {
        headers: { "xi-api-key": key },
      });
      const data = await response.json();
      const voices: TTSVoice[] = (data?.voices ?? []).map((voice: any) => ({
        id: voice.voice_id,
        name: voice.name,
        language: voice.labels?.language ?? voice.language ?? "",
        previewUrl: voice.preview_url,
      }));
      if (!language) return voices;
      const keyword = language.toLowerCase();
      return voices.filter(
        (voice) =>
          voice.language?.toLowerCase().includes(keyword) ||
          voice.name?.toLowerCase().includes(keyword),
      );
    } catch {
      return [];
    }
  }
  return [];
}

export function providerLabel(provider: TTSProvider) {
  switch (provider) {
    case "elevenlabs":
      return "ElevenLabs";
    case "azure":
      return "Azure TTS";
    case "google":
      return "Google TTS";
    default:
      return "Not configured";
  }
}

