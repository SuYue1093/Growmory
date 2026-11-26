import React, { useState, useMemo, useEffect } from 'react';
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  Edit3,
  X,
  Check,
  Layers3,
  Sparkles,
  ArrowLeft,
  HelpCircle,
} from 'lucide-react';
import type { Data, Product, BriefingSearchConfig } from './types';
import { uid } from './types';
import { useI18n } from './i18n';

export type BriefingSearchConfigModalProps = {
  isOpen: boolean;
  onClose: () => void;
  data: Data;
  save: (updater: (data: Data) => void) => Promise<boolean | void>;
  shortName: (product?: Product) => string;
  renderIcon?: (product?: Product, size?: number) => React.ReactNode;
  showToast: (msg: string) => void;
};

const PRESET_PLATFORMS = [
  '官方博客',
  '更新日志',
  'Reddit',
  'X',
  'Product Hunt',
  'App Store',
  '垂直博客',
  '产品横评',
  'Hacker News',
  '小红书',
  '今日头条',
];

export function BriefingSearchConfigModal({
  isOpen,
  onClose,
  data,
  save,
  shortName,
  renderIcon,
  showToast,
}: BriefingSearchConfigModalProps) {
  const { t } = useI18n();

  // Current list of search configs
  const searchConfigs = data.briefingSearchConfigs || [];

  // Auto-import frameworks from latest briefing if searchConfigs is empty
  useEffect(() => {
    if (isOpen && (!data.briefingSearchConfigs || data.briefingSearchConfigs.length === 0)) {
      const latestBriefing = (data.briefings || []).find((b) => b.frameworks && b.frameworks.length > 0);
      if (latestBriefing?.frameworks?.length) {
        const prodMap = new Map((data.products || []).map((p) => [p.id, p.name]));
        const now = new Date().toISOString();
        const autoConfigs: BriefingSearchConfig[] = latestBriefing.frameworks.map((fw) => {
          const isGeneral = !fw.productId || fw.productId === 'general';
          const prodName = isGeneral ? '独立开发与出海生态' : ((fw.productId && prodMap.get(fw.productId)) || '产品专属');
          return {
            id: uid(),
            name: prodName,
            productId: isGeneral ? 'general' : fw.productId,
            weight: isGeneral ? 4 : 5,
            category: 'all',
            focusQuestions: fw.focusQuestions || [],
            competitors: fw.competitors || [],
            platforms: fw.platforms || [],
            keywords: fw.keywords || [],
            enabled: true,
            createdAt: now,
            updatedAt: now,
          };
        });
        void save((d) => {
          d.briefingSearchConfigs = autoConfigs;
        });
      }
    }
  }, [isOpen, data.briefingSearchConfigs, data.briefings, data.products, save]);

  // Scope filter: all / product / ecosystem
  const [scopeFilter, setScopeFilter] = useState<'all' | 'product' | 'ecosystem'>('all');

  // Editing state
  const [editingConfig, setEditingConfig] = useState<BriefingSearchConfig | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Form field states: 主题、关联产品（无、产品列表）、权重、平台、关键词、关注点
  const [formName, setFormName] = useState('');
  const [formProductId, setFormProductId] = useState('general');
  const [formWeight, setFormWeight] = useState<number>(5);
  const [formPlatforms, setFormPlatforms] = useState<string[]>([]);
  const [customPlatform, setCustomPlatform] = useState('');
  const [formKeywords, setFormKeywords] = useState('');
  const [formFocusQuestions, setFormFocusQuestions] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);

  // Filtered configs by scope
  const filteredConfigs = useMemo(() => {
    return searchConfigs.filter((cfg) => {
      const isEcosystem = !cfg.productId || cfg.productId === 'general';
      if (scopeFilter === 'product' && isEcosystem) return false;
      if (scopeFilter === 'ecosystem' && !isEcosystem) return false;
      return true;
    });
  }, [searchConfigs, scopeFilter]);

  // Sort configs: higher weight first, then updated date
  const sortedConfigs = useMemo(() => {
    return [...filteredConfigs].sort((a, b) => {
      if ((b.weight || 3) !== (a.weight || 3)) {
        return (b.weight || 3) - (a.weight || 3);
      }
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }, [filteredConfigs]);

  // Scope counts
  const productCount = useMemo(() => {
    return searchConfigs.filter((c) => c.productId && c.productId !== 'general').length;
  }, [searchConfigs]);

  const ecosystemCount = useMemo(() => {
    return searchConfigs.filter((c) => !c.productId || c.productId === 'general').length;
  }, [searchConfigs]);

  const activeCount = useMemo(() => {
    return searchConfigs.filter((c) => c.enabled !== false).length;
  }, [searchConfigs]);

  if (!isOpen) return null;

  // Open edit form for a new config
  const handleAddNew = () => {
    setIsCreating(true);
    setEditingConfig({
      id: uid(),
      name: '',
      productId: 'general',
      weight: 5,
      category: 'all',
      focusQuestions: [],
      keywords: [],
      platforms: ['官方博客', '更新日志', 'Reddit', 'X', 'Product Hunt'],
      competitors: [],
      enabled: true,
    });
    setFormName('');
    setFormProductId('general');
    setFormWeight(5);
    setFormPlatforms(['官方博客', '更新日志', 'Reddit', 'X', 'Product Hunt']);
    setCustomPlatform('');
    setFormKeywords('');
    setFormFocusQuestions('');
    setFormEnabled(true);
  };

  // Open edit form for an existing config
  const handleEdit = (config: BriefingSearchConfig) => {
    setIsCreating(false);
    setEditingConfig(config);
    setFormName(config.name);
    setFormProductId(config.productId || 'general');
    setFormWeight(config.weight || 3);
    setFormPlatforms(config.platforms || []);
    setCustomPlatform('');
    setFormKeywords((config.keywords || []).join(', '));
    setFormFocusQuestions((config.focusQuestions || []).join('\n'));
    setFormEnabled(config.enabled !== false);
  };

  // Close editing form
  const handleCancelEdit = () => {
    setEditingConfig(null);
    setIsCreating(false);
  };

  // Save the form
  const handleSaveForm = async () => {
    if (!formName.trim()) {
      showToast(t('请填写主题名称', 'Please enter a topic name for the search config'));
      return;
    }

    const keywords = formKeywords
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const focusQuestions = formFocusQuestions
      .split(/[\n;；]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const now = new Date().toISOString();

    await save((d) => {
      d.briefingSearchConfigs = d.briefingSearchConfigs || [];
      if (isCreating) {
        const newRecord: BriefingSearchConfig = {
          id: uid(),
          name: formName.trim(),
          productId: formProductId === 'general' ? 'general' : formProductId,
          weight: Math.min(5, Math.max(1, formWeight)),
          category: 'all',
          platforms: formPlatforms,
          keywords,
          focusQuestions,
          competitors: [],
          enabled: formEnabled,
          createdAt: now,
          updatedAt: now,
        };
        d.briefingSearchConfigs.push(newRecord);
      } else if (editingConfig) {
        const target = d.briefingSearchConfigs.find((c) => c.id === editingConfig.id);
        if (target) {
          target.name = formName.trim();
          target.productId = formProductId === 'general' ? 'general' : formProductId;
          target.weight = Math.min(5, Math.max(1, formWeight));
          target.category = 'all';
          target.platforms = formPlatforms;
          target.keywords = keywords;
          target.focusQuestions = focusQuestions;
          target.enabled = formEnabled;
          target.updatedAt = now;
        }
      }
    });

    showToast(isCreating ? t('已添加检索项', 'Search item added') : t('已更新检索项', 'Search item updated'));
    setEditingConfig(null);
    setIsCreating(false);
  };

  // Quick weight update from list
  const handleQuickWeightChange = async (configId: string, newWeight: number) => {
    const clamped = Math.min(5, Math.max(1, newWeight));
    await save((d) => {
      d.briefingSearchConfigs = d.briefingSearchConfigs || [];
      const item = d.briefingSearchConfigs.find((c) => c.id === configId);
      if (item) {
        item.weight = clamped;
        item.updatedAt = new Date().toISOString();
      }
    });
    showToast(t(`权重已调整为 ${clamped}`, `Weight updated to ${clamped}`));
  };

  // Quick toggle enabled from list
  const handleToggleEnabled = async (configId: string, enabled: boolean) => {
    await save((d) => {
      d.briefingSearchConfigs = d.briefingSearchConfigs || [];
      const item = d.briefingSearchConfigs.find((c) => c.id === configId);
      if (item) {
        item.enabled = enabled;
        item.updatedAt = new Date().toISOString();
      }
    });
  };

  // Delete config
  const handleDeleteConfig = async (configId: string, configName: string) => {
    if (!window.confirm(t(`确定删除检索配置「${configName}」吗？`, `Delete search config "${configName}"?`))) {
      return;
    }
    await save((d) => {
      d.briefingSearchConfigs = (d.briefingSearchConfigs || []).filter((c) => c.id !== configId);
    });
    showToast(t('已删除检索配置', 'Search config deleted'));
  };

  // Platform toggle in form
  const togglePlatform = (p: string) => {
    setFormPlatforms((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
    );
  };

  // Add custom platform
  const handleAddCustomPlatform = () => {
    const trimmed = customPlatform.trim();
    if (!trimmed) return;
    if (!formPlatforms.includes(trimmed)) {
      setFormPlatforms((prev) => [...prev, trimmed]);
    }
    setCustomPlatform('');
  };

  return (
    <div className="modal-backdrop briefing-modal-backdrop" onClick={onClose}>
      <div
        className="modal briefing-config-modal-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="config-dialog-header">
          {editingConfig ? (
            <div className="header-meta-wrap">
              <div className="header-title-line">
                <button
                  type="button"
                  className="header-back-inline-btn"
                  onClick={handleCancelEdit}
                  title={t('返回检索配置列表', 'Back to List')}
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="title-icon-wrap">
                  <SlidersHorizontal size={18} />
                </div>
                <h3>
                  {isCreating
                    ? t('新建检索项', 'New Search Config')
                    : `${t('编辑检索项', 'Edit Search Config')}${formName ? ` · ${formName}` : ''}`}
                </h3>
              </div>
              <p className="header-subtitle-text">
                {t(
                  '配置该项的关注点、权重、平台与关键词，外部 Agent 将按此进行定向检索与核查。',
                  'Configure focus questions, weight, platforms and keywords for external search agents.'
                )}
              </p>
            </div>
          ) : (
            <div className="header-meta-wrap">
              <div className="header-title-line">
                <div className="title-icon-wrap">
                  <SlidersHorizontal size={18} />
                </div>
                <h3>{t('资讯检索配置', 'Search Configuration')}</h3>
                <span className="header-status-badge">
                  {activeCount} / {searchConfigs.length} {t('已启用', 'Active')}
                </span>
              </div>
              <p className="header-subtitle-text">
                {t(
                  '外部 Agent 每天依据此配置中的关注点、平台与关键词执行全网检索，并按星级权重优先满足高优先级项。',
                  'External search agents retrieve web intelligence daily based on these questions, platforms, keywords and weights.'
                )}
              </p>
            </div>
          )}

          <div className="header-right-side-actions">
            {editingConfig && (
              <div className="header-status-toggle-box">
                <label className="switch-toggle" title={formEnabled ? t('已启用', 'Enabled') : t('已停用', 'Disabled')}>
                  <input
                    type="checkbox"
                    checked={formEnabled}
                    onChange={(e) => setFormEnabled(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
                <span className="switch-status-label">
                  {formEnabled ? t('已启用', 'Enabled') : t('已停用', 'Disabled')}
                </span>
              </div>
            )}
            <button
              type="button"
              className="dialog-close-btn"
              onClick={editingConfig ? handleCancelEdit : onClose}
              title={t('关闭', 'Close')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="config-dialog-body">
          {editingConfig ? (
            /* =================== EDIT / CREATE VIEW =================== */
            <div className="config-editor-view">
              <div className="editor-form-scrollable">
                <div className="editor-fieldset-card">
                  <div className="fieldset-grid-2">
                    {/* 1. 主题 */}
                    <div className="form-item">
                      <label className="form-item-label required">{t('主题', 'Topic')}</label>
                      <span className="form-item-hint">
                        {t('概括该项检索的核心聚焦点或调研目标', 'Summarize the core focus or objective')}
                      </span>
                      <input
                        type="text"
                        className="input"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder={t(
                          '如：竞品变现与留存 / 待办应用用户迁移痛点',
                          'e.g., Photo cleaner monetization benchmarks / User migration pain points'
                        )}
                        autoFocus
                      />
                    </div>

                    {/* 2. 关联产品 */}
                    <div className="form-item">
                      <label className="form-item-label">{t('关联产品', 'Target Product')}</label>
                      <span className="form-item-hint">
                        {t('选择无（通用生态）或指定关联的具体产品', 'Choose None (General) or a specific product')}
                      </span>
                      <select
                        className="select"
                        value={formProductId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormProductId(val);
                          if (!formName.trim()) {
                            if (val === 'general') {
                              setFormName('独立开发与出海生态');
                            } else {
                              const p = data.products.find((prod) => prod.id === val);
                              if (p) setFormName(p.name);
                            }
                          }
                        }}
                      >
                        <option value="general">{t('无', 'None')}</option>
                        {(data.products || []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {shortName(p)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 3. 权重 */}
                    <div className="form-item span-2">
                      <label className="form-item-label">{t('权重', 'Weight')}</label>
                      <span className="form-item-hint">
                        {t('权重（1~5 星）决定每日抓取预算与排序优先级，5 星为极高优先深挖', 'Weight (1-5 stars) determines search budget and priority')}
                      </span>
                      <div className="weight-stars-choice-bar">
                        {[
                          { w: 1, label: t('1星 · 极低', '1 Star · Very Low') },
                          { w: 2, label: t('2星 · 低', '2 Stars · Low') },
                          { w: 3, label: t('3星 · 中', '3 Stars · Medium') },
                          { w: 4, label: t('4星 · 高', '4 Stars · High') },
                          { w: 5, label: t('5星 · 极高', '5 Stars · Highest') },
                        ].map((item) => (
                          <button
                            key={item.w}
                            type="button"
                            className={`weight-star-pill ${formWeight === item.w ? 'selected' : ''}`}
                            onClick={() => setFormWeight(item.w)}
                          >
                            <span className="star-glyphs">{'★'.repeat(item.w)}</span>
                            <span className="star-num">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 4. 平台 */}
                    <div className="form-item full-width">
                      <label className="form-item-label">{t('平台', 'Platforms')}</label>
                      <span className="form-item-hint">
                        {t('重点扫描的信息源平台，支持点击勾选或添加自定义站点', 'Target platforms to scan, click to select or add custom sites')}
                      </span>
                      <div className="platform-chips-selector">
                        {PRESET_PLATFORMS.map((p) => {
                          const isSelected = formPlatforms.includes(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              className={`platform-toggle-chip ${isSelected ? 'selected' : ''}`}
                              onClick={() => togglePlatform(p)}
                            >
                              {isSelected && <Check size={12} />}
                              <span>{p}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="custom-platform-input-bar">
                        <input
                          type="text"
                          className="input"
                          value={customPlatform}
                          onChange={(e) => setCustomPlatform(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomPlatform();
                            }
                          }}
                          placeholder={t(
                            '其他平台（如 V2EX、即刻、Twitter、Appfigures），回车添加',
                            'Other platforms (e.g. V2EX, Twitter, Appfigures), press Enter to add'
                          )}
                        />
                        <button
                          type="button"
                          className="button secondary"
                          onClick={handleAddCustomPlatform}
                        >
                          {t('添加', 'Add')}
                        </button>
                      </div>
                    </div>

                    {/* 5. 关键词 */}
                    <div className="form-item full-width">
                      <label className="form-item-label">
                        {t('关键词', 'Keywords')}
                      </label>
                      <span className="form-item-hint">
                        {t('围绕关键词在各平台进行精确与语义扩展匹配，用逗号或换行隔开', 'High-intent search terms for exact and semantic query matching')}
                      </span>
                      <input
                        type="text"
                        className="input monospace-input"
                        value={formKeywords}
                        onChange={(e) => setFormKeywords(e.target.value)}
                        placeholder={t(
                          '如：photo cleaner, privacy labels, Microsoft To Do, Todoist changelog, AI revenue',
                          'e.g., photo cleaner, privacy labels, Todoist changelog, AI revenue'
                        )}
                      />
                    </div>

                    {/* 6. 关注点 */}
                    <div className="form-item full-width">
                      <label className="form-item-label">
                        {t('关注点', 'Focus Points')}
                      </label>
                      <span className="form-item-hint">
                        {t('重点关注的问题或调研方向，每行一条', 'Set specific research questions or angles, one per line')}
                      </span>
                      <textarea
                        className="textarea"
                        rows={3}
                        value={formFocusQuestions}
                        onChange={(e) => setFormFocusQuestions(e.target.value)}
                        placeholder={t(
                          '如：\n· 竞品近期是否有重要更新或收费变动？用户反馈如何？\n· 订阅转化中哪些定价或功能设计容易引发差评？\n· 用户在社交平台与社群中高频抱怨的未解痛点？',
                          'e.g.,\n· What major updates did competitors release? How did users respond?\n· What pricing or feature triggers bad reviews?\n· What user pain points remain unaddressed?'
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* =================== CARDS LIST VIEW =================== */
            <div className="config-list-view">
              {/* TOOLBAR */}
              <div className="config-list-toolbar">
                <div className="scope-segmented-pills" role="group">
                  <button
                    type="button"
                    className={`scope-pill-btn ${scopeFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setScopeFilter('all')}
                  >
                    <span>{t('全部配置', 'All')}</span>
                    <span className="scope-badge-count">{searchConfigs.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`scope-pill-btn ${scopeFilter === 'product' ? 'active' : ''}`}
                    onClick={() => setScopeFilter('product')}
                  >
                    <Layers3 size={13} />
                    <span>{t('产品专属', 'Product Focus')}</span>
                    <span className="scope-badge-count">{productCount}</span>
                  </button>
                  <button
                    type="button"
                    className={`scope-pill-btn ${scopeFilter === 'ecosystem' ? 'active' : ''}`}
                    onClick={() => setScopeFilter('ecosystem')}
                  >
                    <Sparkles size={13} />
                    <span>{t('独立开发生态', 'Ecosystem')}</span>
                    <span className="scope-badge-count">{ecosystemCount}</span>
                  </button>
                </div>

                <div className="toolbar-right-actions">
                  <button
                    type="button"
                    className="button primary add-config-btn"
                    onClick={handleAddNew}
                  >
                    <Plus size={14} />
                    <span>{t('添加检索项', 'Add Search Config')}</span>
                  </button>
                </div>
              </div>

              {/* GRID OF CARDS */}
              {sortedConfigs.length === 0 ? (
                <div className="config-empty-box">
                  <SlidersHorizontal size={36} className="empty-glyph" />
                  <h4>{t('暂无此分类下的检索配置', 'No search configs found')}</h4>
                  <p>
                    {t(
                      '点击下方「添加检索项」创建针对产品痛点或出海生态的定向检索配置。',
                      'Click "Add Search Config" below to create targeted retrieval configs for products or ecosystem.'
                    )}
                  </p>
                  <div className="empty-box-actions">
                    <button type="button" className="button primary" onClick={handleAddNew}>
                      <Plus size={14} />
                      <span>{t('添加检索项', 'Add Search Config')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="config-cards-grid">
                  {sortedConfigs.map((cfg) => {
                    const isGeneral = !cfg.productId || cfg.productId === 'general';
                    const prod = !isGeneral ? data.products.find((p) => p.id === cfg.productId) : null;

                    return (
                      <div
                        key={cfg.id}
                        className={`framework-style-config-card ${cfg.enabled === false ? 'disabled' : ''}`}
                      >
                        {/* CARD TOP HEADER */}
                        <div className="card-top-header">
                          <div className="card-title-meta">
                            <div className="card-product-ident">
                              {isGeneral ? (
                                <Sparkles size={16} className="sparkle-glyph" />
                              ) : renderIcon ? (
                                renderIcon(prod || undefined, 16)
                              ) : (
                                <Layers3 size={16} />
                              )}
                              <span className="card-product-name">{cfg.name}</span>
                            </div>
                            <div className="card-tag-chips">
                              {isGeneral ? (
                                <span className="chip-tag chip-ecosystem">{t('无', 'None')}</span>
                              ) : (
                                <span className="chip-tag chip-product">
                                  {prod ? shortName(prod) : cfg.productId}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="card-top-controls">
                            {/* 权重直接点击星级变更，移除- +，移除权重文字 */}
                            <div
                              className="card-stars-selector"
                              title={t(`权重: ${cfg.weight || 3} 星 (点击直接切换)`, `Weight: ${cfg.weight || 3} stars (Click to change)`)}
                            >
                              {[1, 2, 3, 4, 5].map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  className={`star-click-btn ${s <= (cfg.weight || 3) ? 'active' : 'inactive'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickWeightChange(cfg.id, s);
                                  }}
                                  title={t(`设为 ${s} 星权重`, `Set to ${s} stars`)}
                                >
                                  ★
                                </button>
                              ))}
                            </div>

                            {/* Enable/Disable Toggle */}
                            <label className="switch-toggle" title={cfg.enabled === false ? t('已停用', 'Disabled') : t('已启用', 'Enabled')}>
                              <input
                                type="checkbox"
                                checked={cfg.enabled !== false}
                                onChange={(e) => handleToggleEnabled(cfg.id, e.target.checked)}
                              />
                              <span className="slider round"></span>
                            </label>

                            {/* Edit & Delete Actions */}
                            <div className="card-action-btns">
                              <button
                                type="button"
                                className="icon-action-btn"
                                onClick={() => handleEdit(cfg)}
                                title={t('编辑配置', 'Edit')}
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-action-btn delete-action-btn"
                                onClick={() => handleDeleteConfig(cfg.id, cfg.name)}
                                title={t('删除配置', 'Delete')}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* CARD BODY: 关注点、平台、关键词 */}
                        <div className="card-kv-body">
                          {/* 关注点 */}
                          <div className="kv-item-row">
                            <span className="kv-label">{t('关注点：', 'Focus: ')}</span>
                            <div className="kv-content">
                              {cfg.focusQuestions && cfg.focusQuestions.length > 0 ? (
                                <ul className="focus-bullets-list">
                                  {cfg.focusQuestions.map((q, idx) => (
                                    <li key={idx}>{q}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="empty-text">—</span>
                              )}
                            </div>
                          </div>

                          {/* 平台 */}
                          <div className="kv-item-row">
                            <span className="kv-label">{t('平台：', 'Platforms: ')}</span>
                            <div className="kv-content">
                              {cfg.platforms && cfg.platforms.length > 0 ? (
                                <div className="pills-flex-flow">
                                  {cfg.platforms.map((p, idx) => (
                                    <span key={idx} className="platform-name-pill">
                                      {p}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="empty-text">{t('公开网络', 'Public web')}</span>
                              )}
                            </div>
                          </div>

                          {/* 关键词 */}
                          <div className="kv-item-row">
                            <span className="kv-label">{t('关键词：', 'Keywords: ')}</span>
                            <div className="kv-content">
                              {cfg.keywords && cfg.keywords.length > 0 ? (
                                <div className="pills-flex-flow keywords-monospace-flow">
                                  {cfg.keywords.map((kw, idx) => (
                                    <span key={idx} className="keyword-monospace-pill">
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="empty-text">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="config-dialog-footer">
          {editingConfig ? (
            <>
              <div className="footer-tip-box">
                <HelpCircle size={14} className="tip-icon" />
                <span>
                  {t(
                    '保存后外部 Agent 每日检索时将依据此配置与星级权重分配检索深度与预算。',
                    'Saved configuration guides external agents in allocating retrieval budget and depth.'
                  )}
                </span>
              </div>
              <div className="footer-action-buttons">
                <button type="button" className="button secondary" onClick={handleCancelEdit}>
                  {t('取消', 'Cancel')}
                </button>
                <button type="button" className="button primary" onClick={handleSaveForm}>
                  <Check size={14} />
                  <span>{t('保存检索配置', 'Save Configuration')}</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="footer-tip-box">
                <HelpCircle size={14} className="tip-icon" />
                <span>
                  {t(
                    '此处的配置将作为外部 Agent 每日检索时的核心依据，替代原有的只读检索框架。',
                    'These search configurations directly drive external agents daily retrieval, replacing the old read-only frameworks.'
                  )}
                </span>
              </div>
              <button type="button" className="button primary" onClick={onClose}>
                {t('完成', 'Done')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
