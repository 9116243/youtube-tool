import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Usage: node scripts/build_hero.mjs ./hero-src
const src = process.argv[2] || './hero-src';
const outDir = 'public/brand/hero';
fs.mkdirSync(outDir, { recursive: true });

const sizes = { sm:768, md:1280, lg:1600, xl:2160 };

const files = fs.readdirSync(src)
  .filter(f => /\.(png|jpg|jpeg|webp|avif)$/i.test(f))
  .sort((a,b)=> a.localeCompare(b, 'en', { numeric:true }));

let idx = 1;
for (const f of files) {
  const inPath = path.join(src, f);
  const id = String(idx).padStart(2,'0');
  for (const [k,w] of Object.entries(sizes)) {
    const base = `vivid-hero-${id}-${k}`;
    await sharp(inPath).resize({ width: w }).toFormat('webp', { quality: 82 }).toFile(path.join(outDir, `${base}.webp`));
    await sharp(inPath).resize({ width: w }).toFormat('avif', { quality: 65 }).toFile(path.join(outDir, `${base}.avif`));
  }
  idx++;
}
console.log('Hero images built ->', outDir);
