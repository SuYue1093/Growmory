import { channelOptions, findPlatform, platformName } from './platforms';
import { PlatformLogo } from './platform-logo';
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Sparkles, X, ChevronDown, Layers, Share2, Compass } from "lucide-react";
import type { Data } from "./types";
import { marketingAgentPrompt, type MarketingPromptTarget } from "./marketing-agent";
import { useI18n } from "./i18n.ts";

export function MarketingBrief({ data, initialProductId, initialReleaseId, close }: { data: Data; initialProductId?: string; initialReleaseId?: string; close: () => void }) {
  const { lang, t } = useI18n();
  const initialRelease = data.releases.find(r => r.id === initialReleaseId && r.productId === initialProductId);
  const [productId, setProductId] = useState(initialProductId || "");
  const [releaseId, setReleaseId] = useState(initialReleaseId || "");
  const [channels, setChannels] = useState<string[]>(() => [...new Set((initialRelease?.channels || []).map(platformName))]);
  const [selectedAccountsByChannel, setSelectedAccountsByChannel] = useState<Record<string, string[]>>({});
  const [format, setFormat] = useState("");
  const [theme, setTheme] = useState(initialRelease ? "版本更新推广" : "");
  const [customTheme, setCustomTheme] = useState("");
  const [audience, setAudience] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const validProductId = data.products.some(p => p.id === productId) ? productId : undefined;
  const validReleaseId = data.releases.some(r => r.id === releaseId && r.productId === validProductId) ? releaseId : undefined;
  const currentRelease = data.releases.find(r => r.id === validReleaseId && r.productId === validProductId);
  const socialAccounts = data.socialAnalytics?.accounts || [];

  const accountsForChannel = (ch: string) => {
    const pid = findPlatform(ch)?.id;
    if (!pid) return [];
    return socialAccounts.filter(a => a.platform === pid);
  };

  const toggleChannelAccount = (ch: string, accId: string) => {
    setSelectedAccountsByChannel(prev => {
      const current = prev[ch] || [];
      const next = current.includes(accId) ? current.filter(id => id !== accId) : [...current, accId];
      return { ...prev, [ch]: next };
    });
    setMessage("");
  };

  const briefTargets: MarketingPromptTarget[] | undefined = channels.length
    ? channels.flatMap(ch => {
        const chosen = (selectedAccountsByChannel[ch] || [])
          .map(id => socialAccounts.find(a => a.id === id))
          .filter((a): a is NonNullable<typeof a> => Boolean(a));
        if (!chosen.length) return [{ channel: ch }];
        return chosen.map(a => ({
          channel: ch,
          accountId: a.id,
          accountName: a.name,
          ...(a.contentDirection ? { contentDirection: a.contentDirection } : {}),
          ...(a.writingStyle ? { writingStyle: a.writingStyle } : {}),
        }));
      })
    : undefined;

  const hasSelectedAccountTargets = Boolean(briefTargets?.some(item => item.accountId));

  const prompt = marketingAgentPrompt(
    {
      productId: validProductId,
      releaseId: validReleaseId,
      brief: {
        channels,
        ...(hasSelectedAccountTargets ? { targets: briefTargets } : {}),
        format: format || undefined,
        theme: (theme === "custom" ? customTheme.trim() : theme) || undefined,
        audience: audience.trim() || undefined
      }
    },
    lang
  );

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setMessage(t("提示词已复制，请粘贴给已连接 Growmory MCP 的 AI Agent。", "Prompt copied! Please send to your MCP-connected AI Agent."));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage(t("复制失败，请展开下方提示词并手动复制。", "Copy failed, please expand prompt preview below to copy manually."));
    }
  }

  const availableChannels = channelOptions(currentRelease?.channels || []);

  return (
    <dialog
      ref={dialog}
      className="marketing-brief modern-brief-dialog"
      aria-labelledby="marketing-brief-title"
      onCancel={e => { e.preventDefault(); close(); }}
    >
      <header className="marketing-brief-header">
        <div className="brief-header-text">
          <div className="brief-header-tag">
            <Sparkles size={14} className="brief-tag-icon" />
            <span>{t("AI 创作协作", "AI Copilot Brief")}</span>
          </div>
          <h2 id="marketing-brief-title">{t("确认推广需求", "Confirm Promotion Brief")}</h2>
        </div>
        <button
          type="button"
          className="icon-button brief-close-btn"
          aria-label={t("关闭推广需求", "Close brief")}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>

      <div className="marketing-brief-questions">
        {/* Step 1: 目标产品与版本 */}
        <fieldset className="brief-card-fieldset">
          <legend className="brief-card-legend">
            <span className="legend-step-badge">1</span>
            <Layers size={15} className="legend-icon" />
            <span>{t("这次想推广哪个产品？", "Which product to promote?")}</span>
          </legend>
          <div className="brief-fields-row">
            <label className="brief-form-label">
              <span className="label-text">{t("推广产品", "Product")}</span>
              <select
                aria-label={t("推广产品", "Product")}
                value={productId}
                className="brief-select"
                onChange={e => {
                  setProductId(e.target.value);
                  setReleaseId("");
                  setChannels([]);
                  setTheme("");
                  setMessage("");
                }}
              >
                <option value="">{t("让 AI 提供提议", "Let AI propose")}</option>
                {data.products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            {validProductId && (
              <label className="brief-form-label">
                <span className="label-text">{t("关联版本（可选）", "Associated Version (Optional)")}</span>
                <select
                  aria-label={t("关联版本", "Associated Version")}
                  value={validReleaseId || ""}
                  className="brief-select"
                  onChange={e => {
                    setReleaseId(e.target.value);
                    const selected = data.releases.find(r => r.id === e.target.value && r.productId === productId);
                    setChannels([...new Set((selected?.channels || []).map(platformName))]);
                    setTheme(selected ? "版本更新推广" : "");
                    setMessage("");
                  }}
                >
                  <option value="">{t("不限定版本", "Any version")}</option>
                  {data.releases.filter(r => r.productId === validProductId).map(r => (
                    <option key={r.id} value={r.id}>{r.version}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </fieldset>

        {/* Step 2: 渠道与形式 */}
        <fieldset className="brief-card-fieldset">
          <legend className="brief-card-legend">
            <span className="legend-step-badge">2</span>
            <Share2 size={15} className="legend-icon" />
            <span>{t("想通过什么渠道、形式推广？", "Channels & Format?")}</span>
          </legend>

          <div className="marketing-channel-field">
            <div className="channel-field-header">
              <span className="label-text">{t("推广渠道（可多选）", "Channels (Multiple)")}</span>
              <span className="fine-note">
                {channels.length ? (lang === 'en' ? `Selected ${channels.length}` : `已选择 ${channels.length} 个渠道`) : t("当前交由 AI 自由提议", "AI will propose")}
              </span>
            </div>

            <div className="marketing-channel-options" role="group" aria-label={t("推广渠道", "Channels")}>
              <label className={`channel-pill-item ${!channels.length ? "is-selected" : ""}`}>
                <input
                  type="checkbox"
                  checked={!channels.length}
                  onChange={() => { setChannels([]); setMessage(""); }}
                />
                <span className="pill-text">{t("让 AI 提供提议", "Let AI propose")}</span>
              </label>

              {availableChannels.map(c => {
                const isChecked = channels.includes(c);
                return (
                  <label key={c} className={`channel-pill-item ${isChecked ? "is-selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={e => {
                        setChannels(values => e.target.checked ? [...values, c] : values.filter(v => v !== c));
                        if (!e.target.checked) {
                          setSelectedAccountsByChannel(prev => {
                            const next = { ...prev };
                            delete next[c];
                            return next;
                          });
                        }
                        setMessage("");
                      }}
                    />
                    <span className="platform-label">
                      <PlatformLogo platform={c} size={16} />
                      <span className="platform-name-text">{c}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            {channels.some(ch => accountsForChannel(ch).length > 0) && (
              <div className="group-account-selector" style={{ marginTop: "12px" }}>
                <span className="label-text">{t("指定发布账号（可选，同平台可多选）", "Target Accounts (Optional, multi-select)")}</span>
                {channels.map(ch => {
                  const accs = accountsForChannel(ch);
                  if (!accs.length) return null;
                  const chosen = selectedAccountsByChannel[ch] || [];
                  return (
                    <div key={ch} className="group-account-row">
                      <span className="group-account-platform">
                        <PlatformLogo platform={ch} size={14} />
                        {ch}
                      </span>
                      <div className="group-account-pills">
                        {accs.map(acc => {
                          const isSelected = chosen.includes(acc.id);
                          return (
                            <label key={acc.id} className={`channel-pill-item compact ${isSelected ? "is-selected" : ""}`} title={[acc.contentDirection, acc.writingStyle].filter(Boolean).join(" / ") || undefined}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleChannelAccount(ch, acc.id)}
                              />
                              <span className="pill-text">{acc.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="brief-fields-row" style={{ marginTop: "14px" }}>
            <label className="brief-form-label">
              <span className="label-text">{t("推广形式", "Format")}</span>
              <select
                aria-label={t("推广形式", "Format")}
                value={format}
                className="brief-select"
                onChange={e => { setFormat(e.target.value); setMessage(""); }}
              >
                <option value="">{t("让 AI 提供提议", "Let AI propose")}</option>
                {["图文文章", "短帖", "使用教程", "产品故事", "短视频脚本", "长文章"].map(f => (
                  <option key={f} value={f}>{t(f)}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {/* Step 3: 主题方向与备注 */}
        <fieldset className="brief-card-fieldset">
          <legend className="brief-card-legend">
            <span className="legend-step-badge">3</span>
            <Compass size={15} className="legend-icon" />
            <span>{t("希望围绕什么主题、有哪些备注？", "3. Theme & Notes?")}</span>
          </legend>

          <div className="brief-fields-row">
            <label className="brief-form-label">
              <span className="label-text">{t("主题方向", "Theme")}</span>
              <select
                aria-label={t("主题方向", "Theme")}
                value={theme}
                className="brief-select"
                onChange={e => { setTheme(e.target.value); setMessage(""); }}
              >
                <option value="">{t("让 AI 提供提议", "Let AI propose")}</option>
                {["产品介绍", "版本更新推广", "新功能推广", "使用场景", "使用技巧", "开发故事"].map(tItem => (
                  <option key={tItem} value={tItem}>{t(tItem)}</option>
                ))}
                <option value="custom">{t("自己指定方向", "Custom theme")}</option>
              </select>
            </label>

            <label className="brief-form-label">
              <span className="label-text">{t("备注（可选）", "Notes (Optional)")}</span>
              <input
                maxLength={500}
                value={audience}
                aria-label={t("备注", "Notes")}
                className="brief-input"
                placeholder={t("例如面向独立开发者，或补充重点关注的亮点与语气风格等", "e.g. Target audience, key highlights, tone or special notes")}
                onChange={e => { setAudience(e.target.value); setMessage(""); }}
              />
            </label>
          </div>

          {theme === "custom" && (
            <div style={{ marginTop: "12px" }}>
              <label className="brief-form-label">
                <span className="label-text">{t("自定义主题", "Custom Theme")}</span>
                <input
                  maxLength={1000}
                  value={customTheme}
                  aria-label={t("自定义主题", "Custom Theme")}
                  className="brief-input"
                  placeholder={t("简单描述方向即可，无需写标题或正文", "Briefly describe direction")}
                  onChange={e => { setCustomTheme(e.target.value); setMessage(""); }}
                />
              </label>
            </div>
          )}
        </fieldset>
      </div>

      {/* 提示词展开预览 */}
      <details className="marketing-brief-preview">
        <summary className="brief-preview-summary">
          <div className="preview-summary-left">
            <ChevronDown size={14} className="summary-arrow" />
            <span>{t("查看拼合后的提示词", "View Combined Prompt")}</span>
          </div>
          <span className="preview-badge">{prompt.length} {t("字符", "chars")}</span>
        </summary>
        <div className="preview-textarea-wrap">
          <textarea
            aria-label={t("营销创作提示词", "Marketing Prompt")}
            readOnly
            className="brief-textarea"
            value={prompt}
            onFocus={e => e.target.select()}
          />
        </div>
      </details>

      <footer className="marketing-brief-footer">
        <div className="brief-footer-hint">
          <Sparkles size={14} className="brief-hint-icon" />
          <p>{t("后续提议、选题选择和完整文章都在 AI Agent 对话中完成。", "Proposals, topic choices, and full articles are completed in AI Agent chat.")}</p>
        </div>
        <div className="brief-footer-actions">
          <button type="button" className="button secondary brief-cancel-btn" onClick={close}>
            {t("取消", "Cancel")}
          </button>
          <button
            type="button"
            className={`button primary brief-copy-btn ${copied ? "is-copied" : ""}`}
            onClick={() => void copyPrompt()}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            <span>{copied ? t("已复制提示词", "Prompt Copied") : t("复制提示词", "Copy Prompt")}</span>
          </button>
        </div>
      </footer>

      {message && <p className="marketing-brief-message" role="status">{message}</p>}
    </dialog>
  );
}
