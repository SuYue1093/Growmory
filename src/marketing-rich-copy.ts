import { createElement, type CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Asset, Content } from "./types.ts";

export interface ResolvedContentAssets {
  linkedAssets: Asset[];
  unmatchedNames: string[];
}

export interface BodyAssetReference {
  alt: string;
  src: string;
  assetId: string | null;
}

const SAFE_URL_PROTOCOLS = /^(https?:|\/api\/assets\/file\/|data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml)[;,])/i;

function safeUrlTransform(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/") || trimmed.startsWith("#") || SAFE_URL_PROTOCOLS.test(trimmed)) {
    return trimmed;
  }
  return "";
}

/**
 * Extracts a Growmory asset ID from `/api/assets/file/<id>` (relative or absolute)
 * or `asset://<id>` URLs.
 */
export function parseAssetIdFromSrc(src: string): string | null {
  const raw = src.trim();
  if (!raw) return null;
  if (raw.startsWith("asset://")) {
    const id = raw.slice("asset://".length).split(/[?#]/)[0];
    return id ? decodeAssetId(id) : null;
  }
  const match = raw.match(/(?:^|https?:\/\/[^/]+)\/api\/assets\/file\/([^?#\s]+)/i);
  if (match?.[1]) {
    return decodeAssetId(match[1]);
  }
  return null;
}

function decodeAssetId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function buildAssetFileUrl(assetId: string): string {
  return `/api/assets/file/${encodeURIComponent(assetId)}`;
}

export function buildAssetMarkdownSnippet(asset: Pick<Asset, "id" | "name" | "fileName">): string {
  const label = (asset.name || asset.fileName || "image").replace(/[\[\]\r\n]/g, " ").trim() || "image";
  return `![${label}](${buildAssetFileUrl(asset.id)})`;
}

/**
 * Resolves all assets linked to a piece of marketing content via `assetIds` and `assetNames`.
 */
export function resolveContentAssets(
  content: Pick<Content, "assetIds" | "assetNames" | "productId">,
  allAssets: Asset[],
): ResolvedContentAssets {
  const byId = new Map<string, Asset>();
  for (const asset of allAssets) {
    byId.set(asset.id, asset);
  }

  const linkedAssets: Asset[] = [];
  const seenIds = new Set<string>();
  const addAsset = (asset: Asset | undefined) => {
    if (!asset || seenIds.has(asset.id)) return;
    seenIds.add(asset.id);
    linkedAssets.push(asset);
  };

  for (const id of content.assetIds ?? []) {
    if (typeof id === "string" && id.trim()) {
      addAsset(byId.get(id.trim()));
    }
  }

  const unmatchedNames: string[] = [];
  for (const rawName of content.assetNames ?? []) {
    const needle = rawName?.trim().toLowerCase();
    if (!needle) continue;
    const candidates = allAssets.filter(
      (a) => a.name.trim().toLowerCase() === needle || a.fileName.trim().toLowerCase() === needle,
    );
    if (candidates.length === 0) {
      unmatchedNames.push(rawName);
      continue;
    }
    const preferred =
      (content.productId ? candidates.find((a) => a.productId === content.productId) : undefined) ??
      candidates.find((a) => !seenIds.has(a.id)) ??
      candidates[0];
    addAsset(preferred);
  }

  return { linkedAssets, unmatchedNames };
}

/**
 * Resolves a Markdown image `src` to a renderable browser URL using local asset data when available.
 */
export function resolveImageSrc(src: string, allAssets: Asset[]): string {
  const raw = src.trim();
  const assetId = parseAssetIdFromSrc(raw);
  if (!assetId) return raw;
  const asset = allAssets.find((a) => a.id === assetId);
  if (asset?.url && (asset.url.startsWith("data:") || /^https?:\/\//i.test(asset.url))) {
    return asset.url;
  }
  return buildAssetFileUrl(assetId);
}

/**
 * Extracts Markdown image references from body text and maps them to asset IDs when matched.
 */
export function extractBodyAssetReferences(
  body: string,
  allAssets: Asset[] = [],
): {
  refs: BodyAssetReference[];
  usedAssetIds: Set<string>;
  usedSrcs: Set<string>;
} {
  const refs: BodyAssetReference[] = [];
  const usedAssetIds = new Set<string>();
  const usedSrcs = new Set<string>();
  const assetByUrl = new Map<string, string>();
  for (const asset of allAssets) {
    if (asset.url) assetByUrl.set(asset.url, asset.id);
    assetByUrl.set(buildAssetFileUrl(asset.id), asset.id);
  }

  const regex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    const alt = match[1] ?? "";
    const src = (match[2] ?? "").trim();
    if (!src) continue;
    const assetId = parseAssetIdFromSrc(src) ?? assetByUrl.get(src) ?? null;
    refs.push({ alt, src, assetId });
    usedSrcs.add(src);
    if (assetId) usedAssetIds.add(assetId);
  }

  return { refs, usedAssetIds, usedSrcs };
}

export function insertMarkdownImageAtCursor(
  body: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: string,
): { nextBody: string; nextCursor: number } {
  const start = Math.max(0, Math.min(selectionStart, body.length));
  const end = Math.max(start, Math.min(selectionEnd, body.length));
  const before = body.slice(0, start);
  const after = body.slice(end);
  const prefix = before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after.length === 0 ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const inserted = `${prefix}${snippet}${suffix}`;
  const nextBody = `${before}${inserted}${after}`;
  return { nextBody, nextCursor: before.length + inserted.length };
}

const WECHAT_STYLES: Record<string, CSSProperties> = {
  section: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    fontSize: "16px",
    lineHeight: 1.75,
    color: "#222222",
    wordBreak: "break-word",
  },
  h1: { fontSize: "22px", fontWeight: 700, color: "#111111", lineHeight: 1.4, margin: "24px 0 12px" },
  h2: { fontSize: "19px", fontWeight: 700, color: "#111111", lineHeight: 1.45, margin: "22px 0 10px", paddingLeft: "10px", borderLeft: "4px solid #2563eb" },
  h3: { fontSize: "17px", fontWeight: 700, color: "#1f2937", lineHeight: 1.5, margin: "18px 0 8px" },
  p: { margin: "0 0 14px", fontSize: "16px", lineHeight: 1.75, color: "#222222" },
  ul: { margin: "0 0 14px", paddingLeft: "22px", listStyleType: "disc" },
  ol: { margin: "0 0 14px", paddingLeft: "22px", listStyleType: "decimal" },
  li: { margin: "6px 0", lineHeight: 1.7 },
  blockquote: {
    margin: "16px 0",
    padding: "10px 14px",
    borderLeft: "4px solid #cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#475569",
    fontSize: "15px",
  },
  pre: {
    margin: "14px 0",
    padding: "12px 14px",
    backgroundColor: "#f3f4f6",
    borderRadius: "6px",
    overflowX: "auto",
    fontSize: "13px",
    lineHeight: 1.6,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  code: {
    backgroundColor: "#f3f4f6",
    color: "#111827",
    padding: "2px 5px",
    borderRadius: "4px",
    fontSize: "14px",
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  a: { color: "#2563eb", textDecoration: "underline", wordBreak: "break-all" },
  img: {
    maxWidth: "100%",
    height: "auto",
    display: "block",
    margin: "16px auto",
    borderRadius: "6px",
  },
  hr: { border: "none", borderTop: "1px solid #e5e7eb", margin: "20px 0" },
  table: { borderCollapse: "collapse", width: "100%", margin: "16px 0", fontSize: "14px" },
  th: { border: "1px solid #d1d5db", padding: "8px 10px", backgroundColor: "#f8fafc", fontWeight: 600, textAlign: "left" },
  td: { border: "1px solid #d1d5db", padding: "8px 10px", textAlign: "left" },
  strong: { fontWeight: 700, color: "#111111" },
};

/**
 * Renders Markdown to inline-styled HTML suitable for pasting into WeChat OA,
 * Juejin Rich Text, Zhihu, Medium, and Bilibili article editors.
 */
export function renderMarkdownToPlatformHtml(
  markdown: string,
  options: {
    assets?: Asset[];
    resolvedSrcMap?: Map<string, string>;
    channel?: string;
  } = {},
): string {
  const { assets = [], resolvedSrcMap } = options;

  const components = {
    h1: ({ children }: { children?: React.ReactNode }) => createElement("h1", { style: WECHAT_STYLES.h1 }, children),
    h2: ({ children }: { children?: React.ReactNode }) => createElement("h2", { style: WECHAT_STYLES.h2 }, children),
    h3: ({ children }: { children?: React.ReactNode }) => createElement("h3", { style: WECHAT_STYLES.h3 }, children),
    p: ({ children }: { children?: React.ReactNode }) => createElement("p", { style: WECHAT_STYLES.p }, children),
    ul: ({ children }: { children?: React.ReactNode }) => createElement("ul", { style: WECHAT_STYLES.ul }, children),
    ol: ({ children }: { children?: React.ReactNode }) => createElement("ol", { style: WECHAT_STYLES.ol }, children),
    li: ({ children }: { children?: React.ReactNode }) => createElement("li", { style: WECHAT_STYLES.li }, children),
    blockquote: ({ children }: { children?: React.ReactNode }) => createElement("blockquote", { style: WECHAT_STYLES.blockquote }, children),
    pre: ({ children }: { children?: React.ReactNode }) => createElement("pre", { style: WECHAT_STYLES.pre }, children),
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) =>
      className
        ? createElement("code", { style: { fontFamily: WECHAT_STYLES.code.fontFamily, fontSize: "13px" } }, children)
        : createElement("code", { style: WECHAT_STYLES.code }, children),
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) =>
      createElement("a", { href, style: WECHAT_STYLES.a }, children),
    hr: () => createElement("hr", { style: WECHAT_STYLES.hr }),
    strong: ({ children }: { children?: React.ReactNode }) => createElement("strong", { style: WECHAT_STYLES.strong }, children),
    table: ({ children }: { children?: React.ReactNode }) => createElement("table", { style: WECHAT_STYLES.table }, children),
    th: ({ children }: { children?: React.ReactNode }) => createElement("th", { style: WECHAT_STYLES.th }, children),
    td: ({ children }: { children?: React.ReactNode }) => createElement("td", { style: WECHAT_STYLES.td }, children),
    img: ({ src, alt }: { src?: string; alt?: string }) => {
      const rawSrc = src ?? "";
      const mapped = resolvedSrcMap?.get(rawSrc) ?? resolveImageSrc(rawSrc, assets);
      return createElement("img", {
        src: mapped,
        alt: alt ?? "",
        style: WECHAT_STYLES.img,
      });
    },
  };

  return renderToStaticMarkup(
    createElement(
      "section",
      { style: WECHAT_STYLES.section },
      createElement(
        ReactMarkdown,
        {
          remarkPlugins: [remarkGfm],
          urlTransform: safeUrlTransform,
          components: components as never,
        },
        markdown,
      ),
    ),
  );
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

function loadBrowserImage(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${src.slice(0, 80)}`));
    img.src = src;
  });
}

async function rasterizeImageToPngCanvas(src: string): Promise<HTMLCanvasElement> {
  const isRemote = /^https?:\/\//i.test(src) && typeof window !== "undefined" && !src.startsWith(window.location.origin);
  const img = await loadBrowserImage(src, isRemote ? "anonymous" : undefined);
  const rawW = img.naturalWidth || img.width || 800;
  const rawH = img.naturalHeight || img.height || 600;
  // Render vector SVGs crisp at 2x up to 1600px while preserving raster dimensions.
  const isSvg = /^data:image\/svg\+xml/i.test(src) || /\.svg(?:$|[?#])/i.test(src);
  const scale = isSvg && rawW < 1200 ? Math.min(2, 1600 / Math.max(1, rawW)) : 1;
  const width = Math.max(1, Math.round(rawW * scale));
  const height = Math.max(1, Math.round(rawH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/**
 * Converts a local asset URL, SVG, or WebP image into a clipboard-safe `data:image/png;base64,...`
 * (or preserves native PNG/JPEG/GIF base64 data URLs) so WeChat / Juejin / Zhihu accept pasted images.
 */
export async function imageUrlToClipboardDataUrl(src: string): Promise<string> {
  if (/^data:image\/(?:png|jpeg|jpg|gif);base64,/i.test(src)) {
    return src;
  }
  if (/^data:image\/(?:svg\+xml|webp)/i.test(src)) {
    try {
      const canvas = await rasterizeImageToPngCanvas(src);
      return canvas.toDataURL("image/png");
    } catch {
      return src;
    }
  }
  if (src.startsWith("/")) {
    try {
      const res = await fetch(src);
      if (res.ok) {
        const blob = await res.blob();
        if (/^image\/(?:png|jpeg|gif)$/i.test(blob.type)) {
          return await readBlobAsDataUrl(blob);
        }
        const objUrl = URL.createObjectURL(blob);
        try {
          const canvas = await rasterizeImageToPngCanvas(objUrl);
          return canvas.toDataURL("image/png");
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      }
    } catch {
      // Fallback to direct image load below.
    }
  }
  try {
    const canvas = await rasterizeImageToPngCanvas(src);
    return canvas.toDataURL("image/png");
  } catch {
    return src;
  }
}

export async function imageUrlToPngBlob(src: string): Promise<Blob> {
  const dataUrl = await imageUrlToClipboardDataUrl(src);
  const canvas = await rasterizeImageToPngCanvas(dataUrl);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode PNG blob"));
    }, "image/png");
  });
}

function legacyCopyHtml(html: string, plainText: string): boolean {
  if (typeof document === "undefined") return false;
  const host = document.createElement("div");
  host.contentEditable = "true";
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.innerHTML = html;
  document.body.appendChild(host);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(host);
  selection?.removeAllRanges();
  selection?.addRange(range);
  let ok = false;
  const onCopy = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData("text/html", html);
    e.clipboardData.setData("text/plain", plainText);
  };
  document.addEventListener("copy", onCopy, { once: true });
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    selection?.removeAllRanges();
    host.remove();
  }
  return ok;
}

/**
 * Copies marketing body to system clipboard with inline-styled HTML and base64-inlined images
 * (`text/html` + `text/plain`) for direct pasting into WeChat OA, Juejin Rich Text, Zhihu, etc.
 */
export async function copyMarketingBodyToClipboard(
  markdown: string,
  options: { assets?: Asset[]; channel?: string } = {},
): Promise<{ mode: "rich" | "text"; imageCount: number; inlinedCount: number; html: string }> {
  const assets = options.assets ?? [];
  const { refs } = extractBodyAssetReferences(markdown, assets);
  const resolvedSrcMap = new Map<string, string>();
  let inlinedCount = 0;

  const uniqueSrcs = [...new Set(refs.map((r) => r.src))];
  await Promise.all(
    uniqueSrcs.map(async (rawSrc) => {
      const browserSrc = resolveImageSrc(rawSrc, assets);
      const clipboardSrc = await imageUrlToClipboardDataUrl(browserSrc);
      if (clipboardSrc.startsWith("data:image/")) inlinedCount += 1;
      resolvedSrcMap.set(rawSrc, clipboardSrc);
    }),
  );

  const html = renderMarkdownToPlatformHtml(markdown, {
    assets,
    resolvedSrcMap,
    channel: options.channel,
  });

  if (typeof navigator !== "undefined" && navigator.clipboard && typeof ClipboardItem !== "undefined" && typeof navigator.clipboard.write === "function") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([markdown], { type: "text/plain" }),
        }),
      ]);
      return { mode: "rich", imageCount: uniqueSrcs.length, inlinedCount, html };
    } catch {
      // Fall through to execCommand copy below.
    }
  }

  if (legacyCopyHtml(html, markdown)) {
    return { mode: "rich", imageCount: uniqueSrcs.length, inlinedCount, html };
  }

  await navigator.clipboard.writeText(markdown);
  return { mode: "text", imageCount: uniqueSrcs.length, inlinedCount, html };
}

/**
 * Copies a single image as `image/png` so users in Juejin Markdown mode (or any native image paste target)
 * can paste directly with Cmd+V.
 */
export async function copyAssetImageToClipboard(asset: Asset): Promise<void> {
  const src = resolveImageSrc(buildAssetFileUrl(asset.id), [asset]);
  const pngBlob = await imageUrlToPngBlob(src);
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof ClipboardItem !== "undefined" && typeof navigator.clipboard.write === "function") {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
    return;
  }
  throw new Error("Clipboard image write unavailable");
}

/**
 * Batch copies multiple asset images to system clipboard.
 * Supports rich HTML with embedded base64 images and plain text markdown snippets,
 * allowing pasting into WeChat OA, Zhihu, Juejin, Notion, Lark, etc.
 * If single asset, also attempts to include native PNG image blob.
 */
export async function copyMultipleAssetsToClipboard(
  assets: Asset[],
  allAssets: Asset[] = []
): Promise<{ count: number; inlinedCount: number }> {
  if (!assets.length) return { count: 0, inlinedCount: 0 };

  const pool = allAssets.length ? allAssets : assets;

  // Single asset fast-path with PNG binary blob:
  if (assets.length === 1) {
    const single = assets[0];
    const src = resolveImageSrc(buildAssetFileUrl(single.id), pool);
    try {
      const pngBlob = await imageUrlToPngBlob(src);
      const dataUrl = await imageUrlToClipboardDataUrl(src);
      const label = (single.name || single.fileName || "image").replace(/[\[\]\r\n]/g, " ").trim();
      const markdown = `![${label}](${dataUrl})`;
      const html = `<p><img src="${dataUrl}" alt="${label}" style="max-width:100%;height:auto;" /></p>`;

      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof ClipboardItem !== "undefined" &&
        typeof navigator.clipboard.write === "function"
      ) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              "image/png": pngBlob,
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([markdown], { type: "text/plain" }),
            }),
          ]);
          return { count: 1, inlinedCount: 1 };
        } catch {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
          return { count: 1, inlinedCount: 1 };
        }
      }
    } catch {
      // Fall through to rich HTML / execCommand
    }
  }

  // Multiple assets:
  const resolvedList: { asset: Asset; dataUrl: string }[] = [];
  let inlinedCount = 0;

  for (const asset of assets) {
    const src = resolveImageSrc(buildAssetFileUrl(asset.id), pool);
    const dataUrl = await imageUrlToClipboardDataUrl(src);
    if (dataUrl.startsWith("data:image/")) inlinedCount++;
    resolvedList.push({ asset, dataUrl });
  }

  const html = resolvedList
    .map(({ asset, dataUrl }) => {
      const label = (asset.name || asset.fileName || "image").replace(/["<>&]/g, " ").trim();
      return `<p style="margin: 0 0 16px 0; text-align: center;"><img src="${dataUrl}" alt="${label}" style="max-width: 100%; height: auto; border-radius: 6px;" /></p>`;
    })
    .join("\n");

  const markdown = resolvedList
    .map(({ asset, dataUrl }) => {
      const label = (asset.name || asset.fileName || "image").replace(/[\[\]\r\n]/g, " ").trim();
      return `![${label}](${dataUrl})`;
    })
    .join("\n\n");

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard.write === "function"
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([markdown], { type: "text/plain" }),
        }),
      ]);
      return { count: assets.length, inlinedCount };
    } catch {
      // Fall through to execCommand
    }
  }

  if (legacyCopyHtml(html, markdown)) {
    return { count: assets.length, inlinedCount };
  }

  await navigator.clipboard.writeText(markdown);
  return { count: assets.length, inlinedCount };
}
