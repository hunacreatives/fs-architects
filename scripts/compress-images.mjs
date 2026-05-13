import sharp from 'sharp';
import { readdir, stat, rename, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const IMAGES_DIR = './public/images';
const QUALITY = 80;

// Skip logos, icons, UI elements, and animated GIFs
const SKIP = new Set([
  'logo-fs.png',
  'logo-footer.png',
  'logo-wordmark.png',
  'logo-wordmark-alt.png',
  'intro-logo.png',
  'byd-logo.png',
  'hamburger.png',
  'logo-forward.gif',
  'logo-reverse.gif',
]);

async function getAllFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  const allFiles = await getAllFiles(IMAGES_DIR);
  const toConvert = allFiles.filter(f => {
    const name = path.basename(f);
    const ext = path.extname(f).toLowerCase();
    if (SKIP.has(name)) return false;
    if (ext === '.svg' || ext === '.gif' || ext === '.webp') return false;
    return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
  });

  console.log(`Converting ${toConvert.length} images to webp (skipping ${SKIP.size} logo/icon files)\n`);

  let converted = 0;
  let savedBytes = 0;

  for (const src of toConvert) {
    const base = src.replace(/\.(jpg|jpeg|png)$/i, '');
    const webpPath = base + '.webp';
    const tmpPath = base + '.tmp.webp';
    const name = path.relative(IMAGES_DIR, src);

    try {
      const beforeStat = await stat(src);
      await sharp(src).webp({ quality: QUALITY }).toFile(tmpPath);
      const afterStat = await stat(tmpPath);

      await rename(tmpPath, webpPath);
      await unlink(src);

      savedBytes += beforeStat.size - afterStat.size;
      converted++;
      console.log(`  ${name} → ${path.basename(webpPath)} (${(beforeStat.size/1024).toFixed(0)}KB → ${(afterStat.size/1024).toFixed(0)}KB)`);
    } catch (err) {
      console.error(`  FAILED: ${name}: ${err.message}`);
      if (existsSync(tmpPath)) await unlink(tmpPath).catch(() => {});
    }
  }

  console.log(`\nDone: ${converted} files converted, saved ${(savedBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`\nSkipped (logos/icons):`);
  for (const name of SKIP) console.log(`  ${name}`);

  const remaining = await getAllFiles(IMAGES_DIR);
  let totalSize = 0;
  for (const f of remaining) totalSize += (await stat(f)).size;
  console.log(`\nFinal images folder size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(console.error);
