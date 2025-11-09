export interface SpriteJobResult {
  sheetUrl: string;
  vttUrl: string;
}

export async function generateSpriteSheet(videoPath: string): Promise<SpriteJobResult> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const id = btoa(videoPath).replace(/[^a-z0-9]/gi, "").slice(0, 8);
  return {
    sheetUrl: `https://placehold.co/640x360/png?text=sprite-${id}`,
    vttUrl: `https://example.com/${id}.vtt`,
  };
}
