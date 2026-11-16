import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_DIR = resolve(ROOT, 'data/aso-design');
const PUBLIC_DIR = resolve(ROOT, 'public');
const LUCIDE_DIR = resolve(ROOT, 'node_modules/lucide-react/dist/esm/icons');
const PROFILES = JSON.parse(readFileSync(resolve(ROOT, 'server/aso-screenshot-profiles.json'), 'utf8'));

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
};

const ALLOWED_ASSET_EXTS = new Set(Object.keys(MIME_TYPES));

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function ensureOpaqueRgbPng(pngBuffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!pngBuffer.subarray(0, 8).equals(sig)) throw new Error('Invalid PNG signature');
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idats = [];
  while (offset < pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
    const data = pngBuffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (colorType === 2 && bitDepth === 8) return pngBuffer;
  if (colorType !== 6 || bitDepth !== 8) {
    throw new Error(`Unsupported PNG format (colorType=${colorType}, bitDepth=${bitDepth})`);
  }
  const raw = inflateSync(Buffer.concat(idats));
  const bpp = 4;
  const stride = width * bpp;
  const prev = new Uint8Array(stride);
  const curr = new Uint8Array(stride);
  const rgbRowStride = 1 + width * 3;
  const rgbRaw = Buffer.allocUnsafe(height * rgbRowStride);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + stride);
    const filter = raw[rowStart];
    for (let x = 0; x < stride; x++) {
      const val = raw[rowStart + 1 + x];
      const a = x >= bpp ? curr[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let recon = val;
      if (filter === 1) recon = (val + a) & 0xff;
      else if (filter === 2) recon = (val + b) & 0xff;
      else if (filter === 3) recon = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) recon = (val + paeth(a, b, c)) & 0xff;
      curr[x] = recon;
    }
    const outStart = y * rgbRowStride;
    rgbRaw[outStart] = 0;
    for (let x = 0; x < width; x++) {
      const s = x * 4;
      const d = outStart + 1 + x * 3;
      const alpha = curr[s + 3];
      if (alpha === 255) {
        rgbRaw[d] = curr[s];
        rgbRaw[d + 1] = curr[s + 1];
        rgbRaw[d + 2] = curr[s + 2];
      } else {
        const inv = 255 - alpha;
        rgbRaw[d] = Math.round((curr[s] * alpha + 255 * inv) / 255);
        rgbRaw[d + 1] = Math.round((curr[s + 1] * alpha + 255 * inv) / 255);
        rgbRaw[d + 2] = Math.round((curr[s + 2] * alpha + 255 * inv) / 255);
      }
    }
    prev.set(curr);
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB without alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rgbRaw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildFontFaceCss() {
  if (!existsSync(DESIGN_DIR)) return '';
  return readdirSync(DESIGN_DIR)
    .filter(file => file.endsWith('.ttf'))
    .map(file => {
      const id = file.slice(0, -4);
      return `@font-face { font-family: '${id}'; src: url('/aso-design/${encodeURIComponent(file)}') format('truetype'); font-weight: 100 900; font-display: block; }`;
    })
    .join('\n');
}

function injectFontsCss(html) {
  const linkTag = '<link rel="stylesheet" href="/aso-fonts.css" />';
  if (html.includes('/aso-fonts.css')) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, match => `${match}\n${linkTag}`);
  }
  return `${linkTag}\n${html}`;
}

function escapeAttr(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function loadLucideSvg(name, { size = '24', color = 'currentColor', strokeWidth = '2', className = '', style = '' } = {}) {
  const safeName = String(name || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!safeName) return '';
  const iconFile = resolve(LUCIDE_DIR, `${safeName}.js`);
  if (!existsSync(iconFile)) return '';
  const src = readFileSync(iconFile, 'utf8');
  const start = src.indexOf('[');
  const end = src.lastIndexOf(']');
  if (start === -1 || end === -1) return '';
  let nodes = [];
  try {
    const jsonLike = src
      .slice(start, end + 1)
      .replace(/"(?:\\.|[^"\\])*"|([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/g, (match, key) => (key ? `"${key}":` : match));
    nodes = JSON.parse(jsonLike);
  } catch {
    return '';
  }
  const inner = nodes.map(([tag, attrs]) => {
    const attrStr = Object.entries(attrs || {})
      .filter(([k]) => k !== 'key')
      .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
      .join(' ');
    return `<${tag} ${attrStr}/>`;
  }).join('');
  const extraAttrs = [
    className ? `class="${escapeAttr(className)}"` : '',
    style ? `style="${escapeAttr(style)}"` : '',
  ].filter(Boolean).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${escapeAttr(size)}" height="${escapeAttr(size)}" viewBox="0 0 24 24" fill="none" stroke="${escapeAttr(color)}" stroke-width="${escapeAttr(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" ${extraAttrs}>${inner}</svg>`;
}

export function hydrateLucideIcons(html) {
  return String(html || '').replace(
    /<(i|span)\b([^>]*\bdata-lucide=["']([a-zA-Z0-9-]+)["'][^>]*)>(?:\s*<\/\1>)?/gi,
    (full, _tag, rawAttrs, iconName) => {
      const readAttr = attr => {
        const m = new RegExp(`\\b${attr}=["']([^"']*)["']`, 'i').exec(rawAttrs);
        return m ? m[1] : '';
      };
      const svg = loadLucideSvg(iconName, {
        size: readAttr('data-size') || '24',
        color: readAttr('data-color') || 'currentColor',
        strokeWidth: readAttr('data-stroke-width') || '2',
        className: readAttr('class'),
        style: readAttr('style'),
      });
      return svg || full;
    },
  );
}

function parseSizeString(raw) {
  const match = /^(\d+)x(\d+)$/i.exec(String(raw || '').trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function safeFileWithin(baseDir, relPath) {
  const decoded = decodeURIComponent(relPath).replace(/^\/+/, '');
  const target = resolve(baseDir, decoded);
  const rel = relative(baseDir, target);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  const ext = extname(target).toLowerCase();
  if (!ALLOWED_ASSET_EXTS.has(ext) || !existsSync(target)) return null;
  return { path: target, mime: MIME_TYPES[ext] };
}

function parseArgs(argv) {
  const positional = [];
  let profile = '';
  let sizeArg = '';
  let thumb = '';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile') { profile = argv[++i] || ''; continue; }
    if (arg === '--size') { sizeArg = argv[++i] || ''; continue; }
    if (arg === '--thumb') { thumb = argv[++i] || ''; continue; }
    positional.push(arg);
  }
  return { input: positional[0], output: positional[1], profile, sizeArg, thumb };
}

export async function renderAsoHtml({
  html: rawHtmlInput,
  htmlPath,
  outputPath,
  profile = '',
  size: explicitSize = null,
  thumbPath = '',
  sceneDir: explicitSceneDir = '',
}) {
  if (!outputPath || extname(outputPath).toLowerCase() !== '.png') {
    throw new Error('Output file must end with .png');
  }
  if (profile && !Object.hasOwn(PROFILES, profile)) {
    throw new Error(`Unknown profile: ${profile}. Available: ${Object.keys(PROFILES).join(', ')}`);
  }

  const resolvedHtmlPath = htmlPath ? resolve(htmlPath) : '';
  const rawHtml = rawHtmlInput ?? readFileSync(resolvedHtmlPath, 'utf8');
  const sceneDir = explicitSceneDir ? resolve(explicitSceneDir) : (resolvedHtmlPath ? dirname(resolvedHtmlPath) : ROOT);

  let size = explicitSize;
  if (!size) {
    const metaMatch = rawHtml.match(/<meta\s+name=["']aso-size["']\s+content=["'](\d+x\d+)["']/i);
    if (metaMatch) size = parseSizeString(metaMatch[1]);
  }
  if (!size && profile) size = PROFILES[profile][0];
  if (!size) size = [1242, 2688];

  const [width, height] = size;
  if (!(width > 0 && width <= 4096 && height > 0 && height <= 4096)) {
    throw new Error('Canvas dimensions must be between 1 and 4096');
  }
  if (profile) {
    const valid = PROFILES[profile].some(([w, h]) => w === width && h === height);
    if (!valid) {
      const allowed = PROFILES[profile].map(([w, h]) => `${w}x${h}`).join(', ');
      throw new Error(`${profile} requires a .png output and one of these sizes: ${allowed}`);
    }
  }

  const html = injectFontsCss(hydrateLucideIcons(rawHtml));
  const fontsCss = buildFontFaceCss();

  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://aso-render.local') return route.abort();
      if (url.pathname === '/') {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
      }
      if (url.pathname === '/aso-fonts.css') {
        return route.fulfill({ contentType: 'text/css; charset=utf-8', body: fontsCss });
      }
      let resolved = null;
      if (url.pathname.startsWith('/aso-design/')) {
        resolved = safeFileWithin(DESIGN_DIR, url.pathname.slice('/aso-design/'.length));
      } else if (url.pathname.startsWith('/api/aso/design-resources/')) {
        resolved = safeFileWithin(DESIGN_DIR, url.pathname.slice('/api/aso/design-resources/'.length));
      } else if (url.pathname.startsWith('/aso-lab/')) {
        resolved = safeFileWithin(resolve(PUBLIC_DIR, 'aso-lab'), url.pathname.slice('/aso-lab/'.length));
      } else if (url.pathname.startsWith('/public/')) {
        resolved = safeFileWithin(PUBLIC_DIR, url.pathname.slice('/public/'.length));
      } else if (url.pathname.startsWith('/local/')) {
        resolved = safeFileWithin(sceneDir, url.pathname.slice('/local/'.length));
      } else if (url.pathname.startsWith('/repo/')) {
        resolved = safeFileWithin(ROOT, url.pathname.slice('/repo/'.length));
      } else {
        resolved = safeFileWithin(sceneDir, url.pathname.slice(1)) || safeFileWithin(ROOT, url.pathname.slice(1));
      }
      if (!resolved) return route.abort('accessdenied');
      return route.fulfill({ contentType: resolved.mime, path: resolved.path });
    });

    await page.goto('http://aso-render.local/', { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      const images = Array.from(document.images);
      await Promise.all(images.map(img => img.complete ? img.decode().catch(() => {}) : new Promise(done => {
        img.addEventListener('load', () => img.decode().catch(() => {}).finally(done), { once: true });
        img.addEventListener('error', done, { once: true });
      })));
    });

    const rawShot = await page.screenshot({ type: 'png', omitBackground: false });
    const rgbPng = ensureOpaqueRgbPng(rawShot);
    const outPath = resolve(outputPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, rgbPng);

    const pngDataUrl = `data:image/png;base64,${rgbPng.toString('base64')}`;

    const audit = await page.evaluate(async ({ dataUrl, canvasWidth, canvasHeight }) => {
      const issues = [];
      const rgbFromCss = raw => {
        const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/i.exec(raw || '');
        if (!m) return null;
        return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
      };
      const luminance = ({ r, g, b }) => {
        const toLin = v => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
      };
      const contrastRatio = (c1, c2) => {
        const l1 = luminance(c1);
        const l2 = luminance(c2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };

      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const sampleEdgeWhiteRatio = () => {
        const step = 24;
        let total = 0;
        let nearWhite = 0;
        const pts = [];
        for (let x = 6; x < canvasWidth; x += step) {
          pts.push([x, 6], [x, canvasHeight - 7]);
        }
        for (let y = 6; y < canvasHeight; y += step) {
          pts.push([6, y], [canvasWidth - 7, y]);
        }
        for (const [x, y] of pts) {
          const d = ctx.getImageData(x, y, 1, 1).data;
          total += 1;
          if (luminance({ r: d[0], g: d[1], b: d[2] }) > 0.88) nearWhite += 1;
        }
        return total ? nearWhite / total : 0;
      };

      const seenEls = new Set();
      const textBoxes = [];
      const tinyTexts = [];
      const lowContrastTexts = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue || !node.nodeValue.trim()) continue;
        const el = node.parentElement;
        if (!el || seenEls.has(el)) continue;
        seenEls.add(el);
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const opacity = parseFloat(style.opacity || '1');
        if (opacity <= 0.18) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        if (rect.bottom <= 0 || rect.top >= canvasHeight || rect.right <= 0 || rect.left >= canvasWidth) continue;
        const fontSize = parseFloat(style.fontSize || '0');
        const text = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 28);
        const color = rgbFromCss(style.color);
        if (color && color.a <= 0.25 && fontSize > 180) continue;
        textBoxes.push({ el, rect, fontSize, text, style, color });
        if (fontSize > 0 && fontSize < 26) {
          tinyTexts.push(`${text} (${Math.round(fontSize)}px)`);
        }
        const isGradientText = style.webkitBackgroundClip === 'text' || style.backgroundClip === 'text';
        if (color && color.a > 0.6 && !isGradientText && rect.width >= 12 && rect.height >= 12) {
          const sx = Math.max(0, Math.min(canvasWidth - 1, Math.round(rect.left + 2)));
          const sy = Math.max(0, Math.min(canvasHeight - 1, Math.round(rect.top + 2)));
          const px = ctx.getImageData(sx, sy, 1, 1).data;
          const bg = { r: px[0], g: px[1], b: px[2] };
          const ratio = contrastRatio(color, bg);
          const minRequired = fontSize >= 32 ? 3.2 : 4.5;
          if (ratio < minRequired && contrastRatio(color, bg) > 1.08) {
            lowContrastTexts.push(`${text} (${ratio.toFixed(1)}:1)`);
          }
        }
      }

      if (tinyTexts.length) {
        issues.push({
          code: 'TINY_TEXT',
          message: `存在小于 26px 的文字，160px 缩略图下难以辨识: ${tinyTexts.slice(0, 3).join('、')}`,
        });
      }
      if (lowContrastTexts.length) {
        issues.push({
          code: 'LOW_TEXT_CONTRAST',
          message: `部分文字与背景对比度偏低: ${lowContrastTexts.slice(0, 3).join('、')}`,
        });
      }

      const h1 = document.querySelector('h1');
      const heroBox = h1
        ? h1.getBoundingClientRect()
        : textBoxes.reduce((best, item) => (!best || item.fontSize > best.fontSize ? item : best), null)?.rect || null;
      const heroFontSize = h1
        ? parseFloat(getComputedStyle(h1).fontSize || '0')
        : textBoxes.reduce((max, item) => Math.max(max, item.fontSize), 0);
      if (heroFontSize > 0 && heroFontSize < 84) {
        issues.push({
          code: 'SMALL_HEADLINE',
          message: `主标题字号偏小 (${Math.round(heroFontSize)}px)，建议提升至 96px~132px 增强海报冲击力`,
        });
      }
      if (h1) {
        const h1Style = getComputedStyle(h1);
        const spans = Array.from(h1.querySelectorAll('span, strong, em, mark, b, i'));
        const hasStyledAccent = spans.some(sp => {
          const spStyle = getComputedStyle(sp);
          return (
            spStyle.color !== h1Style.color ||
            spStyle.fontFamily !== h1Style.fontFamily ||
            spStyle.fontSize !== h1Style.fontSize ||
            spStyle.fontWeight !== h1Style.fontWeight ||
            spStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
            spStyle.backgroundImage !== 'none'
          );
        });
        const hasGradientHeadline = h1Style.backgroundImage !== 'none' || h1Style.webkitBackgroundClip === 'text';
        const isCentered = h1Style.textAlign === 'center';
        if (isCentered && !hasStyledAccent && !hasGradientHeadline) {
          issues.push({
            code: 'FLAT_HEADLINE',
            message: '主标题为纯单色统一字号居中排版，缺乏重点词强调或字体/字号/色彩对比设计感',
          });
        }
      }

      const imgs = Array.from(document.images)
        .map(imgEl => ({ imgEl, rect: imgEl.getBoundingClientRect(), src: imgEl.getAttribute('src') || '' }))
        .filter(item => item.rect.width > 120 && item.rect.height > canvasHeight * 0.3);
      const deviceImg = imgs.find(item => /phone|device|screenshot/i.test(item.src)) || imgs[0] || null;

      if (heroBox) {
        const topTextBottom = textBoxes
          .filter(t => t.rect.top < canvasHeight * 0.44 && t.rect.bottom > heroBox.top - 10)
          .reduce((max, t) => Math.max(max, t.rect.bottom), heroBox.bottom);
        const stageCandidates = [];
        if (deviceImg) stageCandidates.push(deviceImg.rect.top);
        for (const el of document.querySelectorAll('[class*="card"], [class*="callout"], [class*="loupe"], [class*="stage"], [class*="slice"]')) {
          const r = el.getBoundingClientRect();
          if (r.top > topTextBottom - 20 && r.height > 80 && r.width > 120) stageCandidates.push(r.top);
        }
        const stageTop = stageCandidates.length ? Math.min(...stageCandidates) : null;
        if (stageTop !== null && stageTop - topTextBottom > 140) {
          issues.push({
            code: 'DEAD_GAP',
            message: `标题区与下方主视觉之间存在 ${Math.round(stageTop - topTextBottom)}px 垂直空档，建议控制在 40px~110px`,
          });
        }
      }

      if (deviceImg) {
        const dRect = deviceImg.rect;
        const screenInner = {
          left: dRect.left + dRect.width * 0.09,
          right: dRect.right - dRect.width * 0.09,
          top: dRect.top + dRect.height * 0.06,
          bottom: dRect.bottom - dRect.height * 0.06,
        };
        const occluded = [];
        for (const t of textBoxes) {
          if (deviceImg.imgEl.contains(t.el) || t.el.contains(deviceImg.imgEl)) continue;
          const r = t.rect;
          if (r.bottom < screenInner.top || r.top > screenInner.bottom) continue;
          const overlapW = Math.min(r.right, screenInner.right) - Math.max(r.left, screenInner.left);
          const overlapH = Math.min(r.bottom, screenInner.bottom) - Math.max(r.top, screenInner.top);
          if (overlapW > 28 && overlapH > 20) {
            occluded.push(t.text);
          }
        }
        if (occluded.length) {
          issues.push({
            code: 'UI_OCCLUSION',
            message: `前景浮层或文字压住了设备屏幕内容区: ${occluded.slice(0, 2).join('、')}`,
          });
        }
      }

      const edgeWhiteRatio = sampleEdgeWhiteRatio();
      if (edgeWhiteRatio > 0.88) {
        issues.push({
          code: 'LOW_EDGE_CONTRAST',
          message: '画布外缘整体过于接近纯白，在 App Store 白色搜索页中可能缺少轮廓区分度',
        });
      }

      return {
        passed: issues.length === 0,
        issues,
        metrics: {
          headlineFontSize: Math.round(heroFontSize),
          edgeWhiteRatio: Number(edgeWhiteRatio.toFixed(2)),
          tinyTextCount: tinyTexts.length,
        },
      };
    }, { dataUrl: pngDataUrl, canvasWidth: width, canvasHeight: height });

    let resolvedThumbPath = '';
    if (thumbPath) {
      const thumbWidth = 160;
      const thumbHeight = Math.max(1, Math.round(thumbWidth * height / width));
      const thumbDataUrl = await page.evaluate(async ({ dataUrl, tw, th }) => {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tw, th);
        ctx.drawImage(img, 0, 0, tw, th);
        return canvas.toDataURL('image/png');
      }, { dataUrl: pngDataUrl, tw: thumbWidth, th: thumbHeight });
      resolvedThumbPath = resolve(thumbPath);
      mkdirSync(dirname(resolvedThumbPath), { recursive: true });
      writeFileSync(resolvedThumbPath, ensureOpaqueRgbPng(Buffer.from(thumbDataUrl.split(',')[1], 'base64')));
    }

    return {
      output: outPath,
      width,
      height,
      opaqueRgb: true,
      audit,
      ...(resolvedThumbPath ? { thumb: resolvedThumbPath } : {}),
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const { input, output, profile, sizeArg, thumb } = parseArgs(process.argv.slice(2));
  if (!input || !output) {
    console.error('Usage: node scripts/render-aso-html.mjs <design.html> <output.png> [--profile SCREENSHOT_GROUP] [--size WxH] [--thumb thumb.png]');
    process.exit(1);
  }
  const inputPath = resolve(input);
  if (extname(inputPath).toLowerCase() === '.json') {
    throw new Error('Layout preset JSON files are no longer supported. Author custom HTML/CSS/SVG in design.html and pass it to render-aso-html.mjs.');
  }
  const result = await renderAsoHtml({
    htmlPath: inputPath,
    outputPath: output,
    profile,
    size: parseSizeString(sizeArg),
    thumbPath: thumb,
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
