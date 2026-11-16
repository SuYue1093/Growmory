import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { aiRequest } from './ai-request.mjs';
import { designResources } from './aso-design-resources.mjs';
import { renderAsoHtml } from '../scripts/render-aso-html.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_LAB_DIR = resolve(ROOT, '.tmp/aso-lab');

export const LAB_OUTPUT_FILES = new Set([
  'aso-lab-test-1242x2688.png',
  'aso-lab-test-160.png',
  'phone-3d.png',
  'design.html',
]);

const VALID_FINISHES = new Set(['original', 'graphite', 'black', 'titanium', 'champagne', 'silver']);

function normalizeFinish(finish) {
  const clean = String(finish || 'titanium').trim().toLowerCase();
  return VALID_FINISHES.has(clean) ? clean : 'titanium';
}

export function readPngMeta(filePath) {
  if (!existsSync(filePath)) return null;
  const stats = statSync(filePath);
  const buf = readFileSync(filePath);
  if (buf.length < 26) return null;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
    opaqueRgb: buf[25] === 2,
    sizeBytes: stats.size,
    updatedAt: stats.mtime.toISOString(),
  };
}

export function resolveLabFile(labDir, name) {
  const safeName = basename(String(name || ''));
  if (!LAB_OUTPUT_FILES.has(safeName)) return null;
  const fullPath = resolve(labDir, safeName);
  if (!existsSync(fullPath)) return null;
  return {
    name: safeName,
    path: fullPath,
    contentType: safeName.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8',
  };
}

function readTrace(labDir) {
  const tracePath = resolve(labDir, 'trace.json');
  if (!existsSync(tracePath)) return null;
  try {
    return JSON.parse(readFileSync(tracePath, 'utf8'));
  } catch {
    return null;
  }
}

export function getLabResult({ labDir = DEFAULT_LAB_DIR, aiConfig } = {}) {
  const ai = aiConfig?.get?.();
  const formatPngEntry = name => {
    const filePath = resolve(labDir, name);
    const meta = readPngMeta(filePath);
    if (!meta) return null;
    return {
      file: name,
      url: `/api/aso/lab/file/${name}?t=${encodeURIComponent(meta.updatedAt)}`,
      ...meta,
    };
  };
  const htmlPath = resolve(labDir, 'design.html');
  const htmlStats = existsSync(htmlPath) ? statSync(htmlPath) : null;
  return {
    aiConfigured: Boolean(ai?.configured),
    aiModel: ai?.configured ? ai.model : '',
    output: formatPngEntry('aso-lab-test-1242x2688.png'),
    thumb: formatPngEntry('aso-lab-test-160.png'),
    device3d: formatPngEntry('phone-3d.png'),
    html: htmlStats ? readFileSync(htmlPath, 'utf8') : '',
    htmlUpdatedAt: htmlStats ? htmlStats.mtime.toISOString() : '',
    trace: readTrace(labDir),
  };
}

export async function renderLabDeviceModel({
  labDir = DEFAULT_LAB_DIR,
  modelId = 'iphone-17-pro-max-3d',
  finish = 'titanium',
  yaw = -12,
  pitch = 5,
  roll = -4,
} = {}) {
  mkdirSync(labDir, { recursive: true });
  const normalizedFinish = normalizeFinish(finish);
  const outPath = resolve(labDir, 'phone-3d.png');
  await execFileAsync(
    'node',
    [
      'scripts/render-aso-device-model.mjs',
      String(modelId || 'iphone-17-pro-max-3d'),
      'public/aso-lab/sample-screenshot.png',
      outPath,
      String(Number(yaw) || 0),
      String(Number(pitch) || 0),
      String(Number(roll) || 0),
      normalizedFinish,
      '--trim',
    ],
    { cwd: ROOT, timeout: 60000 },
  );
  return readPngMeta(outPath);
}

export async function renderLabHtmlComposition({
  labDir = DEFAULT_LAB_DIR,
  html,
  finish = 'titanium',
  rerenderDevice = false,
  modelId = 'iphone-17-pro-max-3d',
  yaw = -12,
  pitch = 5,
  roll = -4,
  trace = null,
  aiConfig,
} = {}) {
  const source = String(html || '').trim();
  if (!source) throw new Error('请先输入或生成 design.html 内容');
  if (source.length > 400000) throw new Error('HTML 内容过长');

  mkdirSync(labDir, { recursive: true });
  const devicePath = resolve(labDir, 'phone-3d.png');
  if (rerenderDevice || (!existsSync(devicePath) && source.includes('phone-3d.png'))) {
    await renderLabDeviceModel({ labDir, modelId, finish, yaw, pitch, roll });
  }

  const htmlPath = resolve(labDir, 'design.html');
  writeFileSync(htmlPath, source, 'utf8');
  const rendered = await renderAsoHtml({
    htmlPath,
    outputPath: resolve(labDir, 'aso-lab-test-1242x2688.png'),
    thumbPath: resolve(labDir, 'aso-lab-test-160.png'),
    profile: 'IPHONE_FACE_ID_LARGE_PROFILE',
    sceneDir: labDir,
  });

  const existingTrace = trace ? null : readTrace(labDir);
  const nextTrace = trace
    ? { ...trace, audit: rendered.audit, rendered }
    : {
        ...(existingTrace || { mode: 'html-render', createdAt: new Date().toISOString() }),
        audit: rendered.audit,
        rendered,
      };
  writeFileSync(resolve(labDir, 'trace.json'), JSON.stringify(nextTrace, null, 2), 'utf8');

  return getLabResult({ labDir, aiConfig });
}

function parseAiGenerationPayload(rawText) {
  const text = String(rawText || '').trim();
  const jsonFence = text.match(/```json\s*\n([\s\S]*?)```/i);
  const rawJsonCandidate = jsonFence ? jsonFence[1].trim() : (text.startsWith('{') ? text : '');
  if (rawJsonCandidate) {
    try {
      const parsed = JSON.parse(rawJsonCandidate);
      if (parsed && typeof parsed.html === 'string' && /<!doctype\s+html|<html\b/i.test(parsed.html)) {
        return {
          concept: String(parsed.concept || ''),
          fonts: Array.isArray(parsed.fonts) ? parsed.fonts : [],
          palette: Array.isArray(parsed.palette) ? parsed.palette : [],
          device3d: parsed.device3d && typeof parsed.device3d === 'object' ? parsed.device3d : null,
          html: parsed.html.trim(),
        };
      }
    } catch {}
  }

  const htmlFence = text.match(/```(?:html)?\s*\n([\s\S]*?)```/i);
  const candidate = (htmlFence ? htmlFence[1] : text).trim();
  const docStart = candidate.search(/<!doctype\s+html|<html\b/i);
  if (docStart === -1) throw new Error('AI 未返回有效的完整 HTML 文档');
  return {
    concept: '',
    fonts: [],
    palette: [],
    device3d: null,
    html: candidate.slice(docStart).trim(),
  };
}

export async function generateLabWithAi({
  labDir = DEFAULT_LAB_DIR,
  aiConfig,
  artDirection = '',
  fetcher = fetch,
} = {}) {
  const ai = aiConfig?.get?.();
  if (!ai?.configured) {
    const err = new Error('尚未配置内置 AI 服务。可在设置中配置 AI，或点击「复制测试提示词」交由本机 Agent 运行完整生成流程后点击「刷新生成结果」预览。');
    err.statusCode = 400;
    throw err;
  }

  const catalog = designResources();
  const fontIds = catalog.resources.filter(r => r.kind === 'font' && r.url).map(r => `${r.id} (${(r.locales || []).join(',')})`);
  const modelIds = catalog.resources.filter(r => r.kind === 'model' && r.usage === 'screen-texture').map(r => r.id);
  const textureUrls = catalog.resources.filter(r => r.kind === 'texture' && r.url).map(r => r.url);
  const frameUrls = catalog.resources.filter(r => r.kind === 'frame' && r.url).map(r => `${r.id}: ${r.url}`);

  const prompt = [
    'Act as a senior ASO visual designer and create ONE high-converting App Store lead screenshot (IPHONE_FACE_ID_LARGE_PROFILE, 1242x2688 opaque RGB PNG) from scratch using ONLY the provided screenshot and logo.',
    'Do NOT use fixed layout presets or canned themes.',
    '',
    '[Inputs & Verification Boundary]',
    `- Product docs: "${catalog.labSample.appName}" (${catalog.labSample.tagline}) — ground copy in these product facts; check UI screenshot only for locale alignment.`,
    '- UI Screenshot: /aso-lab/sample-screenshot.png (1260x2736)',
    '- App Logo: /aso-lab/sample-icon.png (1024x1024)',
    artDirection ? `- Optional Art Direction: ${artDirection}` : '- Art Direction: derive freely from the app identity & UI screenshot',
    '',
    '[Discovered Design Capabilities (Analogous to list_aso_design_resources)]',
    `- Installed local font families (auto-loaded by name): ${fontIds.join('; ')}`,
    `- Available 3D device models (screen-texture): ${modelIds.join(', ')} (finishes: original, graphite, black, titanium, champagne, silver)`,
    `- Flat bezel frames: ${frameUrls.join('; ')}`,
    `- Surface textures: ${textureUrls.join(', ')}`,
    '- Inline vector icons: use <i data-lucide="camera" data-size="32" data-color="#..."></i> or inline SVG',
    '- Target Profile: IPHONE_FACE_ID_LARGE_PROFILE (1242x2688 opaque 24-bit RGB PNG)',
    '',
    '[ASO Craft Goal]',
    '- Design for instant 3-second scannability at 160px search thumbnail scale and clear edge contrast on white (#FFFFFF) App Store pages.',
    '- Create editorial headline tension (strong scale, focal word contrast, mood-matched fonts, real Logo presence) and tight composition without tiny (<26px) text or UI occlusion.',
    '',
    '[Required Output Format]',
    'Return a single JSON object (optionally in a ```json fence) with:',
    '{',
    '  "concept": "brief summary of chosen direction, headline hook, font pairing & palette rationale",',
    '  "fonts": ["chosenFont1", "chosenFont2"],',
    '  "palette": ["#bg", "#text", "#accent"],',
    '  "device3d": { "enabled": true, "modelId": "iphone-17-pro-max-3d", "yaw": -12, "pitch": 5, "roll": -4, "finish": "champagne" },',
    '  "html": "complete standalone HTML5 document with <meta name=\\"aso-size\\" content=\\"1242x2688\\" /> referencing /local/phone-3d.png (if device3d.enabled) or /aso-lab/sample-screenshot.png, and /aso-lab/sample-icon.png"',
    '}',
  ].join('\n');

  const callAi = async messages => aiRequest(
    'aso-lab-generate',
    `${ai.baseUrl.replace(/\/$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model,
        temperature: 0.7,
        messages,
      }),
      signal: AbortSignal.timeout(90000),
    },
    fetcher,
  );

  const systemMsg = {
    role: 'system',
    content: 'You are an editorial App Store visual art director. Given only an app screenshot, logo, product tagline, and discovered local rendering resources, autonomously craft high-design bespoke headline typography, materials, fonts, and HTML/CSS/SVG composition.',
  };

  const response = await callAi([systemMsg, { role: 'user', content: prompt }]);

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`AI 生成失败 (${response.status}): ${raw.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  let plan = parseAiGenerationPayload(content);

  const shouldRender3d = plan.device3d ? plan.device3d.enabled !== false : plan.html.includes('phone-3d.png');
  const finish = normalizeFinish(plan.device3d?.finish);
  const modelId = plan.device3d?.modelId || 'iphone-17-pro-max-3d';
  const yaw = plan.device3d?.yaw ?? -12;
  const pitch = plan.device3d?.pitch ?? 5;
  const roll = plan.device3d?.roll ?? -4;

  let deviceMeta = null;
  if (shouldRender3d) {
    deviceMeta = await renderLabDeviceModel({ labDir, modelId, finish, yaw, pitch, roll });
  }

  const buildTrace = (refined, audit) => {
    const issueSummary = audit?.issues?.length
      ? `${audit.issues.length} 项待改进: ${audit.issues.map(i => i.code).join(', ')}`
      : `全部过检 (${audit?.metrics?.headlineFontSize || '-'}px 主标题)`;
    return {
      mode: 'ai-simulated',
      model: ai.model,
      concept: plan.concept,
      fonts: plan.fonts,
      palette: plan.palette,
      device3d: shouldRender3d ? { modelId, finish, yaw, pitch, roll, ...deviceMeta } : { enabled: false },
      steps: [
        { step: 1, title: '素材库选型与语言核对', detail: `${fontIds.length} 款字体 · ${modelIds.length} 套 3D 模型 · ${textureUrls.length} 个纹理` },
        { step: 2, title: '标题雕刻与构图自主定调', detail: plan.concept || '高对比焦点词、大标题与紧凑留白节奏' },
        {
          step: 3,
          title: shouldRender3d ? '3D 真机贴图极速实渲' : '平面/样机边框快速装配',
          detail: shouldRender3d ? `${modelId} (${finish}, yaw=${yaw}, pitch=${pitch}, roll=${roll})` : '使用原始截图 / 边框素材',
        },
        {
          step: 4,
          title: refined ? '双尺度实渲 + [ASO QA] 二轮自动精修' : '双尺度 1242px / 160px 与 [ASO QA] 自检',
          detail: `IPHONE_FACE_ID_LARGE_PROFILE · ${issueSummary}`,
        },
      ],
      createdAt: new Date().toISOString(),
    };
  };

  let result = await renderLabHtmlComposition({
    labDir,
    html: plan.html,
    modelId,
    finish,
    yaw,
    pitch,
    roll,
    rerenderDevice: false,
    trace: buildTrace(false, null),
    aiConfig,
  });

  const firstAudit = result?.trace?.audit;
  if (firstAudit?.issues?.length) {
    try {
      const refinePrompt = [
        'Your first design.html draft failed these automated [ASO QA] checks:',
        ...firstAudit.issues.map(issue => `- [${issue.code}] ${issue.message}`),
        '',
        'Fix every reported issue cleanly while elevating headline visual craft and keeping the same asset paths (/local/phone-3d.png, /aso-lab/sample-screenshot.png, /aso-lab/sample-icon.png). Return the updated JSON object with the same schema.',
        '',
        'Previous HTML:',
        plan.html,
      ].join('\n');
      const refineRes = await callAi([
        systemMsg,
        { role: 'user', content: prompt },
        { role: 'assistant', content },
        { role: 'user', content: refinePrompt },
      ]);
      if (refineRes.ok) {
        const refineData = await refineRes.json();
        const refinedPlan = parseAiGenerationPayload(refineData?.choices?.[0]?.message?.content || '');
        plan = {
          ...plan,
          concept: refinedPlan.concept || plan.concept,
          fonts: refinedPlan.fonts.length ? refinedPlan.fonts : plan.fonts,
          palette: refinedPlan.palette.length ? refinedPlan.palette : plan.palette,
          html: refinedPlan.html,
        };
        result = await renderLabHtmlComposition({
          labDir,
          html: plan.html,
          modelId,
          finish,
          yaw,
          pitch,
          roll,
          rerenderDevice: false,
          trace: buildTrace(true, null),
          aiConfig,
        });
      }
    } catch {
      // Keep pass-1 output when optional second-pass refinement fails or mock provides single response.
    }
  }

  const finalAudit = result?.trace?.audit;
  if (result?.trace) {
    const updatedTrace = buildTrace(Boolean(firstAudit?.issues?.length && result.trace.steps?.[3]?.title?.includes('精修')), finalAudit);
    updatedTrace.audit = finalAudit;
    updatedTrace.rendered = result.trace.rendered;
    writeFileSync(resolve(labDir, 'trace.json'), JSON.stringify(updatedTrace, null, 2), 'utf8');
    result = getLabResult({ labDir, aiConfig });
  }

  return result;
}
