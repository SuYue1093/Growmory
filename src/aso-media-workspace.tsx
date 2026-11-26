import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ArrowLeft, ArrowRight, Gamepad2, Info, Joystick, Layers, Newspaper, Play, Search, Star, Share, Trash2, Upload, X } from 'lucide-react';
import { useI18n } from './i18n';
import profiles from '../server/aso-screenshot-profiles.json';
import { storeState } from './product-app-store';
import { APP_STORE_LOCALES } from './release-publication';
import type { Product } from './types';

type Version = { id: string; platform: string; version: string; state: string };
type Asset = { id: string; type: string; group: string; name?: string; url?: string; width?: number; height?: number; video?: boolean; videoUrl?: string; upload?: string; sourceLocale?: string };
type ImageDrag = { asset: Asset; pointerId: number; x: number; y: number; width: number; height: number; original: Asset[]; order: Asset[]; active: boolean };
type DraftGroup = { type: string; group: string; items: ({ id: string } | { name: string; data: string })[] };
type Snapshot = { draftGroups?: DraftGroup[]; locale: string; assets: Asset[]; fallbackAssets?: Asset[]; revision: string; editable: boolean; description?: string; promotionalText?: string; whatsNew?: string; name?: string; subtitle?: string };
const SEARCH = 'APP_STORE_SEARCH_RESULTS_ASSET';
const HEADER = 'PRODUCT_PAGE_HEADER_ASSET';
const SCREENSHOT = 'APP_SCREENSHOT';
const VIDEO = 'APP_PREVIEW';
const DEFAULT = 'DEFAULT_PROFILE';
const deviceDefaults: Record<string, string[]> = {
  IOS: [
    'IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE',
    'IPHONE_DYNAMIC_ISLAND_MEDIUM_PROFILE',
    'IPHONE_FACE_ID_LARGE_PROFILE',
    'IPAD_13_PROFILE',
    'IPHONE_DUO_PROFILE',
  ],
  MAC_OS: ['MAC_PROFILE'],
};

export const profileLabels: Record<string, string> = {
  IPHONE_DUO_PROFILE: 'iPhone Duo',
  IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE: 'iPhone 6.9" / 6.7"',
  IPHONE_DYNAMIC_ISLAND_MEDIUM_PROFILE: 'iPhone 6.3" / 6.1"',
  IPHONE_FACE_ID_LARGE_PROFILE: 'iPhone 6.5" / 6.7" (Face ID)',
  IPHONE_67_PROFILE: 'iPhone 6.7"',
  IPHONE_65_PROFILE: 'iPhone 6.5"',
  IPHONE_61_PROFILE: 'iPhone 6.1"',
  IPHONE_58_PROFILE: 'iPhone 5.8"',
  IPHONE_55_PROFILE: 'iPhone 5.5"',
  IPHONE_47_PROFILE: 'iPhone 4.7"',
  IPHONE_40_PROFILE: 'iPhone 4.0"',
  IPAD_13_PROFILE: 'iPad 13" / 12.9"',
  IPAD_PRO_3GEN_129_PROFILE: 'iPad Pro 12.9"',
  IPAD_PRO_129_PROFILE: 'iPad Pro 12.9"',
  IPAD_PRO_3GEN_11_PROFILE: 'iPad Pro 11"',
  IPAD_105_PROFILE: 'iPad 10.5"',
  IPAD_97_PROFILE: 'iPad 9.7"',
  MAC_PROFILE: 'Mac',
  APPLE_WATCH_ULTRA_PROFILE: 'Apple Watch Ultra',
  APPLE_WATCH_SERIES_7_PROFILE: 'Apple Watch Series 7/8/9/10',
  APPLE_WATCH_SERIES_4_PROFILE: 'Apple Watch Series 4/5/6',
  APPLE_TV_PROFILE: 'Apple TV',
};

const placementDimensions: Record<string, [number, number][]> = {
  [SEARCH]: [[3840, 2560]],
  [HEADER]: [[3840, 1646]],
  IPHONE_DUO_PROFILE: profiles.IPHONE_DUO_PROFILE.map(([width, height]) => [width, height]),
  IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE: [
    [1320, 2868], [1290, 2796], [1260, 2736],
    [2868, 1320], [2796, 1290], [2736, 1260],
  ],
  IPHONE_DYNAMIC_ISLAND_MEDIUM_PROFILE: [
    [1206, 2622], [1179, 2556],
    [2622, 1206], [2556, 1179],
  ],
  IPHONE_FACE_ID_LARGE_PROFILE: [
    [1242, 2688], [1284, 2778],
    [2688, 1242], [2778, 1284],
  ],
  IPHONE_67_PROFILE: [
    [1290, 2796], [1284, 2778],
    [2796, 1290], [2778, 1284],
  ],
  IPHONE_65_PROFILE: [
    [1242, 2688], [2688, 1242],
  ],
  IPHONE_61_PROFILE: [
    [1179, 2556], [1170, 2532],
    [2556, 1179], [2532, 1170],
  ],
  IPHONE_58_PROFILE: [
    [1125, 2436], [2436, 1125],
  ],
  IPHONE_55_PROFILE: [
    [1242, 2208], [2208, 1242],
  ],
  IPHONE_47_PROFILE: [
    [750, 1334], [1334, 750],
  ],
  IPAD_13_PROFILE: [
    [2064, 2752], [2048, 2732],
    [2752, 2064], [2732, 2048],
  ],
  IPAD_PRO_3GEN_129_PROFILE: [
    [2048, 2732], [2732, 2048],
  ],
  IPAD_PRO_129_PROFILE: [
    [2048, 2732], [2732, 2048],
  ],
  IPAD_PRO_3GEN_11_PROFILE: [
    [1668, 2388], [2388, 1668],
    [1640, 2360], [2360, 1640],
  ],
  IPAD_105_PROFILE: [
    [1668, 2224], [2224, 1668],
  ],
  IPAD_97_PROFILE: [
    [1536, 2048], [2048, 1536],
  ],
  MAC_PROFILE: [
    [2880, 1800], [2560, 1600], [1440, 900], [1280, 800],
  ],
  APPLE_WATCH_ULTRA_PROFILE: [
    [410, 502],
  ],
  APPLE_WATCH_SERIES_7_PROFILE: [
    [396, 484], [368, 448],
  ],
  APPLE_WATCH_SERIES_4_PROFILE: [
    [368, 448], [312, 390],
  ],
  APPLE_TV_PROFILE: [
    [3840, 2160], [1920, 1080],
  ],
};

function getTargetDimensions(type: string, group: string, width: number, height: number): [number, number] {
  if (type === SEARCH) return [3840, 2560];
  if (type === HEADER) return [3840, 1646];
  let candidates = placementDimensions[group];
  if (!candidates || !candidates.length) {
    if (group.includes('IPAD')) {
      candidates = placementDimensions.IPAD_13_PROFILE;
    } else if (group.includes('MAC')) {
      candidates = placementDimensions.MAC_PROFILE;
    } else if (group.includes('WATCH')) {
      candidates = placementDimensions.APPLE_WATCH_SERIES_7_PROFILE;
    } else {
      candidates = placementDimensions.IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE;
    }
  }
  if (candidates.some(([w, h]) => w === width && h === height)) {
    return [width, height];
  }
  const isLandscape = width > height;
  const sameOrient = candidates.filter(([w, h]) => (isLandscape ? w > h : w <= h));
  const pool = sameOrient.length ? sameOrient : candidates;
  const imageRatio = width / height;

  let best = pool[0];
  let minDiff = Infinity;
  for (const candidate of pool) {
    const candidateRatio = candidate[0] / candidate[1];
    const diff = Math.abs(candidateRatio - imageRatio);
    if (diff < minDiff - 1e-4) {
      minDiff = diff;
      best = candidate;
    } else if (Math.abs(diff - minDiff) <= 1e-4) {
      if (candidate[0] * candidate[1] > best[0] * best[1]) {
        best = candidate;
      }
    }
  }
  return best;
}

function renderScaledImage(canvas: HTMLCanvasElement, image: ImageBitmap, targetWidth: number, targetHeight: number) {
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('无法处理图片尺寸');
  const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
  const scaledWidth = Math.round(image.width * scale);
  const scaledHeight = Math.round(image.height * scale);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, Math.round((targetWidth - scaledWidth) / 2), Math.round((targetHeight - scaledHeight) / 2), scaledWidth, scaledHeight);
  return canvas.toDataURL('image/jpeg', 0.95);
}

async function resizeUpload(file: File, width: number, height: number) {
  const image = await createImageBitmap(file);
  try {
    if (image.width === width && image.height === height) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('无法读取图片'));
        reader.readAsDataURL(file);
      });
    }
    const canvas = document.createElement('canvas');
    return renderScaledImage(canvas, image, width, height);
  } finally { image.close(); }
}

async function resizeDataUrl(dataUrl: string, targetWidth: number, targetHeight: number): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const image = await createImageBitmap(blob);
  try {
    if (image.width === targetWidth && image.height === targetHeight) return dataUrl;
    const canvas = document.createElement('canvas');
    return renderScaledImage(canvas, image, targetWidth, targetHeight);
  } finally { image.close(); }
}

const groupKey = (asset: Pick<Asset, 'type' | 'group'>) => JSON.stringify([asset.type, asset.group]);

function applyMediaDraft(snapshot: Snapshot) {
  const assets = [...snapshot.assets];
  let hasConflict = false;
  for (const entry of snapshot.draftGroups || []) {
    const key = groupKey(entry);
    const original = snapshot.assets.filter(asset => groupKey(asset) === key);
    const next = entry.items.map(item => 'id' in item
      ? original.find(asset => asset.id === item.id)
      : { id: crypto.randomUUID(), type: entry.type, group: entry.group, name: item.name, url: item.data, upload: item.data });
    if (next.some(asset => !asset)) {
      hasConflict = true;
      continue;
    }
    const position = assets.findIndex(asset => groupKey(asset) === key);
    const unchanged = assets.filter(asset => groupKey(asset) !== key);
    unchanged.splice(position < 0 ? unchanged.length : position, 0, ...next.filter(asset => asset !== undefined));
    assets.splice(0, assets.length, ...unchanged);
  }
  return { assets, hasConflict };
}

const draftItems = (assets: Asset[]) => assets.map(asset =>
  asset.upload ? { name: asset.name!, data: asset.upload } : { id: asset.id });

function PreviewVideo({ asset }: { asset: Asset }) {
  const { t } = useI18n();
  const player = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const { videoUrl } = asset;

  useEffect(() => {
    const element = player.current;
    if (!playing || failed || !videoUrl || !element) return;
    if (!/\.m3u8(?:[?#]|$)/i.test(videoUrl)) {
      element.src = videoUrl;
      return;
    }
    let disposed = false;
    let destroy: (() => void) | undefined;
    void import('hls.js').then(({ default: Hls }) => {
      if (disposed) return;
      if (!Hls.isSupported()) {
        if (element.canPlayType('application/vnd.apple.mpegurl')) element.src = videoUrl;
        else setFailed(true);
        return;
      }
      const stream = new Hls();
      destroy = () => stream.destroy();
      stream.on(Hls.Events.ERROR, (_, error) => { if (error.fatal) setFailed(true); });
      stream.loadSource(videoUrl);
      stream.attachMedia(element);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; destroy?.(); };
  }, [playing, failed, videoUrl]);

  const ratio = asset.width && asset.height ? asset.width / asset.height : 16 / 9;
  return <div className="aso-preview-video" style={{ '--aso-video-ratio': ratio } as CSSProperties}>
    {playing && !failed ? <video ref={player} poster={asset.url} controls autoPlay muted playsInline
      aria-label={asset.name || t('App 预览视频', 'App preview video')} onError={() => setFailed(true)} />
      : videoUrl && !failed ? <button type="button" onClick={() => setPlaying(true)} aria-label={t('播放 App 预览', 'Play app preview')}>
        {asset.url && <img src={asset.url} alt="" />}<span><Play size={18} fill="currentColor" /></span>
      </button> : <>
        {asset.url && <img src={asset.url} alt={asset.name || ''} />}
        <small>{failed ? t('视频暂时无法播放', 'Video could not be played') : t('Apple 尚未提供播放地址', 'Apple has not provided a playback URL')}</small>
      </>}
  </div>;
}

function PreviewCopy({ promotionalText, description }: Pick<Snapshot, 'promotionalText' | 'description'>) {
  const { t } = useI18n();
  const text = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const element = text.current;
    if (!element || expanded) return;
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, promotionalText, description]);

  return <div className="aso-phone-description aso-preview-copy">
    <div ref={text} className={expanded ? undefined : 'aso-preview-copy-clamped'}>
      {promotionalText && <p>{promotionalText}</p>}
      {description && <p>{description}</p>}
    </div>
    {(overflow || expanded) && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {expanded ? t('收起', 'Show less') : t('更多', 'More')}
    </button>}
  </div>;
}

export function AsoMediaWorkspace({ product, notify }: { product: Product; notify?: (message: string) => void }) {
  const { t } = useI18n();
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionId, setVersionId] = useState('');
  const [primaryLocale, setPrimaryLocale] = useState('');
  const [locales, setLocales] = useState<string[]>([]);
  const [locale, setLocale] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Asset[] | null>(null);
  const [device, setDevice] = useState('');
  const drag = useRef<ImageDrag | null>(null);
  const positions = useRef<Map<HTMLElement, DOMRect> | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; url: string; x: number; y: number; width: number; height: number; order: Asset[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = `/api/aso/media/${encodeURIComponent(product.id)}`;
  const statusLabel = (state: string) => ({
    ACCEPTED: t('已通过审核', 'Accepted'),
    INVALID_BINARY: t('无效构建版本', 'Invalid binary'),
    PROCESSING_FOR_DISTRIBUTION: t('正在处理以供分发', 'Processing for distribution'),
    WAITING_FOR_EXPORT_COMPLIANCE: t('等待出口合规审核', 'Waiting for export compliance'),
  })[state] || storeState(state, t);
  const version = versions.find(item => item.id === versionId);
  const platform = version?.platform || '';
  const isMac = platform === 'MAC_OS';
  const platforms = [...new Set(versions.map(item => item.platform))];
  const platformLabel = (value: string) => ({ IOS: 'iOS / iPadOS', MAC_OS: 'macOS', TV_OS: 'tvOS', VISION_OS: 'visionOS' })[value] || value;
  const assets = dragPreview?.order || draft || snapshot?.assets || [];
  const groups = [...(snapshot?.assets || []), ...assets];
  const fallbacks = snapshot?.fallbackAssets || [];
  const existingGroups = [...groups, ...fallbacks].filter(asset => [SCREENSHOT, VIDEO].includes(asset.type));
  const devices = [...new Set([...(deviceDefaults[platform] || []), ...existingGroups.map(asset => asset.group)])];
  const selectedDevice = devices.includes(device) ? device : devices[0] || '';
  function displayGroup(type: string, group: string, candidates: Asset[]) {
    if (!deviceDefaults.IOS.includes(group) || candidates.some(asset => asset.type === type && asset.group === group)) return group;
    const family = group.startsWith('IPAD') ? 'IPAD' : 'IPHONE';
    return candidates.find(asset => asset.type === type && asset.group.startsWith(family))?.group || group;
  }
  function mediaForGroup(type: string, group: string, local: Asset[]) {
    const forGroup = (items: Asset[]) => {
      const target = type === SCREENSHOT || type === VIDEO ? displayGroup(type, group, items) : group;
      return items.filter(asset => asset.type === type && asset.group === target);
    };
    const own = forGroup(local);
    return own.length ? own : forGroup(fallbacks);
  }
  function creativeForDevice(type: string, local: Asset[]) {
    const forDevice = (items: Asset[]) => items.find(asset => asset.type === type && asset.group === selectedDevice)
      || items.find(asset => asset.type === type && asset.group === displayGroup(SCREENSHOT, selectedDevice, items))
      || items.find(asset => asset.type === type && asset.group === DEFAULT);
    return forDevice(local) || forDevice(fallbacks);
  }
  const creativeGroups = (type: string) => {
    const available = [...new Set([...groups, ...fallbacks].filter(asset => asset.type === type).map(asset => asset.group))];
    return available.length ? available : [DEFAULT];
  };

  function fallbackNotice(items: Asset[]) {
    const sources = [...new Set(items.flatMap(asset => asset.sourceLocale ? [asset.sourceLocale] : []))];
    return sources.map(source => {
      const label = APP_STORE_LOCALES[source] || source;
      return <p className="fine-print aso-media-fallback" key={source}>
        <Info size={14} aria-hidden="true" /> {t(`App Store 可能使用 ${label} 的素材`, `App Store may use artwork from ${source}`)}
      </p>;
    });
  }

  async function request<T>(path: string, payload?: object, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${base}/${path}`, {
      signal, ...(payload && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t('读取或提交失败', 'Could not read or submit'));
    return data;
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  function showSnapshot(current: Snapshot) {
    const { assets, hasConflict } = applyMediaDraft(current);
    setSnapshot(current);
    setDraft(assets);
    if (hasConflict) setError(t('部分草稿引用的商店素材已变更，对应组仍显示商店素材。',
      'Some draft groups reference store assets that have changed. Those groups still show the store assets.'));
  }

  async function loadLocales(id: string, preferred: string, signal?: AbortSignal) {
    setSnapshot(null);
    setDraft(null);
    setDevice('');
    setVersionId(id);
    setLocales([]);
    setLocale('');
    const data = await request<{ locales: string[] }>(`localized?${new URLSearchParams({ versionId: id })}`, undefined, signal);
    if (signal?.aborted) return;
    setLocales(data.locales);
    setLocale(data.locales.includes(preferred) ? preferred : data.locales[0] || '');
  }

  async function loadTargets(signal?: AbortSignal) {
    const targets = await request<{ versions: Version[]; primaryLocale: string }>('versions', undefined, signal);
    if (signal?.aborted) return;
    setVersions(targets.versions);
    setPrimaryLocale(targets.primaryLocale);
    const first = targets.versions.find(item => item.platform === 'IOS') || targets.versions[0];
    if (first) await loadLocales(first.id, targets.primaryLocale, signal);
  }

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    void loadTargets(controller.signal).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false);
    });
    return () => controller.abort();
    // This workspace is keyed by product ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  async function persistGroup(next: Asset[], { type, group }: Pick<Asset, 'type' | 'group'>) {
    await request('draft', { versionId, locale, type, group, items: draftItems(next.filter(asset => asset.type === type && asset.group === group)) });
    setDraft(next);
  }

  function reordered(order: Asset[], source: Asset, target: Asset) {
    const from = order.indexOf(source);
    const to = order.indexOf(target);
    if (from < 0 || to < 0 || from === to || groupKey(source) !== groupKey(target)) return order;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, source);
    return next;
  }

  function move(source: Asset, target: Asset) {
    if (!draft) return;
    const next = reordered(draft, source, target);
    if (next !== draft) void run(() => persistGroup(next, source));
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>, horizontal: boolean) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || !current.asset.url) return;
    const { clientX: x, clientY: y, currentTarget: gallery } = event;
    if (!current.active) {
      if (Math.hypot(x - current.x, y - current.y) < 6) return;
      current.active = true;
      gallery.setPointerCapture(event.pointerId);
    }
    const bounds = gallery.getBoundingClientRect();
    if (horizontal && y >= bounds.top && y <= bounds.bottom && x >= bounds.left && x <= bounds.right) {
      if (x < bounds.left + 32) gallery.scrollLeft -= 16;
      else if (x > bounds.right - 32) gallery.scrollLeft += 16;
    }
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-aso-asset]');
    const target = hit && gallery.contains(hit) && current.order.find(asset => asset.id === hit.dataset.asoAsset);
    if (target && target !== current.asset && groupKey(target) === groupKey(current.asset)) {
      const rect = hit.getBoundingClientRect();
      const forward = current.order.indexOf(target) > current.order.indexOf(current.asset);
      const distance = horizontal ? x - rect.left - rect.width / 2 : y - rect.top - rect.height / 2;
      if (forward ? distance >= 0 : distance <= 0) {
        positions.current = new Map([...gallery.querySelectorAll<HTMLElement>('[data-aso-asset]')]
          .map(element => [element, element.getBoundingClientRect()]));
        current.order = reordered(current.order, current.asset, target);
      }
    }
    setDragPreview({ id: current.asset.id, url: current.asset.url, x, y, width: current.width, height: current.height, order: current.order });
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>, save: boolean) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragPreview(null);
    if (save && current.active && current.order.some((asset, index) => asset !== current.original[index])) {
      setDraft(current.order);
      void run(async () => {
        try { await persistGroup(current.order, current.asset); }
        catch (error) {
          setDraft(current.original);
          throw error;
        }
      });
    }
  }

  useLayoutEffect(() => {
    const previous = positions.current;
    positions.current = null;
    if (!previous || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [element, before] of previous) {
      if (element.dataset.asoAsset === dragPreview?.id) continue;
      element.getAnimations().forEach(animation => animation.cancel());
      const after = element.getBoundingClientRect();
      const x = before.left - after.left;
      const y = before.top - after.top;
      if (x || y) element.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], { duration: 170, easing: 'ease-out' });
    }
  }, [dragPreview]);

  function addFile(file: File, type: string, group: string) {
    if (!draft) return;
    void run(async () => {
      if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 20 * 1024 * 1024) {
        throw new Error(t('请选择不超过 20 MB 的 PNG 或 JPEG 图片。', 'Choose a PNG or JPEG image up to 20 MB.'));
      }
      const imageBitmap = await createImageBitmap(file);
      const imgWidth = imageBitmap.width;
      const imgHeight = imageBitmap.height;
      imageBitmap.close();

      const [targetWidth, targetHeight] = getTargetDimensions(type, group, imgWidth, imgHeight);
      const url = await resizeUpload(file, targetWidth, targetHeight);
      const isExact = imgWidth === targetWidth && imgHeight === targetHeight;
      const name = isExact ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg';
      await persistGroup([
        ...draft.filter(asset => type === SCREENSHOT || asset.type !== type || asset.group !== group),
        { id: crypto.randomUUID(), name, type, group, url, upload: url, width: targetWidth, height: targetHeight },
      ], { type, group });
    });
  }

  const changes = [...new Set([...(snapshot?.assets || []), ...(draft || [])].map(groupKey))].flatMap(key => {
    if (!draft || !snapshot) return [];
    const original = snapshot.assets.filter(asset => groupKey(asset) === key);
    const next = draft.filter(asset => groupKey(asset) === key);
    if (JSON.stringify(original.map(asset => asset.id)) === JSON.stringify(next.map(asset => asset.id))) return [];
    const [type, group] = JSON.parse(key);
    return [{ type, group, items: draftItems(next) }];
  });
  const hasDraft = Boolean(changes.length || (snapshot?.draftGroups && snapshot.draftGroups.length > 0));

  function gallery(type: string, group: string, title: string, empty: string) {
    const items = mediaForGroup(type, group, assets);
    const previews = type === SCREENSHOT ? mediaForGroup(VIDEO, group, assets) : [];
    const displayed = [...previews, ...items];
    const limit = type === SCREENSHOT ? 10 : 1;
    const uploaded = snapshot?.assets.filter(asset => asset.type === type && asset.group === group).length || 0;
    return <section className="aso-media-gallery" key={groupKey({ type, group })}>
      <div className="aso-store-actions"><h5>{title}</h5>
        {draft && group && (type !== SCREENSHOT || assets.filter(asset => asset.type === SCREENSHOT && asset.group === group).length < limit) && <label className="aso-media-upload">
          <Upload size={14} /> {t('上传图片', 'Upload image')}
          <input aria-label={`${title} · ${t('上传图片', 'Upload image')}`} type="file" accept="image/png,image/jpeg" disabled={busy} onChange={e => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) addFile(file, type, group);
          }} />
        </label>}
      </div>
      {!displayed.length && <div className="aso-placement-empty">{empty}</div>}
      <div className={type === SCREENSHOT ? 'aso-store-strip' : ''}
        onPointerMove={event => updateDrag(event, type === SCREENSHOT)}
        onPointerUp={event => finishDrag(event, true)}
        onPointerCancel={event => finishDrag(event, false)}
        onLostPointerCapture={event => { if (event.target === event.currentTarget) finishDrag(event, false); }}
        onPointerLeave={event => { if (!drag.current?.active) finishDrag(event, false); }}>
        {displayed.map(asset => {
          const siblings = asset.type === VIDEO ? previews : items;
          const index = siblings.indexOf(asset);
          const draggable = !!draft && !asset.sourceLocale && siblings.length > 1 && !!asset.url;
          return <figure className={`aso-store-figure${dragPreview?.id === asset.id ? " aso-store-figure-dragging" : ""}`} key={asset.id} data-aso-asset={asset.id}>
            {asset.video || asset.videoUrl ? <PreviewVideo key={asset.videoUrl} asset={asset} /> : asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" draggable={false} aria-label={t('打开高清素材', 'Open full-resolution asset')}
              className={draggable ? 'aso-media-drag-image' : undefined}
              onPointerDown={event => {
                if (!draft || !draggable || busy || !event.isPrimary || event.button !== 0) return;
                const { width, height } = event.currentTarget.getBoundingClientRect();
                drag.current = { asset, pointerId: event.pointerId, x: event.clientX, y: event.clientY, width, height, original: draft, order: draft, active: false };
              }}>
              <img src={asset.url} alt={asset.name || title} draggable={false} loading="lazy" />
            </a> : <div className="aso-placement-empty">{t('Apple 尚未返回预览', 'Apple has not returned a preview')}</div>}
            {(asset.width && asset.height) ? <figcaption>{asset.width} × {asset.height}</figcaption> : null}
            {draft && !asset.sourceLocale && <div className="aso-store-actions">
              {siblings.length > 1 && <>
                <button type="button" className="button secondary small" aria-label={t(`前移素材 ${index + 1}`, `Move asset ${index + 1} earlier`)} disabled={busy || index === 0} onClick={() => move(asset, siblings[index - 1])}><ArrowLeft size={14} /></button>
                <button type="button" className="button secondary small" aria-label={t(`后移素材 ${index + 1}`, `Move asset ${index + 1} later`)} disabled={busy || index === siblings.length - 1} onClick={() => move(asset, siblings[index + 1])}><ArrowRight size={14} /></button>
              </>}
              <button type="button" className="button secondary small" aria-label={t(`移除 ${asset.name || title}`, `Remove ${asset.name || title}`)} disabled={busy} onClick={() => void run(() => persistGroup(draft.filter(item => item.id !== asset.id), asset))}><Trash2 size={14} /></button>
            </div>}
          </figure>;
        })}
      </div>
      {fallbackNotice(displayed)}
      {items.some(asset => asset.sourceLocale) && <p className="fine-print">
        {t(`当前语言已上传 ${uploaded}/${limit} 张`, `${uploaded}/${limit} uploaded for this localization`)}
      </p>}
    </section>;
  }

  function preview(search: boolean, previewAssets: Asset[]) {
    const deviceMedia = [VIDEO, SCREENSHOT].flatMap(type =>
      mediaForGroup(type, selectedDevice, previewAssets).filter(asset => asset.url || asset.videoUrl));
    const searchFallback = deviceMedia.slice(0, (deviceMedia[0]?.width || 0) > (deviceMedia[0]?.height || 0) ? 1 : 3);
    const mobile = platform === 'IOS';
    const tablet = mobile && selectedDevice.startsWith('IPAD');
    const phone = mobile && !tablet;
    const heroAsset = isMac ? undefined : creativeForDevice(HEADER, previewAssets);
    const hero = heroAsset?.url ? heroAsset : undefined;
    const searchAsset = creativeForDevice(SEARCH, previewAssets);
    const searchMedia = searchAsset?.url || searchAsset?.videoUrl ? [searchAsset] : searchFallback;
    const appName = snapshot?.name || product.name;
    const identity = <div className="aso-phone-identity">
      {product.icon ? <img src={product.icon} alt="" /> : <span className="aso-phone-icon" />}
      <div><strong>{appName}</strong>{snapshot?.subtitle && <small>{snapshot.subtitle}</small>}</div>
      <span className="aso-phone-get">{t('获取', 'Get')}</span>
    </div>;
    const tiles = (items: Asset[], className: string) => <div className={className}
      tabIndex={!search && items.length ? 0 : undefined}
      aria-label={!search && items.length ? t('App 预览和截图', 'App previews and screenshots') : undefined}
      role={!search && items.length ? 'region' : undefined}>
      {items.map(asset => asset.video || asset.videoUrl ? <PreviewVideo key={`${asset.id}:${asset.videoUrl}`} asset={asset} />
        : <img key={asset.id} src={asset.url} alt={asset.name || ''} loading="lazy"
          width={!search ? asset.width : undefined} height={!search ? asset.height : undefined} />)}
    </div>;
    const tabs = [
      { icon: Newspaper, label: 'Today' },
      { icon: Gamepad2, label: t('游戏', 'Games') },
      { icon: Layers, label: 'App' },
      { icon: Joystick, label: 'Arcade' },
      { icon: Search, label: t('搜索', 'Search') },
    ];
    return <><div key={`${versionId}:${locale}:${selectedDevice}`} className={`aso-preview-phone ${phone ? '' : tablet ? 'aso-preview-tablet' : 'aso-preview-desktop'} ${search ? 'aso-preview-search' : 'aso-preview-detail'}`}>
      {phone && <span className="aso-phone-island" />}
      {!mobile && <div className="aso-desktop-chrome"><span /><span /><span /><strong>App Store · {platformLabel(platform)}</strong></div>}
      <div className="aso-phone-scroll" tabIndex={0} role="region" aria-label={search ? t('搜索结果预览内容', 'Search results preview content') : t('详情页预览内容', 'Product page preview content')}>
        {search ? <>
          <div className="aso-phone-search-controls"><div className="aso-phone-searchbar"><Search size={13} />Search</div><span><X size={16} /></span></div>
          {identity}
          {tiles(searchMedia, 'aso-phone-search-media')}
          <div className="aso-phone-next-result" aria-hidden="true"><i /><span><i /><i /></span></div>
          <div className="aso-phone-placeholder" aria-hidden="true"><i /><i /><i /></div>
        </> : <>
          {!isMac && <div className={`aso-phone-hero ${hero ? '' : 'aso-phone-hero-empty'}`}>
            {hero && <>
              <img className="aso-phone-hero-backdrop" src={hero.url} alt="" />
              <img className="aso-phone-hero-artwork" src={hero.url} alt={hero.name || ''} />
            </>}
            <span><ArrowLeft size={16} /><Share size={16} /></span>
          </div>}
          {identity}
          <div className="aso-phone-meta">
            <span>{t('评分', 'Ratings')}<strong>–</strong><Star size={13} /></span>
            <span>{t('年龄分级', 'Age rating')}<strong>–</strong></span>
            <span>{t('语言', 'Language')}<strong>{locale.split('-')[0].toUpperCase()}</strong></span>
          </div>
          {tiles(deviceMedia, 'aso-phone-gallery')}
          {(snapshot?.promotionalText || snapshot?.description) && <PreviewCopy
            promotionalText={snapshot.promotionalText} description={snapshot.description} />}
          {snapshot?.whatsNew && <section className="aso-phone-description">
            <strong>{t('新功能', 'What’s New')}</strong><p>{snapshot.whatsNew}</p>
          </section>}
          <section className="aso-phone-description"><strong>{t('信息', 'Information')}</strong>
            <dl><dt>{t('版本', 'Version')}</dt><dd>{version?.version}</dd><dt>{t('语言', 'Language')}</dt><dd>{APP_STORE_LOCALES[locale] || locale}</dd></dl>
          </section>
        </>}
      </div>
      {mobile && <div className="aso-phone-navbar" aria-hidden="true">
        {tabs.map(({ icon: Icon, label }, index) => <span key={label} className={index === (search ? 4 : 2) ? 'active' : ''}><Icon size={16} />{label}</span>)}
      </div>}
    </div>{fallbackNotice(search ? searchMedia : [...(hero ? [hero] : []), ...deviceMedia])}</>;
  }

  function previewComparison(search: boolean) {
    return <div>
      <h4>{search ? t('搜索结果预览', 'Search results preview') : t('App Store 详情页预览', 'App Store product page preview')}</h4>
      {draft && snapshot ? <div className="aso-media-comparison">
        <section aria-label={t('编辑前', 'Before editing')}><h5>{t('编辑前 · 商店素材', 'Before · Store assets')}</h5>{preview(search, snapshot.assets)}</section>
        <section aria-label={t('编辑后', 'After editing')}><h5>{t('编辑后 · 当前草稿', 'After · Current draft')}</h5>{preview(search, assets)}</section>
      </div> : preview(search, assets)}
    </div>;
  }

  return <section className="aso-section-box aso-store-media">
    {dragPreview && <img className="aso-drag-preview" src={dragPreview.url} alt="" style={{ left: dragPreview.x, top: dragPreview.y, width: dragPreview.width, height: dragPreview.height }} />}
    <header className="aso-section-header aso-media-header">
      <div className="aso-section-title-group"><h3>{t('ASO 图片', 'ASO Media')}</h3>
        <p>{t('选择平台、版本与语言，读取商店素材。点击右侧图片查看高清版本。', 'Choose a version and localization, then read the store assets.')}</p>
      </div>
      <div className="aso-store-actions aso-media-targets">
        <label>{t('平台', 'Platform')}
          <select aria-label={t('平台', 'Platform')} value={platform} disabled={busy || !platforms.length} onChange={e => {
            const next = versions.find(item => item.platform === e.target.value);
            if (next) void run(() => loadLocales(next.id, locale || primaryLocale));
          }}>
            {!platforms.length && <option value="">—</option>}
            {platforms.map(item => <option key={item} value={item}>{platformLabel(item)}</option>)}
          </select>
        </label>
        <label>{t('版本', 'Version')}
          <select aria-label={t('版本', 'Version')} value={versionId} disabled={busy || !versions.length} onChange={e => void run(() => loadLocales(e.target.value, primaryLocale))}>
            {!versions.length && <option value="">{busy ? t('加载中…', 'Loading…') : '—'}</option>}
            {versions.filter(item => item.platform === platform).map(item => <option key={item.id} value={item.id}>{item.version} · {statusLabel(item.state)}</option>)}
          </select>
        </label>
        <label>{t('本地化语言', 'Localization')}
          <select value={locale} disabled={busy || !locales.length} onChange={e => { setLocale(e.target.value); setSnapshot(null); setDraft(null); setError(''); }}>
            {!locales.length && <option value="">—</option>}
            {locales.map(code => <option key={code} value={code}>{APP_STORE_LOCALES[code] || code} ({code})</option>)}
          </select>
        </label>
        <button type="button" className="button primary small" disabled={busy || (!!versions.length && !locale && !error)} onClick={() => void run(async () => {
          if (!versions.length) return loadTargets();
          if (!locale) return loadLocales(versionId, primaryLocale);
          const current = await request<Snapshot>(`localized?${new URLSearchParams({ versionId, locale })}`);
          showSnapshot(current);
        })}>{!locale && error ? t('重试', 'Retry') : t('读取', 'Read')}</button>
      </div>
    </header>
    {busy && <p role="status">{t('正在处理素材…', 'Working on assets…')}</p>}
    {error && <p role="alert">{error}</p>}
    {snapshot ? <>
      <div className="aso-store-actions aso-store-subnav" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '14px 0' }}>
        <button type="button" className="button secondary" disabled={busy || !hasDraft} onClick={() => void run(async () => {
          await request('reset-draft', { versionId, locale });
          if (snapshot) {
            setDraft([...snapshot.assets]);
            setSnapshot({ ...snapshot, draftGroups: [] });
          }
          setError('');
          notify?.(t('草稿已重置，已恢复与线上一致', 'Draft reset to match store assets'));
        })}>{t('重置草稿', 'Reset Draft')}</button>
        <button type="button" className="button primary" disabled={busy || !snapshot.editable || !changes.length} onClick={() => void run(async () => {
          const verifiedChanges = await Promise.all(changes.map(async change => {
            const items = await Promise.all(change.items.map(async item => {
              if ('data' in item && typeof item.data === 'string' && item.data.startsWith('data:image/')) {
                const res = await fetch(item.data);
                const blob = await res.blob();
                const bmp = await createImageBitmap(blob);
                const [tw, th] = getTargetDimensions(change.type, change.group, bmp.width, bmp.height);
                const needsResize = bmp.width !== tw || bmp.height !== th;
                bmp.close();
                if (needsResize) {
                  const resizedData = await resizeDataUrl(item.data, tw, th);
                  return { ...item, data: resizedData };
                }
              }
              return item;
            }));
            return { ...change, items };
          }));
          const updated = await request<Snapshot>('submit-media', { versionId, locale, revision: snapshot.revision, changes: verifiedChanges });
          const current = { ...snapshot, ...updated, draftGroups: updated.draftGroups || [] };
          showSnapshot(current);
          notify?.(t('素材已提交并回读确认', 'Assets submitted and verified'));
        })}>{t('提交至商店', 'Submit to Store')}</button>
        <span className="fine-print">{snapshot.editable
          ? t('上传、移除和排序会自动保存草稿。', 'Uploads, removals and reordering are saved automatically.')
          : t('可保存本地草稿，当前版本不可提交素材。', 'Local drafts can be saved. This version cannot submit assets.')}</span>
      </div>
      <div className="aso-store-actions aso-store-subnav"><label>{t('设备规格', 'Device profile')}
        <select value={selectedDevice} disabled={busy || !devices.length} onChange={e => setDevice(e.target.value)}>
          {!devices.length && <option value="">—</option>}
          {devices.map(group => <option key={group} value={group}>{profileLabels[group] || (group === 'MAC_PROFILE' ? 'Mac' : group.replace(/_PROFILE$/, '').replaceAll('_', ' '))}</option>)}
        </select>
      </label></div>
      {!isMac && <section className="aso-media-preview-row">
        {previewComparison(true)}
        <div>{creativeGroups(SEARCH).map(group => gallery(SEARCH, group, t('搜索结果图片', 'Search result artwork'), t('此展示位暂无素材', 'No asset for this placement')))}</div>
      </section>}
      <section className={`aso-media-preview-row ${isMac ? 'aso-media-preview-row-mac' : ''}`}>
        {previewComparison(false)}
        <div>
          {!isMac && creativeGroups(HEADER).map(group => gallery(HEADER, group, t('标题图片', 'Header artwork'), t('此展示位暂无素材', 'No asset for this placement')))}
          {gallery(SCREENSHOT, selectedDevice, t('App 截图', 'App screenshots'), t('暂无 App 预览和截图', 'No app previews or screenshots'))}
        </div>
      </section>
    </> : !busy && !error && <div className="aso-placement-empty">{t('请选择版本和语言，然后点击「读取」。', 'Choose a version and localization, then select Read.')}</div>}
  </section>;
}
