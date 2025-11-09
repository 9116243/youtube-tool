import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const src = process.argv[2] || './矢量图';
const outDir = 'public/brand/icons/neon';
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(src)
  .filter(f => /\.(png|jpg|jpeg|webp|avif)$/i.test(f))
  .sort((a,b)=> a.localeCompare(b, 'en', { numeric:true }));

const manifest = [];
let i = 1;
for (const f of files) {
  const id = String(i).padStart(3,'0');
  const base = `vi-${id}`;
  const inPath = path.join(src, f);
  const outBase = path.join(outDir, base);

  const img = sharp(inPath).resize(512,512,{ fit:'cover' });
  await img.webp({ quality: 86 }).toFile(`${outBase}.webp`);
  await img.avif({ quality: 70 }).toFile(`${outBase}.avif`);
  await img.png({ compressionLevel: 9 }).toFile(`${outBase}.png`);

  manifest.push({ id, name: base, src: {
    webp: `/public/brand/icons/neon/${base}.webp`,
    avif: `/public/brand/icons/neon/${base}.avif`,
    png: `/public/brand/icons/neon/${base}.png`
  }});
  i++;
}

fs.writeFileSync(path.join(outDir, 'icons.json'), JSON.stringify(manifest, null, 2));
console.log(`Done: ${manifest.length} icons -> ${outDir}`);
