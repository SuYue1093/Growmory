import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Code2, Copy, Image as ImageIcon, RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { useI18n } from './i18n';
import { ASO_LAB_SAMPLE, buildAsoLabTestPrompt } from './aso-media-prompt';

type Resource = {
  id: string;
  name: string;
  kind: 'frame' | 'font' | 'element' | 'model' | 'texture' | 'illustration' | 'pattern';
  url?: string;
  previewUrl?: string;
  device?: string;
  usage?: string;
  original?: string;
  source?: string;
  sourceUrl?: string;
  collection?: string;
  svg?: string;
  category?: string;
  locales?: string[];
};

type Catalog = { resources: Resource[]; backgrounds: { examples: [string, string][] } };

type LabPngEntry = {
  file: string;
  url: string;
  width: number;
  height: number;
  opaqueRgb?: boolean;
  sizeBytes: number;
  updatedAt: string;
};

type LabAudit = {
  passed?: boolean;
  issues?: { code: string; message: string }[];
  metrics?: { headlineFontSize?: number; edgeWhiteRatio?: number; tinyTextCount?: number };
};

type LabTrace = {
  mode?: string;
  model?: string;
  concept?: string;
  fonts?: string[];
  palette?: string[];
  steps?: { step: number; title: string; detail: string }[];
  audit?: LabAudit;
  createdAt?: string;
};

type LabResult = {
  aiConfigured: boolean;
  aiModel: string;
  output: LabPngEntry | null;
  thumb: LabPngEntry | null;
  device3d: LabPngEntry | null;
  html: string;
  htmlUpdatedAt: string;
  trace?: LabTrace | null;
};

function SvgResourceGroups({ resources, kind }: { resources: Resource[]; kind: 'illustration' | 'pattern' }) {
  const { t } = useI18n();
  const items = resources.filter(item => item.kind === kind);
  return [...new Set(items.map(item => item.collection))].map(collection => {
    const group = items.filter(item => item.collection === collection);
    return <details className="aso-lab-element-group" key={collection}>
      <summary>{collection} <span>({group.length})</span></summary>
      <div className="aso-lab-resource-grid">
        {group.map(item => <figure key={item.id}>
          {item.url && <img src={item.url} alt={item.name} loading="lazy" />}
          <figcaption>
            <strong>{item.name}</strong>
            {item.sourceUrl ? <a href={item.sourceUrl} download>{t('下载 SVG', 'Download SVG')}</a>
              : item.original && <a href={item.original}>{t('SVG 原图', 'Original SVG')}</a>}
          </figcaption>
        </figure>)}
      </div>
      {group[0]?.source && <a href={group[0].source}>{t('素材来源', 'Asset source')}</a>}
    </details>;
  });
}

function DesignResources() {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<Catalog>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    fetch('/api/aso/design-resources', { signal: request.signal })
      .then(response => {
        if (!response.ok) throw new Error('Resource catalog unavailable');
        return response.json();
      })
      .then(setCatalog)
      .catch(() => { if (!request.signal.aborted) setFailed(true); });
    return () => request.abort();
  }, []);

  if (!catalog) return <p role={failed ? 'alert' : 'status'}>{failed
    ? t('无法读取设计资源', 'Could not load design resources')
    : t('正在读取设计资源…', 'Loading design resources…')}</p>;

  const samples: Record<string, string> = {
    'zh-Hans': '把灵感留下', 'zh-Hant': '把靈感留下', ja: 'ひらめきを残す', ko: '아이디어를 기록하세요',
    ar: 'احتفظ بأفكارك', th: 'จดไอเดียของคุณ',
    hi: 'अपने विचार लिखें', he: 'רשמו את הרעיון', bn: 'ভাবনাটা লিখে রাখুন',
    ta: 'உங்கள் எண்ணங்களை எழுதுங்கள்', ka: 'ჩაიწერეთ თქვენი იდეები', km: 'កត់ត្រាគំនិតរបស់អ្នក',
  };
  const elementGroups = [
    ['shapes', t('几何形状', 'Shapes')], ['arrows', t('装饰箭头', 'Arrows')],
    ['decor', t('笔刷与飘带', 'Decor')], ['blobs', t('有机色块', 'Blobs')],
    ['stars', t('星芒', 'Stars')], ['waves', t('波形', 'Waves')],
    ['laurels', t('桂冠', 'Laurel wreaths')], ['lines', t('装饰线条', 'Lines')],
    ['patterns', t('背景底纹', 'Background patterns')], ['icons', t('功能图标', 'Icons')],
  ];
  return <section className="aso-lab-resources" aria-label={t('Agent 设计资源', 'Agent design resources')}>
    <h2>{t('Agent 设计资源', 'Agent design resources')}</h2>
    <h3>{t('设备样机', 'Device frames')}</h3>
    <div className="aso-lab-resource-grid">
      {catalog.resources.filter(item => item.kind === 'frame').map(item => <figure key={item.id}>
        {item.url && <img src={item.url} alt={item.name} />}
        <figcaption>
          <strong>{item.name}</strong>
          {item.usage === 'screen-overlay' && <span>{t('可嵌入 UI 截图', 'Fits a UI screenshot')}</span>}
          {item.original && <a href={item.original}>{t('官方样机下载包', 'Official bezel download')}</a>}
        </figcaption>
      </figure>)}
    </div>
    <h3>{t('模型与纹理', 'Models and textures')}</h3>
    <div className="aso-lab-resource-grid">
      {catalog.resources.filter(item => item.kind === 'model' || item.kind === 'texture').map(item => <figure key={item.id}>
        {item.kind === 'texture' && item.url && <img src={item.url} alt={item.name} loading="lazy" />}
        {item.previewUrl && <img src={item.previewUrl} alt={item.name} loading="lazy" />}
        <figcaption>
          <strong>{item.name}</strong>
          {item.device === 'generic' && <span>{t('通用设备', 'Generic device')}</span>}
          {item.usage === 'screen-texture' && <span>{t('支持屏幕贴图', 'Supports screen textures')}</span>}
          {item.kind === 'model' && item.url && <a href={item.url} download>{t('下载 GLB', 'Download GLB')}</a>}
          <a href={item.source}>{t('素材来源', 'Asset source')}</a>
        </figcaption>
      </figure>)}
    </div>
    <h3>{t('SVG 插画', 'SVG illustrations')}</h3>
    <SvgResourceGroups resources={catalog.resources} kind="illustration" />
    <h3>{t('平铺图案', 'Repeating patterns')}</h3>
    <SvgResourceGroups resources={catalog.resources} kind="pattern" />
    <h3>{t('背景配色示例', 'Example background palettes')}</h3>
    <div className="aso-lab-resource-grid">
      {catalog.backgrounds.examples.map(([from, to]) => <figure key={from}>
        <div className="aso-lab-swatch" style={{ background: `linear-gradient(130deg, ${from}, ${to})` }} />
        <figcaption>{from} / {to}</figcaption>
      </figure>)}
    </div>
    <h3>{t('可插入元素', 'Insertable elements')}</h3>
    {elementGroups.map(([category, label]) => {
      const elements = catalog.resources.filter(item => item.kind === 'element' && item.category === category);
      if (!elements.length) return null;
      return <details className="aso-lab-element-group" key={category}>
        <summary>{label} <span>({elements.length})</span></summary>
        <div className="aso-lab-resource-grid">
          {elements.map(item => <figure key={item.id}>
            <img className="aso-lab-element" src={`data:image/svg+xml,${encodeURIComponent(item.svg || '')}`} alt="" loading="lazy" />
            <figcaption>{item.name}</figcaption>
          </figure>)}
        </div>
      </details>;
    })}
    <h3>{t('字体', 'Fonts')}</h3>
    <div className="aso-lab-resource-grid">
      {catalog.resources.filter(item => item.kind === 'font').map(item => <figure key={item.id}>
        {item.url && <style>{`@font-face{font-family:aso-${item.id};src:url(${item.url}) format("truetype");font-display:swap}`}</style>}
        <p lang={item.locales?.[0]} dir="auto" style={{ fontFamily: item.url ? `aso-${item.id}` : undefined }}>
          {item.url ? samples[item.locales?.[0] || ''] || 'Keep the thought.' : t('待导入', 'Pending import')}
        </p>
        <figcaption>{item.name}</figcaption>
      </figure>)}
    </div>
  </section>;
}

export function AsoTemplateLab({ notify }: { notify?: (message: string) => void }) {
  const { t, lang } = useI18n();
  const [artDirection, setArtDirection] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [labResult, setLabResult] = useState<LabResult | null>(null);
  const [htmlDraft, setHtmlDraft] = useState('');
  const [busyAction, setBusyAction] = useState<'' | 'refresh' | 'render' | 'ai'>('');
  const [labError, setLabError] = useState('');

  const testPrompt = useMemo(
    () => buildAsoLabTestPrompt({ artDirection, lang }),
    [artDirection, lang],
  );

  const workflowSteps = useMemo(() => [
    t('1. 素材库盘点与选型', '1. Discover & Pick Assets'),
    t('2. 审美定调与装配', '2. Art Direction & Assembly'),
    t('3. 规范自查与 3D 实渲', '3. Standards & 3D Render'),
    t('4. 双尺度实渲与 3 秒自检', '4. Dual-scale 1242px & 160px QA'),
    t('5. 模拟交付回看', '5. Simulated Delivery'),
  ], [t]);

  const loadLabResult = useCallback(async (showSpinner = false) => {
    if (showSpinner) setBusyAction('refresh');
    setLabError('');
    try {
      const response = await fetch('/api/aso/lab/result');
      if (!response.ok) throw new Error(t('读取生成结果失败', 'Failed to load generated result'));
      const data = await response.json() as LabResult;
      setLabResult(data);
      if (data.html) setHtmlDraft(data.html);
    } catch (err) {
      setLabError((err as Error).message);
    } finally {
      if (showSpinner) setBusyAction('');
    }
  }, [t]);

  useEffect(() => {
    void loadLabResult(false);
  }, [loadLabResult]);

  const handleCopyTestPrompt = async () => {
    try {
      await navigator.clipboard.writeText(testPrompt);
      setCopied(true);
      const okMsg = t(
        '已复制测试提示词，请粘贴给本机 Agent 完整跑一遍真实 ASO 生图流程，完成后点击下方「刷新生成结果」预览。',
        'Test prompt copied. Run it with your local Agent to simulate the full pipeline, then click Refresh Result below.',
      );
      setCopyMessage(okMsg);
      notify?.(t('已复制 ASO 实验室测试提示词', 'ASO Lab test prompt copied'));
      setTimeout(() => setCopied(false), 2600);
    } catch {
      const errMsg = t('自动复制失败，请从下方输入框全选复制提示词。', 'Clipboard failed. Select and copy the prompt below.');
      setCopyMessage(errMsg);
      notify?.(errMsg);
    }
  };

  const handleRenderHtml = async () => {
    if (!htmlDraft.trim()) {
      setLabError(t('请先输入 HTML 代码，或点击「模拟全流程生成（AI）」/ 粘贴提示词给外部 Agent 生成 .tmp/aso-lab/design.html。', 'Enter HTML below, run AI simulation, or run the copied prompt in your Agent.'));
      return;
    }
    setBusyAction('render');
    setLabError('');
    try {
      const response = await fetch('/api/aso/lab/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: htmlDraft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('HTML 渲染失败', 'HTML render failed'));
      setLabResult(data);
      notify?.(t('已渲染 1242 × 2688 测试效果图与 160 px 缩略图', 'Rendered 1242 × 2688 screenshot & 160 px thumbnail'));
    } catch (err) {
      setLabError((err as Error).message);
    } finally {
      setBusyAction('');
    }
  };

  const handleAiGenerate = async () => {
    setBusyAction('ai');
    setLabError('');
    try {
      const response = await fetch('/api/aso/lab/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artDirection }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('AI 模拟生成失败', 'AI simulation failed'));
      setLabResult(data);
      if (data.html) setHtmlDraft(data.html);
      notify?.(t('已完成完整模拟生图与双尺度实渲', 'Full pipeline simulation & render completed'));
    } catch (err) {
      setLabError((err as Error).message);
    } finally {
      setBusyAction('');
    }
  };

  return <section className="aso-template-lab" aria-label={t('ASO 图片实验室', 'ASO Artwork Lab')}>
    <section className="aso-lab-test-card" aria-labelledby="aso-lab-test-heading">
      <div className="aso-lab-test-header">
        <div>
          <div className="aso-lab-test-title-row">
            <Sparkles size={18} />
            <h2 id="aso-lab-test-heading">{t('测试入口：制作一张 ASO 上架图', 'Test Entry: Generate an ASO Screenshot')}</h2>
            <span className="aso-lab-test-badge">{ASO_LAB_SAMPLE.outputSize} · {ASO_LAB_SAMPLE.outputProfile}</span>
          </div>
          <p className="aso-lab-test-desc">
            {t(
              '提供给已连接 Growmory MCP 的外部 Agent 使用：仅包含固定 App 截图与 Logo（无预设版式、无预设素材），由 Agent 通过 Growmory MCP 盘点设计资源、自由编排 HTML/3D 并完成 1242×2688 与 160px 双尺度校验。',
              'For external Agents connected to Growmory MCP: includes ONLY a fixed screenshot and app logo (zero preset layouts or materials) so the Agent discovers resources via MCP, composes bespoke HTML/3D, and validates full & 160 px outputs.',
            )}
          </p>
        </div>
        <button type="button" className="button primary aso-lab-test-cta" onClick={handleCopyTestPrompt}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span>{copied ? t('已复制测试提示词', 'Copied Test Prompt') : t('点击复制测试提示词', 'Copy Test Prompt')}</span>
        </button>
      </div>

      {copyMessage && (
        <p className="aso-lab-test-status" role="status">{copyMessage}</p>
      )}

      <div className="aso-lab-test-grid">
        <div className="aso-lab-test-sample">
          <div className="aso-lab-sample-label">
            <ImageIcon size={14} />
            <span>{t('输入素材（仅截图与 Logo）', 'Provided Input Assets (Screenshot & Logo Only)')}</span>
          </div>
          <div className="aso-lab-sample-media">
            <img
              className="aso-lab-sample-shot"
              src={ASO_LAB_SAMPLE.screenshotUrl}
              alt={t('固定 UI 测试截图（拾页首页）', 'Fixed UI test screenshot (Shiye Home)')}
            />
            <div className="aso-lab-sample-meta">
              <div className="aso-lab-sample-app">
                <img
                  className="aso-lab-sample-icon"
                  src={ASO_LAB_SAMPLE.iconUrl}
                  alt={t('固定应用 Logo（拾页）', 'Fixed app logo (Shiye)')}
                />
                <div>
                  <strong>{lang === 'en' ? ASO_LAB_SAMPLE.appNameEn : ASO_LAB_SAMPLE.appName}</strong>
                  <span>{lang === 'en' ? ASO_LAB_SAMPLE.taglineEn : ASO_LAB_SAMPLE.tagline}</span>
                </div>
              </div>
              <dl className="aso-lab-sample-paths">
                <div>
                  <dt>{t('UI 截图', 'Screenshot')}</dt>
                  <dd><code>{ASO_LAB_SAMPLE.screenshotPath}</code> ({ASO_LAB_SAMPLE.screenshotSize})</dd>
                </div>
                <div>
                  <dt>{t('应用 Logo', 'App Logo')}</dt>
                  <dd><code>{ASO_LAB_SAMPLE.iconPath}</code></dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        <div className="aso-lab-test-controls">
          <label className="aso-media-art-direction">
            <span>{t('补充画面方向（可选，与正式生成一致）', 'Additional art direction (optional)')}</span>
            <input
              value={artDirection}
              onChange={event => setArtDirection(event.target.value)}
              placeholder={t('例如：突出「今日回响」重读灵感体验（留空则由 Agent 自主决定）', 'e.g. Highlight Today Echo reflection (leave blank for autonomous direction)')}
            />
          </label>

          <div className="aso-lab-prompt-preview">
            <label htmlFor="aso-lab-test-prompt-text">{t('完整模拟生成提示词', 'Full Simulated Workflow Prompt')}</label>
            <textarea
              id="aso-lab-test-prompt-text"
              readOnly
              rows={9}
              value={testPrompt}
              aria-label={t('测试生图提示词', 'Test image generation prompt')}
            />
          </div>
        </div>
      </div>
    </section>

    <section className="aso-lab-live-panel" aria-labelledby="aso-lab-live-heading">
      <div className="aso-lab-live-header">
        <div>
          <h2 id="aso-lab-live-heading">{t('真实生成流程模拟与实际效果预览', 'Simulated Generation Flow & Live Effect Preview')}</h2>
          <p>
            {labResult?.aiConfigured
              ? t(`已配置 AI 模型（${labResult.aiModel}）：可点击「模拟全流程生成（AI）」让 AI 从零自主选材、渲染 3D 并输出 1242 × 2688 成品；也可粘贴提示词给外部 Agent 后点「刷新 Agent 生成结果」。`, `AI configured (${labResult.aiModel}): click Simulate Full Flow (AI) to autonomously choose resources and render, or run the copied prompt with your Agent and click Refresh Agent Result.`)
              : t('将上方提示词粘贴给本机 Agent 执行完整生成流程后，点击「刷新 Agent 生成结果」即可在此预览实际成品与 160 px 缩略图；也可在下方使用配置好的 AI 或 HTML 实时渲染测试。', 'Run the copied prompt in your local Agent, then click Refresh Agent Result to inspect both the full output and 160 px thumbnail—or test via configured AI / live HTML below.')}
          </p>
        </div>
        <div className="aso-lab-live-actions">
          <button
            type="button"
            className="button primary"
            disabled={busyAction !== ''}
            onClick={handleAiGenerate}
          >
            <Wand2 size={15} />
            <span>{busyAction === 'ai' ? t('全流程模拟生成中…', 'Simulating Flow…') : t('模拟全流程生成（AI）', 'Simulate Full Flow (AI)')}</span>
          </button>
          <button
            type="button"
            className="button"
            disabled={busyAction !== ''}
            onClick={() => loadLabResult(true)}
          >
            <RefreshCw size={15} />
            <span>{busyAction === 'refresh' ? t('刷新中…', 'Refreshing…') : t('刷新 Agent 生成结果', 'Refresh Agent Result')}</span>
          </button>
        </div>
      </div>

      <ol className="aso-lab-pipeline-steps" aria-label={t('真实生成步骤', 'Generation workflow steps')}>
        {workflowSteps.map((step, index) => (
          <li key={step} className={labResult?.output ? 'done' : index === 0 ? 'ready' : ''}>{step}</li>
        ))}
      </ol>

      {labError && <p className="aso-lab-live-error" role="alert">{labError}</p>}

      {labResult?.trace && (
        <div className="aso-lab-trace-card">
          {labResult.trace.concept && (
            <p className="aso-lab-trace-concept">
              <strong>{t('AI 自主构思说明：', 'Autonomous Art Direction: ')}</strong>
              {labResult.trace.concept}
            </p>
          )}
          {Array.isArray(labResult.trace.steps) && labResult.trace.steps.length > 0 && (
            <ul className="aso-lab-trace-list">
              {labResult.trace.steps.map(item => (
                <li key={item.step}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          )}
          {labResult.trace.audit && (
            <div className={`aso-lab-audit-box ${labResult.trace.audit.passed ? 'pass' : 'warn'}`}>
              <strong>
                {labResult.trace.audit.passed
                  ? t('[ASO QA 自动体检] 全部过检', '[ASO QA Auto-Audit] Passed')
                  : t(`[ASO QA 自动体检] 发现 ${labResult.trace.audit.issues?.length || 0} 项可优化`, `[ASO QA Auto-Audit] ${labResult.trace.audit.issues?.length || 0} issue(s) found`)}
                {labResult.trace.audit.metrics?.headlineFontSize ? ` · ${t('主标题', 'Headline')} ${labResult.trace.audit.metrics.headlineFontSize}px` : ''}
              </strong>
              {Array.isArray(labResult.trace.audit.issues) && labResult.trace.audit.issues.length > 0 && (
                <ul>
                  {labResult.trace.audit.issues.map(issue => (
                    <li key={issue.code}><code>{issue.code}</code> {issue.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {labResult?.output ? (
        <div className="aso-lab-result-grid">
          <figure className="aso-lab-result-full">
            <img src={labResult.output.url} alt={t('实际生成的 ASO 1242 × 2688 成品图', 'Generated ASO 1242 × 2688 screenshot')} />
            <figcaption>
              <strong>{t('全尺寸成品图', 'Full-Resolution Output')}</strong>
              <span>
                {labResult.output.width} × {labResult.output.height} · {labResult.output.opaqueRgb ? '24-bit Opaque RGB PNG' : 'PNG'} · {(labResult.output.sizeBytes / 1024).toFixed(0)} KB
              </span>
            </figcaption>
          </figure>
          <div className="aso-lab-result-side">
            {labResult.thumb && (
              <figure className="aso-lab-result-thumb">
                <img src={labResult.thumb.url} alt={t('160 px 列表缩略图检视', '160 px thumbnail inspection')} />
                <figcaption>
                  <strong>{t('160 px 缩略图检视', '160 px Thumbnail Check')}</strong>
                  <span>{t('检验首图 3 秒可读性与标题对比度', 'Verify 3-second scannability & contrast')}</span>
                </figcaption>
              </figure>
            )}
            {labResult.device3d && (
              <figure className="aso-lab-result-device3d">
                <img src={labResult.device3d.url} alt={t('生成过程产出的 3D 真机中间素材', 'Intermediate 3D device render')} />
                <figcaption>
                  <strong>{t('3D 真机中间素材', '3D Device Intermediate')}</strong>
                  <span><code>.tmp/aso-lab/phone-3d.png</code> · {labResult.device3d.width} × {labResult.device3d.height}</span>
                </figcaption>
              </figure>
            )}
          </div>
        </div>
      ) : (
        <div className="aso-lab-result-empty">
          <p>{t('尚未检测到已生成的上架图（.tmp/aso-lab/aso-lab-test-1242x2688.png）。', 'No generated screenshot detected yet at .tmp/aso-lab/aso-lab-test-1242x2688.png.')}</p>
          <small>{t('完整模拟方式：① 点击上方「点击复制测试提示词」交给本机 Agent 从零执行，完成后点「刷新 Agent 生成结果」；② 若已配置 AI 服务，直接点「模拟全流程生成（AI）」；③ 或在下方提交自定义 HTML 实渲验证。', 'Ways to test: 1) Copy the prompt to your local Agent and click Refresh Agent Result; 2) Run Simulate Full Flow (AI); or 3) Render custom HTML below.')}</small>
        </div>
      )}

      <details className="aso-lab-html-runner" open={!labResult?.output || Boolean(htmlDraft)}>
        <summary>
          <Code2 size={15} />
          <span>{t('HTML 实时渲染测试（.tmp/aso-lab/design.html → 1242 × 2688 RGB PNG）', 'Live HTML Render Test (.tmp/aso-lab/design.html → 1242 × 2688 RGB PNG)')}</span>
        </summary>
        <div className="aso-lab-html-body">
          <textarea
            aria-label={t('测试 HTML 源码', 'Test HTML source')}
            rows={10}
            value={htmlDraft}
            onChange={event => setHtmlDraft(event.target.value)}
            placeholder={t(
              '在此查看、微调或提交自定义 design.html（无预设版式，可自由引用 /aso-lab/sample-screenshot.png、/aso-lab/sample-icon.png、/local/phone-3d.png、data/aso-design 字体及 <i data-lucide="camera"></i>）…',
              'Inspect, tweak, or paste custom design.html here (supports /aso-lab/sample-screenshot.png, /aso-lab/sample-icon.png, /local/phone-3d.png, local font names, and <i data-lucide="camera"></i>)…',
            )}
          />
          <div className="aso-lab-html-actions">
            <button
              type="button"
              className="button primary"
              disabled={busyAction !== ''}
              onClick={handleRenderHtml}
            >
              <span>{busyAction === 'render' ? t('Chromium 渲染中…', 'Rendering in Chromium…') : t('渲染 HTML 测试效果', 'Render HTML Output')}</span>
            </button>
          </div>
        </div>
      </details>
    </section>

    <DesignResources />
  </section>;
}
