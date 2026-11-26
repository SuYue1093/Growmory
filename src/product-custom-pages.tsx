import React, { useState, useEffect } from 'react';
import type { Product } from './types';
import { useI18n } from './i18n.ts';
import {
  Layers,
  Plus,
  RefreshCw,
  Copy,
  ExternalLink,
  Sparkles,
  X,
  Trash2,
  Edit2,
  Check,
  Globe,
  Link as LinkIcon,
  FileText,
} from 'lucide-react';
import { buildCustomPagesAgentPrompt } from './custom-pages-agent-prompt.ts';
import { storeState } from './product-app-store';
import { APP_STORE_LOCALES } from './release-publication';

export type CustomProductPageVersion = {
  id: string;
  version: string;
  state: string;
  deepLink?: string;
  localizations: Array<{
    id: string;
    locale: string;
    promotionalText?: string;
  }>;
};

export type CustomProductPage = {
  id: string;
  name: string;
  url: string;
  visibleToAllUsers: boolean;
  versions: CustomProductPageVersion[];
};

export function ProductCustomPages({
  product,
  notify,
}: {
  product: Product;
  notify?: (msg: string) => void;
}) {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<CustomProductPage[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [serverLocales, setServerLocales] = useState<string[]>([]);

  // 计算该产品实际已在 App Store Connect 或版本中配置的语言
  const configuredProductLocales = React.useMemo(() => {
    const set = new Set<string>();
    const versions = product.appStore?.versions || [];
    for (const v of versions) {
      for (const n of (v.notes || [])) {
        if (n.locale) set.add(n.locale);
      }
    }
    if (serverLocales && serverLocales.length > 0) {
      for (const l of serverLocales) set.add(l);
    }
    return Array.from(set);
  }, [product, serverLocales]);

  // Modals
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<CustomProductPage | null>(null);
  const [showVersionModal, setShowVersionModal] = useState<CustomProductPage | null>(null);
  const [showLocModal, setShowLocModal] = useState<{ page: CustomProductPage; version: CustomProductPageVersion; loc?: { id: string; locale: string; promotionalText?: string } } | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formDeepLink, setFormDeepLink] = useState('');
  const [formLocale, setFormLocale] = useState('zh-Hans');
  const [formPromoText, setFormPromoText] = useState('');
  const [formVisible, setFormVisible] = useState(true);

  const fetchPages = async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/custom-pages/${encodeURIComponent(product.id)}/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取自定义页面列表失败');
      setPages(data.pages || []);
      setIsConfigured(!!data.configured);
      setSyncedAt(data.syncedAt || null);
      if (Array.isArray(data.locales)) {
        setServerLocales(data.locales);
      }
    } catch (err: any) {
      notify?.(err.message || '获取自定义页面列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPages(false);
  }, [product.id]);

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      notify?.(t('请填写页面名称', 'Please provide a page name'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/custom-pages/${encodeURIComponent(product.id)}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          deepLink: formDeepLink.trim() || undefined,
          locale: formLocale.trim() || undefined,
          promotionalText: formPromoText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建自定义页面失败');
      setPages(data.pages || []);
      setShowCreateModal(false);
      setFormName('');
      setFormDeepLink('');
      setFormPromoText('');
      notify?.(t('自定义产品页面已创建', 'Custom product page created'));
    } catch (err: any) {
      notify?.(err.message || '创建自定义页面失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/custom-pages/${encodeURIComponent(product.id)}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: showEditModal.id,
          name: formName.trim() || undefined,
          visibleToAllUsers: formVisible,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新自定义页面失败');
      setPages(data.pages || []);
      setShowEditModal(null);
      notify?.(t('自定义产品页面已更新', 'Custom product page updated'));
    } catch (err: any) {
      notify?.(err.message || '更新自定义页面失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    if (!confirm(t('确定要删除此自定义产品页面吗？此操作不可恢复。', 'Are you sure you want to delete this custom product page? This action cannot be undone.'))) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/custom-pages/${encodeURIComponent(product.id)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除自定义页面失败');
      setPages(data.pages || []);
      notify?.(t('自定义产品页面已删除', 'Custom product page deleted'));
    } catch (err: any) {
      notify?.(err.message || '删除自定义页面失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showVersionModal) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/custom-pages/${encodeURIComponent(product.id)}/create-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: showVersionModal.id,
          deepLink: formDeepLink.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '新建版本失败');
      setPages(data.pages || []);
      setShowVersionModal(null);
      setFormDeepLink('');
      notify?.(t('新版本已创建', 'New version created'));
    } catch (err: any) {
      notify?.(err.message || '新建版本失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSetLocalization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showLocModal) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/custom-pages/${encodeURIComponent(product.id)}/set-localization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: showLocModal.version.id,
          localizationId: showLocModal.loc?.id,
          locale: formLocale.trim(),
          promotionalText: formPromoText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '设置本地化宣传文案失败');
      setPages(data.pages || []);
      setShowLocModal(null);
      setFormPromoText('');
      notify?.(t('宣传文本已保存', 'Promotional text saved'));
    } catch (err: any) {
      notify?.(err.message || '设置本地化宣传文案失败');
    } finally {
      setLoading(false);
    }
  };

  const agentPrompt = buildCustomPagesAgentPrompt(product, lang);

  return (
    <div className="custom-pages-workspace">
      {/* 顶部状态与操作工具栏 */}
      <div className="panel-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`status-pill ${isConfigured ? 'green' : 'amber'}`}>
            {isConfigured ? t('已连接 App Store Connect', 'Connected to App Store Connect') : t('草稿模式 (未配置 API 凭据)', 'Draft Mode (No API credentials)')}
          </span>
          {syncedAt && (
            <span style={{ color: 'var(--muted, #64748b)', fontSize: 12 }}>
              {t('上次同步：', 'Last synced: ')}{new Date(syncedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="button secondary"
            onClick={() => setShowAgentModal(true)}
          >
            <Sparkles size={15} />
            <span>{t('Agent 策略与提示词', 'Agent Strategy & Prompt')}</span>
          </button>

          <button
            type="button"
            className="button secondary"
            disabled={loading}
            onClick={() => fetchPages(true)}
            title={t('向 App Store Connect 刷新列表', 'Refresh from App Store Connect')}
          >
            <RefreshCw size={15} className={loading ? 'spinning' : ''} />
            <span>{t('刷新', 'Refresh')}</span>
          </button>

          <button
            type="button"
            className="button primary"
            onClick={() => {
              setFormName('');
              setFormDeepLink('');
              setFormLocale(configuredProductLocales[0] || 'zh-Hans');
              setFormPromoText('');
              setShowCreateModal(true);
            }}
          >
            <Plus size={16} />
            <span>{t('新建自定义页面', 'New Custom Page')}</span>
          </button>
        </div>
      </div>

      {/* 列表区域 */}
      {pages.length === 0 ? (
        <div className="panel padded text-center" style={{ padding: '60px 20px', textAlign: 'center', background: 'var(--panel-bg, #ffffff)', borderRadius: 12, border: '1px dashed var(--border, #e2e8f0)' }}>
          <div style={{ display: 'inline-flex', padding: 16, background: '#f0f9ff', borderRadius: '50%', color: '#0284c7', marginBottom: 16 }}>
            <Layers size={36} />
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>{t('暂无自定义产品页面', 'No Custom Product Pages Yet')}</h3>
          <p style={{ margin: '0 0 20px 0', color: 'var(--muted, #64748b)', fontSize: 13, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
            {t(
              '你可以为不同获客渠道创建最多 35 个不同版本的自定义页面，每个页面拥有独立 App Store 链接，可直接用在 Apple Search Ads、社媒广告或 KOL 合作中。',
              'You can create up to 35 custom product pages for distinct acquisition channels, each with a unique App Store link for Apple Search Ads or social campaigns.'
            )}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setFormName('');
                setFormDeepLink('');
                setFormLocale(configuredProductLocales[0] || 'zh-Hans');
                setFormPromoText('');
                setShowCreateModal(true);
              }}
            >
              <Plus size={15} />
              <span>{t('创建首个自定义页面', 'Create First Custom Page')}</span>
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setShowAgentModal(true)}
            >
              <Sparkles size={15} />
              <span>{t('查看 Agent 规划指南', 'View Agent Guide')}</span>
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {pages.map(page => {
            const latestVersion = page.versions[0];
            return (
              <div
                key={page.id}
                className="panel padded"
                style={{
                  background: 'var(--panel-bg, #ffffff)',
                  borderRadius: 12,
                  border: '1px solid var(--border, #e2e8f0)',
                  padding: 20,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{page.name}</h3>
                      <span className={`status-pill ${latestVersion?.state === 'APPROVED' ? 'green' : latestVersion?.state === 'READY_FOR_REVIEW' ? 'blue' : 'amber'}`}>
                        {latestVersion ? storeState(latestVersion.state, t) : t('无版本', 'No Version')}
                      </span>
                      {page.visibleToAllUsers ? (
                        <span className="badge" style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 6 }}>
                          {t('全部用户可见', 'Visible to all')}
                        </span>
                      ) : (
                        <span className="badge" style={{ fontSize: 11, background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 6 }}>
                          {t('仅特定链接可见', 'Link only')}
                        </span>
                      )}
                    </div>

                    {/* App Store URL */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted, #64748b)' }}>{t('分发链接：', 'Distribution URL: ')}</span>
                      <code style={{ fontSize: 12, background: '#f8fafc', padding: '3px 8px', borderRadius: 4, border: '1px solid #e2e8f0', color: '#0f172a' }}>
                        {page.url}
                      </code>
                      <button
                        type="button"
                        className="text-button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(page.url);
                          notify?.(t('已复制 App Store 自定义页面链接', 'App Store custom product page URL copied'));
                        }}
                        title={t('复制链接', 'Copy URL')}
                      >
                        <Copy size={13} />
                      </button>
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-button"
                        title={t('在 App Store 打开', 'Open in App Store')}
                        style={{ display: 'inline-flex', alignItems: 'center' }}
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => {
                        setShowVersionModal(page);
                        setFormDeepLink(latestVersion?.deepLink || '');
                      }}
                    >
                      <Plus size={13} />
                      <span>{t('新建版本', 'New Version')}</span>
                    </button>

                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => {
                        setShowEditModal(page);
                        setFormName(page.name);
                        setFormVisible(page.visibleToAllUsers);
                      }}
                    >
                      <Edit2 size={13} />
                      <span>{t('编辑', 'Edit')}</span>
                    </button>

                    <button
                      type="button"
                      className="button secondary small"
                      style={{ color: '#ef4444' }}
                      onClick={() => handleDeletePage(page.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* 页面版本与本地化信息 */}
                {page.versions && page.versions.length > 0 ? (
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14, border: '1px solid #e2e8f0' }}>
                    {page.versions.map((v, vIdx) => (
                      <div key={v.id} style={{ marginBottom: vIdx < page.versions.length - 1 ? 14 : 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                              {t('版本', 'Version')} {v.version || `1.${vIdx}`}
                            </span>
                            <span className="count">{storeState(v.state, t)}</span>
                            {v.deepLink ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#0284c7' }}>
                                <LinkIcon size={12} />
                                {t('深层链接：', 'Deep Link: ')}{v.deepLink}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: '#94a3b8' }}>{t('（未配置深层链接）', '(No deep link)')}</span>
                            )}
                          </div>

                          <button
                            type="button"
                            className="button secondary small"
                            onClick={() => {
                              setShowLocModal({ page, version: v });
                              setFormLocale(configuredProductLocales[0] || 'zh-Hans');
                              setFormPromoText('');
                            }}
                          >
                            <Plus size={12} />
                            <span>{t('添加语言文案', 'Add Localized Copy')}</span>
                          </button>
                        </div>

                        {/* 本地化列表 */}
                        {v.localizations && v.localizations.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                            {v.localizations.map(loc => (
                              <div
                                key={loc.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: '#ffffff',
                                  borderRadius: 6,
                                  padding: '8px 12px',
                                  border: '1px solid #e2e8f0',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                                  <span style={{ fontWeight: 600, fontSize: 12, padding: '2px 6px', background: '#f1f5f9', borderRadius: 4 }}>
                                    <Globe size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                                    {loc.locale}
                                  </span>
                                  <span style={{ fontSize: 13, color: loc.promotionalText ? '#1e293b' : '#94a3b8' }}>
                                    {loc.promotionalText || t('（暂未设置宣传文本）', '(No promotional text set)')}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() => {
                                    setShowLocModal({ page, version: v, loc });
                                    setFormLocale(loc.locale);
                                    setFormPromoText(loc.promotionalText || '');
                                  }}
                                >
                                  <Edit2 size={12} />
                                  <span>{t('编辑文案', 'Edit Copy')}</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
                            {t('暂无多语言推广文本配置，可点击上方「添加语言文案」为特定市场配置定制内容。', 'No localized promotional text. Click "Add Localized Copy" to configure custom copy for target markets.')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>{t('暂无版本信息', 'No versions')}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 新建自定义页面弹窗 */}
      {showCreateModal && (
        <div className="app-store-pages-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="app-store-pages-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-top-bar">
              <h3 className="modal-title">
                <Layers size={18} />
                <span>{t('新建自定义产品页面 (CPP)', 'New Custom Product Page')}</span>
              </h3>
              <button type="button" className="icon-button" aria-label={t('关闭', 'Close')} onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePage}>
              <div className="modal-section">
                <label className="section-label" htmlFor="cpp-name-input">
                  <span>{t('页面名称（便于内部识别）', 'Page Name')}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="cpp-name-input"
                  className="input full-width"
                  placeholder={t('例如：夏日效率活动 / 摄影爱好者推荐 / ASA-办公分类词', 'e.g., Summer Promo / Creator Segment / ASA-Keywords')}
                  value={formName}
                  maxLength={60}
                  onChange={e => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="modal-section">
                <label className="section-label" htmlFor="cpp-deeplink-input">
                  <span>{t('深层链接 (Deep Link)', 'Deep Link')}</span>
                  <span className="optional-tag">{t('选填', 'Optional')}</span>
                </label>
                <input
                  id="cpp-deeplink-input"
                  className="input full-width"
                  placeholder={t('例如：growmory://promo/summer 或 https://growmory.app/feature/scan', 'e.g. myapp://promo/summer')}
                  value={formDeepLink}
                  onChange={e => setFormDeepLink(e.target.value)}
                />
                <span className="field-hint">
                  {t('用户通过该自定义页面下载并打开应用时，直达应用内的特定页面或迎新流程。', 'Directs users to specific in-app content or onboarding flow after install.')}
                </span>
              </div>

              <div className="modal-section">
                <label className="section-label" htmlFor="cpp-init-locale-select">
                  <span>{t('初始语言 (Locale)', 'Initial Locale')}</span>
                  <span className="required-star">*</span>
                </label>
                <select
                  id="cpp-init-locale-select"
                  className="select full-width"
                  value={formLocale}
                  onChange={e => setFormLocale(e.target.value)}
                >
                  {configuredProductLocales.length > 0 && (
                    <optgroup label={t('产品已配置语言 (优先推荐)', 'Configured Product Locales (Recommended)')}>
                      {configuredProductLocales.map(code => (
                        <option key={`cfg-${code}`} value={code}>
                          {APP_STORE_LOCALES[code] ? `${APP_STORE_LOCALES[code]} (${code})` : code}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={t('全部 App Store 支持语言', 'All App Store Supported Locales')}>
                    {Object.entries(APP_STORE_LOCALES).map(([code, name]) => (
                      <option key={`all-${code}`} value={code}>
                        {name} ({code})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="modal-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="section-label" htmlFor="cpp-promotext-input">{t('宣传文本 (Promotional Text)', 'Promotional Text')}</label>
                  <span style={{ fontSize: 12, color: formPromoText.length > 170 ? '#ef4444' : '#64748b' }}>
                    {formPromoText.length} / 170
                  </span>
                </div>
                <textarea
                  id="cpp-promotext-input"
                  className="input full-width"
                  rows={3}
                  placeholder={t('该页面在 App Store 首屏展示的宣传亮点，不超过 170 字符', 'Key promotional highlight shown on the App Store page, up to 170 chars')}
                  value={formPromoText}
                  maxLength={170}
                  onChange={e => setFormPromoText(e.target.value)}
                />
              </div>

              <div className="modal-bottom-actions">
                <button type="button" className="button secondary" onClick={() => setShowCreateModal(false)}>
                  {t('取消', 'Cancel')}
                </button>
                <button type="submit" className="button primary" disabled={loading}>
                  {loading ? t('创建中...', 'Creating...') : t('确认创建', 'Confirm Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 编辑自定义页面弹窗 */}
      {showEditModal && (
        <div className="app-store-pages-modal-backdrop" onClick={() => setShowEditModal(null)}>
          <div className="app-store-pages-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-top-bar">
              <h3 className="modal-title">
                <Edit2 size={18} />
                <span>{t('编辑自定义页面设置', 'Edit Custom Page Settings')}</span>
              </h3>
              <button type="button" className="icon-button" aria-label={t('关闭', 'Close')} onClick={() => setShowEditModal(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdatePage}>
              <div className="modal-section">
                <label className="section-label" htmlFor="cpp-edit-name-input">{t('页面名称', 'Page Name')}</label>
                <input
                  id="cpp-edit-name-input"
                  className="input full-width"
                  value={formName}
                  maxLength={60}
                  onChange={e => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="modal-section">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formVisible}
                    onChange={e => setFormVisible(e.target.checked)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{t('对全部用户可见 (visibleToAllUsers)', 'Visible to all users')}</span>
                </label>
                <span className="field-hint">
                  {t('关闭时，只有通过特定链接访问的用户才能看到此页面。', 'When turned off, only users visiting via direct link can see this page.')}
                </span>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" className="button secondary" onClick={() => setShowEditModal(null)}>
                  {t('取消', 'Cancel')}
                </button>
                <button type="submit" className="button primary" disabled={loading}>
                  {loading ? t('保存中...', 'Saving...') : t('保存修改', 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新建版本弹窗 */}
      {showVersionModal && (
        <div className="app-store-pages-modal-backdrop" onClick={() => setShowVersionModal(null)}>
          <div className="app-store-pages-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-top-bar">
              <h3 className="modal-title">
                <Plus size={18} />
                <span>{t('为自定义页面新建版本', 'Create New Version')}</span>
              </h3>
              <button type="button" className="icon-button" aria-label={t('关闭', 'Close')} onClick={() => setShowVersionModal(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateVersion}>
              <div className="modal-section">
                <label className="section-label" htmlFor="cpp-version-deeplink">{t('深层链接 (Deep Link)', 'Deep Link')}</label>
                <input
                  id="cpp-version-deeplink"
                  className="input full-width"
                  placeholder={t('例如：growmory://promo/v2', 'e.g. myapp://promo/v2')}
                  value={formDeepLink}
                  onChange={e => setFormDeepLink(e.target.value)}
                />
                <span className="field-hint">
                  {t('选填，为此版本关联特定的 Universal Link 或 URL Scheme 落地页。', 'Optional: associate a specific Universal Link or URL Scheme with this version.')}
                </span>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" className="button secondary" onClick={() => setShowVersionModal(null)}>
                  {t('取消', 'Cancel')}
                </button>
                <button type="submit" className="button primary" disabled={loading}>
                  {loading ? t('创建中...', 'Creating...') : t('创建版本', 'Create Version')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 设置本地化文案弹窗 */}
      {showLocModal && (
        <div className="app-store-pages-modal-backdrop" onClick={() => setShowLocModal(null)}>
          <div className="app-store-pages-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-top-bar">
              <h3 className="modal-title">
                <FileText size={18} />
                <span>{showLocModal.loc ? t('编辑本地化宣传文案', 'Edit Promotional Text') : t('添加语言宣传文案', 'Add Localized Copy')}</span>
              </h3>
              <button type="button" className="icon-button" aria-label={t('关闭', 'Close')} onClick={() => setShowLocModal(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSetLocalization}>
              <div className="modal-section">
                <label className="section-label" htmlFor="cpp-loc-select">
                  <span>{t('语言 (Locale)', 'Locale')}</span>
                  <span className="required-star">*</span>
                </label>
                {showLocModal.loc ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <Globe size={15} style={{ color: '#0284c7' }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {APP_STORE_LOCALES[formLocale] ? `${APP_STORE_LOCALES[formLocale]} (${formLocale})` : formLocale}
                    </span>
                  </div>
                ) : (
                  <select
                    id="cpp-loc-select"
                    className="select full-width"
                    value={formLocale}
                    onChange={e => setFormLocale(e.target.value)}
                  >
                    {configuredProductLocales.length > 0 && (
                      <optgroup label={t('产品已配置语言 (优先推荐)', 'Configured Product Locales (Recommended)')}>
                        {configuredProductLocales.map(code => (
                          <option key={`loc-cfg-${code}`} value={code}>
                            {APP_STORE_LOCALES[code] ? `${APP_STORE_LOCALES[code]} (${code})` : code}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label={t('全部 App Store 支持语言', 'All App Store Supported Locales')}>
                      {Object.entries(APP_STORE_LOCALES).map(([code, name]) => (
                        <option key={`loc-all-${code}`} value={code}>
                          {name} ({code})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                )}
              </div>

              <div className="modal-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="section-label" htmlFor="cpp-loc-promotext">{t('宣传文本 (Promotional Text)', 'Promotional Text')}</label>
                  <span style={{ fontSize: 12, color: formPromoText.length > 170 ? '#ef4444' : '#64748b' }}>
                    {formPromoText.length} / 170
                  </span>
                </div>
                <textarea
                  id="cpp-loc-promotext"
                  className="input full-width"
                  rows={4}
                  placeholder={t('输入该语言版本的 App Store 宣传文本（≤170 字符）', 'Enter localized promotional text (<= 170 chars)')}
                  value={formPromoText}
                  maxLength={170}
                  onChange={e => setFormPromoText(e.target.value)}
                />
              </div>

              <div className="modal-bottom-actions">
                <button type="button" className="button secondary" onClick={() => setShowLocModal(null)}>
                  {t('取消', 'Cancel')}
                </button>
                <button type="submit" className="button primary" disabled={loading}>
                  {loading ? t('保存中...', 'Saving...') : t('确认保存', 'Confirm Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Agent 提示词与策略指南弹窗 */}
      {showAgentModal && (
        <div className="app-store-pages-modal-backdrop" onClick={() => setShowAgentModal(false)}>
          <div className="app-store-pages-modal large" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div className="modal-top-bar">
              <h3 className="modal-title">
                <Sparkles size={18} />
                <span>{t('自定义产品页面 (CPP) Agent 策略与提示词', 'Custom Product Pages (CPP) Agent Strategy & Prompt')}</span>
              </h3>
              <button type="button" className="icon-button" aria-label={t('关闭', 'Close')} onClick={() => setShowAgentModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-section">
              <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                {t(
                  '将此提示词复制给已连接 Growmory MCP 的 AI Agent。Agent 会通过 get_custom_product_pages_context 读取产品事实与当前页面，并调用 manage_custom_product_page 协助你规划并生成渠道定制化策略。',
                  'Send this prompt to an AI agent connected via Growmory MCP. The agent reads product context and uses manage_custom_product_page to plan and create targeted landing pages.'
                )}
              </p>

              <div className="modal-prompt-preview">
                <textarea
                  readOnly
                  rows={10}
                  value={agentPrompt}
                  aria-label={t('Agent 提示词', 'Agent Prompt')}
                  style={{
                    width: '100%',
                    padding: 12,
                    fontFamily: 'monospace',
                    fontSize: 12,
                    lineHeight: 1.6,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#0f172a',
                  }}
                />
              </div>
            </div>

            <div className="modal-bottom-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowAgentModal(false)}
              >
                {t('关闭', 'Close')}
              </button>
              <button
                type="button"
                className={`button primary ${copiedPrompt ? 'copied' : ''}`}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(agentPrompt);
                    setCopiedPrompt(true);
                    notify?.(t('已复制自定义页面规划 Agent 提示词', 'CPP Agent prompt copied to clipboard'));
                    setTimeout(() => setCopiedPrompt(false), 2500);
                  } catch {
                    notify?.(t('复制失败，请手动选择复制', 'Copy failed. Please copy manually.'));
                  }
                }}
              >
                {copiedPrompt ? <Check size={16} /> : <Copy size={16} />}
                <span>{copiedPrompt ? t('已复制到剪贴板', 'Copied to Clipboard') : t('复制提示词', 'Copy Prompt')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
