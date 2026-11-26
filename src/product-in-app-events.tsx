import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Product } from './types';
import { useI18n } from './i18n.ts';
import {
  Calendar,
  Plus,
  RefreshCw,
  Copy,
  Sparkles,
  X,
  Globe,
  Clock,
  Search,
  Eye,
  ChevronLeft,
  Upload,
  Check,
  Save,
  Send,
  Smartphone,
  Info,
  Trash2,
  Wand2,
  Image as ImageIcon,
} from 'lucide-react';
import {
  buildInAppEventsAgentPrompt,
  buildInAppEventImagePrompt,
} from './in-app-events-agent-prompt.ts';
import { getLocaleDisplayName } from './release-publication';

export type InAppEventBadge =
  | 'CHALLENGE'
  | 'COMPETITION'
  | 'LIVE_EVENT'
  | 'LIVE_STREAM'
  | 'MAJOR_UPDATE'
  | 'NEW_SEASON'
  | 'PREMIERE'
  | 'SPECIAL_EVENT';

export type InAppEventState =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'WAITING_FOR_REVIEW'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'PAST'
  | 'ARCHIVED';

export function getEventStateLabel(state: InAppEventState, t: (zh: string, en?: string) => string): string {
  switch (state) {
    case 'DRAFT': return t('草稿', 'Draft');
    case 'READY_FOR_REVIEW': return t('准备提交审核', 'Ready for Review');
    case 'WAITING_FOR_REVIEW': return t('等待审核', 'Waiting for Review');
    case 'IN_REVIEW': return t('审核中', 'In Review');
    case 'APPROVED': return t('已通过', 'Approved');
    case 'PUBLISHED': return t('生效中', 'Published');
    case 'PAST': return t('已结束', 'Past');
    case 'ARCHIVED': return t('已归档', 'Archived');
    default: return state;
  }
}

export type InAppEventPurpose =
  | 'APPROPRIATE_FOR_ALL_USERS'
  | 'ATTRACT_NEW_USERS'
  | 'KEEP_ACTIVE_USERS_INFORMED'
  | 'BRING_BACK_LAPSED_USERS';

export type InAppEventPurchaseRequirement =
  | 'NO_COST_ASSOCIATED'
  | 'IN_APP_PURCHASE'
  | 'SUBSCRIPTION'
  | 'IN_APP_PURCHASE_AND_SUBSCRIPTION';

export type InAppEventPriority = 'NORMAL' | 'HIGH';

export type InAppEventLocalization = {
  id: string;
  locale: string;
  name: string;
  shortDescription?: string;
  longDescription?: string;
  cardMediaUrl?: string;
  detailMediaUrl?: string;
};

export type TerritorySchedule = {
  territories?: string[];
  publishStart?: string;
  eventStart?: string;
  eventEnd?: string;
};

export type InAppEvent = {
  id: string;
  referenceName: string;
  badge: InAppEventBadge;
  eventState: InAppEventState;
  deepLink?: string;
  purchaseRequirement?: InAppEventPurchaseRequirement;
  purpose?: InAppEventPurpose;
  priority?: InAppEventPriority;
  primaryLocale: string;
  territorySchedules: TerritorySchedule[];
  archivedTerritorySchedules?: TerritorySchedule[];
  localizations: InAppEventLocalization[];
  createdAt?: string;
  updatedAt?: string;
};

const BADGE_OPTIONS: Array<{
  key: InAppEventBadge;
  labelZh: string;
  labelEn: string;
  descZh: string;
  descEn: string;
}> = [
  {
    key: 'CHALLENGE',
    labelZh: '挑战',
    labelEn: 'Challenge',
    descZh: '鼓励用户在活动结束前达成特定目标的活动（如健身挑战或通关任务）。',
    descEn: 'Activities that encourage users to achieve a goal before the event ends.',
  },
  {
    key: 'COMPETITION',
    labelZh: '比赛',
    labelEn: 'Competition',
    descZh: '用户相互竞争以获得最高排名或赢取奖励的活动（如锦标赛或排位赛）。',
    descEn: 'Activities where users compete for the highest ranking or to win rewards.',
  },
  {
    key: 'LIVE_EVENT',
    labelZh: '直播活动',
    labelEn: 'Live Event',
    descZh: '所有用户能够同时体验的实时活动（如体育比赛或直播音乐会）。',
    descEn: 'Real-time activities that all users can experience simultaneously.',
  },
  {
    key: 'MAJOR_UPDATE',
    labelZh: '重磅更新',
    labelEn: 'Major Update',
    descZh: '推出重要的新功能、内容或体验（超越小幅改进或修复漏洞）。',
    descEn: 'Introducing significant new features, content, or experiences.',
  },
  {
    key: 'NEW_SEASON',
    labelZh: '新一季',
    labelEn: 'New Season',
    descZh: '推出新内容、故事情节或媒体库（如新季度电视节目或全新战斗通行证）。',
    descEn: 'Introducing new content, storylines, or media libraries.',
  },
  {
    key: 'PREMIERE',
    labelZh: '首发',
    labelEn: 'Premiere',
    descZh: '首次发布或公开的媒体内容或其他内容（如新电影或音讯首发）。',
    descEn: 'First-time availability of media content or other experiences.',
  },
  {
    key: 'SPECIAL_EVENT',
    labelZh: '特别活动',
    labelEn: 'Special Event',
    descZh: '无法归类在其他徽章中的限时活动，通常涵盖多个活动或跨界协同合作。',
    descEn: 'Time-limited activities not covered by other badge categories.',
  },
];

const PURPOSE_OPTIONS: Array<{ key: InAppEventPurpose; labelZh: string; descZh: string; labelEn: string; descEn: string }> = [
  {
    key: 'APPROPRIATE_FOR_ALL_USERS',
    labelZh: '适合所有用户',
    descZh: '',
    labelEn: 'Appropriate for all users',
    descEn: '',
  },
  {
    key: 'ATTRACT_NEW_USERS',
    labelZh: '吸引新用户',
    descZh: '新用户是指从未下载过此 App 的用户。',
    labelEn: 'Attract new users',
    descEn: 'New users have never downloaded this app before.',
  },
  {
    key: 'KEEP_ACTIVE_USERS_INFORMED',
    labelZh: '随时通知活跃用户',
    descZh: '活跃用户是指已下载 App 且最近打开过 App 的用户。',
    labelEn: 'Keep active users informed',
    descEn: 'Active users have downloaded and recently opened this app.',
  },
  {
    key: 'BRING_BACK_LAPSED_USERS',
    labelZh: '召回流失用户',
    descZh: '流失用户是指已下载 App 但最近没有打开过 App 的用户。',
    labelEn: 'Bring back lapsed users',
    descEn: 'Lapsed users have downloaded this app but have not opened it recently.',
  },
];

const PURCHASE_OPTIONS: Array<{ key: InAppEventPurchaseRequirement; labelZh: string; labelEn: string }> = [
  { key: 'NO_COST_ASSOCIATED', labelZh: '不需要 App 内购买', labelEn: 'No cost associated' },
  { key: 'IN_APP_PURCHASE', labelZh: '需要 App 内购买', labelEn: 'In-app purchase required' },
  { key: 'SUBSCRIPTION', labelZh: '需要订阅', labelEn: 'Subscription required' },
  { key: 'IN_APP_PURCHASE_AND_SUBSCRIPTION', labelZh: '需要内购或订阅', labelEn: 'In-app purchase or subscription' },
];

function formatIsoDate(iso?: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

function toDatetimeLocal(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

/**
 * 将上传的图片自动按 Apple 官方要求的高清尺寸缩放和居中裁剪为标准 PNG：
 * - 活动卡片：1920 × 1080 (16:9)
 * - 活动详情：1080 × 1920 (9:16)
 */
export async function resizeImageToSpecs(
  source: File | Blob | string,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    let srcUrl = '';
    let isObjectUrl = false;

    if (typeof source === 'string') {
      srcUrl = source;
    } else {
      srcUrl = URL.createObjectURL(source);
      isObjectUrl = true;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context not available');
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 智能 cover 居中等比裁剪填充，确保全出血无黑边无变形
        const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const dx = (targetWidth - drawWidth) / 2;
        const dy = (targetHeight - drawHeight) / 2;

        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

        const resultDataUrl = canvas.toDataURL('image/png', 0.95);
        if (isObjectUrl) URL.revokeObjectURL(srcUrl);
        resolve(resultDataUrl);
      } catch (err) {
        if (isObjectUrl) URL.revokeObjectURL(srcUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      if (isObjectUrl) URL.revokeObjectURL(srcUrl);
      reject(new Error('图片加载失败，请检查文件格式是否有效'));
    };

    img.src = srcUrl;
  });
}

export function ProductInAppEvents({
  product,
  notify,
}: {
  product: Product;
  notify?: (msg: string) => void;
}) {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<InAppEvent[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [serverLocales, setServerLocales] = useState<string[]>([]);

  // Navigation mode: 'list' or 'detail' (App Store Connect 1:1 view)
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Search & Filter in list view
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [badgeFilter, setBadgeFilter] = useState<string>('all');

  // Modals
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showAgentRefineModal, setShowAgentRefineModal] = useState(false);
  const [agentDirection, setAgentDirection] = useState('');
  const [copiedRefinePrompt, setCopiedRefinePrompt] = useState(false);
  const [showAssetBrowser, setShowAssetBrowser] = useState<'card' | 'detail' | null>(null);

  // Image generation prompt modal states
  const [showImagePromptModal, setShowImagePromptModal] = useState<'card' | 'detail' | null>(null);
  const [imagePromptHasRef, setImagePromptHasRef] = useState(false);
  const [copiedImagePrompt, setCopiedImagePrompt] = useState(false);

  // App Store Connect Detail/Edit Form states
  const [activeLocale, setActiveLocale] = useState<string>('zh-Hans');

  // Form fields
  const [formRefName, setFormRefName] = useState('');
  const [formBadge, setFormBadge] = useState<InAppEventBadge>('SPECIAL_EVENT');
  const [formPurpose, setFormPurpose] = useState<InAppEventPurpose>('APPROPRIATE_FOR_ALL_USERS');
  const [formPurchase, setFormPurchase] = useState<InAppEventPurchaseRequirement>('NO_COST_ASSOCIATED');
  const [formPriority, setFormPriority] = useState<InAppEventPriority>('NORMAL');
  const [formDeepLink, setFormDeepLink] = useState('');
  const [formPrimaryLocale, setFormPrimaryLocale] = useState('zh-Hans');
  const [formPublishStart, setFormPublishStart] = useState('');
  const [formEventStart, setFormEventStart] = useState('');
  const [formEventEnd, setFormEventEnd] = useState('');

  // Active locale specific copy & media
  const [formLocName, setFormLocName] = useState('');
  const [formLocShortDesc, setFormLocShortDesc] = useState('');
  const [formLocLongDesc, setFormLocLongDesc] = useState('');
  const [formCardMediaUrl, setFormCardMediaUrl] = useState('');
  const [formDetailMediaUrl, setFormDetailMediaUrl] = useState('');

  // File upload hidden inputs
  const cardFileInputRef = useRef<HTMLInputElement>(null);
  const detailFileInputRef = useRef<HTMLInputElement>(null);

  const productAvailableLocales = useMemo(() => {
    const set = new Set<string>();
    const versions = product.appStore?.versions || [];
    for (const v of versions) {
      for (const n of v.notes || []) {
        if (n.locale) set.add(n.locale);
      }
    }
    for (const l of serverLocales || []) set.add(l);
    if (set.size === 0) {
      ['zh-Hans', 'en-US', 'ja', 'zh-Hant', 'ko', 'de-DE', 'fr-FR', 'es-ES'].forEach(l => set.add(l));
    }
    return Array.from(set);
  }, [product, serverLocales]);

  const currentEvent = useMemo(() => {
    return events.find(e => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  const fetchEvents = async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/in-app-events/${encodeURIComponent(product.id)}/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取 App 内活动列表失败');
      setEvents(data.events || []);
      setIsConfigured(!!data.configured);
      setSyncedAt(data.syncedAt || null);
      if (Array.isArray(data.locales)) {
        setServerLocales(data.locales);
      }
    } catch (err: any) {
      notify?.(err.message || '获取 App 内活动列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents(false);
  }, [product.id]);

  // Load selected event into edit form
  const initFormWithEvent = (ev: InAppEvent, targetLocale?: string) => {
    setSelectedEventId(ev.id);
    setFormRefName(ev.referenceName || '');
    setFormBadge(ev.badge || 'SPECIAL_EVENT');
    setFormPurpose(ev.purpose || 'APPROPRIATE_FOR_ALL_USERS');
    setFormPurchase(ev.purchaseRequirement || 'NO_COST_ASSOCIATED');
    setFormPriority(ev.priority || 'NORMAL');
    setFormDeepLink(ev.deepLink || '');
    setFormPrimaryLocale(ev.primaryLocale || 'zh-Hans');

    const s = ev.territorySchedules?.[0] || {};
    setFormPublishStart(toDatetimeLocal(s.publishStart));
    setFormEventStart(toDatetimeLocal(s.eventStart));
    setFormEventEnd(toDatetimeLocal(s.eventEnd));

    const localeToLoad = targetLocale || ev.primaryLocale || 'zh-Hans';
    setActiveLocale(localeToLoad);

    const loc = ev.localizations?.find(l => l.locale === localeToLoad) || ev.localizations?.[0];
    setFormLocName(loc?.name || ev.referenceName || '');
    setFormLocShortDesc(loc?.shortDescription || '');
    setFormLocLongDesc(loc?.longDescription || '');
    setFormCardMediaUrl(loc?.cardMediaUrl || '');
    setFormDetailMediaUrl(loc?.detailMediaUrl || '');

    setViewMode('detail');
  };

  // Switch active localization in detail view
  const handleSwitchLocale = (nextLocale: string) => {
    if (!currentEvent) return;
    setActiveLocale(nextLocale);
    const loc = currentEvent.localizations?.find(l => l.locale === nextLocale);
    setFormLocName(loc?.name || '');
    setFormLocShortDesc(loc?.shortDescription || '');
    setFormLocLongDesc(loc?.longDescription || '');
    setFormCardMediaUrl(loc?.cardMediaUrl || '');
    setFormDetailMediaUrl(loc?.detailMediaUrl || '');
  };

  // Create new event
  const handleCreateNewDraft = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const start = new Date(now.getTime() + 86400000);
      const end = new Date(now.getTime() + 14 * 86400000);
      const initialName = `新活动-${now.getMonth() + 1}月${now.getDate()}日`;

      const res = await fetch(`/api/app-store-connect/in-app-events/${encodeURIComponent(product.id)}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceName: initialName,
          badge: 'SPECIAL_EVENT',
          primaryLocale: productAvailableLocales[0] || 'zh-Hans',
          publishStart: now.toISOString(),
          eventStart: start.toISOString(),
          eventEnd: end.toISOString(),
          name: initialName.slice(0, 30),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建活动草稿失败');
      setEvents(data.events || []);
      const created = data.events?.[0];
      if (created) {
        initFormWithEvent(created);
        notify?.(t('活动草稿已创建，请在下方补充活动信息', 'Event draft created. Please complete event information below.'));
      }
    } catch (err: any) {
      notify?.(err.message || '创建活动失败');
    } finally {
      setLoading(false);
    }
  };

  // 1. 保存需要为保存在本地（不提交到 App Store Connect）
  const handleSaveLocal = async (): Promise<boolean> => {
    if (!currentEvent) return false;
    if (!formRefName.trim()) {
      notify?.(t('请填写参考名称', 'Please provide a reference name'));
      return false;
    }

    setLoading(true);
    try {
      const existingTerritories = currentEvent.territorySchedules?.[0]?.territories;
      const schedule = {
        territories: existingTerritories && existingTerritories.length > 0 ? existingTerritories : undefined,
        publishStart: formPublishStart ? new Date(formPublishStart).toISOString() : undefined,
        eventStart: formEventStart ? new Date(formEventStart).toISOString() : undefined,
        eventEnd: formEventEnd ? new Date(formEventEnd).toISOString() : undefined,
      };

      const res = await fetch(`/api/app-store-connect/in-app-events/${encodeURIComponent(product.id)}/save-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: currentEvent.id,
          referenceName: formRefName.trim(),
          badge: formBadge,
          purpose: formPurpose,
          purchaseRequirement: formPurchase,
          priority: formPriority,
          deepLink: formDeepLink.trim() || undefined,
          primaryLocale: formPrimaryLocale,
          territorySchedules: [schedule],
          localization: {
            locale: activeLocale,
            name: formLocName.trim() || formRefName.trim().slice(0, 30),
            shortDescription: formLocShortDesc.trim() || undefined,
            longDescription: formLocLongDesc.trim() || undefined,
            cardMediaUrl: formCardMediaUrl || undefined,
            detailMediaUrl: formDetailMediaUrl || undefined,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '本地保存活动失败');
      setEvents(data.events || []);
      const updated = (data.events || []).find((e: InAppEvent) => e.id === currentEvent.id);
      if (updated) {
        setSelectedEventId(updated.id);
      }
      notify?.(t('活动已保存到本地', 'Event saved to local database'));
      return true;
    } catch (err: any) {
      notify?.(err.message || '本地保存活动失败');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // 2. 提交至 App Store Connect（同步活动与素材，不直接提交审核）
  const handleSubmitToAppStoreConnect = async () => {
    if (!currentEvent) return;
    if (!formRefName.trim()) {
      notify?.(t('请填写参考名称', 'Please provide a reference name'));
      return;
    }

    setLoading(true);
    try {
      const existingTerritories = currentEvent.territorySchedules?.[0]?.territories;
      const nowMs = Date.now();
      let pStart = formPublishStart ? new Date(formPublishStart).getTime() : 0;
      let eStart = formEventStart ? new Date(formEventStart).getTime() : 0;
      let eEnd = formEventEnd ? new Date(formEventEnd).getTime() : 0;

      // 保证提交给 Apple 的时间必须在未来
      if (pStart && pStart <= nowMs) {
        const fixed = new Date(nowMs + 15 * 60 * 1000);
        setFormPublishStart(toDatetimeLocal(fixed.toISOString()));
        pStart = fixed.getTime();
      }
      if (eStart && eStart <= nowMs) {
        const fixed = new Date(nowMs + 24 * 3600 * 1000);
        setFormEventStart(toDatetimeLocal(fixed.toISOString()));
        eStart = fixed.getTime();
      }
      if (eStart && eEnd && eEnd <= eStart) {
        const fixedEnd = new Date(eStart + 14 * 86400000);
        setFormEventEnd(toDatetimeLocal(fixedEnd.toISOString()));
        eEnd = fixedEnd.getTime();
      }

      const schedule = {
        territories: existingTerritories && existingTerritories.length > 0 ? existingTerritories : undefined,
        publishStart: pStart ? new Date(pStart).toISOString() : undefined,
        eventStart: eStart ? new Date(eStart).toISOString() : undefined,
        eventEnd: eEnd ? new Date(eEnd).toISOString() : undefined,
      };

      const res = await fetch(`/api/app-store-connect/in-app-events/${encodeURIComponent(product.id)}/submit-apple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: currentEvent.id,
          referenceName: formRefName.trim(),
          badge: formBadge,
          purpose: formPurpose,
          purchaseRequirement: formPurchase,
          priority: formPriority,
          deepLink: formDeepLink.trim() || undefined,
          primaryLocale: formPrimaryLocale,
          territorySchedules: [schedule],
          localization: {
            locale: activeLocale,
            name: formLocName.trim() || formRefName.trim().slice(0, 30),
            shortDescription: formLocShortDesc.trim() || undefined,
            longDescription: formLocLongDesc.trim() || undefined,
            cardMediaUrl: formCardMediaUrl || undefined,
            detailMediaUrl: formDetailMediaUrl || undefined,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交至 App Store Connect 失败');
      setEvents(data.events || []);
      const updated = (data.events || []).find((e: InAppEvent) => e.id === currentEvent.id);
      if (updated) {
        setSelectedEventId(updated.id);
      }
      notify?.(data.message || t('活动已成功提交至 App Store Connect（可在苹果后台查看或添加到审核）', 'Synced to App Store Connect successfully!'));
    } catch (err: any) {
      notify?.(err.message || '提交至 App Store Connect 失败');
    } finally {
      setLoading(false);
    }
  };

  // Delete current event
  const handleDeleteCurrentEvent = async () => {
    if (!currentEvent) return;
    if (!confirm(t(`确定要删除活动「${currentEvent.referenceName}」吗？此操作无法撤销。`, `Are you sure to delete "${currentEvent.referenceName}"? This cannot be undone.`))) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/app-store-connect/in-app-events/${encodeURIComponent(product.id)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: currentEvent.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除活动失败');
      setEvents(data.events || []);
      setSelectedEventId(null);
      setViewMode('list');
      notify?.(t('活动已成功删除', 'Event deleted successfully'));
    } catch (err: any) {
      notify?.(err.message || '删除活动失败');
    } finally {
      setLoading(false);
    }
  };

  // File upload handlers with automatic resizing & cover cropping
  const handleCardFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const resized = await resizeImageToSpecs(file, 1920, 1080);
      setFormCardMediaUrl(resized);
      notify?.(t('活动卡片图片已自动处理为符合规范的 1920×1080 (16:9) 尺寸', 'Card image automatically formatted to 1920×1080 (16:9)'));
    } catch (err: any) {
      notify?.(err.message || '图片处理失败');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleDetailFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const resized = await resizeImageToSpecs(file, 1080, 1920);
      setFormDetailMediaUrl(resized);
      notify?.(t('活动详情页图片已自动处理为符合规范的 1080×1920 (9:16) 尺寸', 'Detail image automatically formatted to 1080×1920 (9:16)'));
    } catch (err: any) {
      notify?.(err.message || '图片处理失败');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  // Filtered Events for List View
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      if (stateFilter !== 'all' && ev.eventState !== stateFilter) return false;
      if (badgeFilter !== 'all') {
        const evBadgeNorm = ev.badge === 'LIVE_STREAM' ? 'LIVE_EVENT' : ev.badge;
        if (evBadgeNorm !== badgeFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchRef = (ev.referenceName || '').toLowerCase().includes(q);
        const matchLoc = (ev.localizations || []).some(
          l => (l.name || '').toLowerCase().includes(q) || (l.shortDescription || '').toLowerCase().includes(q)
        );
        if (!matchRef && !matchLoc) return false;
      }
      return true;
    });
  }, [events, stateFilter, badgeFilter, searchQuery]);

  const copyPromptText = () => {
    const text = buildInAppEventsAgentPrompt(product, lang);
    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
    notify?.(t('Agent 提示词已复制到剪贴板', 'Agent prompt copied to clipboard'));
  };

  const copyEventUrl = () => {
    const appId = product.appStore?.appId || '900100001';
    const eventId = currentEvent?.id || '6837206933';
    const url = `https://apps.apple.com/us/app/id${appId}?eventid=${eventId}`;
    navigator.clipboard.writeText(url);
    notify?.(t('活动 URL 已拷贝', 'Event URL copied'));
  };

  const normalizedFormBadge = formBadge === 'LIVE_STREAM' ? 'LIVE_EVENT' : formBadge;
  const currentBadgeOption = BADGE_OPTIONS.find(b => b.key === normalizedFormBadge) || BADGE_OPTIONS[0];

  // =========================================================================
  // VIEW MODE: DETAIL & EDIT (Growmory Platform Unified Design)
  // =========================================================================
  if (viewMode === 'detail' && currentEvent) {
    const appId = product.appStore?.appId || '900100001';
    const eventId = currentEvent.id;
    const eventUrl = `https://apps.apple.com/us/app/id${appId}?eventid=${eventId}`;

    return (
      <div className="iae-detail-workspace">
        {/* Hidden File Uploads */}
        <input
          ref={cardFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleCardFileUpload}
        />
        <input
          ref={detailFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleDetailFileUpload}
        />

        {/* Top Action & Breadcrumb Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button secondary small"
              onClick={() => setViewMode('list')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ChevronLeft size={14} />
              <span>{t('返回活动列表', 'Back to Events')}</span>
            </button>

            <span className={`status-pill ${isConfigured ? 'green' : 'amber'}`}>
              {isConfigured ? t('已连接 App Store Connect', 'Connected to App Store Connect') : t('本地草稿模式', 'Local Draft Mode')}
            </span>

            <span className={`status-pill ${currentEvent.eventState === 'PUBLISHED' ? 'green' : currentEvent.eventState === 'READY_FOR_REVIEW' ? 'blue' : 'amber'}`}>
              {getEventStateLabel(currentEvent.eventState, t)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* 4、新增按钮：agent完善 */}
            <button
              type="button"
              className="button secondary"
              onClick={() => setShowAgentRefineModal(true)}
              title={t('通过 AI Agent 完善活动文案与排期属性', 'Refine event copy and attributes via AI Agent')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Sparkles size={15} style={{ color: '#8b5cf6' }} />
              <span>{t('Agent 完善', 'Agent Refine')}</span>
            </button>

            {/* 1、保存为保存在本地（不提交到 App Store Connect） */}
            <button
              type="button"
              className="button secondary"
              onClick={handleSaveLocal}
              disabled={loading}
              title={t('仅保存在本地 Growmory 数据库中，不调用 Apple 接口', 'Save to local database only')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Save size={15} />
              <span>{loading ? t('保存中…', 'Saving…') : t('保存', 'Save')}</span>
            </button>

            {/* 2、提交至AppStoreconnect（不直接提交审核） */}
            <button
              type="button"
              className="button primary"
              onClick={handleSubmitToAppStoreConnect}
              disabled={loading}
              title={t('将活动信息、排期与素材同步至 App Store Connect 后台（不直接提交审核）', 'Upload to App Store Connect without submitting for review')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Send size={15} />
              <span>{t('提交至AppStoreconnect', 'Submit to App Store Connect')}</span>
            </button>
          </div>
        </div>

        {/* Title Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 6px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text, #0f172a)' }}>
              {formRefName || t('未命名活动', 'Untitled Event')}
            </h2>
            <div style={{ fontSize: 13, color: 'var(--muted, #64748b)', marginTop: 4 }}>
              {t('配置 App Store 官方活动属性、排期与多语言文案，右侧支持实时动态交互预览。', 'Configure App Store event properties, schedule, and multi-language copy with live preview.')}
            </div>
          </div>
        </div>

        {/* Main Two-Column Layout */}
        <div className="iae-detail-layout">
          {/* LEFT COLUMN: Main Form Sections */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>

            {/* SECTION 1: 活动信息 (Event Information) */}
            <div className="iae-section-card">
              <div className="iae-section-header">
                <h3 className="iae-section-title">
                  <Calendar size={18} style={{ color: '#0284c7' }} />
                  <span>{t('活动信息', 'Event Information')}</span>
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted, #64748b)' }}>{t('语言：', 'Locale: ')}</span>
                  <select
                    value={activeLocale}
                    onChange={e => handleSwitchLocale(e.target.value)}
                    style={{
                      height: 30,
                      fontSize: 12.5,
                      padding: '0 8px',
                      borderRadius: 6,
                      border: '1px solid var(--border, #cbd5e1)',
                      background: 'var(--input-bg, #ffffff)',
                      color: 'var(--text, #0f172a)',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {productAvailableLocales.map(l => (
                      <option key={l} value={l}>
                        {getLocaleDisplayName(l, t)} ({l})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="iae-section-desc">
                {t('请在下方输入活动对外公开的标题、简短描述、详情说明及配套卡片素材。', 'Enter the public title, card summary, long description, and artwork assets below.')}
              </p>

              {/* 名称 (Name) */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <span>{t('名称', 'Name')}</span>
                </label>
                <div>
                  <input
                    type="text"
                    maxLength={30}
                    className="iae-input"
                    value={formLocName}
                    onChange={e => setFormLocName(e.target.value)}
                    placeholder={t('活动标题（≤30字符，切勿重复徽章名称）', 'Event title (<= 30 chars, do not repeat badge)')}
                  />
                  <div className="iae-counter">{formLocName.length} / 30</div>
                </div>
              </div>

              {/* 简短描述 (Short Description) */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <span>{t('简短描述', 'Short Description')}</span>
                </label>
                <div>
                  <input
                    type="text"
                    maxLength={50}
                    className="iae-input"
                    value={formLocShortDesc}
                    onChange={e => setFormLocShortDesc(e.target.value)}
                    placeholder={t('卡片简述，突出核心参与利益（≤50字符）', 'Card summary highlighting key benefit (<= 50 chars)')}
                  />
                  <div className="iae-counter">{formLocShortDesc.length} / 50</div>
                </div>
              </div>

              {/* 活动卡片图像或视频 (Event Card Media) */}
              <div className="iae-field">
                <div className="iae-field-label">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{t('活动卡片图像或视频 (16:9)', 'Event Card Image or Video (16:9)')}</span>
                    <span style={{ color: 'var(--muted, #86868b)', cursor: 'help' }} title={t('展示在 App Store 搜索和产品页的横向活动卡片背景图', 'Visual asset displayed on landscape event cards')}>?</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => {
                        setImagePromptHasRef(Boolean(formCardMediaUrl));
                        setShowImagePromptModal('card');
                      }}
                      title={t('生成生图提示词', 'Generate image prompt')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#7c3aed' }}
                    >
                      <Wand2 size={13} />
                      <span>{t('生图提示词', 'AI Image Prompt')}</span>
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setShowAssetBrowser('card')}
                    >
                      {t('浏览素材', 'Browse Assets')}
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => cardFileInputRef.current?.click()}
                    >
                      {t('上传图片', 'Upload')}
                    </button>
                  </div>
                </div>

                <div className="iae-field-desc">
                  {t('推荐尺寸：1920 x 1080 像素或 3840 x 2160 像素 (16:9)。', 'Recommended dimensions: 1920 x 1080 or 3840 x 2160 (16:9).')}
                </div>

                <div
                  className="iae-media-box landscape"
                  style={{
                    width: 280,
                    maxWidth: '100%',
                    aspectRatio: '16 / 9',
                    position: 'relative',
                    cursor: formCardMediaUrl ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                  onClick={() => {
                    if (!formCardMediaUrl) {
                      cardFileInputRef.current?.click();
                    }
                  }}
                >
                  {formCardMediaUrl ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <img
                        src={formCardMediaUrl}
                        alt="Card Media"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormCardMediaUrl('');
                        }}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          background: 'rgba(0,0,0,0.65)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '50%',
                          width: 24,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          zIndex: 2,
                        }}
                        title={t('移除图片', 'Remove')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 12, textAlign: 'center', color: 'var(--muted, #64748b)' }}>
                      <ImageIcon size={24} strokeWidth={1.5} />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{t('16:9 横屏素材', '16:9 Landscape Asset')}</span>
                      <span style={{ fontSize: 11, opacity: 0.8 }}>{t('点击上传或选择素材', 'Click to upload or browse')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 详细描述 (Detailed Description) */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <span>{t('详细描述', 'Detailed Description')}</span>
                </label>
                <div>
                  <textarea
                    rows={3}
                    maxLength={120}
                    className="iae-textarea"
                    value={formLocLongDesc}
                    onChange={e => setFormLocLongDesc(e.target.value)}
                    placeholder={t('活动详情页长文案，说明规则、参与方式与奖励机制（≤120字符）', 'Event details page long description (<= 120 chars)')}
                  />
                  <div className="iae-counter">{formLocLongDesc.length} / 120</div>
                </div>
              </div>

              {/* 活动详情页面图像或视频 (Event Details Media) */}
              <div className="iae-field">
                <div className="iae-field-label">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{t('活动详情页面图像或视频 (9:16)', 'Event Details Page Image or Video (9:16)')}</span>
                    <span style={{ color: 'var(--muted, #86868b)', cursor: 'help' }} title={t('展示在点开活动后的沉浸式全屏详情页顶部竖向图', 'Visual asset displayed on the immersive portrait event details sheet')}>?</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => {
                        setImagePromptHasRef(Boolean(formDetailMediaUrl));
                        setShowImagePromptModal('detail');
                      }}
                      title={t('生成生图提示词', 'Generate image prompt')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#7c3aed' }}
                    >
                      <Wand2 size={13} />
                      <span>{t('生图提示词', 'AI Image Prompt')}</span>
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setShowAssetBrowser('detail')}
                    >
                      {t('浏览素材', 'Browse Assets')}
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => detailFileInputRef.current?.click()}
                    >
                      {t('上传图片', 'Upload')}
                    </button>
                  </div>
                </div>

                <div className="iae-field-desc">
                  {t('推荐尺寸：1080 x 1920 像素或 2160 x 3840 像素 (9:16)。', 'Recommended dimensions: 1080 x 1920 or 2160 x 3840 (9:16).')}
                </div>

                <div
                  className="iae-media-box portrait"
                  style={{
                    width: 180,
                    maxWidth: '100%',
                    aspectRatio: '9 / 16',
                    position: 'relative',
                    cursor: formDetailMediaUrl ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                  onClick={() => {
                    if (!formDetailMediaUrl) {
                      detailFileInputRef.current?.click();
                    }
                  }}
                >
                  {formDetailMediaUrl ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <img
                        src={formDetailMediaUrl}
                        alt="Detail Media"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormDetailMediaUrl('');
                        }}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          background: 'rgba(0,0,0,0.65)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '50%',
                          width: 24,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          zIndex: 2,
                        }}
                        title={t('移除图片', 'Remove')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 16, textAlign: 'center', color: 'var(--muted, #64748b)' }}>
                      <Smartphone size={28} strokeWidth={1.5} />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{t('9:16 竖屏素材', '9:16 Portrait Asset')}</span>
                      <span style={{ fontSize: 11, opacity: 0.8 }}>{t('点击上传或选择素材', 'Click to upload or browse')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 徽章 (Badge) */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{t('徽章', 'Badge')}</span>
                    <span style={{ color: 'var(--muted, #86868b)', cursor: 'help' }} title={t('定义活动的性质并在卡片左上方展示', 'Categorizes the event type on App Store')}>?</span>
                  </div>
                </label>
                <select
                  className="iae-input"
                  value={formBadge === 'LIVE_STREAM' ? 'LIVE_EVENT' : formBadge}
                  onChange={e => setFormBadge(e.target.value as InAppEventBadge)}
                >
                  {BADGE_OPTIONS.map(opt => (
                    <option key={opt.key} value={opt.key}>
                      {lang === 'en' ? opt.labelEn : opt.labelZh}
                    </option>
                  ))}
                </select>
                <div className="iae-field-desc" style={{ marginTop: 6, fontSize: 12, color: 'var(--muted, #64748b)' }}>
                  {lang === 'en' ? currentBadgeOption.descEn : currentBadgeOption.descZh}
                </div>
              </div>
            </div>

            {/* SECTION 2: 供应国家或地区 (Availability and Scheduling) */}
            <div className="iae-section-card">
              <div className="iae-section-header">
                <h3 className="iae-section-title">
                  <Globe size={18} style={{ color: '#0284c7' }} />
                  <span>{t('供应国家或地区', 'Availability and Scheduling')}</span>
                </h3>
                <div style={{ fontSize: 12.5, color: 'var(--muted, #64748b)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Clock size={13} />
                  <span>(GMT +8) {t('上海', 'Shanghai')}</span>
                </div>
              </div>

              {/* 供应范围 */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <span>{t('供应范围', 'Availability')}</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                  <span style={{ color: 'var(--text, #1d1d1f)' }}>{t('已选择所有国家或地区', 'All countries or regions selected')}</span>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => notify?.(t('当前活动对全部 App Store 可用区域生效', 'Active in all App Store storefronts'))}
                  >
                    {t('查看地区', 'View Territories')}
                  </button>
                </div>
              </div>

              {/* 开始日期和时间 & 结束日期和时间 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div className="iae-field">
                  <label className="iae-field-label">
                    <span>{t('开始日期和时间', 'Start Date and Time')}</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="iae-input"
                    value={formEventStart}
                    onChange={e => setFormEventStart(e.target.value)}
                  />
                </div>

                <div className="iae-field">
                  <label className="iae-field-label">
                    <span>{t('结束日期和时间', 'End Date and Time')}</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="iae-input"
                    value={formEventEnd}
                    onChange={e => setFormEventEnd(e.target.value)}
                  />
                </div>
              </div>

              {/* 发布开始日期和时间 (Pre-notification) */}
              <div className="iae-field" style={{ marginTop: 4 }}>
                <label className="iae-field-label">
                  <span>{t('发布开始日期和时间（商店预告）', 'Publish Start Date and Time (Preview)')}</span>
                </label>
                <p className="iae-field-desc">
                  {t('选取此活动首次出现在 App Store 上的日期和时间（最多可提前 14 天预热展示）。', 'Date and time when the event first appears on App Store (up to 14 days in advance).')}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <div style={{ maxWidth: 320 }}>
                    <input
                      type="datetime-local"
                      className="iae-input"
                      value={formPublishStart}
                      onChange={e => setFormPublishStart(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 3: 额外信息 (Additional Information) */}
            <div className="iae-section-card">
              <div className="iae-section-header">
                <h3 className="iae-section-title">
                  <Info size={18} style={{ color: '#0284c7' }} />
                  <span>{t('额外信息', 'Additional Information')}</span>
                </h3>
              </div>

              {/* 参考名称 */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{t('参考名称', 'Reference Name')}</span>
                    <span style={{ color: 'var(--muted, #86868b)', cursor: 'help' }} title={t('仅在 App Store Connect 后台标识该活动', 'Internal name visible only in App Store Connect')}>?</span>
                  </div>
                </label>
                <div>
                  <input
                    type="text"
                    maxLength={64}
                    className="iae-input"
                    value={formRefName}
                    onChange={e => setFormRefName(e.target.value)}
                    placeholder={t('活动内部管理名称（≤64字符）', 'Internal reference name (<= 64 chars)')}
                  />
                  <div className="iae-counter">{formRefName.length} / 64</div>
                </div>
              </div>

              {/* 活动深层链接 */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{t('活动深层链接', 'Event Deep Link')}</span>
                    <span style={{ color: 'var(--muted, #86868b)', cursor: 'help' }} title={t('用户点击卡片后直接在 App 内打开的页面路由', 'Universal Link or custom URL Scheme to open the event in your app')}>?</span>
                  </div>
                </label>
                <input
                  type="text"
                  className="iae-input"
                  placeholder="growmory://events/spring"
                  value={formDeepLink}
                  onChange={e => setFormDeepLink(e.target.value)}
                />
              </div>

              {/* 活动优先级 */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <span>{t('活动优先级', 'Event Priority')}</span>
                </label>
                <p className="iae-field-desc">
                  {t('请选择你想要此活动在产品页面上显示的排序权重。', 'Choose priority weight to display on product page.')}
                </p>
                <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                  <label className="iae-radio-item">
                    <input
                      type="radio"
                      name="priority"
                      checked={formPriority === 'NORMAL'}
                      onChange={() => setFormPriority('NORMAL')}
                    />
                    <span style={{ fontSize: 13.5, color: 'var(--text, #0f172a)' }}>{t('普通优先级', 'Normal Priority')}</span>
                  </label>
                  <label className="iae-radio-item">
                    <input
                      type="radio"
                      name="priority"
                      checked={formPriority === 'HIGH'}
                      onChange={() => setFormPriority('HIGH')}
                    />
                    <span style={{ fontSize: 13.5, color: 'var(--text, #0f172a)' }}>{t('高优先级', 'High Priority')}</span>
                  </label>
                </div>
              </div>

              {/* 参加活动是否需要 App 内购买 */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <span>{t('参加活动是否需要 App 内购买', 'In-App Purchase Requirement')}</span>
                </label>
                <p className="iae-field-desc">
                  {t(
                    '如果此活动包含在自动续期订阅项目内且不会向相关订阅者收取额外费用，请选择“无需额外付费”。',
                    'Select "No cost associated" if included in existing subscription at no extra cost.'
                  )}
                </p>
                <select
                  className="iae-input"
                  value={formPurchase}
                  onChange={e => setFormPurchase(e.target.value as InAppEventPurchaseRequirement)}
                >
                  {PURCHASE_OPTIONS.map(opt => (
                    <option key={opt.key} value={opt.key}>
                      {lang === 'en' ? opt.labelEn : opt.labelZh}
                    </option>
                  ))}
                </select>
              </div>

              {/* 主要语言 */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{t('主要语言', 'Primary Language')}</span>
                    <span style={{ color: 'var(--muted, #86868b)', cursor: 'help' }} title={t('此活动默认使用的主要本地化语言', 'Default language for this event')}>?</span>
                  </div>
                </label>
                <select
                  className="iae-input"
                  value={formPrimaryLocale}
                  onChange={e => setFormPrimaryLocale(e.target.value)}
                >
                  {productAvailableLocales.map(l => (
                    <option key={l} value={l}>
                      {getLocaleDisplayName(l, t)} ({l})
                    </option>
                  ))}
                </select>
              </div>

              {/* 活动 URL */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{t('活动 URL', 'Event URL')}</span>
                    <span style={{ color: 'var(--muted, #86868b)', cursor: 'help' }} title={t('此活动在 App Store 官方的直接分发链接', 'Direct App Store link to this event')}>?</span>
                  </div>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <code style={{ fontSize: 12.5, background: 'var(--surface, #f8fafc)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border, #e2e8f0)', color: 'var(--text, #0f172a)', wordBreak: 'break-all' }}>
                    {eventUrl}
                  </code>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={copyEventUrl}
                  >
                    <Copy size={13} />
                    <span>{t('拷贝链接', 'Copy Link')}</span>
                  </button>
                </div>
              </div>

              {/* 活动目的 */}
              <div className="iae-field">
                <label className="iae-field-label">
                  <span>{t('活动目的', 'Event Purpose')}</span>
                </label>
                <p className="iae-field-desc">
                  {t(
                    '选择活动的大致目标人群。App Store 用于推荐算法匹配，不会直接展示给用户。',
                    'Choose the audience target. Used by App Store recommendation algorithms.'
                  )}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {PURPOSE_OPTIONS.map(opt => (
                    <label key={opt.key} className="iae-radio-item">
                      <input
                        type="radio"
                        name="purpose"
                        checked={formPurpose === opt.key}
                        onChange={() => setFormPurpose(opt.key)}
                        style={{ marginTop: 2 }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text, #0f172a)' }}>
                          {lang === 'en' ? opt.labelEn : opt.labelZh}
                        </span>
                        {(opt.descZh || opt.descEn) && (
                          <span style={{ fontSize: 12, color: 'var(--muted, #64748b)', marginTop: 2 }}>
                            {lang === 'en' ? opt.descEn : opt.descZh}
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 删除活动 */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border, #f1f5f9)' }}>
                <button
                  type="button"
                  className="button secondary small"
                  style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                  onClick={handleDeleteCurrentEvent}
                >
                  <Trash2 size={13} />
                  <span>{t('删除活动', 'Delete In-App Event')}</span>
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Live Interactive App Store Preview (双图纵向排列) */}
          <div className="iae-preview-panel">
            <div className="iae-preview-header">
              <h3 className="iae-preview-title">
                <Smartphone size={16} style={{ color: '#0284c7' }} />
                <span>{t('App Store 实时预览', 'App Store Live Preview')}</span>
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* 1. 16:9 活动卡片 (Event Card) */}
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text, #334155)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{t('16:9 活动卡片', '16:9 Event Card')}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted, #64748b)', fontWeight: 400 }}>1920 × 1080</span>
                </div>
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '16 / 9',
                    borderRadius: 14,
                    position: 'relative',
                    overflow: 'hidden',
                    background: formCardMediaUrl ? `url(${formCardMediaUrl}) center/cover no-repeat` : 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    padding: 16,
                    color: '#ffffff',
                  }}
                >
                  {/* Gradient scrim overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0) 100%)',
                      pointerEvents: 'none',
                    }}
                  />

                  <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: '78%' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#93c5fd' }}>
                        {lang === 'en' ? currentBadgeOption.labelEn : currentBadgeOption.labelZh}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formLocName || t('活动名称', 'Event Name')}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.88)', lineHeight: 1.35, maxHeight: 32, overflow: 'hidden' }}>
                        {formLocShortDesc || t('简短描述', 'Short Description')}
                      </span>
                    </div>

                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        color: '#0071e3',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '4px 12px',
                        borderRadius: 14,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                      }}
                    >
                      {t('获取', 'GET')}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. 9:16 活动详情页面 (Event Details Page Sheet) */}
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text, #334155)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{t('9:16 活动详情页', '9:16 Event Details Page')}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted, #64748b)', fontWeight: 400 }}>1080 × 1920</span>
                </div>
                <div
                  style={{
                    width: '100%',
                    maxWidth: 290,
                    margin: '0 auto',
                    aspectRatio: '9 / 16',
                    borderRadius: 32,
                    overflow: 'hidden',
                    position: 'relative',
                    background: formDetailMediaUrl
                      ? `url(${formDetailMediaUrl}) center/cover no-repeat`
                      : 'linear-gradient(150deg, #fef3c7 0%, #fed7aa 40%, #fbcfe8 100%)',
                    boxShadow: '0 16px 36px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                  }}
                >
                  {/* Top native App Store modal header */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 14,
                      left: 14,
                      right: 14,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      zIndex: 4,
                      pointerEvents: 'none',
                    }}
                  >
                    {/* Left pill indicator */}
                    <div
                      style={{
                        width: 48,
                        height: 18,
                        borderRadius: 9,
                        background: 'rgba(255, 255, 255, 0.72)',
                        backdropFilter: 'blur(8px)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                    />
                    {/* Right circular close button */}
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'rgba(255, 255, 255, 0.72)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        color: '#475569',
                      }}
                    >
                      <X size={13} strokeWidth={2.4} />
                    </div>
                  </div>

                  {/* Gradient Scrim Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(20, 16, 16, 0.92) 0%, rgba(20, 16, 16, 0.75) 28%, rgba(20, 16, 16, 0.35) 54%, rgba(0, 0, 0, 0.05) 72%, transparent 85%)',
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                  />

                  {/* Overlay Content (matching App Store Connect live layout) */}
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 3,
                      padding: '16px 16px 18px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                      color: '#ffffff',
                    }}
                  >
                    {/* Badge */}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'rgba(255, 255, 255, 0.88)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {lang === 'en' ? currentBadgeOption.labelEn : currentBadgeOption.labelZh}
                    </span>

                    {/* Title */}
                    <div
                      style={{
                        fontSize: 17,
                        fontWeight: 700,
                        color: '#ffffff',
                        lineHeight: 1.25,
                        wordBreak: 'break-word',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {formLocName || t('活动名称', 'Event Name')}
                    </div>

                    {/* Long Description */}
                    <div
                      style={{
                        fontSize: 11,
                        color: 'rgba(255, 255, 255, 0.85)',
                        lineHeight: 1.48,
                        maxHeight: 105,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 5,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                        marginTop: 2,
                      }}
                    >
                      {formLocLongDesc || formLocShortDesc || t('在 App Store 活动详情页中呈现活动的完整背景、核心特色与更新说明。', 'Full event background and details copy displayed in App Store event details sheet.')}
                    </div>

                    {/* CTA pill placeholder */}
                    <div
                      style={{
                        marginTop: 8,
                        width: 76,
                        height: 25,
                        borderRadius: 13,
                        background: 'rgba(255, 255, 255, 0.42)',
                        backdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: '#ffffff',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {t('获取', 'GET')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4、新增按钮：agent完善，点击后弹窗，输入方向，复制提示词 */}
        {showAgentRefineModal && (
          <div className="app-store-pages-modal-backdrop" onClick={() => setShowAgentRefineModal(false)}>
            <div className="app-store-pages-modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
              <div className="modal-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={18} style={{ color: '#8b5cf6' }} />
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                    {t('Agent 完善', 'Agent Refine')}
                  </h3>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowAgentRefineModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ fontSize: 13, color: 'var(--muted, #64748b)', margin: '0 0 14px', lineHeight: 1.5 }}>
                {t(
                  '输入优化方向（可选），复制提示词发送给 AI Agent 即可自动完善活动配置与文案。',
                  'Enter optimization direction (optional), copy and send the prompt to AI Agent to refine event details.'
                )}
              </p>

              {/* 输入方向 */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text, #334155)', marginBottom: 6 }}>
                  {t('优化方向（可选）：', 'Optimization Direction (Optional):')}
                </label>
                <textarea
                  rows={3}
                  value={agentDirection}
                  onChange={e => setAgentDirection(e.target.value)}
                  placeholder={t(
                    '例如：突出活动亮点，优化活动标题与描述，增强吸引力。',
                    'e.g. Highlight event features, refine title and description for higher engagement.'
                  )}
                  style={{
                    width: '100%',
                    borderRadius: 8,
                    border: '1px solid var(--border, #cbd5e1)',
                    background: 'var(--input-bg, #ffffff)',
                    color: 'var(--text, #0f172a)',
                    padding: '10px 12px',
                    fontSize: 13,
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* 提示词预览 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #334155)' }}>
                    {t('提示词预览：', 'Prompt Preview:')}
                  </span>
                </div>

                <pre
                  style={{
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '16px 20px',
                    borderRadius: 10,
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    maxHeight: '40vh',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'monospace',
                  }}
                >
                  {buildInAppEventsAgentPrompt(product, lang, {
                    event: {
                      id: currentEvent.id,
                      referenceName: formRefName,
                      badge: formBadge,
                      eventState: currentEvent.eventState,
                      deepLink: formDeepLink,
                      purpose: formPurpose,
                      purchaseRequirement: formPurchase,
                      priority: formPriority,
                      publishStart: formPublishStart,
                      eventStart: formEventStart,
                      eventEnd: formEventEnd,
                      localizations: currentEvent.localizations,
                    },
                    direction: agentDirection,
                  })}
                </pre>
              </div>

              {/* 弹窗底部操作 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowAgentRefineModal(false)}
                >
                  {t('关闭', 'Close')}
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    const prompt = buildInAppEventsAgentPrompt(product, lang, {
                      event: {
                        id: currentEvent.id,
                        referenceName: formRefName,
                        badge: formBadge,
                        eventState: currentEvent.eventState,
                        deepLink: formDeepLink,
                        purpose: formPurpose,
                        purchaseRequirement: formPurchase,
                        priority: formPriority,
                        publishStart: formPublishStart,
                        eventStart: formEventStart,
                        eventEnd: formEventEnd,
                        localizations: currentEvent.localizations,
                      },
                      direction: agentDirection,
                    });
                    navigator.clipboard.writeText(prompt);
                    setCopiedRefinePrompt(true);
                    setTimeout(() => setCopiedRefinePrompt(false), 2000);
                    notify?.(t('Agent 完善提示词已复制到剪贴板', 'Agent refine prompt copied to clipboard'));
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {copiedRefinePrompt ? <Check size={16} /> : <Copy size={16} />}
                  {copiedRefinePrompt ? t('已复制！', 'Copied!') : t('复制提示词', 'Copy Prompt')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ASSET BROWSER MODAL */}
        {showAssetBrowser && (
          <div className="app-store-pages-modal-backdrop" onClick={() => setShowAssetBrowser(null)}>
            <div className="app-store-pages-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
              <div className="modal-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 className="modal-title" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
                  {t('浏览素材', 'Browse Assets')}
                </h3>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowAssetBrowser(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                {t('从产品已有素材库中选择图片，或上传本地素材：', 'Select image from product assets or upload a local file:')}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  type="button"
                  className="button secondary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', color: '#7c3aed', borderColor: '#ddd6fe', background: '#f5f3ff' }}
                  onClick={() => {
                    const currentType = showAssetBrowser;
                    setShowAssetBrowser(null);
                    setShowImagePromptModal(currentType);
                  }}
                >
                  <Wand2 size={16} />
                  <span>{t('生图提示词', 'AI Image Prompt')}</span>
                </button>

                <button
                  type="button"
                  className="button secondary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px' }}
                  onClick={() => {
                    if (showAssetBrowser === 'card') cardFileInputRef.current?.click();
                    else detailFileInputRef.current?.click();
                    setShowAssetBrowser(null);
                  }}
                >
                  <Upload size={16} />
                  {t('上传新图片', 'Upload New Image')}
                </button>

                <div style={{ fontSize: 12, color: '#86868b', textAlign: 'center', margin: '4px 0' }}>
                  {t('— 或者选择推荐预设 —', '— Or choose a preset —')}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { label: '极简科技蓝', gradient: 'linear-gradient(135deg, #0284c7 0%, #1e40af 100%)' },
                    { label: '活力暖阳橙', gradient: 'linear-gradient(135deg, #ea580c 0%, #b45309 100%)' },
                    { label: '未来霓虹紫', gradient: 'linear-gradient(135deg, #7c3aed 0%, #4338ca 100%)' },
                    { label: '暗黑质感黑', gradient: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' },
                    { label: '自然翡翠绿', gradient: 'linear-gradient(135deg, #059669 0%, #065f46 100%)' },
                    { label: '摩登樱粉红', gradient: 'linear-gradient(135deg, #db2777 0%, #9d174d 100%)' },
                  ].map((preset, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        const isCard = showAssetBrowser === 'card';
                        const canvas = document.createElement('canvas');
                        canvas.width = isCard ? 1920 : 1080;
                        canvas.height = isCard ? 1080 : 1920;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                          const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
                          const colors = preset.gradient.match(/#[0-9a-fA-F]{6}/g) || ['#0284c7', '#1e40af'];
                          grad.addColorStop(0, colors[0]);
                          grad.addColorStop(1, colors[1] || colors[0]);
                          ctx.fillStyle = grad;
                          ctx.fillRect(0, 0, canvas.width, canvas.height);
                          const dataUrl = canvas.toDataURL('image/png');
                          if (isCard) setFormCardMediaUrl(dataUrl);
                          else setFormDetailMediaUrl(dataUrl);
                          notify?.(t(`已生成 ${isCard ? '1920×1080' : '1080×1920'} 规范图片`, `Generated ${isCard ? '1920x1080' : '1080x1920'} image`));
                        }
                        setShowAssetBrowser(null);
                      }}
                      style={{
                        height: 64,
                        borderRadius: 8,
                        background: preset.gradient,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 6,
                        textAlign: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      }}
                    >
                      {preset.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI IMAGE PROMPT MODAL */}
        {showImagePromptModal && (
          <div className="app-store-pages-modal-backdrop" onClick={() => setShowImagePromptModal(null)}>
            <div className="app-store-pages-modal" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
              <div className="modal-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wand2 size={18} style={{ color: 'var(--primary, #0284c7)' }} />
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                    {t('生图提示词', 'AI Image Prompt')}
                  </h3>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowImagePromptModal(null)}
                >
                  <X size={18} />
                </button>
              </div>

              {/* 规格切换：16:9 活动卡片 vs 9:16 活动详情页 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button
                  type="button"
                  className={`button small ${showImagePromptModal === 'card' ? 'primary' : 'secondary'}`}
                  style={{ flex: 1, fontSize: 12.5 }}
                  onClick={() => setShowImagePromptModal('card')}
                >
                  {t('16:9 活动卡片 (1920x1080)', '16:9 Card (1920x1080)')}
                </button>
                <button
                  type="button"
                  className={`button small ${showImagePromptModal === 'detail' ? 'primary' : 'secondary'}`}
                  style={{ flex: 1, fontSize: 12.5 }}
                  onClick={() => setShowImagePromptModal('detail')}
                >
                  {t('9:16 详情页面 (1080x1920)', '9:16 Detail (1080x1920)')}
                </button>
              </div>

              {/* 模式切换：纯文生图 vs 垫图/UI截图参考 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button
                  type="button"
                  className={`button small ${!imagePromptHasRef ? 'primary' : 'secondary'}`}
                  style={{ flex: 1, fontSize: 12 }}
                  onClick={() => setImagePromptHasRef(false)}
                >
                  {t('纯文生图 (无参考图)', 'Text to Image (No Reference)')}
                </button>
                <button
                  type="button"
                  className={`button small ${imagePromptHasRef ? 'primary' : 'secondary'}`}
                  style={{ flex: 1, fontSize: 12 }}
                  onClick={() => setImagePromptHasRef(true)}
                >
                  {t('图生图 / 垫图 (有 UI 截图或模具)', 'Image to Image (With UI / Mockup Ref)')}
                </button>
              </div>

              {(() => {
                const promptData = buildInAppEventImagePrompt({
                  productName: product.name,
                  eventTitle: formLocName || formRefName,
                  referenceName: formRefName,
                  badge: formBadge,
                  mediaType: showImagePromptModal,
                  shortDescription: formLocShortDesc,
                  longDescription: formLocLongDesc,
                  hasReference: imagePromptHasRef,
                  lang,
                });

                return (
                  <div>
                    <pre
                      style={{
                        background: 'var(--surface-sunken, #0f172a)',
                        color: 'var(--text-code, #f8fafc)',
                        padding: '16px 18px',
                        borderRadius: 8,
                        fontSize: 13,
                        lineHeight: 1.6,
                        maxHeight: '36vh',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'inherit',
                        marginBottom: 16,
                      }}
                    >
                      {promptData.prompt}
                    </pre>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => setShowImagePromptModal(null)}
                      >
                        {t('关闭', 'Close')}
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        onClick={() => {
                          navigator.clipboard.writeText(promptData.prompt);
                          setCopiedImagePrompt(true);
                          setTimeout(() => setCopiedImagePrompt(false), 2000);
                          notify?.(t('提示词已复制到剪贴板', 'Prompt copied to clipboard'));
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        {copiedImagePrompt ? <Check size={16} /> : <Copy size={16} />}
                        {copiedImagePrompt ? t('已复制！', 'Copied!') : t('复制提示词', 'Copy Prompt')}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW MODE: LIST (Events Table & Cards Overview)
  // =========================================================================
  return (
    <div className="in-app-events-workspace" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top action & status banner */}
      <div className="panel-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className={`status-pill ${isConfigured ? 'green' : 'amber'}`}>
            {isConfigured ? t('已连接 App Store Connect', 'Connected to App Store Connect') : t('本地草稿模式 (未配置连接)', 'Local Draft Mode (Offline)')}
          </span>
          {syncedAt && (
            <span style={{ fontSize: 12, color: 'var(--muted, #64748b)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock size={13} />
              {t('同步于', 'Synced at')}: {formatIsoDate(syncedAt)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button secondary"
            onClick={() => setShowAgentModal(true)}
            title={t('获取 AI Agent 提示词，通过 MCP 自动创建与规划活动', 'Get AI Agent prompt to plan events via MCP')}
          >
            <Sparkles size={15} style={{ color: '#8b5cf6' }} />
            {t('Agent 提示词', 'Agent Prompt')}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => fetchEvents(true)}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spinning' : ''} />
            {t('刷新同步', 'Sync & Refresh')}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleCreateNewDraft}
          >
            <Plus size={16} />
            {t('新建活动', 'Create Event')}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div className="panel padded" style={{ padding: '16px 20px', borderRadius: 10, background: 'var(--panel-bg, #ffffff)', border: '1px solid var(--border, #e2e8f0)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted, #64748b)', fontWeight: 500 }}>{t('全部活动', 'Total Events')}</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--text, #0f172a)' }}>{events.length}</div>
        </div>
        <div className="panel padded" style={{ padding: '16px 20px', borderRadius: 10, background: 'var(--panel-bg, #ffffff)', border: '1px solid var(--border, #e2e8f0)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted, #64748b)', fontWeight: 500 }}>{t('已发布 / 生效中', 'Published & Active')}</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#16a34a' }}>
            {events.filter(e => e.eventState === 'PUBLISHED' || e.eventState === 'APPROVED').length}
          </div>
        </div>
        <div className="panel padded" style={{ padding: '16px 20px', borderRadius: 10, background: 'var(--panel-bg, #ffffff)', border: '1px solid var(--border, #e2e8f0)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted, #64748b)', fontWeight: 500 }}>{t('草稿与待审核', 'Drafts & In Review')}</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#d97706' }}>
            {events.filter(e => e.eventState === 'DRAFT' || e.eventState === 'READY_FOR_REVIEW').length}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, background: 'var(--panel-bg, #ffffff)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 260 }}>
          <div style={{ position: 'relative', width: 'min(320px, 100%)' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
            <input
              type="text"
              placeholder={t('搜索活动参考名或文案...', 'Search event name or copy...')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: 34, height: 38, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13 }}
            />
          </div>
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            style={{ height: 38, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, padding: '0 12px' }}
          >
            <option value="all">{t('所有状态', 'All States')}</option>
            <option value="DRAFT">{t('草稿', 'Draft')}</option>
            <option value="READY_FOR_REVIEW">{t('准备审核', 'Ready for Review')}</option>
            <option value="APPROVED">{t('已批准', 'Approved')}</option>
            <option value="PUBLISHED">{t('已发布', 'Published')}</option>
            <option value="PAST">{t('已结束', 'Past')}</option>
          </select>
          <select
            value={badgeFilter}
            onChange={e => setBadgeFilter(e.target.value)}
            style={{ height: 38, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, padding: '0 12px' }}
          >
            <option value="all">{t('所有徽章类别', 'All Badge Types')}</option>
            {BADGE_OPTIONS.map(b => (
              <option key={b.key} value={b.key}>{lang === 'en' ? b.labelEn : b.labelZh}</option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted, #64748b)' }}>
          {t('展示', 'Showing')} {filteredEvents.length} / {events.length} {t('个活动', 'events')}
        </div>
      </div>

      {/* Events List or Empty State */}
      {filteredEvents.length === 0 ? (
        <div
          className="panel padded text-center"
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            background: 'var(--panel-bg, #ffffff)',
            borderRadius: 12,
            border: '1px dashed var(--border, #e2e8f0)',
          }}
        >
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f3e8ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Calendar size={28} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>
            {events.length === 0 ? t('暂无 App 内活动', 'No In-App Events Yet') : t('无符合筛选条件的活动', 'No matching events found')}
          </h3>
          <p style={{ maxWidth: 480, margin: '0 auto 20px', color: '#64748b', fontSize: 13.5, lineHeight: 1.6 }}>
            {events.length === 0
              ? t(
                  'App 内活动是在 App Store 集中展示的时效性活动，如竞技赛事、新版本重大功能首发、直播首映等。点击下方按钮即可进入与 App Store Connect 完全一致的活动详情与编辑页。',
                  'In-App Events are timely events displayed on the App Store. Click below to enter the App Store Connect style details and edit view.'
                )
              : t('可尝试清空搜索关键字或重置状态与徽章筛选条件。', 'Try clearing your search query or resetting filters.')}
          </p>
          {events.length === 0 && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                className="button primary"
                onClick={handleCreateNewDraft}
              >
                <Plus size={16} />
                {t('新建活动', 'Create Event')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 18 }}>
          {filteredEvents.map(ev => {
            const evBadgeNorm = ev.badge === 'LIVE_STREAM' ? 'LIVE_EVENT' : ev.badge;
            const badgeOpt = BADGE_OPTIONS.find(b => b.key === evBadgeNorm) || BADGE_OPTIONS[0];
            const primaryLoc = ev.localizations?.find(l => l.locale === ev.primaryLocale) || ev.localizations?.[0];
            const schedule = ev.territorySchedules?.[0];

            return (
              <div
                key={ev.id}
                className="panel"
                style={{
                  background: 'var(--panel-bg, #ffffff)',
                  borderRadius: 12,
                  border: '1px solid var(--border, #e2e8f0)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                }}
                onClick={() => initFormWithEvent(ev)}
              >
                {/* Card Header */}
                <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: '#e0e7ff',
                        color: '#4338ca',
                        fontSize: 11.5,
                        fontWeight: 600,
                      }}
                    >
                      {lang === 'en' ? badgeOpt.labelEn : badgeOpt.labelZh}
                    </span>
                    {ev.priority === 'HIGH' && (
                      <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: 6, fontWeight: 600 }}>
                        {t('高优先级', 'High Priority')}
                      </span>
                    )}
                  </div>

                  <span className={`status-pill ${ev.eventState === 'APPROVED' || ev.eventState === 'PUBLISHED' ? 'green' : ev.eventState === 'READY_FOR_REVIEW' ? 'blue' : 'amber'}`} style={{ fontSize: 11.5 }}>
                    {ev.eventState}
                  </span>
                </div>

                {/* Card Body */}
                <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
                    {primaryLoc?.name || ev.referenceName}
                  </h4>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {t('参考名称', 'Reference Name')}: <span style={{ fontFamily: 'monospace' }}>{ev.referenceName}</span>
                  </div>

                  {primaryLoc?.shortDescription && (
                    <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.45, background: '#f8fafc', padding: '8px 10px', borderRadius: 6 }}>
                      {primaryLoc.shortDescription}
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={13} style={{ color: '#0071e3' }} />
                      <span>{formatIsoDate(schedule?.eventStart)} ~ {formatIsoDate(schedule?.eventEnd)}</span>
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Globe size={13} style={{ color: '#64748b' }} />
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      {ev.localizations?.length || 1} {t('个语言版本', 'locales')}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="button secondary small"
                    onClick={e => {
                      e.stopPropagation();
                      initFormWithEvent(ev);
                    }}
                  >
                    <Eye size={13} />
                    {t('打开详情与编辑', 'Open & Edit')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AGENT PROMPT MODAL */}
      {showAgentModal && (
        <div className="app-store-pages-modal-backdrop" onClick={() => setShowAgentModal(false)}>
          <div className="app-store-pages-modal large" onClick={e => e.stopPropagation()}>
            <div className="modal-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={20} style={{ color: '#8b5cf6' }} />
                <h3 className="modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                  {t('In-App Events AI Agent 提示词', 'In-App Events AI Agent Prompt')}
                </h3>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={t('关闭', 'Close')}
                onClick={() => setShowAgentModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <pre
              style={{
                background: '#0f172a',
                color: '#f8fafc',
                padding: '16px 20px',
                borderRadius: 10,
                fontSize: 12.5,
                lineHeight: 1.6,
                maxHeight: '48vh',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'monospace',
              }}
            >
              {buildInAppEventsAgentPrompt(product, lang)}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowAgentModal(false)}
              >
                {t('关闭', 'Close')}
              </button>
              <button
                type="button"
                className="button primary"
                onClick={copyPromptText}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {copiedPrompt ? <Check size={16} /> : <Copy size={16} />}
                {copiedPrompt ? t('已复制！', 'Copied!') : t('复制提示词', 'Copy Prompt')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
