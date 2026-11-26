import React, { useState, useEffect } from 'react';
import type { Product } from './types';
import { useI18n } from './i18n.ts';
import {
  Split,
  Plus,
  RefreshCw,
  Copy,
  Sparkles,
  X,
  Trash2,
  Edit2,
  Check,
  Globe,
  Play,
  Square,
  Layout,
  Image as ImageIcon,
  BarChart2,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Upload,
  ExternalLink,
  HelpCircle,
  MoreHorizontal,
  Maximize2,
  ArrowLeft,
  Share2,
  Star,
  Search,
  Newspaper,
  Gamepad2,
  Layers,
  Joystick,
} from 'lucide-react';
import { buildPageOptimizationAgentPrompt } from './page-optimization-agent-prompt.ts';
import { storeState } from './product-app-store';
import { APP_STORE_LOCALES } from './release-publication';

export type TreatmentScreenshot = {
  id: string;
  url: string;
  name?: string;
  width?: number;
  height?: number;
};

export type OptimizationTreatment = {
  id: string;
  name: string;
  appIconName?: string;
  appIconUrl?: string;
  promotedDate?: string;
  screenshots?: TreatmentScreenshot[];
  localizations: Array<{
    id: string;
    locale: string;
  }>;
};

export type PageOptimizationExperiment = {
  id: string;
  name: string;
  trafficProportion: number;
  state: string;
  reviewRequired?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  platform?: string;
  treatments: OptimizationTreatment[];
};

function PpoVideoPlayer({
  videoUrl,
  posterUrl,
  autoPlay = true,
}: {
  videoUrl: string;
  posterUrl?: string;
  autoPlay?: boolean;
}) {
  const { t } = useI18n();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl;
      if (autoPlay) {
        video.play().catch(() => {});
      }
      return;
    }

    let hlsInstance: any = null;
    let disposed = false;

    import('hls.js')
      .then(({ default: Hls }) => {
        if (disposed || !video) return;
        if (Hls.isSupported()) {
          hlsInstance = new Hls({ enableWorker: false });
          hlsInstance.loadSource(videoUrl);
          hlsInstance.attachMedia(video);
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (autoPlay) {
              video.play().catch(() => {});
            }
          });
          hlsInstance.on(Hls.Events.ERROR, (_: any, data: any) => {
            if (data.fatal) {
              setError(true);
            }
          });
        } else {
          setError(true);
        }
      })
      .catch(() => {
        setError(true);
      });

    return () => {
      disposed = true;
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [videoUrl, autoPlay]);

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#f87171', background: '#0f172a', borderRadius: 8 }}>
        <p style={{ margin: 0, fontSize: 13 }}>{t('当前浏览器未能直接播放该流媒体视频，建议在 Safari 中播放或直接在 App Store 查看。', 'Playback unsupported in current browser. Please view in Safari or App Store.')}</p>
        {posterUrl && <img src={posterUrl} alt="Poster" style={{ maxWidth: '100%', maxHeight: 320, marginTop: 12, borderRadius: 6 }} />}
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      poster={posterUrl}
      controls
      playsInline
      style={{
        maxWidth: '100%',
        maxHeight: '76vh',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        background: '#000000',
      }}
    />
  );
}

function AppStorePhonePreview({
  appName,
  subtitle,
  iconUrl,
  headerImage,
  searchImage,
  screenshots,
  device,
  viewMode,
  onOpenPreview,
}: {
  appName: string;
  subtitle?: string;
  iconUrl?: string;
  headerImage?: string;
  searchImage?: string;
  screenshots: any[];
  device: 'iphone-island' | 'iphone-duo' | 'ipad-13';
  viewMode: 'detail' | 'search';
  onOpenPreview?: (item: any) => void;
}) {
  const { t } = useI18n();
  const isTablet = device === 'ipad-13';

  return (
    <div
      className={`aso-preview-phone ${isTablet ? 'aso-preview-tablet' : ''} ${viewMode === 'search' ? 'aso-preview-search' : 'aso-preview-detail'}`}
      style={{
        width: '100%',
        maxWidth: isTablet ? 380 : 280,
        margin: '0 auto',
        border: '7px solid #1e293b',
        borderRadius: isTablet ? 24 : 40,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      {!isTablet && <span className="aso-phone-island" />}

      <div className="aso-phone-scroll" style={{ maxHeight: isTablet ? 420 : 500, overflowY: 'auto' }}>
        {viewMode === 'search' ? (
          <>
            <div className="aso-phone-search-controls" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="aso-phone-searchbar" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: '#f1f5f9', padding: '4px 8px', borderRadius: 8, fontSize: 11, color: '#64748b' }}>
                <Search size={12} />
                <span>{appName}</span>
              </div>
              <X size={14} style={{ color: '#94a3b8' }} />
            </div>

            <div className="aso-phone-identity">
              {iconUrl ? <img src={iconUrl} alt="App Icon" /> : <span className="aso-phone-icon" />}
              <div>
                <strong>{appName}</strong>
                {subtitle && <small>{subtitle}</small>}
              </div>
              <span className="aso-phone-get">{t('获取', 'GET')}</span>
            </div>

            <div className="aso-phone-search-media" style={{ padding: '4px 10px 10px 10px' }}>
              {searchImage ? (
                <img
                  src={searchImage}
                  alt="Search Artwork"
                  style={{ width: '100%', borderRadius: 8, cursor: 'pointer', border: '1px solid #e2e8f0' }}
                  onClick={() => onOpenPreview?.({ url: searchImage, name: '搜索结果展示图' })}
                />
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  {screenshots.slice(0, 3).map((s, idx) => (
                    <img
                      key={idx}
                      src={s.url}
                      alt={`Search ${idx + 1}`}
                      style={{ width: '31%', borderRadius: 6, objectFit: 'cover', cursor: 'pointer' }}
                      onClick={() => onOpenPreview?.(s)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className={`aso-phone-hero ${headerImage ? '' : 'aso-phone-hero-empty'}`} style={{ position: 'relative' }}>
              {headerImage && (
                <>
                  <img className="aso-phone-hero-backdrop" src={headerImage} alt="" />
                  <img className="aso-phone-hero-artwork" src={headerImage} alt="Header Artwork" />
                </>
              )}
              <span style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}>
                <ArrowLeft size={15} style={{ color: headerImage ? '#ffffff' : '#334155' }} />
                <Share2 size={15} style={{ color: headerImage ? '#ffffff' : '#334155' }} />
              </span>
            </div>

            <div className="aso-phone-identity">
              {iconUrl ? <img src={iconUrl} alt="App Icon" /> : <span className="aso-phone-icon" />}
              <div>
                <strong>{appName}</strong>
                {subtitle && <small>{subtitle}</small>}
              </div>
              <span className="aso-phone-get">{t('获取', 'GET')}</span>
            </div>

            <div className="aso-phone-meta">
              <span>{t('评分', 'Ratings')}<strong>–</strong><Star size={11} fill="currentColor" /></span>
              <span>{t('年龄分级', 'Age rating')}<strong>–</strong></span>
              <span>{t('语言', 'Language')}<strong>ZH</strong></span>
            </div>

            <div className="aso-phone-gallery" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 12px' }}>
              {screenshots.map((s, idx) => (
                <div
                  key={s.id || idx}
                  style={{
                    position: 'relative',
                    flex: '0 0 65%',
                    aspectRatio: isTablet ? '3 / 4' : '9 / 19.5',
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer',
                  }}
                  onClick={() => onOpenPreview?.(s)}
                >
                  <img src={s.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {s.isVideo && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                      <Play size={13} fill="#fff" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="aso-phone-navbar" aria-hidden="true">
        <span><Newspaper size={13} />Today</span>
        <span><Gamepad2 size={13} />{t('游戏', 'Games')}</span>
        <span className={viewMode === 'detail' ? 'active' : ''}><Layers size={13} />App</span>
        <span><Joystick size={13} />Arcade</span>
        <span className={viewMode === 'search' ? 'active' : ''}><Search size={13} />{t('搜索', 'Search')}</span>
      </div>
    </div>
  );
}

export function ProductPageOptimization({
  product,
  notify,
}: {
  product: Product;
  notify?: (msg: string) => void;
}) {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [experiments, setExperiments] = useState<PageOptimizationExperiment[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [serverLocales, setServerLocales] = useState<string[]>([]);

  // Modals
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<PageOptimizationExperiment | null>(null);
  const [showTreatmentModal, setShowTreatmentModal] = useState<PageOptimizationExperiment | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formTraffic, setFormTraffic] = useState(50);
  const [formPlatform, setFormPlatform] = useState('IOS');
  const [formTreatmentName, setFormTreatmentName] = useState('Treatment A');
  const [formIconName, setFormIconName] = useState('');

  // 页面设计与分析数据视图状态
  const [activeViewMap, setActiveViewMap] = useState<Record<string, 'treatments' | 'design' | 'analytics'>>({});
  const [selectedTreatmentIndexMap, setSelectedTreatmentIndexMap] = useState<Record<string, number>>({});
  const [designDataMap, setDesignDataMap] = useState<Record<string, any>>({});
  const [analyticsDataMap, setAnalyticsDataMap] = useState<Record<string, any>>({});
  const [loadingDesign, setLoadingDesign] = useState<Record<string, boolean>>({});
  const [loadingAnalytics, setLoadingAnalytics] = useState<Record<string, boolean>>({});
  const [hoverChartIndex, setHoverChartIndex] = useState<number | null>(null);

  // 选中的设备类型 Tab (带灵动岛的 iPhone / iPhone Duo / iPad 13 英寸)
  const [selectedDeviceTab, setSelectedDeviceTab] = useState<'iphone-island' | 'iphone-duo' | 'ipad-13'>('iphone-island');

  // 手机预览模式 (详情页 detail vs 搜索结果 search)
  const [phonePreviewModeMap, setPhonePreviewModeMap] = useState<Record<string, 'detail' | 'search'>>({});

  // 图表悬停坐标
  const [hoverChartPos, setHoverChartPos] = useState<{ x: number; y: number } | null>(null);

  // 高清大图预览画廊弹窗
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    title: string;
    screenshots: any[];
    currentIndex: number;
  }>({
    isOpen: false,
    title: '',
    screenshots: [],
    currentIndex: 0,
  });

  useEffect(() => {
    if (!previewModal.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewModal(prev => ({ ...prev, isOpen: false }));
      } else if (e.key === 'ArrowLeft') {
        setPreviewModal(prev => ({
          ...prev,
          currentIndex: (prev.currentIndex - 1 + prev.screenshots.length) % prev.screenshots.length,
        }));
      } else if (e.key === 'ArrowRight') {
        setPreviewModal(prev => ({
          ...prev,
          currentIndex: (prev.currentIndex + 1) % prev.screenshots.length,
        }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewModal.isOpen, previewModal.screenshots.length]);

  // Actual product configured languages
  const configuredProductLocales = Array.from(new Set(
    (product.appStore?.versions || []).flatMap(v => (v.notes || []).map(n => n.locale)).filter(Boolean)
  ));

  const allActualLocales = Array.from(new Set([
    ...configuredProductLocales,
    ...serverLocales,
    ...Object.keys(APP_STORE_LOCALES),
  ]));

  const initialLocales = configuredProductLocales.length > 0
    ? configuredProductLocales
    : ['zh-Hans', 'en-US'];
  const [selectedLocales, setSelectedLocales] = useState<string[]>(initialLocales);

  const toggleLocale = (code: string) => {
    setSelectedLocales(prev =>
      prev.includes(code)
        ? (prev.length > 1 ? prev.filter(c => c !== code) : prev)
        : [...prev, code]
    );
  };

  const fetchExperiments = async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/page-optimization/${encodeURIComponent(product.id)}/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取产品页面优化实验列表失败');
      setExperiments(data.experiments || []);
      setIsConfigured(!!data.configured);
      setSyncedAt(data.syncedAt || null);
      if (Array.isArray(data.locales) && data.locales.length > 0) {
        setServerLocales(data.locales);
      }
    } catch (err: any) {
      notify?.(err.message || '获取产品页面优化实验列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExperiments(false);
  }, [product.id]);

  const handleCreateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      notify?.(t('请填写实验名称', 'Please provide an experiment name'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/page-optimization/${encodeURIComponent(product.id)}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          trafficProportion: formTraffic,
          platform: formPlatform,
          treatments: [
            {
              name: formTreatmentName.trim() || 'Treatment A',
              appIconName: formIconName.trim() || undefined,
              locales: selectedLocales.length > 0 ? selectedLocales : ['zh-Hans'],
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建优化实验失败');
      setExperiments(data.experiments || []);
      setShowCreateModal(false);
      setFormName('');
      setFormTraffic(50);
      setFormIconName('');
      notify?.(t('产品页面优化实验已创建', 'PPO Experiment created'));
    } catch (err: any) {
      notify?.(err.message || '创建优化实验失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/page-optimization/${encodeURIComponent(product.id)}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experimentId: showEditModal.id,
          name: formName.trim() || undefined,
          trafficProportion: formTraffic,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新优化实验失败');
      setExperiments(data.experiments || []);
      setShowEditModal(null);
      notify?.(t('实验配置已更新', 'Experiment updated'));
    } catch (err: any) {
      notify?.(err.message || '更新优化实验失败');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExperiment = async (exp: PageOptimizationExperiment) => {
    const isRunning = exp.state === 'APPROVED' || exp.state === 'IN_REVIEW' || !!exp.startDate;
    const nextStarted = !isRunning;
    const confirmMsg = nextStarted
      ? t('确定要启动此 A/B 测试实验吗？流量将按设定比例分配给测试变体。', 'Start this A/B experiment? Traffic will be split to treatments according to the set proportion.')
      : t('确定要停止此 A/B 测试实验吗？停止后所有用户将看到原始默认页面。', 'Stop this A/B experiment? All users will see the default original page once stopped.');
    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/page-optimization/${encodeURIComponent(product.id)}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experimentId: exp.id,
          started: nextStarted,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '切换实验状态失败');
      setExperiments(data.experiments || []);
      notify?.(nextStarted ? t('实验已启动', 'Experiment started') : t('实验已停止', 'Experiment stopped'));
    } catch (err: any) {
      notify?.(err.message || '切换实验状态失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExperiment = async (experimentId: string) => {
    if (!confirm(t('确定要删除此产品页面优化实验吗？此操作不可恢复。', 'Are you sure you want to delete this experiment? This action cannot be undone.'))) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/page-optimization/${encodeURIComponent(product.id)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experimentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除优化实验失败');
      setExperiments(data.experiments || []);
      notify?.(t('优化实验已删除', 'Experiment deleted'));
    } catch (err: any) {
      notify?.(err.message || '删除优化实验失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showTreatmentModal) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/page-optimization/${encodeURIComponent(product.id)}/add-treatment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experimentId: showTreatmentModal.id,
          name: formTreatmentName.trim() || 'New Treatment',
          appIconName: formIconName.trim() || undefined,
          locales: selectedLocales.length > 0 ? selectedLocales : ['zh-Hans'],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加变体方案失败');
      setExperiments(data.experiments || []);
      setShowTreatmentModal(null);
      setFormTreatmentName('');
      setFormIconName('');
      notify?.(t('测试变体方案已添加', 'Treatment added'));
    } catch (err: any) {
      notify?.(err.message || '添加变体方案失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTreatment = async (treatmentId: string) => {
    if (!confirm(t('确定要删除此测试变体吗？', 'Are you sure you want to delete this treatment?'))) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/page-optimization/${encodeURIComponent(product.id)}/delete-treatment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ treatmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除变体失败');
      setExperiments(data.experiments || []);
      notify?.(t('变体方案已删除', 'Treatment deleted'));
    } catch (err: any) {
      notify?.(err.message || '删除变体失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取页面设计对比数据 (参考 ASO 图片)
  const fetchDesign = async (expId: string) => {
    setLoadingDesign(prev => ({ ...prev, [expId]: true }));
    try {
      const res = await fetch(`/api/app-store-connect/page-optimization/${encodeURIComponent(product.id)}/design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experimentId: expId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取设计数据失败');
      setDesignDataMap(prev => ({ ...prev, [expId]: data }));
    } catch (err: any) {
      notify?.(err.message || '获取页面设计数据失败');
    } finally {
      setLoadingDesign(prev => ({ ...prev, [expId]: false }));
    }
  };

  // 获取分析数据 (参考数据分析模块)
  const fetchAnalytics = async (expId: string) => {
    setLoadingAnalytics(prev => ({ ...prev, [expId]: true }));
    try {
      const res = await fetch(`/api/app-store-connect/page-optimization/${encodeURIComponent(product.id)}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experimentId: expId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取分析数据失败');
      setAnalyticsDataMap(prev => ({ ...prev, [expId]: data }));
    } catch (err: any) {
      notify?.(err.message || '获取分析数据失败');
    } finally {
      setLoadingAnalytics(prev => ({ ...prev, [expId]: false }));
    }
  };

  const handleTabChange = (expId: string, tab: 'treatments' | 'design' | 'analytics') => {
    setActiveViewMap(prev => ({ ...prev, [expId]: tab }));
    if (tab === 'design' && !designDataMap[expId]) {
      fetchDesign(expId);
    } else if (tab === 'analytics' && !analyticsDataMap[expId]) {
      fetchAnalytics(expId);
    }
  };

  // 更新变体截屏
  const handleUpdateTreatmentScreenshots = async (expId: string, treatmentId: string, nextShots: any[]) => {
    try {
      const res = await fetch(`/api/app-store-connect/page-optimization/${encodeURIComponent(product.id)}/treatment-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experimentId: expId, treatmentId, screenshots: nextShots }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新截屏素材失败');
      setDesignDataMap(prev => ({ ...prev, [expId]: data }));
      notify?.(t('变体截屏素材已更新', 'Variant screenshots updated'));
    } catch (err: any) {
      notify?.(err.message || '更新截屏素材失败');
    }
  };

  // 上传图片并加入变体截屏
  const handleUploadScreenshot = (expId: string, treatmentId: string, currentShots: any[], file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const newShot = {
        id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url: dataUrl,
        name: file.name || `截屏 ${currentShots.length + 1}`,
        width: 1242,
        height: 2688,
      };
      handleUpdateTreatmentScreenshots(expId, treatmentId, [...currentShots, newShot]);
    };
    reader.readAsDataURL(file);
  };

  // 从对照组快速复制截屏
  const handleCopyControlScreenshots = (expId: string, treatmentId: string, controlShots: any[], trName: string) => {
    const cloned = (controlShots || []).map((s, idx) => ({
      ...s,
      id: `${treatmentId}-copy-${idx + 1}-${Date.now()}`,
      name: idx === 0 ? `变体 ${trName} · 首图` : s.name,
    }));
    handleUpdateTreatmentScreenshots(expId, treatmentId, cloned);
  };

  const agentPrompt = buildPageOptimizationAgentPrompt(product, lang);

  return (
    <div className="page-optimization-workspace">
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
            <span>{t('Agent 实验设计指南', 'Agent Design Guide & Prompt')}</span>
          </button>

          <button
            type="button"
            className="button secondary"
            disabled={loading}
            onClick={() => fetchExperiments(true)}
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
              setFormTraffic(50);
              setFormPlatform('IOS');
              setFormTreatmentName('Treatment A');
              setFormIconName('');
              setSelectedLocales(configuredProductLocales.length > 0 ? configuredProductLocales : ['zh-Hans', 'en-US']);
              setShowCreateModal(true);
            }}
          >
            <Plus size={16} />
            <span>{t('新建 A/B 实验', 'New Experiment')}</span>
          </button>
        </div>
      </div>

      {/* 列表区域 */}
      {experiments.length === 0 ? (
        <div className="panel padded text-center" style={{ padding: '60px 20px', textAlign: 'center', background: 'var(--panel-bg, #ffffff)', borderRadius: 12, border: '1px dashed var(--border, #e2e8f0)' }}>
          <div style={{ display: 'inline-flex', padding: 16, background: '#f5f3ff', borderRadius: '50%', color: '#7c3aed', marginBottom: 16 }}>
            <Split size={36} />
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>{t('暂无产品页面优化实验', 'No Optimization Experiments Yet')}</h3>
          <p style={{ margin: '0 0 20px 0', color: 'var(--muted, #64748b)', fontSize: 13, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
            {t(
              '你可以同时创建最多 3 个测试变体（Treatments）与原始默认页面对照测试。建议遵循单变量测试原则，单独测试应用图标或首屏截屏，运行 7~14 天以获得统计显著结论。',
              'You can create up to 3 test treatments against the original control. Isolate single variables (icon or hero screenshot) and run for 7-14 days for statistical significance.'
            )}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setFormName('');
                setFormTraffic(50);
                setFormPlatform('IOS');
                setFormTreatmentName('Treatment A');
                setFormIconName('');
                setSelectedLocales(configuredProductLocales.length > 0 ? configuredProductLocales : ['zh-Hans', 'en-US']);
                setShowCreateModal(true);
              }}
            >
              <Plus size={15} />
              <span>{t('创建首个优化实验', 'Create First Experiment')}</span>
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setShowAgentModal(true)}
            >
              <Sparkles size={15} />
              <span>{t('查看 Agent 假设设计指南', 'View Agent Guide')}</span>
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {experiments.map(exp => {
            const isStopped = exp.state === 'STOPPED' || exp.state === 'COMPLETED' || (exp.endDate && new Date(exp.endDate).getTime() <= Date.now());
            const isRunning = !isStopped && (exp.state === 'APPROVED' || exp.state === 'IN_REVIEW' || (!!exp.startDate && (!exp.endDate || new Date(exp.endDate).getTime() > Date.now())));
            const controlTraffic = 100 - exp.trafficProportion;
            const treatmentShare = exp.treatments.length > 0
              ? (exp.trafficProportion / exp.treatments.length).toFixed(1)
              : exp.trafficProportion;

            const formatRange = () => {
              if (!exp.startDate) return '';
              const start = new Date(exp.startDate).toLocaleDateString();
              if (exp.endDate) {
                return `${start} - ${new Date(exp.endDate).toLocaleDateString()}`;
              }
              return `${t('开始于：', 'Started: ')}${start}`;
            };

            return (
              <div
                key={exp.id}
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
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{exp.name}</h3>
                      <span className={`status-pill ${isRunning ? 'green' : isStopped ? 'gray' : exp.state === 'PREPARE_FOR_SUBMISSION' ? 'amber' : 'gray'}`}>
                        {isRunning ? t('进行中', 'Running') : isStopped ? t('已结束', 'Ended') : storeState(exp.state, t)}
                      </span>
                      <span className="badge" style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 6 }}>
                        {exp.platform || 'iOS'}
                      </span>
                      {exp.startDate && (
                        <span style={{ fontSize: 12, color: 'var(--muted, #64748b)' }}>
                          {formatRange()}
                        </span>
                      )}
                    </div>

                    {/* 流量分配比例可视化条 */}
                    <div style={{ marginTop: 12, maxWidth: 520 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: '#475569' }}>
                        <span>
                          <b>{t('原始页面 (对照组)：', 'Original Control: ')}</b>
                          {controlTraffic}% {t('流量', 'traffic')}
                        </span>
                        <span>
                          <b>{t('测试变体组：', 'Test Treatments: ')}</b>
                          {exp.trafficProportion}% {t('流量', 'traffic')}
                        </span>
                      </div>
                      <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${controlTraffic}%`, background: '#94a3b8', transition: 'width 0.3s' }} title={`Original: ${controlTraffic}%`} />
                        <div style={{ width: `${exp.trafficProportion}%`, background: '#7c3aed', transition: 'width 0.3s' }} title={`Treatments: ${exp.trafficProportion}%`} />
                      </div>
                    </div>
                  </div>

                  {/* 右侧操作按钮 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {!isStopped && (
                      <button
                        type="button"
                        className={`button small ${isRunning ? 'secondary' : 'primary'}`}
                        onClick={() => handleToggleExperiment(exp)}
                        title={isRunning ? t('停止实验', 'Stop Experiment') : t('启动实验', 'Start Experiment')}
                      >
                        {isRunning ? <Square size={13} /> : <Play size={13} />}
                        <span>{isRunning ? t('停止实验', 'Stop') : t('启动实验', 'Start')}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="button secondary small"
                      disabled={exp.treatments.length >= 3}
                      onClick={() => {
                        setShowTreatmentModal(exp);
                        setFormTreatmentName(`Treatment ${String.fromCharCode(65 + exp.treatments.length)}`);
                        setFormIconName('');
                        setSelectedLocales(configuredProductLocales.length > 0 ? configuredProductLocales : ['zh-Hans', 'en-US']);
                      }}
                      title={exp.treatments.length >= 3 ? t('最多添加 3 个测试变体', 'Up to 3 treatments allowed') : t('添加变体', 'Add Treatment')}
                    >
                      <Plus size={13} />
                      <span>{t('添加变体', 'Add Treatment')}</span>
                    </button>

                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => {
                        setShowEditModal(exp);
                        setFormName(exp.name);
                        setFormTraffic(exp.trafficProportion);
                      }}
                    >
                      <Edit2 size={13} />
                      <span>{t('编辑', 'Edit')}</span>
                    </button>

                    <button
                      type="button"
                      className="button secondary small"
                      style={{ color: '#ef4444' }}
                      onClick={() => handleDeleteExperiment(exp.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* 子视图切换 Tab: 变体配置 / 页面设计对比 / 数据分析看板 */}
                <div className="ppo-card-tabs" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className={`ppo-tab-button ${(activeViewMap[exp.id] || 'treatments') === 'treatments' ? 'active' : ''}`}
                    onClick={() => handleTabChange(exp.id, 'treatments')}
                  >
                    <Layout size={14} />
                    <span>{t('变体方案配置', 'Treatments')}</span>
                  </button>
                  <button
                    type="button"
                    className={`ppo-tab-button ${(activeViewMap[exp.id] || 'treatments') === 'design' ? 'active' : ''}`}
                    onClick={() => handleTabChange(exp.id, 'design')}
                  >
                    <ImageIcon size={14} />
                    <span>{t('页面设计对比', 'Design Preview')}</span>
                  </button>
                  <button
                    type="button"
                    className={`ppo-tab-button ${(activeViewMap[exp.id] || 'treatments') === 'analytics' ? 'active' : ''}`}
                    onClick={() => handleTabChange(exp.id, 'analytics')}
                  >
                    <BarChart2 size={14} />
                    <span>{t('数据分析看板', 'Analytics & Trends')}</span>
                  </button>
                </div>

                {/* 视图 1：方案配置与变体列表 */}
                {(activeViewMap[exp.id] || 'treatments') === 'treatments' && (
                  <div style={{ marginTop: 12 }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 600, color: '#475569' }}>
                      {t('对比方案组', 'Treatments & Control Groups')} ({exp.treatments.length + 1} {t('组对比', 'variants')})
                    </h4>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                      {/* 对照组卡片 */}
                      <div
                        style={{
                          background: '#f8fafc',
                          borderRadius: 8,
                          padding: 14,
                          border: '1px solid #e2e8f0',
                          position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>
                            {t('原始页面 (Original Baseline)', 'Original Baseline')}
                          </span>
                          <span className="badge" style={{ fontSize: 11, background: '#e2e8f0', color: '#475569', borderRadius: 4, padding: '2px 6px' }}>
                            {controlTraffic}%
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748b' }}>
                          {t('使用当前正式上架或已发布的默认图标、截屏和预览视频。', 'Uses the live default app icon, screenshots, and previews as benchmark control.')}
                        </p>
                      </div>

                      {/* 测试变体卡片 */}
                      {exp.treatments.map((tr) => (
                        <div
                          key={tr.id}
                          style={{
                            background: '#ffffff',
                            borderRadius: 8,
                            padding: 14,
                            border: '1px solid #ddd6fe',
                            position: 'relative',
                            boxShadow: '0 1px 2px rgba(124, 58, 237, 0.05)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: '#6d28d9' }}>
                              {tr.name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="badge" style={{ fontSize: 11, background: '#ede9fe', color: '#7c3aed', borderRadius: 4, padding: '2px 6px' }}>
                                ~{treatmentShare}%
                              </span>
                              <button
                                type="button"
                                className="text-button"
                                style={{ color: '#ef4444', padding: 2 }}
                                onClick={() => handleDeleteTreatment(tr.id)}
                                title={t('删除此变体', 'Delete treatment')}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>

                          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                            {tr.appIconName ? (
                              <div style={{ marginBottom: 4 }}>
                                <span style={{ color: '#64748b' }}>{t('测试图标：', 'Test Icon: ')}</span>
                                <code>{tr.appIconName}</code>
                              </div>
                            ) : (
                              <div style={{ marginBottom: 4, color: '#64748b' }}>
                                {t('测试变量：截屏文案与视觉素材差异', 'Test Variable: Screenshots & visual creative')}
                              </div>
                            )}

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                              {tr.localizations.map(loc => (
                                <span key={loc.id} style={{ fontSize: 11, padding: '2px 6px', background: '#f1f5f9', borderRadius: 4 }}>
                                  <Globe size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                                  {APP_STORE_LOCALES[loc.locale] || loc.locale} ({loc.locale})
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 视图 2：页面设计对比（复用 ASO 图片模块设计，复刻截图 4） */}
                {(activeViewMap[exp.id] || 'treatments') === 'design' && (() => {
                  const designData = designDataMap[exp.id];
                  const isLoading = loadingDesign[exp.id];
                  const currentTreatmentIdx = selectedTreatmentIndexMap[exp.id] || 0;
                  const currentTr = designData?.treatments?.[currentTreatmentIdx] || exp.treatments[0];
                  const controlDesign = designData?.control || {
                    iconUrl: product.icon || '',
                    appName: product.name,
                    subtitle: product.englishName || product.summary?.slice(0, 30) || '',
                    screenshots: [],
                    ipadScreenshots: [],
                    previews: [],
                  };

                  const openPreview = (title: string, items: any[], startIndex = 0) => {
                    if (!items || items.length === 0) return;
                    setPreviewModal({
                      isOpen: true,
                      title,
                      screenshots: items,
                      currentIndex: startIndex,
                    });
                  };

                  const isIpad = selectedDeviceTab === 'ipad-13';

                  const activeTrScreenshots = isIpad
                    ? ((currentTr?.ipadScreenshots && currentTr.ipadScreenshots.length > 0) ? currentTr.ipadScreenshots : currentTr?.screenshots || [])
                    : (currentTr?.screenshots || []);

                  const activeControlScreenshots = isIpad
                    ? ((controlDesign.ipadScreenshots && controlDesign.ipadScreenshots.length > 0) ? controlDesign.ipadScreenshots : controlDesign.screenshots || [])
                    : (controlDesign.screenshots || []);

                  const trAllMedia = [...(currentTr?.previews || []), ...(activeTrScreenshots || [])];
                  const controlAllMedia = [...(controlDesign.previews || []), ...(activeControlScreenshots || [])];

                  const trHeaderImage = currentTr?.headerImage || designData?.headerImage || controlDesign.headerImage;
                  const trSearchImage = currentTr?.searchImage || designData?.searchImage || controlDesign.searchImage;
                  const controlHeaderImage = controlDesign.headerImage || designData?.headerImage;
                  const controlSearchImage = controlDesign.searchImage || designData?.searchImage;

                  const trPhoneMode = phonePreviewModeMap[`tr-${exp.id}`] || 'detail';
                  const controlPhoneMode = phonePreviewModeMap[`ctl-${exp.id}`] || 'detail';

                  return (
                    <div style={{ marginTop: 16 }}>
                      {isLoading ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                          <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 8px auto', display: 'block', color: '#0071e3' }} />
                          <span>{t('正在载入页面视觉设计对比...', 'Loading visual comparison...')}</span>
                        </div>
                      ) : (
                        <>
                          {/* 1. 变体方案卡片 (暗色背景) */}
                          <div className="ppo-asc-card">
                            <div className="ppo-asc-card-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                                  {currentTr?.name || t('测试变体方案', 'Test Treatment')}
                                </h3>
                                {exp.treatments.length > 1 && (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    {exp.treatments.map((tr, idx) => (
                                      <button
                                        key={tr.id}
                                        type="button"
                                        className={`button small ${currentTreatmentIdx === idx ? 'primary' : 'secondary'}`}
                                        style={{ padding: '2px 8px', fontSize: 11.5 }}
                                        onClick={() => setSelectedTreatmentIndexMap(prev => ({ ...prev, [exp.id]: idx }))}
                                      >
                                        {tr.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <span
                                style={{ fontSize: 13, color: '#0071e3', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                onClick={() => notify?.(t('可在 App Store Connect 网页版“媒体管理”中管理各分辨率尺寸', 'Manage all resolutions in App Store Connect Media Manager'))}
                              >
                                {t('在“媒体管理”中查看所有尺寸', 'View all sizes in Media Manager')}
                                <ExternalLink size={12} />
                              </span>
                            </div>

                            {/* 设备切换 Tab 栏 (切换时同步更新尺寸比例) */}
                            <div className="ppo-device-bar">
                              <div className="ppo-device-tabs">
                                <button
                                  type="button"
                                  className={`ppo-device-tab ${selectedDeviceTab === 'iphone-island' ? 'active' : ''}`}
                                  onClick={() => setSelectedDeviceTab('iphone-island')}
                                >
                                  <Smartphone size={14} />
                                  <span>{t('带灵动岛的 iPhone (中等显示屏)', 'iPhone with Dynamic Island')}</span>
                                </button>
                                <button
                                  type="button"
                                  className={`ppo-device-tab ${selectedDeviceTab === 'iphone-duo' ? 'active' : ''}`}
                                  onClick={() => setSelectedDeviceTab('iphone-duo')}
                                >
                                  <Smartphone size={14} />
                                  <span>{t('iPhone Duo', 'iPhone Duo')}</span>
                                </button>
                                <button
                                  type="button"
                                  className={`ppo-device-tab ${selectedDeviceTab === 'ipad-13' ? 'active' : ''}`}
                                  onClick={() => setSelectedDeviceTab('ipad-13')}
                                >
                                  <Layout size={14} />
                                  <span>{t('iPad 13 英寸显示屏', 'iPad 13" Display')}</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                className="button secondary small"
                                style={{ gap: 4, padding: '4px 10px', fontSize: 12 }}
                                onClick={() => openPreview(currentTr?.name || '变体方案素材', trAllMedia, 0)}
                              >
                                <Maximize2 size={13} />
                                <span>{t('预览', 'Preview')}</span>
                              </button>
                            </div>

                            {/* 左右分栏：左侧真机模型预览 (复用 ASO 图片)，右侧素材瀑布流 */}
                            <div className="ppo-design-layout">
                              {/* 左侧：真机预览外壳 */}
                              <div className="ppo-phone-preview-col">
                                <div className="ppo-preview-mode-switch">
                                  <button
                                    type="button"
                                    className={`ppo-preview-mode-btn ${trPhoneMode === 'detail' ? 'active' : ''}`}
                                    onClick={() => setPhonePreviewModeMap(prev => ({ ...prev, [`tr-${exp.id}`]: 'detail' }))}
                                  >
                                    {t('详情页预览', 'Product Page')}
                                  </button>
                                  <button
                                    type="button"
                                    className={`ppo-preview-mode-btn ${trPhoneMode === 'search' ? 'active' : ''}`}
                                    onClick={() => setPhonePreviewModeMap(prev => ({ ...prev, [`tr-${exp.id}`]: 'search' }))}
                                  >
                                    {t('搜索结果预览', 'Search Result')}
                                  </button>
                                </div>

                                <AppStorePhonePreview
                                  appName={product.name}
                                  subtitle={product.englishName || product.summary?.slice(0, 30)}
                                  iconUrl={currentTr?.appIconUrl || product.icon}
                                  headerImage={trHeaderImage}
                                  searchImage={trSearchImage}
                                  screenshots={trAllMedia}
                                  device={selectedDeviceTab}
                                  viewMode={trPhoneMode}
                                  onOpenPreview={(item) => openPreview(item.name || '素材预览', trAllMedia, trAllMedia.indexOf(item))}
                                />
                              </div>

                              {/* 右侧：展示位专属素材 + 截屏横向画廊 */}
                              <div className="ppo-media-waterfall-col">
                                {/* 专属展示位素材：标题图与搜索结果图 */}
                                {(trHeaderImage || trSearchImage) && (
                                  <div className="ppo-artworks-row">
                                    {trHeaderImage && (
                                      <div className="ppo-artwork-card">
                                        <div className="card-title-row">
                                          <span>{t('标题图片 (Header Artwork)', 'Header Artwork')}</span>
                                          <span className="badge" style={{ fontSize: 10, background: '#ede9fe', color: '#6d28d9' }}>{t('详情页顶部', 'Hero')}</span>
                                        </div>
                                        <img
                                          src={trHeaderImage}
                                          alt="Header Artwork"
                                          onClick={() => openPreview('标题图 (Header Artwork)', [{ url: trHeaderImage, name: '标题图片 (Header Artwork)' }], 0)}
                                        />
                                      </div>
                                    )}

                                    {trSearchImage && (
                                      <div className="ppo-artwork-card">
                                        <div className="card-title-row">
                                          <span>{t('搜索结果图片 (Search Artwork)', 'Search Artwork')}</span>
                                          <span className="badge" style={{ fontSize: 10, background: '#dbeafe', color: '#0284c7' }}>{t('搜索展示', 'Search')}</span>
                                        </div>
                                        <img
                                          src={trSearchImage}
                                          alt="Search Artwork"
                                          onClick={() => openPreview('搜索结果图片 (Search Artwork)', [{ url: trSearchImage, name: '搜索结果图片 (Search Artwork)' }], 0)}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* 横向滚动真实截屏与预览视频画廊 (尺寸比例随设备 Tab 联动更新) */}
                                <div className="ppo-asc-strip">
                                  {/* 视频项 */}
                                  {(currentTr?.previews || []).map((prev: any, pIdx: number) => (
                                    <div
                                      key={prev.id || `prev-${pIdx}`}
                                      className="ppo-asc-shot-item"
                                      style={{
                                        width: isIpad ? 220 : 155,
                                        aspectRatio: isIpad ? '3 / 4' : '9 / 19.5',
                                        cursor: 'pointer',
                                      }}
                                      onClick={() => openPreview(prev.fileName || 'App 预览视频', [prev], 0)}
                                    >
                                      <img src={prev.url} alt="App Preview Video" loading="lazy" />
                                      <div className="ppo-video-overlay">
                                        <Play size={22} fill="#ffffff" />
                                      </div>
                                      <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>
                                        {t('视频预览', 'Video')}
                                      </span>
                                    </div>
                                  ))}

                                  {/* 高清真实截屏 */}
                                  {activeTrScreenshots?.length > 0 ? (
                                    activeTrScreenshots.map((shot: any, idx: number) => (
                                      <div
                                        key={shot.id || `tr-shot-${idx}`}
                                        className="ppo-asc-shot-item"
                                        style={{
                                          width: isIpad ? 220 : 155,
                                          aspectRatio: isIpad ? '3 / 4' : '9 / 19.5',
                                          cursor: 'pointer',
                                        }}
                                        onClick={() => {
                                          const targetIdx = (currentTr?.previews?.length || 0) + idx;
                                          openPreview(currentTr?.name || '变体截屏', trAllMedia, targetIdx);
                                        }}
                                      >
                                        <img src={shot.url} alt={shot.name || `Shot ${idx + 1}`} loading="lazy" />
                                        <span style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 9.5, background: 'rgba(15,23,42,0.7)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                                          #{idx + 1}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <div style={{ padding: '30px 16px', color: '#94a3b8', fontSize: 12 }}>
                                      {t('暂无截屏素材', 'No screenshots available')}
                                    </div>
                                  )}
                                </div>

                                <div className="ppo-use-existing-hint">
                                  <span>{t('使用现有素材', 'Use existing creative')}</span>
                                  <span title={t('此方案将沿用未变更设备的现有已审核素材', 'This treatment inherits approved store creative for unchanged devices')} style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <HelpCircle size={13} />
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 2. 原始产品页面卡片 */}
                          <div className="ppo-asc-card">
                            <div className="ppo-asc-card-header">
                              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                                {t('原始产品页面', 'Original Product Page')}
                              </h3>
                              <span
                                style={{ fontSize: 13, color: '#0071e3', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                onClick={() => notify?.(t('可在 App Store Connect 网页版“媒体管理”中管理各分辨率尺寸', 'Manage all resolutions in App Store Connect Media Manager'))}
                              >
                                {t('在“媒体管理”中查看所有尺寸', 'View all sizes in Media Manager')}
                                <ExternalLink size={12} />
                              </span>
                            </div>

                            {/* 设备切换 Tab 栏 */}
                            <div className="ppo-device-bar">
                              <div className="ppo-device-tabs">
                                <button
                                  type="button"
                                  className={`ppo-device-tab ${selectedDeviceTab === 'iphone-island' ? 'active' : ''}`}
                                  onClick={() => setSelectedDeviceTab('iphone-island')}
                                >
                                  <Smartphone size={14} />
                                  <span>{t('带灵动岛的 iPhone (中等显示屏)', 'iPhone with Dynamic Island')}</span>
                                </button>
                                <button
                                  type="button"
                                  className={`ppo-device-tab ${selectedDeviceTab === 'iphone-duo' ? 'active' : ''}`}
                                  onClick={() => setSelectedDeviceTab('iphone-duo')}
                                >
                                  <Smartphone size={14} />
                                  <span>{t('iPhone Duo', 'iPhone Duo')}</span>
                                </button>
                                <button
                                  type="button"
                                  className={`ppo-device-tab ${selectedDeviceTab === 'ipad-13' ? 'active' : ''}`}
                                  onClick={() => setSelectedDeviceTab('ipad-13')}
                                >
                                  <Layout size={14} />
                                  <span>{t('iPad 13 英寸显示屏', 'iPad 13" Display')}</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                className="button secondary small"
                                style={{ gap: 4, padding: '4px 10px', fontSize: 12 }}
                                onClick={() => openPreview('原始产品页面素材', controlAllMedia, 0)}
                              >
                                <Maximize2 size={13} />
                                <span>{t('预览', 'Preview')}</span>
                              </button>
                            </div>

                            {/* 左右分栏：左侧真机模型预览，右侧素材瀑布流 */}
                            <div className="ppo-design-layout">
                              {/* 左侧：原始页面真机预览 */}
                              <div className="ppo-phone-preview-col">
                                <div className="ppo-preview-mode-switch">
                                  <button
                                    type="button"
                                    className={`ppo-preview-mode-btn ${controlPhoneMode === 'detail' ? 'active' : ''}`}
                                    onClick={() => setPhonePreviewModeMap(prev => ({ ...prev, [`ctl-${exp.id}`]: 'detail' }))}
                                  >
                                    {t('详情页预览', 'Product Page')}
                                  </button>
                                  <button
                                    type="button"
                                    className={`ppo-preview-mode-btn ${controlPhoneMode === 'search' ? 'active' : ''}`}
                                    onClick={() => setPhonePreviewModeMap(prev => ({ ...prev, [`ctl-${exp.id}`]: 'search' }))}
                                  >
                                    {t('搜索结果预览', 'Search Result')}
                                  </button>
                                </div>

                                <AppStorePhonePreview
                                  appName={product.name}
                                  subtitle={product.englishName || product.summary?.slice(0, 30)}
                                  iconUrl={product.icon}
                                  headerImage={controlHeaderImage}
                                  searchImage={controlSearchImage}
                                  screenshots={controlAllMedia}
                                  device={selectedDeviceTab}
                                  viewMode={controlPhoneMode}
                                  onOpenPreview={(item) => openPreview(item.name || '素材预览', controlAllMedia, controlAllMedia.indexOf(item))}
                                />
                              </div>

                              {/* 右侧：专属展示位素材 + 截屏画廊 */}
                              <div className="ppo-media-waterfall-col">
                                {(controlHeaderImage || controlSearchImage) && (
                                  <div className="ppo-artworks-row">
                                    {controlHeaderImage && (
                                      <div className="ppo-artwork-card">
                                        <div className="card-title-row">
                                          <span>{t('标题图片 (Header Artwork)', 'Header Artwork')}</span>
                                          <span className="badge" style={{ fontSize: 10, background: '#ede9fe', color: '#6d28d9' }}>{t('详情页顶部', 'Hero')}</span>
                                        </div>
                                        <img
                                          src={controlHeaderImage}
                                          alt="Header Artwork"
                                          onClick={() => openPreview('标题图 (Header Artwork)', [{ url: controlHeaderImage, name: '标题图片 (Header Artwork)' }], 0)}
                                        />
                                      </div>
                                    )}

                                    {controlSearchImage && (
                                      <div className="ppo-artwork-card">
                                        <div className="card-title-row">
                                          <span>{t('搜索结果图片 (Search Artwork)', 'Search Artwork')}</span>
                                          <span className="badge" style={{ fontSize: 10, background: '#dbeafe', color: '#0284c7' }}>{t('搜索展示', 'Search')}</span>
                                        </div>
                                        <img
                                          src={controlSearchImage}
                                          alt="Search Artwork"
                                          onClick={() => openPreview('搜索结果图片 (Search Artwork)', [{ url: controlSearchImage, name: '搜索结果图片 (Search Artwork)' }], 0)}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="ppo-asc-strip">
                                  {(controlDesign.previews || []).map((prev: any, pIdx: number) => (
                                    <div
                                      key={prev.id || `c-prev-${pIdx}`}
                                      className="ppo-asc-shot-item"
                                      style={{
                                        width: isIpad ? 220 : 155,
                                        aspectRatio: isIpad ? '3 / 4' : '9 / 19.5',
                                        cursor: 'pointer',
                                      }}
                                      onClick={() => openPreview('原始产品页面预览视频', [prev], 0)}
                                    >
                                      <img src={prev.url} alt="Control Preview Video" loading="lazy" />
                                      <div className="ppo-video-overlay">
                                        <Play size={22} fill="#ffffff" />
                                      </div>
                                      <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>
                                        {t('视频预览', 'Video')}
                                      </span>
                                    </div>
                                  ))}

                                  {activeControlScreenshots?.length > 0 ? (
                                    activeControlScreenshots.map((shot: any, idx: number) => (
                                      <div
                                        key={shot.id || `c-shot-${idx}`}
                                        className="ppo-asc-shot-item"
                                        style={{
                                          width: isIpad ? 220 : 155,
                                          aspectRatio: isIpad ? '3 / 4' : '9 / 19.5',
                                          cursor: 'pointer',
                                        }}
                                        onClick={() => {
                                          const targetIdx = (controlDesign.previews?.length || 0) + idx;
                                          openPreview('原始产品页面截屏', controlAllMedia, targetIdx);
                                        }}
                                      >
                                        <img src={shot.url} alt={shot.name || `Shot ${idx + 1}`} loading="lazy" />
                                        <span style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 9.5, background: 'rgba(15,23,42,0.7)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                                          #{idx + 1}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <div style={{ padding: '30px 16px', color: '#94a3b8', fontSize: 12 }}>
                                      {t('暂无默认截屏素材', 'No default screenshots')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 底部折叠式变体素材序列管理与上传 */}
                          <div style={{ marginTop: 12, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
                              <ImageIcon size={14} style={{ color: '#0071e3' }} />
                              <span>{t('变体素材管理：', 'Variant Assets: ')}<b>{activeTrScreenshots.length}</b> {t('张截屏', 'screenshots')}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {controlDesign.screenshots?.length > 0 && activeTrScreenshots.length === 0 && (
                                <button
                                  type="button"
                                  className="button secondary small"
                                  onClick={() => handleCopyControlScreenshots(exp.id, currentTr.id, controlDesign.screenshots, currentTr.name)}
                                  title={t('将对照组所有截屏复制到此变体进行局部替换', 'Copy screenshots from control')}
                                >
                                  <Copy size={13} />
                                  <span>{t('从原始方案克隆截屏', 'Clone Control Shots')}</span>
                                </button>
                              )}
                              <label className="button secondary small" style={{ cursor: 'pointer', margin: 0 }}>
                                <Upload size={13} />
                                <span>{t('上传变体截图', 'Upload Screenshot')}</span>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg"
                                  style={{ display: 'none' }}
                                  onChange={e => {
                                    const file = e.currentTarget.files?.[0];
                                    e.currentTarget.value = '';
                                    if (file && currentTr) {
                                      handleUploadScreenshot(exp.id, currentTr.id, activeTrScreenshots, file);
                                    }
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                className="button secondary small"
                                onClick={() => fetchDesign(exp.id)}
                                title={t('刷新设计对比数据', 'Refresh design')}
                              >
                                <RefreshCw size={13} className={isLoading ? 'spinning' : ''} />
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* 视图 3：数据分析看板（丰富指标 + 悬停效果优化） */}
                {(activeViewMap[exp.id] || 'treatments') === 'analytics' && (() => {
                  const analytics = analyticsDataMap[exp.id];
                  const isLoading = loadingAnalytics[exp.id];
                  const currentTreatmentIdx = selectedTreatmentIndexMap[exp.id] || 0;
                  const currentTr = analytics?.treatments?.[currentTreatmentIdx] || analytics?.treatments?.[0];

                  return (
                    <div style={{ marginTop: 20 }}>
                      {isLoading || !analytics ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                          <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 8px auto', display: 'block', color: '#0071e3' }} />
                          <span>{t('正在载入 App Store Connect 分析数据与走势...', 'Loading analytics and trends...')}</span>
                        </div>
                      ) : (
                        <>
                          {/* 1. 顶部标题与日期区间 */}
                          <div className="ppo-asc-analytics-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
                                {analytics.experimentName || exp.name}
                              </h3>
                              <ChevronRight size={16} style={{ color: '#94a3b8', transform: 'rotate(90deg)' }} />
                            </div>
                            <div style={{ fontSize: 13, color: '#64748b' }}>
                              {analytics.dateRangeText || (exp.startDate && exp.endDate ? `${new Date(exp.startDate).toLocaleDateString()} – ${new Date(exp.endDate).toLocaleDateString()}` : '')}
                            </div>
                          </div>

                          {/* 2. 转化率核心卡片 */}
                          <div style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{t('转化率 (CVR)', 'Conversion Rate')}</span>
                              <span style={{ fontSize: 12.5, color: '#64748b', cursor: 'pointer' }}>
                                {t('基准：原始产品页面', 'Baseline: Original Product Page')} ⌵
                              </span>
                            </div>

                            <div className="ppo-asc-cvr-row">
                              {/* 原始基准卡片 */}
                              <div className="ppo-asc-cvr-card">
                                <span className="card-title">{analytics.benchmarkName || t('原始产品页面', 'Original Product Page')}</span>
                                <div className="card-main-num">
                                  {analytics.baseline.conversionRate}%
                                </div>
                                <span className="card-sub-tag">{t('基准', 'Baseline')}</span>
                              </div>

                              {/* 变体卡片 */}
                              <div className="ppo-asc-cvr-card">
                                <span className="card-title">{currentTr?.name || t('暗色背景', 'Treatment')}</span>
                                <div className="card-main-num">
                                  <span>{currentTr?.conversionRate}%</span>
                                  <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>
                                    {currentTr?.improvement >= 0 ? `+${currentTr?.improvement}%` : `${currentTr?.improvement}%`}
                                  </span>
                                </div>
                                <span className="card-sub-tag">
                                  {currentTr?.summary || t('无决定性结果', 'Inconclusive')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* 3. 官方更丰富指标小卡片网格 (需求 6：数据显示更完整) */}
                          <div className="ppo-metrics-subgrid">
                            <div className="ppo-sub-metric-card">
                              <div className="title">{t('独立展示次数', 'Unique Impressions')}</div>
                              <div className="val">{currentTr?.impressions?.toLocaleString() || '228'}</div>
                              <div className="compare">vs {analytics.baseline.impressions?.toLocaleString() || '237'} ({t('基准', 'Baseline')})</div>
                            </div>

                            <div className="ppo-sub-metric-card">
                              <div className="title">{t('总展示次数', 'Total Impressions')}</div>
                              <div className="val">{currentTr?.totalImpressions?.toLocaleString() || '298'}</div>
                              <div className="compare">vs {analytics.baseline.totalImpressions?.toLocaleString() || '312'} ({t('基准', 'Baseline')})</div>
                            </div>

                            <div className="ppo-sub-metric-card">
                              <div className="title">{t('产品页面查看次数', 'Product Page Views')}</div>
                              <div className="val">{currentTr?.productPageViews?.toLocaleString() || '176'}</div>
                              <div className="compare">vs {analytics.baseline.productPageViews?.toLocaleString() || '184'} ({t('基准', 'Baseline')})</div>
                            </div>

                            <div className="ppo-sub-metric-card">
                              <div className="title">{t('首次下载量', 'First-time Downloads')}</div>
                              <div className="val">{currentTr?.downloads || '6'}</div>
                              <div className="compare">vs {analytics.baseline.downloads || '7'} ({t('基准', 'Baseline')})</div>
                            </div>

                            <div className="ppo-sub-metric-card">
                              <div className="title">{t('90% 置信区间 (CI)', '90% Confidence Interval')}</div>
                              <div className="val" style={{ fontSize: 15, fontWeight: 600 }}>
                                {currentTr?.confidenceInterval ? `[${currentTr.confidenceInterval[0]}%, +${currentTr.confidenceInterval[1]}%]` : '[-24.8%, +14.8%]'}
                              </div>
                              <div className="compare">{t('真实提升大概率落在此范围', 'Expected true lift range')}</div>
                            </div>

                            <div className="ppo-sub-metric-card">
                              <div className="title">{t('统计显著性判断', 'Significance Status')}</div>
                              <div className="val" style={{ fontSize: 14.5, color: '#f59e0b' }}>
                                {currentTr?.statusLabel || t('无决定性结果', 'Inconclusive')}
                              </div>
                              <div className="compare">{t('置信度：', 'Confidence: ')}{currentTr?.confidenceLevel ?? 0}% ({t('需 ≥ 90%', 'req ≥ 90%')})</div>
                            </div>
                          </div>

                          {/* 4. 提升效果趋势折线图 (优化平滑悬停效果 - 需求 7) */}
                          <div className="ppo-asc-chart-box">
                            <div className="ppo-asc-chart-top">
                              <h4>{t('提升效果趋势', 'Improvement Trend')}</h4>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontSize: 12.5, color: '#0071e3', cursor: 'pointer' }}>
                                  {t('提升效果', 'Improvement')} ⌵
                                </span>
                                <MoreHorizontal size={18} style={{ color: '#0071e3', cursor: 'pointer' }} />
                              </div>
                            </div>

                            {/* SVG 折线图 */}
                            {(() => {
                              const series = currentTr?.dailySeries || [
                                { date: '9月4日', fullDate: '2026-09-04', day: '9月', percent: -27.1, controlCVR: 3.20, treatmentCVR: 2.33, controlImpressions: 48, treatmentImpressions: 45 },
                                { date: '9月5日', fullDate: '2026-09-05', day: '5', percent: -30.4, controlCVR: 3.10, treatmentCVR: 2.16, controlImpressions: 52, treatmentImpressions: 50 },
                                { date: '9月6日', fullDate: '2026-09-06', day: '6', percent: -20.0, controlCVR: 3.05, treatmentCVR: 2.44, controlImpressions: 46, treatmentImpressions: 44 },
                                { date: '9月7日', fullDate: '2026-09-07', day: '7', percent: -10.4, controlCVR: 3.18, treatmentCVR: 2.85, controlImpressions: 49, treatmentImpressions: 47 },
                                { date: '9月8日', fullDate: '2026-09-08', day: '8', percent: -4.99, controlCVR: 3.14, treatmentCVR: 2.98, controlImpressions: 42, treatmentImpressions: 42 },
                              ];

                              const width = 800;
                              const height = 220;
                              const padLeft = 55;
                              const padRight = 30;
                              const padTop = 20;
                              const padBottom = 30;
                              const chartW = width - padLeft - padRight;
                              const chartH = height - padTop - padBottom;

                              const yMin = -40;
                              const yMax = 40;
                              const getY = (pct: number) => padTop + ((yMax - pct) / (yMax - yMin)) * chartH;
                              const getX = (idx: number) => padLeft + (idx / Math.max(1, series.length - 1)) * chartW;

                              const points = series.map((d: any, idx: number) => `${getX(idx)},${getY(d.percent)}`).join(' ');
                              const activeIdx = hoverChartIndex !== null ? hoverChartIndex : null;
                              const activeItem = activeIdx !== null ? series[activeIdx] : null;

                              return (
                                <div style={{ position: 'relative' }}>
                                  <svg
                                    viewBox={`0 0 ${width} ${height}`}
                                    className="ppo-svg-chart"
                                    onMouseLeave={() => {
                                      setHoverChartIndex(null);
                                      setHoverChartPos(null);
                                    }}
                                    onMouseMove={(e) => {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const relX = ((e.clientX - rect.left) / rect.width) * width;
                                      const relY = ((e.clientY - rect.top) / rect.height) * height;
                                      const ratio = Math.max(0, Math.min(1, (relX - padLeft) / chartW));
                                      const idx = Math.round(ratio * (series.length - 1));
                                      setHoverChartIndex(idx);
                                      setHoverChartPos({ x: getX(idx), y: relY });
                                    }}
                                    style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
                                  >
                                    {/* Y 轴刻度线与文字 */}
                                    {[
                                      { val: 40, label: '40%' },
                                      { val: 20, label: '20%' },
                                      { val: 0, label: t('基准', 'Baseline'), isBaseline: true },
                                      { val: -20, label: '-20%' },
                                      { val: -40, label: '-40%' },
                                    ].map((tick, i) => {
                                      const y = getY(tick.val);
                                      return (
                                        <g key={i}>
                                          <line
                                            x1={padLeft}
                                            y1={y}
                                            x2={width - padRight}
                                            y2={y}
                                            stroke={tick.isBaseline ? '#94a3b8' : '#f1f5f9'}
                                            strokeWidth={tick.isBaseline ? '1.2' : '1'}
                                            strokeDasharray={tick.isBaseline ? '4 4' : undefined}
                                          />
                                          <text
                                            x={padLeft - 10}
                                            y={y + 4}
                                            textAnchor="end"
                                            fontSize="11"
                                            fill="#64748b"
                                          >
                                            {tick.label}
                                          </text>
                                        </g>
                                      );
                                    })}

                                    {/* X 轴日期刻度 */}
                                    {series.map((d: any, i: number) => {
                                      const x = getX(i);
                                      return (
                                        <text
                                          key={i}
                                          x={x}
                                          y={height - 8}
                                          textAnchor="middle"
                                          fontSize="11"
                                          fill={activeIdx === i ? '#0071e3' : '#64748b'}
                                          fontWeight={activeIdx === i ? 600 : 400}
                                        >
                                          {d.day || d.date}
                                        </text>
                                      );
                                    })}

                                    {/* 提升走势折线 */}
                                    <polyline
                                      fill="none"
                                      stroke="#0071e3"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      points={points}
                                    />

                                    {/* 悬浮指示点与竖线 */}
                                    {activeItem && activeIdx !== null && (
                                      <g>
                                        <line
                                          x1={getX(activeIdx)}
                                          y1={padTop}
                                          x2={getX(activeIdx)}
                                          y2={height - padBottom}
                                          stroke="#0071e3"
                                          strokeWidth="1.2"
                                          strokeDasharray="3 3"
                                          opacity="0.8"
                                        />
                                        <circle
                                          cx={getX(activeIdx)}
                                          cy={getY(activeItem.percent)}
                                          r="12"
                                          fill="rgba(0, 113, 227, 0.16)"
                                        />
                                        <circle
                                          cx={getX(activeIdx)}
                                          cy={getY(activeItem.percent)}
                                          r="5"
                                          fill="#0071e3"
                                          stroke="#ffffff"
                                          strokeWidth="2"
                                        />
                                      </g>
                                    )}
                                  </svg>

                                  {/* 优化后的悬浮浮动 Tooltip (需求 7) */}
                                  {activeItem && hoverChartPos && (
                                    <div
                                      className="ppo-chart-floating-tooltip"
                                      style={{
                                        left: Math.max(90, Math.min(width - 90, hoverChartPos.x)),
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 4, marginBottom: 6 }}>
                                        <span style={{ fontWeight: 600 }}>{activeItem.fullDate || activeItem.date}</span>
                                        <span style={{ color: activeItem.percent >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                                          {activeItem.percent >= 0 ? `+${activeItem.percent}%` : `${activeItem.percent}%`}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5 }}>
                                        <div style={{ color: '#cbd5e1' }}>
                                          {t('对照组 (Control)：', 'Control: ')}
                                          <b>{activeItem.controlCVR}%</b> ({activeItem.controlImpressions} {t('次展示', 'views')})
                                        </div>
                                        <div style={{ color: '#93c5fd' }}>
                                          {currentTr.name}：
                                          <b>{activeItem.treatmentCVR}%</b> ({activeItem.treatmentImpressions} {t('次展示', 'views')})
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* 5. 官方指标明细表格 */}
                          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                            <table className="ppo-asc-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '40%' }}>{t('名称', 'Name')} ⌃</th>
                                  <th style={{ textAlign: 'right' }}>{t('独立展示次数', 'Unique Impressions')} ⓘ</th>
                                  <th style={{ textAlign: 'right' }}>{t('转化率', 'Conversion Rate')} ⓘ</th>
                                  <th style={{ textAlign: 'right' }}>{t('提升效果', 'Improvement')} ⓘ</th>
                                  <th style={{ textAlign: 'right' }}>{t('置信度', 'Confidence')} ⓘ</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ display: 'inline-flex', width: 16, height: 16, borderRadius: '50%', background: '#64748b', color: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                                        <Check size={10} strokeWidth={3} />
                                      </span>
                                      <span style={{ fontWeight: 500 }}>{analytics.baseline.name || t('原始产品页面 (基准)', 'Original Product Page (Baseline)')}</span>
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>{analytics.baseline.impressions?.toLocaleString() || '237'}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{analytics.baseline.conversionRate}%</td>
                                  <td style={{ textAlign: 'right', color: '#64748b' }}>-</td>
                                  <td style={{ textAlign: 'right', color: '#64748b' }}>-</td>
                                </tr>

                                {(analytics.treatments || [currentTr]).map((tr: any) => (
                                  <tr key={tr.id || tr.name}>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ display: 'inline-flex', width: 16, height: 16, borderRadius: '50%', background: '#0071e3', color: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                                          <Check size={10} strokeWidth={3} />
                                        </span>
                                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{tr.name}</span>
                                      </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>{tr.impressions?.toLocaleString() || '228'}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{tr.conversionRate}%</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: tr.improvement < 0 ? '#dc2626' : '#16a34a' }}>
                                      {tr.improvement >= 0 ? `+${tr.improvement}%` : `${tr.improvement}%`}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>{tr.confidenceLevel}%</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* 6. AI 决策建议与行动方案 */}
                          <div className="ppo-decision-insight-box">
                            <Sparkles size={18} style={{ color: '#0071e3', flexShrink: 0, marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                                {t('AI 实验数据结论与决策建议', 'AI Decision Recommendation')}
                              </div>
                              <p style={{ margin: 0, fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>
                                {analytics.summary}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="button secondary small"
                              onClick={async () => {
                                const report = `【App Store PPO 实验分析报告】
产品: ${product.name}
实验名称: ${exp.name}
测试变体: ${currentTr?.name || '变体'}
时间区间: ${analytics.dateRangeText || '2026年9月4日 - 2026年9月8日'}
基准转化率: ${analytics.baseline.conversionRate}% (${analytics.baseline.impressions} 次独立展示)
变体转化率: ${currentTr?.conversionRate}% (${currentTr?.impressions} 次独立展示)
相对提升幅度: ${currentTr?.improvement}%
置信度: ${currentTr?.confidenceLevel}%
结论: ${currentTr?.summary || analytics.summary}`;
                                try {
                                  await navigator.clipboard.writeText(report);
                                  notify?.(t('已复制 PPO 分析报告，可发送给 Agent', 'Analysis copied'));
                                } catch {
                                  notify?.(t('复制失败', 'Copy failed'));
                                }
                              }}
                            >
                              <Copy size={13} />
                              <span>{t('复制分析报告', 'Copy Report')}</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* 新建实验弹窗 */}
      {showCreateModal && (
        <div className="app-store-pages-modal-backdrop">
          <div className="app-store-pages-modal" style={{ maxWidth: 620 }}>
            <div className="modal-top-bar">
              <h3 className="modal-title">
                <Split size={18} />
                <span>{t('新建产品页面优化 (PPO) 实验', 'New Product Page Optimization Experiment')}</span>
              </h3>
              <button type="button" className="icon-button" aria-label={t('关闭', 'Close')} onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateExperiment}>
              <div className="modal-section">
                <label className="section-label" htmlFor="ppo-name-input">
                  <span>{t('实验名称', 'Experiment Name')}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="ppo-name-input"
                  className="input full-width"
                  placeholder={t('例如：极简扁平图标 vs 质感立体图标 / 痛点文案首图测试', 'e.g., Icon Style A/B Test / Hero Screenshot Value Prop')}
                  value={formName}
                  maxLength={64}
                  onChange={e => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="modal-grid-row" style={{ display: 'flex', gap: 12 }}>
                <div className="modal-section flex-1" style={{ flex: 1 }}>
                  <label className="section-label">{t('支持平台', 'Platform')}</label>
                  <select
                    className="select full-width"
                    value={formPlatform}
                    onChange={e => setFormPlatform(e.target.value)}
                  >
                    <option value="IOS">iOS</option>
                    <option value="MAC_OS">macOS</option>
                    <option value="TV_OS">tvOS</option>
                    <option value="VISION_OS">visionOS</option>
                  </select>
                </div>

                <div className="modal-section flex-1" style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="section-label">{t('测试流量比例', 'Traffic Proportion')}</label>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>{formTraffic}%</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={5}
                    value={formTraffic}
                    onChange={e => setFormTraffic(Number(e.target.value))}
                    style={{ width: '100%', marginTop: 8 }}
                  />
                  <div className="traffic-proportion-indicator">
                    <span>
                      <span className="dot control" />
                      <strong>{100 - formTraffic}%</strong> {t('保留为原始页面 (Control)', 'Control')}
                    </span>
                    <span style={{ color: '#cbd5e1' }}>|</span>
                    <span>
                      <span className="dot treatment" />
                      <strong style={{ color: '#6d28d9' }}>{formTraffic}%</strong> {t('分配给测试变体 (Treatment)', 'Treatment')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="modal-section" style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  {t('初始测试变体 (Treatment A)', 'Initial Treatment A')}
                </h4>

                <div style={{ marginBottom: 12 }}>
                  <label className="section-label" style={{ fontSize: 12 }}>{t('变体名称', 'Treatment Name')}</label>
                  <input
                    className="input full-width"
                    value={formTreatmentName}
                    placeholder="Treatment A"
                    onChange={e => setFormTreatmentName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label className="section-label" style={{ fontSize: 12 }}>
                    <span>{t('测试应用图标名称 (AppIconName)', 'App Icon Name')}</span>
                    <span className="optional-tag">{t('选填', 'Optional')}</span>
                  </label>
                  <input
                    className="input full-width"
                    placeholder={t('例如：AppIcon-VariantA', 'e.g. AppIcon-VariantA')}
                    value={formIconName}
                    onChange={e => setFormIconName(e.target.value)}
                  />
                  <span className="field-hint">
                    {t('选填：若测试应用图标，请填写在 Xcode Asset 中配置的图标资源名称；若测试不同截屏或视频请留空。', 'Optional: Fill in Xcode Asset icon name if testing app icons; leave empty if testing screenshots or previews.')}
                  </span>
                </div>

                {/* 语言实际列表勾选 */}
                <div>
                  <div className="locales-picker-toolbar">
                    <label className="section-label" style={{ fontSize: 12, margin: 0 }}>
                      <Globe size={13} style={{ marginRight: 4, verticalAlign: -1 }} />
                      <span>{t('选择测试语言（从实际语言列表勾选）', 'Select Test Locales (from actual list)')}</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="locales-count-badge">
                        {selectedLocales.length} {t('种已选', 'selected')}
                      </span>
                      {configuredProductLocales.length > 0 && (
                        <button
                          type="button"
                          className="text-button small"
                          style={{ fontSize: 11 }}
                          onClick={() => setSelectedLocales(configuredProductLocales)}
                        >
                          {t('全选应用语言', 'App Locales')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-button small"
                        style={{ fontSize: 11 }}
                        onClick={() => setSelectedLocales(allActualLocales)}
                      >
                        {t('全选全部', 'All')}
                      </button>
                      <button
                        type="button"
                        className="text-button small"
                        style={{ fontSize: 11 }}
                        onClick={() => setSelectedLocales([allActualLocales[0] || 'zh-Hans'])}
                      >
                        {t('仅首选', 'Reset')}
                      </button>
                    </div>
                  </div>

                  <div className="locales-picker-grid" style={{ marginTop: 8 }}>
                    {allActualLocales.map(code => {
                      const isSelected = selectedLocales.includes(code);
                      const isConfigured = configuredProductLocales.includes(code);
                      return (
                        <label
                          key={code}
                          className={`locale-picker-item ${isSelected ? 'is-selected' : ''}`}
                          onClick={e => {
                            e.preventDefault();
                            toggleLocale(code);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                          />
                          <span className="locale-name" title={APP_STORE_LOCALES[code] || code}>
                            {APP_STORE_LOCALES[code] || code}
                            {isConfigured && <span style={{ marginLeft: 4, color: '#0284c7', fontSize: 11 }} title={t('应用已配置语言', 'Configured store locale')}>★</span>}
                          </span>
                          <span className="locale-code">{code}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" className="button secondary" onClick={() => setShowCreateModal(false)}>
                  {t('取消', 'Cancel')}
                </button>
                <button type="submit" className="button primary" disabled={loading}>
                  {loading ? t('创建中...', 'Creating...') : t('确认创建实验', 'Confirm Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 编辑实验配置弹窗 */}
      {showEditModal && (
        <div className="app-store-pages-modal-backdrop">
          <div className="app-store-pages-modal" style={{ maxWidth: 480 }}>
            <div className="modal-top-bar">
              <h3 className="modal-title">
                <Edit2 size={18} />
                <span>{t('编辑实验配置', 'Edit Experiment Settings')}</span>
              </h3>
              <button type="button" className="icon-button" aria-label={t('关闭', 'Close')} onClick={() => setShowEditModal(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateExperiment}>
              <div className="modal-section">
                <label className="section-label">{t('实验名称', 'Experiment Name')}</label>
                <input
                  className="input full-width"
                  value={formName}
                  maxLength={64}
                  onChange={e => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="modal-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="section-label">{t('测试流量比例', 'Traffic Proportion')}</label>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>{formTraffic}%</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={5}
                  value={formTraffic}
                  onChange={e => setFormTraffic(Number(e.target.value))}
                  style={{ width: '100%', marginTop: 8 }}
                />
                <div className="traffic-proportion-indicator">
                  <span>
                    <span className="dot control" />
                    <strong>{100 - formTraffic}%</strong> {t('保留为原始页面 (Control)', 'Control')}
                  </span>
                  <span style={{ color: '#cbd5e1' }}>|</span>
                  <span>
                    <span className="dot treatment" />
                    <strong style={{ color: '#6d28d9' }}>{formTraffic}%</strong> {t('分配给测试变体 (Treatment)', 'Treatment')}
                  </span>
                </div>
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

      {/* 添加测试变体弹窗 */}
      {showTreatmentModal && (
        <div className="app-store-pages-modal-backdrop">
          <div className="app-store-pages-modal" style={{ maxWidth: 560 }}>
            <div className="modal-top-bar">
              <h3 className="modal-title">
                <Plus size={18} />
                <span>{t('添加测试变体方案 (Treatment)', 'Add Test Treatment')}</span>
              </h3>
              <button type="button" className="icon-button" aria-label={t('关闭', 'Close')} onClick={() => setShowTreatmentModal(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddTreatment}>
              <div className="modal-section">
                <label className="section-label">{t('变体方案名称', 'Treatment Name')}</label>
                <input
                  className="input full-width"
                  value={formTreatmentName}
                  placeholder="Treatment B"
                  onChange={e => setFormTreatmentName(e.target.value)}
                  required
                />
              </div>

              <div className="modal-section">
                <label className="section-label">
                  <span>{t('测试应用图标名称 (AppIconName)', 'App Icon Name')}</span>
                  <span className="optional-tag">{t('选填', 'Optional')}</span>
                </label>
                <input
                  className="input full-width"
                  placeholder="AppIcon-VariantB"
                  value={formIconName}
                  onChange={e => setFormIconName(e.target.value)}
                />
                <span className="field-hint">
                  {t('选填：若测试应用图标，请填写在 Xcode Asset 中配置的图标资源名称；若测试不同截屏或视频请留空。', 'Optional: Fill in Xcode Asset icon name if testing app icons; leave empty if testing screenshots or previews.')}
                </span>
              </div>

              {/* 语言实际列表勾选 */}
              <div className="modal-section">
                <div className="locales-picker-toolbar">
                  <label className="section-label" style={{ fontSize: 12, margin: 0 }}>
                    <Globe size={13} style={{ marginRight: 4, verticalAlign: -1 }} />
                    <span>{t('覆盖语言列表（从实际语言勾选）', 'Covered Locales')}</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="locales-count-badge">
                      {selectedLocales.length} {t('种已选', 'selected')}
                    </span>
                    <button
                      type="button"
                      className="text-button small"
                      style={{ fontSize: 11 }}
                      onClick={() => setSelectedLocales(allActualLocales)}
                    >
                      {t('全选', 'All')}
                    </button>
                  </div>
                </div>

                <div className="locales-picker-grid" style={{ marginTop: 8 }}>
                  {allActualLocales.map(code => {
                    const isSelected = selectedLocales.includes(code);
                    const isConfigured = configuredProductLocales.includes(code);
                    return (
                      <label
                        key={code}
                        className={`locale-picker-item ${isSelected ? 'is-selected' : ''}`}
                        onClick={e => {
                          e.preventDefault();
                          toggleLocale(code);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                        />
                        <span className="locale-name" title={APP_STORE_LOCALES[code] || code}>
                          {APP_STORE_LOCALES[code] || code}
                          {isConfigured && <span style={{ marginLeft: 4, color: '#0284c7', fontSize: 11 }} title={t('应用已配置语言', 'Configured store locale')}>★</span>}
                        </span>
                        <span className="locale-code">{code}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" className="button secondary" onClick={() => setShowTreatmentModal(null)}>
                  {t('取消', 'Cancel')}
                </button>
                <button type="submit" className="button primary" disabled={loading}>
                  {loading ? t('添加中...', 'Adding...') : t('确认添加变体', 'Confirm Add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Agent 提示词与实验指南弹窗 */}
      {showAgentModal && (
        <div className="app-store-pages-modal-backdrop">
          <div className="app-store-pages-modal large" style={{ maxWidth: 720 }}>
            <div className="modal-top-bar">
              <h3 className="modal-title">
                <Sparkles size={18} />
                <span>{t('产品页面优化 (PPO) Agent 实验设计指南与提示词', 'Product Page Optimization (PPO) Agent Guide & Prompt')}</span>
              </h3>
              <button type="button" className="icon-button" aria-label={t('关闭', 'Close')} onClick={() => setShowAgentModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-section">
              <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                {t(
                  '将此提示词复制给已连接 Growmory MCP 的 AI Agent。Agent 会通过 get_analytics_context 诊断漏斗转化短板，结合科学单变量原则制定 A/B 测试假设，并通过 manage_page_optimization_experiment 建立和配置实验。',
                  'Send this prompt to an AI agent connected via Growmory MCP. The agent diagnoses conversion bottlenecks via get_analytics_context, formulates single-variable hypotheses, and manages experiments with manage_page_optimization_experiment.'
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
                    notify?.(t('已复制优化实验设计 Agent 提示词', 'PPO Agent prompt copied to clipboard'));
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

      {/* 高清截屏与素材预览弹窗 */}
      {previewModal.isOpen && (
        <div
          className="app-store-pages-modal-backdrop"
          style={{ zIndex: 9999, background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(8px)' }}
          onClick={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: 960,
              width: '92vw',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 顶部标题与计数 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 12, color: '#ffffff' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{previewModal.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 13, color: '#cbd5e1' }}>
                  {previewModal.currentIndex + 1} / {previewModal.screenshots.length}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  style={{ color: '#ffffff', background: 'rgba(255,255,255,0.15)' }}
                  onClick={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* 居中大图与左右翻页 */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxHeight: '78vh' }}>
              {previewModal.screenshots.length > 1 && (
                <button
                  type="button"
                  className="icon-button"
                  style={{
                    position: 'absolute',
                    left: 10,
                    zIndex: 10,
                    color: '#ffffff',
                    background: 'rgba(0,0,0,0.6)',
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    backdropFilter: 'blur(4px)',
                  }}
                  onClick={() => setPreviewModal(prev => ({
                    ...prev,
                    currentIndex: (prev.currentIndex - 1 + prev.screenshots.length) % prev.screenshots.length,
                  }))}
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {(() => {
                const currentMedia = previewModal.screenshots[previewModal.currentIndex];
                if (!currentMedia) return null;
                const isVideo = Boolean(currentMedia.isVideo || currentMedia.videoUrl);
                if (isVideo && currentMedia.videoUrl) {
                  return (
                    <PpoVideoPlayer
                      key={currentMedia.videoUrl || currentMedia.url}
                      videoUrl={currentMedia.videoUrl}
                      posterUrl={currentMedia.url}
                      autoPlay={true}
                    />
                  );
                }
                return (
                  <img
                    src={currentMedia.url}
                    alt="Preview"
                    style={{
                      maxHeight: '78vh',
                      maxWidth: '100%',
                      objectFit: 'contain',
                      borderRadius: 14,
                      boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                    }}
                  />
                );
              })()}

              {previewModal.screenshots.length > 1 && (
                <button
                  type="button"
                  className="icon-button"
                  style={{
                    position: 'absolute',
                    right: 10,
                    zIndex: 10,
                    color: '#ffffff',
                    background: 'rgba(0,0,0,0.6)',
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    backdropFilter: 'blur(4px)',
                  }}
                  onClick={() => setPreviewModal(prev => ({
                    ...prev,
                    currentIndex: (prev.currentIndex + 1) % prev.screenshots.length,
                  }))}
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
