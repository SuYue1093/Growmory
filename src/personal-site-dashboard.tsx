import { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart3,
  ExternalLink,
  Plus,
  RefreshCw,
  Globe,
  Settings,
  BookOpen,
  Eye,
  Clock,
  Search,
  CheckCircle2,
  Copy,
  Trash2,
  Sparkles,
  Pencil,
  Upload,
  AlertCircle,
  ImageIcon,
  X,
  Key
} from 'lucide-react';
import { normalizeHisuyueSlug } from './hisuyue-slug';
import type { Product } from './types';

type ArticleItem = {
  slug: string;
  title: string;
  tag: string;
  app: string;
  appName?: string;
  category?: string;
  date: string;
  desc: string;
  views: number | null;
  visitors: number | null;
  url: string;
  cover?: string;
  sections?: [string, string][];
};

type UnpublishedContent = {
  id: string;
  title: string;
  body: string;
  channel: string;
  date: string;
  createdAt?: string;
  productId?: string;
  tags?: string[];
  coverAssetId?: string;
  assetIds?: string[];
  explanation?: string;
  siteSlug?: string;
};

type MetricPeriod = {
  pv: number;
  uv: number;
  ip: number;
  bounceRate: string;
  avgDuration: string;
  estimatedPv?: number;
  estimatedUv?: number;
  estimatedIp?: number;
};

type StatsPayload = {
  today?: MetricPeriod;
  yesterday?: MetricPeriod;
  last7days?: MetricPeriod;
  last30days?: MetricPeriod;
  lastUpdatedAt?: string;
};

type BaiduSite = {
  site_id: number;
  domain: string;
  status: number;
  create_time?: string;
};

type BaiduConfig = {
  configured: boolean;
  hasToken: boolean;
  apiKey: string;
  secretKey: string;
  siteId: string;
  numericSiteId?: number | null;
  siteDomain?: string;
  expiresAt?: number | null;
  lastSyncedAt?: string | null;
  authorizeUrl?: string;
  sites?: BaiduSite[];
  liveError?: string | null;
};

type OverviewData = {
  canDeploy: boolean;
  articleMetricsAvailable: boolean;
  baiduConfig: BaiduConfig;
  hasData: boolean;
  stats: StatsPayload | null;
  totalArticles: number;
  articles: ArticleItem[];
};

const CATEGORIES = [
  { id: 'dev', name: '开发手记', desc: '独立开发随想、复盘与通用思考' },
  { id: 'firefly', name: '萤火待办', desc: '萤火待办核心工作流与使用指南' },
  { id: 'stepbystep', name: '一步步', desc: '一步步 SOP 流程与使用指南' },
  { id: 'quicknotes', name: '灵感随记', desc: '灵感随记卡片笔记与闪念整理' },
  { id: 'shiye', name: '拾页', desc: '拾页阅读摘录与读书方法' },
  { id: 'picin', name: 'Picin', desc: 'Picin 相册整理与漫游指南' }
] as const;

export function PersonalSiteDashboard({ products }: { products: Product[] }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Time Range Tabs
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'last7days' | 'last30days'>('today');

  // Filtering for Published Articles Table
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBaiduModal, setShowBaiduModal] = useState(false);
  const [showEditStatsModal, setShowEditStatsModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add Article Modal: Content Selection & Filtering
  const [unpublished, setUnpublished] = useState<UnpublishedContent[]>([]);
  const [loadingUnpublished, setLoadingUnpublished] = useState(false);
  const [contentSearch, setContentSearch] = useState('');
  const [contentPlatform, setContentPlatform] = useState('all');
  const [selectedContent, setSelectedContent] = useState<UnpublishedContent | null>(null);

  // Add Article Modal: Form State
  const [formSlug, setFormSlug] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<string>('dev');
  const [formDesc, setFormDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [publishError, setPublishError] = useState('');

  // Deleting state
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  // Baidu settings state
  const [baiduApiKey, setBaiduApiKey] = useState('2g2Oi1id8EBz4fVa7TlOXqOK5Dgmo89w');
  const [baiduSecretKey, setBaiduSecretKey] = useState('rRoHt1EkIcozRAFeHFOf6YFAJgKemB3p');
  const [baiduSiteId, setBaiduSiteId] = useState('2d3bd9e9276c2ba801c5b7f672749871');
  const [baiduCode, setBaiduCode] = useState('');
  const [baiduToken, setBaiduToken] = useState('');
  const [savingBaidu, setSavingBaidu] = useState(false);
  const [exchangingCode, setExchangingCode] = useState(false);
  const [syncingBaidu, setSyncingBaidu] = useState(false);

  // Real Stats Edit State
  const [editPv, setEditPv] = useState<string>('35');
  const [editUv, setEditUv] = useState<string>('23');
  const [editIp, setEditIp] = useState<string>('20');
  const [editBounce, setEditBounce] = useState<string>('85.71%');
  const [editDuration, setEditDuration] = useState<string>('00:02:03');
  const [editEstPv, setEditEstPv] = useState<string>('54');
  const [editEstUv, setEditEstUv] = useState<string>('33');
  const [editEstIp, setEditEstIp] = useState<string>('29');
  const [savingStats, setSavingStats] = useState(false);

  // Toast auto-hide
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const loadOverview = async (forceSync = false) => {
    try {
      setError('');
      const res = await fetch(`/api/personal-site/overview${forceSync ? '?sync=1' : ''}`);
      if (!res.ok) throw new Error('读取个人主页数据失败');
      const json: OverviewData = await res.json();
      setData(json);
      if (json.baiduConfig) {
        setBaiduSiteId(json.baiduConfig.siteId || '2d3bd9e9276c2ba801c5b7f672749871');
        if (json.baiduConfig.apiKey) setBaiduApiKey(json.baiduConfig.apiKey);
        if (json.baiduConfig.secretKey) setBaiduSecretKey(json.baiduConfig.secretKey);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const openAddModal = async () => {
    setShowAddModal(true);
    setPublishError('');
    setLoadingUnpublished(true);
    setSelectedContent(null);
    setContentSearch('');
    setContentPlatform('all');
    try {
      const res = await fetch('/api/personal-site/unpublished-contents');
      if (res.ok) {
        const list: UnpublishedContent[] = await res.json();
        setUnpublished(list);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUnpublished(false);
    }
  };

  const handleSelectContent = (item: UnpublishedContent) => {
    setSelectedContent(item);
    setFormTitle(item.title);

    const cleanSlug = normalizeHisuyueSlug(item.title, 28);
    const slugSuffix = Math.random().toString(36).substring(2, 6);
    setFormSlug(item.siteSlug || (cleanSlug ? `${cleanSlug}-${slugSuffix}` : `post-${Date.now().toString(36)}-${slugSuffix}`));

    // Map Category automatically from product
    const prod = products.find(p => p.id === item.productId);
    if (prod) {
      if (prod.name.includes('萤火')) setFormCategory('firefly');
      else if (prod.name.includes('一步步')) setFormCategory('stepbystep');
      else if (prod.name.includes('灵感')) setFormCategory('quicknotes');
      else if (prod.name.includes('拾页')) setFormCategory('shiye');
      else if (prod.name.includes('Picin')) setFormCategory('picin');
      else setFormCategory('dev');
    } else {
      setFormCategory('dev');
    }

    const plainText = item.body
      .replace(/#{1,6}\s+.+/g, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    setFormDesc(plainText.slice(0, 120) || item.title);
  };

  const handleSubmitPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContent || !formSlug || !formTitle) return;
    setPublishError('');
    setSubmitting(true);
    try {
      const payload = {
        contentId: selectedContent?.id,
        slug: formSlug,
        title: formTitle,
        category: formCategory,
        desc: formDesc,
        deploy: data?.canDeploy === true
      };

      const res = await fetch('/api/personal-site/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '发布失败');

      setNotice(result.message);
      setShowAddModal(false);
      loadOverview();
    } catch (err) {
      setPublishError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteArticle = async (art: ArticleItem) => {
    const confirmed = window.confirm(`确定要从本地站点移除《${art.title}》吗？\n此操作仅重建本地静态网站。`);
    if (!confirmed) return;

    setDeletingSlug(art.slug);
    try {
      const res = await fetch('/api/personal-site/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: art.slug })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '删除失败');

      setNotice(result.message || '文章已从本地站点移除并重新构建。');
      loadOverview();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingSlug(null);
    }
  };

  const handleExchangeCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baiduCode.trim()) {
      setError('请输入从百度授权页获取的 Code 授权码');
      return;
    }
    setExchangingCode(true);
    setError('');
    try {
      const res = await fetch('/api/personal-site/baidu/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: baiduCode.trim(),
          apiKey: baiduApiKey.trim(),
          secretKey: baiduSecretKey.trim()
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '换取 Token 失败');
      setNotice('百度统计账号授权成功！数据已自动完成同步。');
      setBaiduCode('');
      setShowBaiduModal(false);
      loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExchangingCode(false);
    }
  };

  const handleSyncBaidu = async () => {
    setSyncingBaidu(true);
    setError('');
    try {
      const res = await fetch('/api/personal-site/baidu/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '同步失败');
      setNotice('百度统计真实数据已成功拉取并同步！');
      loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncingBaidu(false);
    }
  };

  const handleSaveBaidu = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBaidu(true);
    try {
      const res = await fetch('/api/personal-site/baidu-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: baiduSiteId,
          apiKey: baiduApiKey,
          secretKey: baiduSecretKey,
          token: baiduToken || undefined
        })
      });
      if (!res.ok) throw new Error('保存配置失败');
      setNotice('百度统计配置已保存');
      setShowBaiduModal(false);
      loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingBaidu(false);
    }
  };

  const handleSaveStats = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStats(true);
    try {
      const payload: Record<string, MetricPeriod> = {};
      payload[period] = {
        pv: Number(editPv) || 0,
        uv: Number(editUv) || 0,
        ip: Number(editIp) || 0,
        bounceRate: editBounce.trim() || '--',
        avgDuration: editDuration.trim() || '--',
        ...(period === 'today' ? {
          estimatedPv: Number(editEstPv) || 0,
          estimatedUv: Number(editEstUv) || 0,
          estimatedIp: Number(editEstIp) || 0
        } : {})
      };

      const res = await fetch('/api/personal-site/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('保存统计数据失败');

      setNotice('统计数据已根据百度统计后台真实数值保存！');
      setShowEditStatsModal(false);
      loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingStats(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await fetch('/api/personal-site/import-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, fileName: file.name })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '解析文件失败');
      setNotice(result.message || '百度统计报表解析导入成功！');
      loadOverview();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setNotice('文章链接已复制到剪贴板');
  };

  // Filtered Published Articles
  const filteredArticles = useMemo(() => {
    if (!data?.articles) return [];
    return data.articles.filter(art => {
      const matchCat = selectedCategory === 'all' || art.app === selectedCategory || (selectedCategory === 'dev' && (!art.app || art.app === 'dev'));
      const matchSearch = !search || art.title.toLowerCase().includes(search.toLowerCase()) || (art.tag || '').includes(search);
      return matchCat && matchSearch;
    });
  }, [data?.articles, selectedCategory, search]);

  // Unpublished Contents: Filtered by Platform and Title, Sorted by Creation Time Descending
  const filteredUnpublished = useMemo(() => {
    return unpublished.filter(item => {
      const matchPlatform = contentPlatform === 'all' || (item.channel || '').toLowerCase().includes(contentPlatform.toLowerCase());
      const matchTitle = !contentSearch || (item.title || '').toLowerCase().includes(contentSearch.toLowerCase());
      return matchPlatform && matchTitle;
    });
  }, [unpublished, contentPlatform, contentSearch]);

  const platformOptions = useMemo(() => {
    const channels = new Set<string>();
    unpublished.forEach(u => {
      if (u.channel) channels.add(u.channel);
    });
    return Array.from(channels);
  }, [unpublished]);

  if (loading) {
    return (
      <div className="personal-site-workspace" style={{ padding: '40px 0', textAlign: 'center' }}>
        <RefreshCw className="spinning" size={24} style={{ margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--muted)' }}>正在加载个人主页运营数据与文章...</p>
      </div>
    );
  }

  const currentSavedStats = data?.stats;
  const activeMetric: MetricPeriod | null = currentSavedStats ? (currentSavedStats[period] || null) : null;

  return (
    <div className="personal-site-workspace">
      {notice && (
        <div className="banner success-banner" style={{ marginBottom: 16 }}>
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="banner error-banner" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      {/* Top Banner / Hero Bar */}
      <div className="personal-site-header-card">
        <div className="personal-site-header-info">
          <div className="site-badge">
            <Globe size={16} />
            <span>{data?.baiduConfig?.siteDomain ? `https://${data.baiduConfig.siteDomain}` : '个人作品站'}</span>
          </div>
          <h2>{data?.baiduConfig?.siteDomain || '作品主页'} · 运营与内容总览</h2>
        </div>
        <div className="personal-site-header-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setRefreshing(true);
              loadOverview(true);
            }}
            disabled={refreshing}
            title="刷新数据并同步百度统计"
          >
            <RefreshCw size={15} className={refreshing ? 'spinning' : ''} />
            <span>{refreshing ? '正在刷新…' : '刷新'}</span>
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setShowBaiduModal(true)}
            title="百度统计配置"
          >
            <Settings size={15} />
            <span>百度统计 API 配置</span>
          </button>
          <a
            href={data?.baiduConfig?.siteDomain ? `https://${data.baiduConfig.siteDomain}/` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="button secondary"
          >
            <ExternalLink size={15} />
            <span>访问官网</span>
          </a>
          <button
            type="button"
            className="button"
            style={{ background: '#647b5f', borderColor: '#647b5f', color: '#fff' }}
            onClick={openAddModal}
          >
            <Plus size={16} />
            <span>添加文章至个人主页</span>
          </button>
        </div>
      </div>

      {/* Baidu Tongji Metrics Cards */}
      <div className="section-title-strip" style={{ marginTop: 24, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BarChart3 size={18} style={{ color: '#647b5f' }} />
          <h3 style={{ margin: 0, fontSize: 16 }}>百度统计实时指标</h3>
          {data?.baiduConfig?.hasToken ? (
            <span className="badge badge-success" style={{ fontSize: 11 }}>API 自动同步已接入</span>
          ) : activeMetric ? (
            <span className="badge badge-success" style={{ fontSize: 11 }}>已录入真实数据</span>
          ) : (
            <span className="badge badge-neutral" style={{ fontSize: 11 }}>待授权 OpenAPI</span>
          )}
          {data?.baiduConfig?.lastSyncedAt && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              最近同步: {new Date(data.baiduConfig.lastSyncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Time Range Filter Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[
          ['today', '今天'],
          ['yesterday', '昨天'],
          ['last7days', '最近7天'],
          ['last30days', '最近30天']
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key as typeof period)}
            style={{
              padding: '6px 16px',
              fontSize: 13,
              borderRadius: 6,
              border: period === key ? '1px solid #1e80ff' : '1px solid var(--line)',
              background: period === key ? '#1e80ff' : 'var(--paper)',
              color: period === key ? '#ffffff' : 'var(--ink)',
              cursor: 'pointer',
              fontWeight: period === key ? 600 : 400,
              transition: 'all 0.15s ease'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeMetric ? (
        <div className="personal-stats-grid">
          <div className="stat-card">
            <div className="stat-label">浏览量 (PV)</div>
            <div className="stat-number">{activeMetric.pv}</div>
            <div className="stat-hint">
              <Sparkles size={13} />
              <span>{period === 'today' && activeMetric.estimatedPv ? `预计今日: ${activeMetric.estimatedPv} PV` : '已结转'}</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">独立 IP 数</div>
            <div className="stat-number">{activeMetric.ip}</div>
            <div className="stat-hint">
              <Eye size={13} />
              <span>访客数 (UV): <strong>{activeMetric.uv}</strong></span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">跳出率</div>
            <div className="stat-number">{activeMetric.bounceRate || '--'}</div>
            <div className="stat-hint">
              <span>{period === 'today' ? '实时统计中' : '阶段汇总'}</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">平均访问时长</div>
            <div className="stat-number" style={{ fontSize: 24 }}>{activeMetric.avgDuration || '--'}</div>
            <div className="stat-hint">
              <Clock size={13} />
              <span>停留时长</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '28px 20px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
          <AlertCircle size={28} style={{ color: '#647b5f', margin: '0 auto 10px' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
            暂无【{period === 'today' ? '今天' : period === 'yesterday' ? '昨天' : period === 'last7days' ? '最近7天' : '最近30天'}】的真实统计数据
          </div>
          <p style={{ margin: '0 auto 16px', fontSize: 13, color: 'var(--muted)', maxWidth: 480 }}>
            系统已移除所有假数据。你可以点击右上角的<strong>「录入 / 校准真实数据」</strong>直接填入百度后台看到的真实数值，或者点击<strong>「导入百度统计报表」</strong>上传官方下载文件。
          </p>
          <div style={{ display: 'inline-flex', gap: 10 }}>
            <button
              type="button"
              className="button"
              style={{ background: '#647b5f', borderColor: '#647b5f', color: '#fff' }}
              onClick={() => {
                if (period === 'today') {
                  setEditPv('35');
                  setEditUv('23');
                  setEditIp('20');
                  setEditBounce('85.71%');
                  setEditDuration('00:02:03');
                }
                setShowEditStatsModal(true);
              }}
            >
              <Pencil size={14} />
              <span>录入当前后台数据</span>
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />
              <span>导入后台报表文件</span>
            </button>
          </div>
        </div>
      )}

      {/* Articles Management Section */}
      <div className="articles-section-container" style={{ marginTop: 32 }}>
        <div className="section-header-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookOpen size={18} style={{ color: '#647b5f' }} />
            <h3 style={{ margin: 0, fontSize: 17 }}>文章列表</h3>
            <span className="badge" style={{ fontSize: 12 }}>共 {data?.totalArticles ?? 0} 篇手记</span>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="search-input-shell" style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} />
              <input
                type="text"
                placeholder="搜索文章标题..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, height: 34, fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)', width: 180 }}
              />
            </div>

            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              style={{ height: 34, fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)', padding: '0 10px' }}
            >
              <option value="all">全部分类</option>
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table of Articles */}
        <div className="articles-table-wrapper" style={{ marginTop: 14, overflowX: 'auto' }}>
          <table className="personal-articles-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>
                <th style={{ padding: '12px 14px' }}>文章标题与导读</th>
                <th style={{ padding: '12px 10px', width: 130 }}>分类</th>
                <th style={{ padding: '12px 10px', width: 110 }}>发布日期</th>
                <th style={{ padding: '12px 10px', width: 90, textAlign: 'right' }}>真实阅读 (PV)</th>
                <th style={{ padding: '12px 10px', width: 90, textAlign: 'right' }}>真实访客 (UV)</th>
                <th style={{ padding: '12px 14px', width: 140, textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                    没有找到符合条件的手记文章
                  </td>
                </tr>
              ) : (
                filteredArticles.map(art => (
                  <tr key={art.slug} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '14px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                        {art.title}
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {art.desc}
                      </div>
                    </td>
                    <td style={{ padding: '14px 10px' }}>
                      <span className="article-tag-pill">{art.appName || art.tag || '开发手记'}</span>
                    </td>
                    <td style={{ padding: '14px 10px', color: 'var(--muted)' }}>
                      {art.date}
                    </td>
                    <td style={{ padding: '14px 10px', textAlign: 'right', fontWeight: 600 }}>
                      {art.views ?? '—'}
                    </td>
                    <td style={{ padding: '14px 10px', textAlign: 'right', color: 'var(--muted)' }}>
                      {art.visitors ?? '—'}
                    </td>
                    <td style={{ padding: '14px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <a
                          href={art.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="icon-button"
                          title="访问个人站文章"
                          style={{ padding: 6 }}
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => copyUrl(art.url)}
                          title="复制文章链接"
                          style={{ padding: 6 }}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          style={{ color: '#ef4444', padding: 6 }}
                          disabled={deletingSlug === art.slug}
                          onClick={() => handleDeleteArticle(art)}
                          title="从本地站点移除此文章"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden file input for report import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".csv,.txt,.xlsx,.xls"
        style={{ display: 'none' }}
      />

      {/* Modal: Edit / Input Real Stats */}
      {showEditStatsModal && (
        <div className="modal-backdrop" onClick={() => setShowEditStatsModal(false)}>
          <div
            className="modal-box"
            style={{ maxWidth: 540, width: '90%' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Pencil size={18} style={{ color: '#647b5f' }} />
                <h3 style={{ margin: 0, fontSize: 17 }}>录入【{period === 'today' ? '今日' : period === 'yesterday' ? '昨日' : period === 'last7days' ? '最近7天' : '最近30天'}】真实统计数据</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowEditStatsModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStats} style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>请直接填入百度统计后台对应的真实指标：</span>
                {period === 'today' && (
                  <button
                    type="button"
                    style={{ fontSize: 11, color: '#1e80ff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => {
                      setEditPv('35');
                      setEditUv('23');
                      setEditIp('20');
                      setEditBounce('85.71%');
                      setEditDuration('00:02:03');
                      setEditEstPv('54');
                      setEditEstUv('33');
                      setEditEstIp('29');
                    }}
                  >
                    填入当前截图真实数据 (35/23/20)
                  </button>
                )}
                {period === 'yesterday' && (
                  <button
                    type="button"
                    style={{ fontSize: 11, color: '#1e80ff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => {
                      setEditPv('27');
                      setEditUv('18');
                      setEditIp('18');
                      setEditBounce('77.78%');
                      setEditDuration('00:01:43');
                    }}
                  >
                    填入昨日截图真实数据 (27/18/18)
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    浏览量 (PV)
                  </label>
                  <input
                    type="number"
                    required
                    value={editPv}
                    onChange={e => setEditPv(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    访客数 (UV)
                  </label>
                  <input
                    type="number"
                    required
                    value={editUv}
                    onChange={e => setEditUv(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    IP 数
                  </label>
                  <input
                    type="number"
                    required
                    value={editIp}
                    onChange={e => setEditIp(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    跳出率 (如 85.71%)
                  </label>
                  <input
                    type="text"
                    required
                    value={editBounce}
                    onChange={e => setEditBounce(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    平均访问时长 (如 00:02:03)
                  </label>
                  <input
                    type="text"
                    required
                    value={editDuration}
                    onChange={e => setEditDuration(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)' }}
                  />
                </div>
              </div>

              {period === 'today' && (
                <div style={{ padding: '12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--muted)' }}>
                    预计今日数据 (可选)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--muted)' }}>预计 PV</label>
                      <input
                        type="number"
                        value={editEstPv}
                        onChange={e => setEditEstPv(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--muted)' }}>预计 UV</label>
                      <input
                        type="number"
                        value={editEstUv}
                        onChange={e => setEditEstUv(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--muted)' }}>预计 IP</label>
                      <input
                        type="number"
                        value={editEstIp}
                        onChange={e => setEditEstIp(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="button secondary" onClick={() => setShowEditStatsModal(false)}>
                  取消
                </button>
                <button
                  type="submit"
                  className="button"
                  disabled={savingStats}
                  style={{ background: '#647b5f', borderColor: '#647b5f', color: '#fff' }}
                >
                  {savingStats ? '保存中...' : '保存真实数据'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Article from Growmory Marketing Contents */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div
            className="modal-box personal-add-modal"
            style={{ maxWidth: 920, width: '92%', maxHeight: '88vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} style={{ color: '#647b5f' }} />
                <h3 style={{ margin: 0, fontSize: 18 }}>添加文章至独立作品站</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px 0' }}>
              <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 13 }}>
                从营销内容中选择文章同步至独立作品站。正文保留富文本格式，封面和关联图片会一并同步。
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1.15fr', gap: 20 }}>
                {/* Left: Select Content with Search & Platform Filter */}
                <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: 'var(--surface)', display: 'flex', flexDirection: 'column', maxHeight: 500 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                      可同步的营销文章 ({filteredUnpublished.length})
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>按创建时间倒序</span>
                  </div>

                  {/* Filters bar */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Search size={13} style={{ position: 'absolute', left: 8, top: 9, color: 'var(--muted)' }} />
                      <input
                        type="text"
                        placeholder="搜索标题..."
                        value={contentSearch}
                        onChange={e => setContentSearch(e.target.value)}
                        style={{ width: '100%', height: 30, fontSize: 12, paddingLeft: 26, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)' }}
                      />
                    </div>
                    <select
                      value={contentPlatform}
                      onChange={e => setContentPlatform(e.target.value)}
                      style={{ height: 30, fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)', padding: '0 6px' }}
                    >
                      <option value="all">全部平台</option>
                      {platformOptions.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  {/* Content Cards List */}
                  <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
                    {loadingUnpublished ? (
                      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                        <RefreshCw className="spinning" size={18} style={{ margin: '0 auto 8px' }} />
                        <span>正在检索内容...</span>
                      </div>
                    ) : filteredUnpublished.length === 0 ? (
                      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                        没有找到匹配的营销文章。
                      </div>
                    ) : (
                      filteredUnpublished.map(item => {
                        const isSelected = selectedContent?.id === item.id;
                        const hasCover = !!(item.coverAssetId || (item.assetIds && item.assetIds.length > 0));
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleSelectContent(item)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: isSelected ? '2px solid #647b5f' : '1px solid var(--line)',
                              background: isSelected ? 'rgba(100,123,95,0.08)' : 'var(--paper)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', marginBottom: 4 }}>
                              {item.title}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ background: 'var(--line)', padding: '2px 6px', borderRadius: 4 }}>
                                  {item.channel || '营销库'}
                                </span>
                                {hasCover && (
                                  <span style={{ color: '#647b5f', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <ImageIcon size={11} /> 含封面
                                  </span>
                                )}
                              </div>
                              <span>{item.createdAt ? item.createdAt.slice(0, 10) : item.date || '草稿'}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right: Review & Publish Form */}
                <form onSubmit={handleSubmitPublish} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      文章标题 <span style={{ color: 'red' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formTitle}
                      onChange={e => setFormTitle(e.target.value)}
                      placeholder="请先从左侧选择营销文章"
                      style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        URL 标识 (Slug) <span style={{ color: 'red' }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formSlug}
                        onChange={e => setFormSlug(e.target.value)}
                        placeholder="例如: organize-photos"
                        style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        文章分类 <span style={{ color: 'red' }}>*</span>
                      </label>
                      <select
                        value={formCategory}
                        onChange={e => setFormCategory(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)' }}
                      >
                        {CATEGORIES.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.desc})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Cover Status Notification */}
                  <div style={{ padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--line)', fontSize: 12 }}>
                    {selectedContent?.coverAssetId || (selectedContent?.assetIds && selectedContent.assetIds.length > 0) ? (
                      <div style={{ color: '#647b5f', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={14} />
                        <span>已检测到营销内容配图，封面优先展示，关联图片会进入缩略图列表。</span>
                      </div>
                    ) : (
                      <div style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ImageIcon size={14} />
                        <span>没有单独关联的图片；正文中已有的插图仍会保留。</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      导读摘要 (一句话简介)
                    </label>
                    <textarea
                      rows={3}
                      value={formDesc}
                      onChange={e => setFormDesc(e.target.value)}
                      placeholder="展示在列表中的导读摘要..."
                      style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)' }}
                    />
                  </div>

                  {publishError && <p role="alert" className="banner error-banner">{publishError}</p>}
                  <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setShowAddModal(false)}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="button"
                      disabled={submitting || !selectedContent || !formSlug || !formTitle}
                      style={{ background: '#647b5f', borderColor: '#647b5f', color: '#fff' }}
                    >
                      {submitting ? '正在处理…' : data?.canDeploy ? `发布到 ${data?.baiduConfig?.siteDomain || '线上站点'}` : '同步并构建本地站点'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Baidu Tongji OpenAPI Config & Authorization */}
      {showBaiduModal && (
        <div className="modal-backdrop" onClick={() => setShowBaiduModal(false)}>
          <div
            className="modal-box"
            style={{ maxWidth: 580, width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Key size={18} style={{ color: '#647b5f' }} />
                <h3 style={{ margin: 0, fontSize: 17 }}>百度统计 OpenAPI 接入</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowBaiduModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Status Banner */}
              <div style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: data?.baiduConfig?.hasToken ? 'rgba(100, 123, 95, 0.08)' : 'var(--surface)',
                border: data?.baiduConfig?.hasToken ? '1px solid rgba(100, 123, 95, 0.3)' : '1px solid var(--line)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: data?.baiduConfig?.hasToken ? '#2e5a27' : 'var(--ink)' }}>
                    {data?.baiduConfig?.hasToken ? '✓ 百度统计 OpenAPI 已成功连接' : '⚪ 尚未完成百度账号授权'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {data?.baiduConfig?.hasToken
                      ? `绑定站点: ${data.baiduConfig.siteDomain || '独立站点'} (Site ID: ${data.baiduConfig.numericSiteId || data.baiduConfig.siteId}) · 自动刷新已激活`
                      : '根据官方文档规范，通过授权码 (Code) 换取 Access Token 与 10 年长期 Refresh Token。'}
                  </div>
                </div>
                {data?.baiduConfig?.hasToken && (
                  <button
                    type="button"
                    className="button"
                    disabled={syncingBaidu}
                    onClick={async () => {
                      await handleSyncBaidu();
                    }}
                    style={{ background: '#647b5f', borderColor: '#647b5f', color: '#fff', fontSize: 12, padding: '4px 10px', whiteSpace: 'nowrap' }}
                  >
                    <RefreshCw size={12} className={syncingBaidu ? 'spin' : ''} />
                    <span>立即刷新</span>
                  </button>
                )}
              </div>

              {/* Step 1: Open Authorize URL */}
              <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: '50%', background: '#647b5f', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 'bold' }}>1</span>
                  <span>第一步：在百度获取授权码 (Code)</span>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  点击下方按钮，将在新窗口打开百度账号授权页。使用管理该站点统计的百度账号登录并确认授权，百度将显示一串授权码 (Code)：
                </p>
                <a
                  href={`http://openapi.baidu.com/oauth/2.0/authorize?response_type=code&client_id=${encodeURIComponent(baiduApiKey.trim())}&redirect_uri=oob&scope=basic&display=popup`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 14px' }}
                >
                  <ExternalLink size={13} />
                  <span>打开百度账号授权页获取 Code</span>
                </a>
              </div>

              {/* Step 2: Exchange Code */}
              <form onSubmit={handleExchangeCode} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: '50%', background: '#647b5f', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 'bold' }}>2</span>
                  <span>第二步：粘贴授权码并完成绑定</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input
                    type="text"
                    required
                    placeholder="粘贴从百度授权页获得的 Code (例如 9b2a...)"
                    value={baiduCode}
                    onChange={e => setBaiduCode(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)' }}
                  />
                  <button
                    type="submit"
                    className="button"
                    disabled={exchangingCode || !baiduCode.trim()}
                    style={{ background: '#647b5f', borderColor: '#647b5f', color: '#fff', whiteSpace: 'nowrap' }}
                  >
                    {exchangingCode ? '正在兑换并同步...' : '兑换 Token 并同步'}
                  </button>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                  服务端将自动请求百度换取 Token，获取站点 ID 并立即拉取今日/昨日/近7天/近30天指标与手记阅读量。
                </p>
              </form>

              {/* Developer Credentials Details (API Key / Secret Key) */}
              <details style={{ fontSize: 12, border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--ink)' }}>
                  开发者凭据设置 (API Key / Secret Key)
                </summary>
                <form onSubmit={handleSaveBaidu} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                      API Key (Client ID)
                    </label>
                    <input
                      type="text"
                      value={baiduApiKey}
                      onChange={e => setBaiduApiKey(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                      Secret Key (Client Secret)
                    </label>
                    <input
                      type="password"
                      value={baiduSecretKey}
                      onChange={e => setBaiduSecretKey(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                      百度统计脚本 ID
                    </label>
                    <input
                      type="text"
                      value={baiduSiteId}
                      onChange={e => setBaiduSiteId(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                      手动指定 Access Token (可选，有 Code 兑换时不需填写)
                    </label>
                    <input
                      type="password"
                      value={baiduToken}
                      onChange={e => setBaiduToken(e.target.value)}
                      placeholder="留空则使用上述 Code 换取到的 Token"
                      style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      type="submit"
                      disabled={savingBaidu}
                      className="button secondary"
                      style={{ fontSize: 11, padding: '4px 12px' }}
                    >
                      {savingBaidu ? '保存中...' : '保存凭据'}
                    </button>
                  </div>
                </form>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
