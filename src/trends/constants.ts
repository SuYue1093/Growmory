import type { Metric } from './types';
import { t } from '../i18n.ts';

export const METRIC_LABELS: Record<Metric, string> = new Proxy({
  impressions: '展示次数',
  pageViews: '查看次数',
  firstDownloads: '首次下载',
  redownloads: '重新下载',
}, {
  get(target, prop: Metric) {
    if (prop in target) {
      return t(target[prop]);
    }
    return (target as any)[prop];
  }
});

export const METRIC_DESCRIPTIONS: Record<Metric, string> = new Proxy({
  impressions: 'App 图标在搜索结果、榜单或推荐位被用户看到的次数（不含产品页查看）',
  pageViews: '用户点击进入并查看 App Store 产品详情页的次数',
  firstDownloads: 'Apple ID 首次获取并下载此 App 的次数（新增用户口径）',
  redownloads: '曾经下载过此 App 的 Apple ID 重新下载的次数（老用户召回）',
}, {
  get(target, prop: Metric) {
    if (prop in target) {
      return t(target[prop]);
    }
    return (target as any)[prop];
  }
});

export const METRIC_COLORS: Record<Metric, { primary: string; light: string; border: string }> = {
  impressions: { primary: '#6366f1', light: '#eef2ff', border: '#c7d2fe' },
  pageViews: { primary: '#0ea5e9', light: '#f0f9ff', border: '#bae6fd' },
  firstDownloads: { primary: '#2563eb', light: '#eff6ff', border: '#bfdbfe' },
  redownloads: { primary: '#8b5cf6', light: '#f5f3ff', border: '#ddd6fe' },
};

export const SOURCE_INFO: Record<string, { label: string; labelEn: string; desc: string; descEn: string; color: string }> = {
  'App Store search': {
    label: 'App Store 搜索',
    labelEn: 'App Store Search',
    desc: '通过 App Store 搜索结果发现，可能包含搜索结果广告',
    descEn: 'Discovered through App Store search results, which may include Apple Search Ads',
    color: '#2563eb',
  },
  'App Store browse': {
    label: 'App Store 浏览',
    labelEn: 'App Store Browse',
    desc: '用户在 Today、各类排行榜或分类标签浏览时发现',
    descEn: 'Discovered while users browse Today, charts, or category tabs',
    color: '#0ea5e9',
  },
  'App referrer': {
    label: 'App 引荐',
    labelEn: 'App Referrer',
    desc: '从其他 App 内的链接、推广或分享跳转至 App Store',
    descEn: 'Navigated to the App Store from links, promotions, or shares in other apps',
    color: '#10b981',
  },
  'Web referrer': {
    label: '网页引荐',
    labelEn: 'Web Referrer',
    desc: '从 Safari 或外部网页链接点击跳转至 App Store',
    descEn: 'Navigated to the App Store from Safari or external web links',
    color: '#f59e0b',
  },
  'Unavailable': {
    label: '来源不可用',
    labelEn: 'Unavailable',
    desc: 'Apple 未提供来源分类，可能包括兑换码或设备管理分发',
    descEn: 'Apple does not provide source attribution; may include promo codes or MDM distribution',
    color: '#64748b',
  },
  'Apple Search Ads': {
    label: 'Apple Search Ads',
    labelEn: 'Apple Search Ads',
    desc: '来自 Apple Search Ads 搜索广告投放',
    descEn: 'Attributed to Apple Search Ads campaigns',
    color: '#3b82f6',
  },
  'Institutional Purchase': {
    label: '机构购买',
    labelEn: 'Institutional Purchase',
    desc: '由企业或教育机构批量购买与分发',
    descEn: 'Volume purchases and distribution by business or educational institutions',
    color: '#8b5cf6',
  },
  'Custom Product Page': {
    label: '自定产品页面',
    labelEn: 'Custom Product Page',
    desc: '通过自定产品页面深层链接访问并下载',
    descEn: 'Accessed and downloaded via custom product page deep links',
    color: '#06b6d4',
  },
  'App Clip': {
    label: '轻 App',
    labelEn: 'App Clip',
    desc: '通过轻 App 体验引导至完整版 App 下载',
    descEn: 'Guided from an App Clip experience to full app download',
    color: '#ec4899',
  },
  '未知': {
    label: '未知来源',
    labelEn: 'Unknown Source',
    desc: '未识别的来源分类',
    descEn: 'Unidentified source category',
    color: '#94a3b8',
  },
  'Unknown': {
    label: '未知来源',
    labelEn: 'Unknown Source',
    desc: '未识别的来源分类',
    descEn: 'Unidentified source category',
    color: '#94a3b8',
  },
};

export function getSourceLabel(source: string): string {
  if (source === 'all') return t('全部渠道', 'All Channels');
  const info = SOURCE_INFO[source];
  if (info) return t(info.label, info.labelEn);
  return t(source);
}

export function getSourceDesc(source: string): string {
  const info = SOURCE_INFO[source];
  if (!info) return '';
  return t(info.desc, info.descEn);
}

export function getSourceColor(source: string): string {
  return SOURCE_INFO[source]?.color || '#94a3b8';
}

const TERRITORY_MAP: Record<string, { name: string; flag: string }> = {
  CN: { name: '中国大陆', flag: '🇨🇳' },
  CHN: { name: '中国大陆', flag: '🇨🇳' },
  US: { name: '美国', flag: '🇺🇸' },
  USA: { name: '美国', flag: '🇺🇸' },
  JP: { name: '日本', flag: '🇯🇵' },
  JPN: { name: '日本', flag: '🇯🇵' },
  GB: { name: '英国', flag: '🇬🇧' },
  GBR: { name: '英国', flag: '🇬🇧' },
  DE: { name: '德国', flag: '🇩🇪' },
  DEU: { name: '德国', flag: '🇩🇪' },
  FR: { name: '法国', flag: '🇫🇷' },
  FRA: { name: '法国', flag: '🇫🇷' },
  TW: { name: '中国台湾', flag: '🇹🇼' },
  TWN: { name: '中国台湾', flag: '🇹🇼' },
  HK: { name: '中国香港', flag: '🇭🇰' },
  HKG: { name: '中国香港', flag: '🇭🇰' },
  KR: { name: '韩国', flag: '🇰🇷' },
  KOR: { name: '韩国', flag: '🇰🇷' },
  CA: { name: '加拿大', flag: '🇨🇦' },
  CAN: { name: '加拿大', flag: '🇨🇦' },
  AU: { name: '澳大利亚', flag: '🇦🇺' },
  AUS: { name: '澳大利亚', flag: '🇦🇺' },
  SG: { name: '新加坡', flag: '🇸🇬' },
  SGP: { name: '新加坡', flag: '🇸🇬' },
  RU: { name: '俄罗斯', flag: '🇷🇺' },
  RUS: { name: '俄罗斯', flag: '🇷🇺' },
  BR: { name: '巴西', flag: '🇧🇷' },
  BRA: { name: '巴西', flag: '🇧🇷' },
  IN: { name: '印度', flag: '🇮🇳' },
  IND: { name: '印度', flag: '🇮🇳' },
  IT: { name: '意大利', flag: '🇮🇹' },
  ITA: { name: '意大利', flag: '🇮🇹' },
  ES: { name: '西班牙', flag: '🇪🇸' },
  ESP: { name: '西班牙', flag: '🇪🇸' },
  NL: { name: '荷兰', flag: '🇳🇱' },
  NLD: { name: '荷兰', flag: '🇳🇱' },
  SE: { name: '瑞典', flag: '🇸🇪' },
  SWE: { name: '瑞典', flag: '🇸🇪' },
  CH: { name: '瑞士', flag: '🇨🇭' },
  CHE: { name: '瑞士', flag: '🇨🇭' },
  TH: { name: '泰国', flag: '🇹🇭' },
  THA: { name: '泰国', flag: '🇹🇭' },
  ID: { name: '印度尼西亚', flag: '🇮🇩' },
  IDN: { name: '印度尼西亚', flag: '🇮🇩' },
  MY: { name: '马来西亚', flag: '🇲🇾' },
  MYS: { name: '马来西亚', flag: '🇲🇾' },
  VN: { name: '越南', flag: '🇻🇳' },
  VNM: { name: '越南', flag: '🇻🇳' },
  PH: { name: '菲律宾', flag: '🇵🇭' },
  PHL: { name: '菲律宾', flag: '🇵🇭' },
  MX: { name: '墨西哥', flag: '🇲🇽' },
  MEX: { name: '墨西哥', flag: '🇲🇽' },
  RS: { name: '塞尔维亚', flag: '🇷🇸' },
  SRB: { name: '塞尔维亚', flag: '🇷🇸' },
  PT: { name: '葡萄牙', flag: '🇵🇹' },
  PRT: { name: '葡萄牙', flag: '🇵🇹' },
  NZ: { name: '新西兰', flag: '🇳🇿' },
  NZL: { name: '新西兰', flag: '🇳🇿' },
};

export function getTerritoryInfo(code: string): { name: string; flag: string } {
  if (code === 'all') return { name: t('全部国家/地区', 'All Countries/Territories'), flag: '🌐' };
  const upper = (code || '').toUpperCase();
  const info = TERRITORY_MAP[upper];
  if (!info) return { name: code, flag: '🏳️' };
  return { name: t(info.name), flag: info.flag };
}

export const dateOffset = (value: string, offset: number) =>
  new Date(Date.parse(value + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);

export const yesterday = () =>
  new Date(Date.now() - 86400000).toISOString().slice(0, 10);

export function findLatestDataDate(insightsList: ({ trends?: { coverage?: { downloads?: string[]; engagement?: string[] }; revenue?: { coverage?: string[]; rows?: { date: string }[] }; rows?: { date: string }[] } } | null | undefined)[]): string {
  let maxDate = '';
  for (const val of insightsList) {
    if (!val || !val.trends) continue;
    const cov = val.trends.coverage;
    if (cov?.downloads) {
      for (const d of cov.downloads) {
        if (d > maxDate) maxDate = d;
      }
    }
    if (cov?.engagement) {
      for (const d of cov.engagement) {
        if (d > maxDate) maxDate = d;
      }
    }
    const revCov = val.trends.revenue?.coverage;
    if (revCov) {
      for (const d of revCov) {
        if (d > maxDate) maxDate = d;
      }
    }
    if (val.trends.rows) {
      for (const r of val.trends.rows) {
        if (r.date && r.date > maxDate) maxDate = r.date;
      }
    }
  }
  return maxDate || yesterday();
}

export function formatShortDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}`;
  }
  return dateStr;
}

export function formatPercent(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

export function getRecent7Days(baseDate?: string): string[] {
  const base = baseDate || yesterday();
  return Array.from({ length: 7 }, (_, i) => dateOffset(base, i - 6));
}

