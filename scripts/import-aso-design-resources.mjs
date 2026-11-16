import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { designFiles, designFilePath } from '../server/aso-design-resources.mjs';

const exists = file => access(designFilePath(file)).then(() => true, () => false);
async function save(file, data) {
  const target = designFilePath(file);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, target);
}

async function download(url, file) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const valid = file.endsWith('.png') ? data.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    : file.endsWith('.jpg') ? data.subarray(0, 3).toString('hex') === 'ffd8ff'
    : file.endsWith('.glb') ? data.length >= 12 && data.toString('ascii', 0, 4) === 'glTF' && data.readUInt32LE(4) === 2 && data.readUInt32LE(8) === data.length
    : file.endsWith('.ttf') ? data.subarray(0, 4).toString('hex') === '00010000'
    : file.endsWith('.webp') ? data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
    : file.endsWith('.svg') ? /<svg[\s>]/i.test(data.toString('utf8'))
      : data.toString('utf8').includes('SIL OPEN FONT LICENSE');
  if (!valid) throw new Error('Unexpected asset format');
  await save(file, data);
}

await mkdir(dirname(designFilePath(designFiles[0].file)), { recursive: true });
async function importResource(resource) {
  try {
    const files = [
      [resource.file, resource.download],
      [resource.previewFile, resource.previewDownload],
      [resource.sourceFile, resource.original],
      [`${resource.id}-OFL.txt`, resource.licenseUrl],
    ];
    for (const [file, url] of files) {
      if (!file || !url || await exists(file)) continue;
      await download(url, file);
      console.log(file);
    }
  } catch (error) {
    console.error(`${resource.file}: ${error.cause?.code || error.message}`);
    process.exitCode = 1;
  }
}

for (let index = 0; index < designFiles.length; index += 4) {
  await Promise.all(designFiles.slice(index, index + 4).map(importResource));
}

const pending = [];
for (const item of designFiles) {
  if (item.sourceFile && await exists(item.sourceFile) && !await exists(item.file)) pending.push(item);
}
if (pending.length) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1536, height: 1536 } });
    await page.setContent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'"><canvas width="1536" height="1536" style="display:block"></canvas><style>body{margin:0}</style>');
    for (const item of pending) {
      try {
        let svg = await readFile(designFilePath(item.sourceFile), 'utf8');
        if (item.kind === 'pattern') {
          svg = svg.replaceAll('<%= background %>', '#f3f0e9').replaceAll('<%= foreground %>', '#303747');
        }
        await page.evaluate(async ({ source, tiled }) => {
          const canvas = document.querySelector('canvas');
          const context = canvas.getContext('2d');
          context.clearRect(0, 0, canvas.width, canvas.height);
          const image = new Image();
          image.src = source;
          await image.decode();
          if (tiled) {
            const pattern = context.createPattern(image, 'repeat');
            const scale = 80 / image.naturalHeight;
            pattern.setTransform(new DOMMatrix().scale(scale));
            context.fillStyle = pattern;
            context.fillRect(0, 0, canvas.width, canvas.height);
          } else {
            const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
            const width = image.naturalWidth * scale;
            const height = image.naturalHeight * scale;
            context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
          }
        }, { source: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, tiled: item.kind === 'pattern' });
        await save(item.file, await page.screenshot({ omitBackground: true }));
        console.log(item.file);
      } catch (error) {
        console.error(`${item.file}: ${error.message}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await browser.close();
  }
}
