import { useState } from 'react';
import { Search, Copy, Check, Star, BarChart2 } from 'lucide-react';
import type { PublicAppItem } from './app-store-fast-import';
import { useI18n } from './i18n.ts';
import { formatDisplayPrice } from './currency';

export function AsoKeywordResearch({ notify }: { notify: (msg: string) => void }) {
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const [country, setCountry] = useState('cn');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [copiedTerm, setCopiedTerm] = useState('');
  const [rankingApps, setRankingApps] = useState<PublicAppItem[]>([]);
  const [activeKeyword, setActiveKeyword] = useState('');
  const [appDetails, setAppDetails] = useState<{
    app: PublicAppItem;
    ratings?: { ratings: number; histogram: Record<string, number> };
    similar?: PublicAppItem[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function handleExplore(seedTerm?: string) {
    const target = (seedTerm || term).trim();
    if (!target) return;
    setBusy(true);
    setRankingApps([]);
    setActiveKeyword(target);

    try {
      // 1. Fetch suggestions
      const suggestPromise = fetch('/api/app-store/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: target, country }),
      }).then(r => r.json()).catch(() => []);

      // 2. Fetch search rankings
      const searchPromise = fetch('/api/app-store/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: target, country, num: 10 }),
      }).then(r => r.json()).catch(() => []);

      const [suggestList, searchList] = await Promise.all([suggestPromise, searchPromise]);

      if (Array.isArray(suggestList)) setSuggestions(suggestList);
      if (Array.isArray(searchList)) setRankingApps(searchList);
    } catch {
      notify(t('检索失败，请稍后重试', 'Search failed, please try again later'));
    } finally {
      setBusy(false);
    }
  }

  function copyWord(word: string) {
    navigator.clipboard.writeText(word);
    setCopiedTerm(word);
    notify(t(`已复制关键词「${word}」`, `Copied keyword "${word}"`));
    setTimeout(() => setCopiedTerm(''), 2000);
  }

  async function inspectApp(app: PublicAppItem) {
    setDetailLoading(true);
    setAppDetails({ app });

    try {
      const [ratingsRes, similarRes] = await Promise.all([
        fetch('/api/app-store/ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: String(app.id), country }),
        }).then(r => r.json()).catch(() => null),
        fetch('/api/app-store/similar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: String(app.id), country }),
        }).then(r => r.json()).catch(() => []),
      ]);

      setAppDetails({
        app,
        ratings: ratingsRes && !ratingsRes.error ? ratingsRes : undefined,
        similar: Array.isArray(similarRes) ? similarRes : [],
      });
    } catch {
      // ignore inspect error
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="aso-keyword-research" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section className="panel padded">
        <h2>{t('ASO 关键词探索与竞品榜单', 'ASO Keyword Exploration & Competitor Rankings')}</h2>
        <p className="body-copy">
          {t('直连苹果 App Store 官方搜索提示接口（MZSearchHints），实时挖掘用户真实搜索联想热词，并分析目标关键词下的 Top 竞品排名与口碑评分。', 'Connects directly to official App Store search hints (MZSearchHints) to discover trending search autocomplete keywords and examine top competitor rankings and ratings.')}
        </p>

        <form
          onSubmit={e => {
            e.preventDefault();
            void handleExplore();
          }}
          style={{ display: 'flex', gap: 10, marginTop: 14 }}
        >
          <input
            type="text"
            className="input-text"
            style={{ flex: 1 }}
            placeholder={t('输入核心种子词（如：习惯打卡、时间管理、记账、Notion、Todo）', 'Enter seed keyword (e.g. habit tracker, time management, notion, todo)')}
            value={term}
            onChange={e => setTerm(e.target.value)}
          />
          <select
            className="input-select"
            style={{ width: 120 }}
            value={country}
            onChange={e => setCountry(e.target.value)}
          >
            <option value="cn">{t('中国区 (CN)', 'China (CN)')}</option>
            <option value="us">{t('美国区 (US)', 'United States (US)')}</option>
            <option value="jp">{t('日本区 (JP)', 'Japan (JP)')}</option>
            <option value="gb">{t('英国区 (GB)', 'United Kingdom (GB)')}</option>
          </select>
          <button className="button primary" type="submit" disabled={busy || !term.trim()}>
            <Search size={15} /> {busy ? t('探索中…', 'Searching...') : t('探索关键词与排名', 'Explore Keywords & Rankings')}
          </button>
        </form>

        {/* Suggestions tags */}
        {suggestions.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>
                {t('苹果官方搜索联想词（点击词查看排名，点击复制可加入 ASO 词库）', 'App Store Autocomplete Suggestions (Click to inspect ranking, copy to add to ASO pool)')}
              </h4>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {suggestions.map(s => {
                const isSelected = activeKeyword === s;
                return (
                  <div
                    key={s}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: isSelected ? 'var(--color-primary-bg, #eff6ff)' : 'var(--bg-tag, #f1f5f9)',
                      border: isSelected ? '1px solid var(--color-primary, #3b82f6)' : '1px solid transparent',
                      borderRadius: 16,
                      padding: '3px 10px',
                      fontSize: 13,
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        color: isSelected ? 'var(--color-primary, #2563eb)' : 'inherit',
                        fontWeight: isSelected ? 600 : 400,
                      }}
                      onClick={() => {
                        setTerm(s);
                        void handleExplore(s);
                      }}
                      title={t('查看该词的 App Store 排名', 'View App Store ranking for this keyword')}
                    >
                      {s}
                    </button>
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0 0 0 6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        color: '#94a3b8',
                      }}
                      onClick={() => copyWord(s)}
                      title={t('复制关键词', 'Copy keyword')}
                    >
                      {copiedTerm === s ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Rankings Section */}
      {rankingApps.length > 0 && (
        <section className="panel padded">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>
              {t(`「${activeKeyword}」App Store 搜索排名 Top ${rankingApps.length}`, `"${activeKeyword}" App Store Top ${rankingApps.length} Rankings`)}
            </h3>
            <span className="fine-print">{t('国家/地区：', 'Country/Territory: ')}{country.toUpperCase()}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {rankingApps.map((app, index) => (
              <div
                key={app.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border-color, #e2e8f0)',
                  background: 'var(--bg-card, #ffffff)',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: index < 3 ? 'var(--color-primary, #2563eb)' : '#94a3b8',
                    color: '#ffffff',
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
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {app.title}
                  </div>
                  <div className="fine-print" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'nowrap' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', maxWidth: 140 }}>
                      {app.developer || t('未知开发者', 'Unknown Developer')}
                    </span>
                    {app.score != null && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#eab308', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <Star size={11} fill="#eab308" /> {app.score.toFixed(1)}
                      </span>
                    )}
                    <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {app.free ? t('免费', 'Free') : formatDisplayPrice(app.price, app.free, app.currency)}
                    </span>
                  </div>
                </div>
                <button
                  className="button secondary small"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() => void inspectApp(app)}
                  title={t('查看评分直方图与同类竞品', 'View rating histogram and similar apps')}
                >
                  <BarChart2 size={13} /> {t('口碑', 'Reputation')}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* App Insights Modal / Card */}
      {appDetails && (
        <div className="modal-backdrop" onClick={() => setAppDetails(null)}>
          <div
            className="modal-box"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 640 }}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img
                  src={appDetails.app.icon}
                  alt={appDetails.app.title}
                  style={{ width: 40, height: 40, borderRadius: 8 }}
                />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{appDetails.app.title}</h3>
                  <small style={{ color: 'var(--text-secondary, #64748b)' }}>{appDetails.app.developer}</small>
                </div>
              </div>
              <button className="icon-button" onClick={() => setAppDetails(null)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              {detailLoading ? (
                <p>{t('正在分析口碑与同类竞品…', 'Analyzing reputation and similar apps...')}</p>
              ) : (
                <>
                  {/* Rating Histogram */}
                  <h4>{t('评分分布（口碑直方图）', 'Rating Distribution (Histogram)')}</h4>
                  {(() => {
                    const histogram = appDetails.ratings?.histogram;
                    const totalRatings = histogram ? Object.values(histogram).reduce((a, b) => a + b, 0) : 0;
                    if (totalRatings > 0) {
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '12px 0 20px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 24, fontWeight: 700, color: '#eab308' }}>
                              {appDetails.app.score?.toFixed(1) || '4.0'}
                            </span>
                            <span className="fine-print">{t(`总计 ${totalRatings.toLocaleString()} 个有效星级评分`, `Total ${totalRatings.toLocaleString()} ratings`)}</span>
                          </div>
                          {[5, 4, 3, 2, 1].map(star => {
                            const count = histogram![String(star)] || 0;
                            const percent = Math.round((count / totalRatings) * 100);
                            return (
                              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                <span style={{ width: 32, display: 'flex', alignItems: 'center', gap: 2 }}>
                                  {star} <Star size={10} fill="#eab308" color="#eab308" />
                                </span>
                                <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{ width: `${percent}%`, height: '100%', background: '#3b82f6', borderRadius: 4 }} />
                                </div>
                                <span style={{ width: 60, textAlign: 'right', color: '#64748b' }}>
                                  {count.toLocaleString()} ({percent}%)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                    return (
                      <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', margin: '8px 0 16px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 20, fontWeight: 700, color: '#eab308' }}>
                            ★ {appDetails.app.score?.toFixed(1) || t('暂无评分', 'No rating')}
                          </span>
                          <span className="fine-print">
                            {appDetails.app.reviews ? t(`当前商店综合评分，累计 ${appDetails.app.reviews.toLocaleString()} 条用户评价`, `Store rating with ${appDetails.app.reviews.toLocaleString()} total user reviews`) : t('该应用在当前商店未公开 1-5 星柱状分布', 'Star histogram not publicly disclosed in this storefront')}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Similar Apps */}
                  {appDetails.similar && appDetails.similar.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <h4>{t('相似应用（用户还购买了）', 'Similar Apps (Customers Also Bought)')}</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {appDetails.similar.slice(0, 8).map(sim => (
                          <div
                            key={sim.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 8px',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: 6,
                              fontSize: 12,
                            }}
                          >
                            <img src={sim.icon} alt={sim.title} style={{ width: 20, height: 20, borderRadius: 4 }} />
                            <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {sim.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="button secondary" onClick={() => setAppDetails(null)}>
                {t('关闭', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
