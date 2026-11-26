import { useState, useEffect } from 'react';
import { Sparkles, Wand2, Copy, Check, AlertCircle, CheckCircle2, Layers } from 'lucide-react';
import type { Product } from './types';
import { useI18n } from './i18n.ts';

type AsoCopy = {
  name: string;
  subtitle: string;
  keywords: string;
  promotionalText: string;
  description: string;
};

export function AsoStudio({
  product,
  notify,
}: {
  product: Product;
  notify: (msg: string) => void;
}) {
  const { t } = useI18n();
  const storageKey = `growmory:aso:${product.id}`;

  const [copy, setCopy] = useState<AsoCopy>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      name: product.name || '',
      subtitle: (product.summary || '').slice(0, 30),
      keywords: '',
      promotionalText: (product.summary || '').slice(0, 170),
      description: `${product.name} —— ${product.summary || '轻量高效的产品与日常工具'}\n\n【核心特点】\n• 极简易用：开箱即用，专注核心体验\n• 本地优先：数据本地保存，安全私密\n• 顺畅体验：专为效率与专注设计`,
    };
  });

  const [busy, setBusy] = useState(false);
  const [optMessage, setOptMessage] = useState('');
  const [copied, setCopied] = useState(false);

  // Auto-save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(copy));
    } catch {
      // ignore storage error
    }
  }, [copy, storageKey]);

  // Character counts
  const nameLen = [...copy.name].length;
  const subLen = [...copy.subtitle].length;
  const kwLen = [...copy.keywords].length;
  const promoLen = [...copy.promotionalText].length;
  const descLen = [...copy.description].length;

  // Keyword tokens
  const kwTokens = copy.keywords
    .split(/[,，;\n]+/)
    .map(w => w.trim())
    .filter(Boolean);

  // Check duplicates in Title/Subtitle
  const titleText = `${copy.name} ${copy.subtitle}`.toLowerCase();
  const duplicateInTitle = kwTokens.filter(w => w.length >= 2 && titleText.includes(w.toLowerCase()));
  const internalDuplicates = kwTokens.filter((w, i) => kwTokens.indexOf(w) !== i);

  // 1-Click Smart Deduplication & Slimming
  async function handleOptimize() {
    setBusy(true);
    try {
      const resp = await fetch('/api/aso/optimize-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: copy.name,
          subtitle: copy.subtitle,
          keywords: copy.keywords,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.after !== undefined) {
        setCopy(current => ({ ...current, keywords: data.after }));
        if (data.savedChars > 0) {
          setOptMessage(t(`优化完成！已节省 ${data.savedChars} 字符，剔除了 ${data.redundantInTitleOrSubtitle.length + data.duplicateWords.length} 个重复冗余词。`, `Optimized! Saved ${data.savedChars} characters and removed ${data.redundantInTitleOrSubtitle.length + data.duplicateWords.length} redundant duplicate words.`));
        } else {
          setOptMessage(t('当前关键词已高度精炼，无冗余重复词。', 'Current keywords are already concise with no redundant words.'));
        }
        notify(t('关键词已完成去重瘦身', 'Keywords deduplicated and trimmed'));
      }
    } catch {
      notify(t('优化失败，请稍后重试', 'Optimization failed, please try again later'));
    } finally {
      setBusy(false);
    }
  }

  // 1-Click AI Generation
  async function handleAiGenerate() {
    setBusy(true);
    setOptMessage('');
    try {
      const resp = await fetch('/api/aso/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          seedKeywords: kwTokens,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || t('生成失败', 'Generation failed'));

      setCopy({
        name: data.name || copy.name,
        subtitle: data.subtitle || copy.subtitle,
        keywords: data.keywords || copy.keywords,
        promotionalText: data.promotionalText || copy.promotionalText,
        description: data.description || copy.description,
      });

      if (data.tip) {
        setOptMessage(data.tip);
      } else {
        setOptMessage(t('✨ AI 已根据产品资料生成高权重合规文案，并完成自动去重压缩。', '✨ AI generated compliant, high-weight copy based on product materials, with auto-deduplication and compression.'));
      }
      notify(t('ASO 文案已生成并载入', 'ASO copy generated and loaded'));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // 1-Click Copy All for App Store Connect
  function handleCopyAll() {
    const text = `【${t('App 名称', 'App Name')} (<=30)】\n${copy.name}\n\n【${t('副标题', 'Subtitle')} (<=30)】\n${copy.subtitle}\n\n【${t('关键词', 'Keywords')} (<=100)】\n${copy.keywords}\n\n【${t('宣传文本', 'Promotional Text')} (<=170)】\n${copy.promotionalText}\n\n【${t('描述', 'Description')} (<=4000)】\n${copy.description}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    notify(t('已复制整套 ASO 文案（可直接粘贴至 App Store Connect）', 'Copied full ASO copy set (ready to paste into App Store Connect)'));
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="aso-studio" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Action Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--bg-card, #ffffff)',
          borderRadius: 8,
          border: '1px solid var(--border-color, #e2e8f0)',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{t('ASO 文案工作台', 'ASO Copy Studio')}</span>
            <span className="tag small" style={{ fontWeight: 400 }}>{t('草稿实时保存', 'Draft Auto-saved')}</span>
          </h3>
          <p className="fine-print" style={{ margin: '2px 0 0 0' }}>
            {t('支持 30/30/100 严格字符限制校验、标题词重复自动侦测与一键压缩去重。', 'Enforces 30/30/100 character rules, detects title/subtitle duplicates, and provides 1-click slimming.')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="button primary small"
            disabled={busy}
            onClick={() => void handleAiGenerate()}
            title={t('基于产品文档一键生成严格合规的 ASO 文案', 'Generate compliant ASO copy based on product documentation')}
          >
            <Sparkles size={13} /> {busy ? t('生成中…', 'Generating...') : t('AI 智能起草', 'AI Draft')}
          </button>
          <button
            className="button secondary small"
            disabled={busy || !copy.keywords}
            onClick={() => void handleOptimize()}
            title={t('自动清除空格、中文逗号转半角、剔除标题副标题已有的重复词', 'Clean spaces, normalize commas, and remove duplicate words from title/subtitle')}
          >
            <Wand2 size={13} /> {t('智能去重与瘦身', 'Deduplicate & Slim')}
          </button>
          <button
            className="button secondary small"
            onClick={handleCopyAll}
            title={t('复制整套文案', 'Copy full copy set')}
          >
            {copied ? <Check size={13} color="#16a34a" /> : <Copy size={13} />} {t('复制全部文案', 'Copy All')}
          </button>
        </div>
      </div>

      {optMessage && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--color-primary-bg, #eff6ff)',
            border: '1px solid var(--color-primary, #93c5fd)',
            borderRadius: 6,
            fontSize: 13,
            color: 'var(--color-primary-dark, #1e40af)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{optMessage}</span>
          <button
            type="button"
            className="text-button"
            style={{ fontSize: 12 }}
            onClick={() => setOptMessage('')}
          >
            {t('知道了', 'Got it')}
          </button>
        </div>
      )}

      {/* Main Grid: 2 Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        {/* Left Column: Title, Subtitle, Promotional Text, Description */}
        <section className="panel padded" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>{t('App 名称 (Name)', 'App Name')}</label>
              <span className="fine-print" style={{ color: nameLen > 30 ? '#ef4444' : '#64748b' }}>
                {t(`${nameLen} / 30 字符`, `${nameLen} / 30 chars`)}
              </span>
            </div>
            <input
              type="text"
              className="input-text"
              placeholder={t('例如：极简习惯 - 坚持打卡', 'e.g. Habit Tracker - Daily Goal')}
              value={copy.name}
              onChange={e => setCopy({ ...copy, name: e.target.value })}
              style={{ width: '100%', borderColor: nameLen > 30 ? '#ef4444' : undefined }}
            />
            <small className="fine-print">{t('建议格式：品牌词 - 核心品类词（权重最高字段）', 'Recommended format: Brand - Core Category (highest ranking weight)')}</small>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>{t('副标题 (Subtitle)', 'Subtitle')}</label>
              <span className="fine-print" style={{ color: subLen > 30 ? '#ef4444' : '#64748b' }}>
                {t(`${subLen} / 30 字符`, `${subLen} / 30 chars`)}
              </span>
            </div>
            <input
              type="text"
              className="input-text"
              placeholder={t('例如：科学追踪每一个微习惯', 'e.g. Track micro-habits scientifically')}
              value={copy.subtitle}
              onChange={e => setCopy({ ...copy, subtitle: e.target.value })}
              style={{ width: '100%', borderColor: subLen > 30 ? '#ef4444' : undefined }}
            />
            <small className="fine-print">{t('差异化卖点；严禁重复名称中已有的词汇', 'Differentiating value prop; avoid repeating words already in the app name')}</small>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>{t('宣传文本 (Promotional Text)', 'Promotional Text')}</label>
              <span className="fine-print" style={{ color: promoLen > 170 ? '#ef4444' : '#64748b' }}>
                {t(`${promoLen} / 170 字符`, `${promoLen} / 170 chars`)}
              </span>
            </div>
            <input
              type="text"
              className="input-text"
              placeholder={t('显示在描述顶部，可随时修改无需发版审核', 'Shown at the top of description; can be edited anytime without review')}
              value={copy.promotionalText}
              onChange={e => setCopy({ ...copy, promotionalText: e.target.value })}
              style={{ width: '100%', borderColor: promoLen > 170 ? '#ef4444' : undefined }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>{t('应用描述 (Description)', 'Description')}</label>
              <span className="fine-print" style={{ color: descLen > 4000 ? '#ef4444' : '#64748b' }}>
                {t(`${descLen} / 4000 字符`, `${descLen} / 4000 chars`)}
              </span>
            </div>
            <textarea
              className="input-text"
              rows={6}
              placeholder={t('介绍产品亮点、主要功能及适用场景...', 'Introduce product highlights, main features, and use cases...')}
              value={copy.description}
              onChange={e => setCopy({ ...copy, description: e.target.value })}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        </section>

        {/* Right Column: 100-char Keyword Quota Center */}
        <section className="panel padded" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{t('100 字符关键词池 (Keywords)', '100-Char Keyword Pool (Keywords)')}</span>
              </label>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: kwLen > 100 ? '#ef4444' : kwLen >= 80 ? '#16a34a' : '#eab308',
                }}
              >
                {t(`${kwLen} / 100 字符`, `${kwLen} / 100 chars`)}
                {kwLen <= 100 && <span style={{ fontWeight: 400, marginLeft: 4, color: '#64748b' }}>({t(`剩余 ${100 - kwLen}`, `${100 - kwLen} remaining`)})</span>}
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
              <div
                style={{
                  width: `${Math.min(100, (kwLen / 100) * 100)}%`,
                  height: '100%',
                  background: kwLen > 100 ? '#ef4444' : kwLen >= 80 ? '#16a34a' : '#3b82f6',
                  transition: 'width 0.2s',
                }}
              />
            </div>

            <textarea
              className="input-text"
              rows={4}
              placeholder={t('输入关键词，英文逗号分隔，如：专注,番茄钟,自律,时间规划', 'Enter keywords separated by commas, e.g. focus,pomodoro,timer,planner')}
              value={copy.keywords}
              onChange={e => setCopy({ ...copy, keywords: e.target.value })}
              style={{
                width: '100%',
                resize: 'vertical',
                borderColor: kwLen > 100 ? '#ef4444' : undefined,
                fontFamily: 'monospace',
                fontSize: 13,
              }}
            />
          </div>

          {/* Diagnostics alerts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {duplicateInTitle.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b45309', background: '#fef3c7', padding: '6px 10px', borderRadius: 6 }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>
                  {t('发现重复词：', 'Found duplicate keywords: ')}<strong>{duplicateInTitle.join(', ')}</strong> {t('已存在于名称或副标题中，白白占用额度，建议点击上方「智能去重与瘦身」。', 'already exist in the name or subtitle, wasting quota. Click "Deduplicate & Slim" above.')}
                </span>
              </div>
            )}

            {internalDuplicates.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b45309', background: '#fef3c7', padding: '6px 10px', borderRadius: 6 }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>
                  {t('内部重复词：', 'Duplicate keywords: ')}<strong>{internalDuplicates.join(', ')}</strong> {t('出现多次。', 'appear multiple times.')}
                </span>
              </div>
            )}

            {kwLen > 100 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#ef4444', background: '#fee2e2', padding: '6px 10px', borderRadius: 6 }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{t(`超出苹果 100 字符硬性上限，保存至商店将会被拒。请删减 ${kwLen - 100} 个字符。`, `Exceeds Apple's 100-character hard limit and will be rejected. Please remove ${kwLen - 100} characters.`)}</span>
              </div>
            )}

            {duplicateInTitle.length === 0 && internalDuplicates.length === 0 && kwLen <= 100 && kwLen > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#16a34a', background: '#dcfce7', padding: '6px 10px', borderRadius: 6 }}>
                <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                <span>{t('关键词规范合规：无名称副标题重复占用，英文半角逗号分隔。', 'Keywords are fully compliant: no duplicates with title/subtitle, comma-separated.')}</span>
              </div>
            )}
          </div>

          {/* Keyword Tokens Chips */}
          {kwTokens.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', marginBottom: 6 }}>
                {t(`已解析覆盖词 (${kwTokens.length} 个独立词)：`, `Parsed Keywords (${kwTokens.length} unique words):`)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {kwTokens.map((w, idx) => {
                  const isDup = duplicateInTitle.includes(w) || internalDuplicates.includes(w);
                  return (
                    <span
                      key={w + idx}
                      className="tag"
                      style={{
                        background: isDup ? '#fee2e2' : 'var(--bg-tag, #f1f5f9)',
                        color: isDup ? '#ef4444' : 'inherit',
                        border: isDup ? '1px solid #fca5a5' : 'none',
                        textDecoration: isDup ? 'line-through' : 'none',
                      }}
                    >
                      {w}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Secondary Locales Bonus Tip */}
      <section
        className="panel padded"
        style={{
          background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.7) 0%, rgba(243, 232, 255, 0.7) 100%)',
          border: '1px solid rgba(199, 210, 254, 0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Layers size={18} color="#4f46e5" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: 14, color: '#312e81' }}>
              {t('独立开发者 ASO 词库翻倍秘籍（Secondary Locales）', 'Indie Hacker ASO Multiplier Secret (Secondary Locales)')}
            </h4>
            <p className="body-copy" style={{ margin: 0, fontSize: 13, color: '#3730a3', lineHeight: 1.5 }}>
              {t(
                '苹果在中国区支持跨语言联合索引：用户在 App Store 搜索时，除「简体中文 (zh-Hans)」外，还会同时被「美式英语 (en-US)」与「繁体中文 (zh-Hant)」的关键词覆盖！因此在准备发版时，额外配置一套不重复的 en-US 词库，即可在中国区免费多享 +100 字符 的曝光机会。',
                'Apple supports cross-locale indexing in China and other storefronts: users searching the store are indexed by English (en-US) and Traditional Chinese (zh-Hant) in addition to Simplified Chinese! Configuring an extra non-duplicated en-US keyword pool yields +100 bonus keyword characters for store discovery.'
              )}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
