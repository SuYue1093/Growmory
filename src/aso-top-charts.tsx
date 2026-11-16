import { useState, useEffect } from 'react';
import { Trophy, RefreshCw } from 'lucide-react';
import type { PublicAppItem } from './app-store-fast-import';
import { useI18n } from './i18n.ts';
import { formatDisplayPrice } from './currency';

export function AsoTopCharts() {
  const { t } = useI18n();
  const [collection, setCollection] = useState('TOP_FREE_IOS');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('cn');
  const [busy, setBusy] = useState(false);
  const [apps, setApps] = useState<PublicAppItem[]>([]);
  const [error, setError] = useState('');

  async function loadCharts() {
    setBusy(true);
    setError('');
    try {
      const resp = await fetch('/api/app-store/top', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection,
          category: category || undefined,
          country,
          num: 20,
        }),
      });
      const list = await resp.json();
      if (!resp.ok) throw new Error(list.error || t('获取榜单失败', 'Failed to fetch charts'));
      if (Array.isArray(list)) setApps(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadCharts();
  }, [collection, category, country]);

  return (
    <div className="aso-top-charts" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="panel padded">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={18} color="#eab308" />
              <span>{t('品类榜单与竞品大盘观察', 'Category Charts & Market Watch')}</span>
            </h2>
            <p className="body-copy" style={{ margin: '4px 0 0 0' }}>
              {t('观察所属品类头部 App 的标题命名结构与词汇分布，汲取头部产品的 ASO 定位与转化经验。', 'Analyze top apps\' naming structure and keyword distribution to learn ASO positioning and conversion tactics.')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="input-select"
              value={collection}
              onChange={e => setCollection(e.target.value)}
              style={{ width: 130 }}
            >
              <option value="TOP_FREE_IOS">{t('免费榜 Top', 'Top Free')}</option>
              <option value="TOP_PAID_IOS">{t('付费榜 Top', 'Top Paid')}</option>
              <option value="TOP_GROSSING_IOS">{t('畅销榜 Top', 'Top Grossing')}</option>
            </select>

            <select
              className="input-select"
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{ width: 130 }}
            >
              <option value="">{t('全品类大盘', 'All Categories')}</option>
              <option value="PRODUCTIVITY">{t('效率 (Productivity)', 'Productivity')}</option>
              <option value="UTILITIES">{t('工具 (Utilities)', 'Utilities')}</option>
              <option value="FINANCE">{t('财务 (Finance)', 'Finance')}</option>
              <option value="BUSINESS">{t('商业 (Business)', 'Business')}</option>
              <option value="HEALTH_AND_FITNESS">{t('健康健美 (Health)', 'Health & Fitness')}</option>
              <option value="LIFESTYLE">{t('生活 (Lifestyle)', 'Lifestyle')}</option>
              <option value="EDUCATION">{t('教育 (Education)', 'Education')}</option>
            </select>

            <select
              className="input-select"
              value={country}
              onChange={e => setCountry(e.target.value)}
              style={{ width: 100 }}
            >
              <option value="cn">{t('中国区', 'China (CN)')}</option>
              <option value="us">{t('美国区', 'United States (US)')}</option>
              <option value="jp">{t('日本区', 'Japan (JP)')}</option>
              <option value="gb">{t('英国区', 'United Kingdom (GB)')}</option>
            </select>

            <button className="button secondary small" disabled={busy} onClick={() => void loadCharts()}>
              <RefreshCw size={13} className={busy ? 'spin' : ''} /> {t('刷新', 'Refresh')}
            </button>
          </div>
        </div>

        {error && <p role="alert" style={{ color: '#ef4444', margin: '12px 0 0 0' }}>{error}</p>}

        {/* Charts List */}
        <div style={{ marginTop: 16 }}>
          {busy && apps.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '30px 0' }}>{t('正在从 App Store 实时同步最新榜单…', 'Syncing charts from App Store...')}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
              {apps.map((app, index) => {
                const isTop3 = index < 3;
                return (
                  <div
                    key={app.id || index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 10,
                      borderRadius: 8,
                      border: '1px solid var(--border-color, #e2e8f0)',
                      background: 'var(--bg-card, #ffffff)',
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        background: isTop3
                          ? index === 0
                            ? '#eab308'
                            : index === 1
                              ? '#94a3b8'
                              : '#b45309'
                          : '#f1f5f9',
                        color: isTop3 ? '#ffffff' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </div>

                    <img
                      src={app.icon}
                      alt={app.title}
                      style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {app.title}
                      </div>
                      <div className="fine-print" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'nowrap' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
                          {app.developer || t('开发者', 'Developer')}
                        </span>
                        {app.genre && <span className="tag small" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{t(app.genre)}</span>}
                        <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {app.free ? t('免费', 'Free') : formatDisplayPrice(app.price, app.free, app.currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
