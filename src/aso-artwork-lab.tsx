import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  ArrowLeft, ArrowUpRight, Camera, Check, ChevronRight, Clipboard, Copy, Download, Image, Images, Plus, RefreshCw, Trash2, Upload,
} from 'lucide-react';
import profiles from '../server/aso-screenshot-profiles.json';
import { useI18n } from './i18n';
import { profileLabels } from './aso-media-workspace';
import { APP_STORE_LOCALES } from './release-publication';
import { AssetPickerModal } from './asset-picker-modal';
import type { Asset, Data, Product } from './types';

type Profile = keyof typeof profiles;
type Target = { locale: string; profile: Profile; size: string; goal: string };
type Status = 'planning' | 'review' | 'capture' | 'design' | 'ready' | 'submitted';
type Summary = {
  id: string;
  target: Target;
  createdAt: string | null;
  shotCount: number;
  captureCount: number;
  finalCount: number;
  status: Status;
  submission: { versionId: string; version: string; submittedAt: string } | null;
};
type Shot = { key: string; title: string; headline: string; subheadline?: string; capture: string };
type ArtworkSet = Summary & {
  revision: number;
  confirmedAt: string | null;
  plan: { direction?: string; shots: Shot[] } | null;
  captures: { slot: string; width: number; height: number; source: 'import' | 'simulator' }[];
  finals: string[];
};
type Version = { id: string; platform: string; version: string; state: string };

const firstSize = (profile: Profile) => profiles[profile][0].join('x');
const pixels = (size: string) => size.replace('x', ' × ');
const keys = Object.keys(profiles) as Profile[];
const defaultTarget: Target = {
  locale: 'zh-Hans', profile: 'IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE',
  size: firstSize('IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE'), goal: '',
};
const platformFor = (profile: Profile) => profile === 'MAC_PROFILE' ? 'MAC_OS' : profile === 'APPLE_TV_PROFILE' ? 'TV_OS' : 'IOS';
const assetUrl = (asset: Asset) => asset.url || `/api/assets/file/${encodeURIComponent(asset.id)}`;
const maxShots = 10;
const productLogoPath = 'branding/product-logo.png';
const screenshotFileName = (shot: Shot, order?: number) =>
  `${order === undefined ? '' : `${order}-`}${shot.key}.png`;

export function AsoArtworkLab({ product, products, assetLibrary, notify }: {
  product: Product;
  products: Product[];
  assetLibrary?: Pick<Data, 'assets' | 'assetFolders' | 'releases'>;
  notify?: (message: string) => void;
}) {
  const { t, lang } = useI18n();
  const [sets, setSets] = useState<Summary[]>([]);
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [active, setActive] = useState<ArtworkSet | null>(null);
  const [target, setTarget] = useState<Target>(defaultTarget);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [versionId, setVersionId] = useState('');
  const [draftMode, setDraftMode] = useState<'replace' | 'append' | ''>('');
  const [replaceRevision, setReplaceRevision] = useState('');
  const [assetShot, setAssetShot] = useState<Shot | null>(null);
  const [showSupplement, setShowSupplement] = useState(false);
  const [copySource, setCopySource] = useState<Summary | null>(null);
  const [copyLocale, setCopyLocale] = useState('');
  const copyDialog = useRef<HTMLDialogElement>(null);
  const base = `/api/aso/artwork/${encodeURIComponent(product.id)}`;
  const statusText = {
    planning: t('待生成方案', 'Awaiting brief'),
    review: t('待确认方案', 'Awaiting confirmation'),
    capture: t('待补齐原始截图', 'Awaiting screenshots'),
    design: t('待上传成图', 'Awaiting final images'),
    ready: t('待提交草稿', 'Ready to save'),
    submitted: t('已提交草稿', 'Saved to drafts'),
  };
  const profileName = (profile: Profile) => profileLabels[profile] || profile;
  function sizeLabel(profile: Profile, size: string) {
    if (profile !== 'IPHONE_DUO_PROFILE') return `${pixels(size)} px`;
    const [width, height] = size.split('x').map(Number);
    const screen = Math.min(width, height) === 1398 ? t('外屏', 'Outer display') : t('内屏', 'Inner display');
    const orientation = width > height ? t('横屏', 'Landscape') : t('竖屏', 'Portrait');
    return `${screen} · ${orientation} · ${pixels(size)} px`;
  }
  const label = (target: Target) => `${target.locale} / ${profileName(target.profile)} / ${sizeLabel(target.profile, target.size)}`;
  const plan = active?.plan;
  const remainingShots = maxShots - (active?.shotCount ?? 0);
  const phase = active ? ({ planning: 0, review: 0, capture: 1, design: 2, ready: 3, submitted: 4 })[active.status] : 0;
  const canvasRatio = Number(target.size.split('x')[0]) / Number(target.size.split('x')[1]);
  const dateFormat = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const capturesReady = !!(active?.confirmedAt && plan && active.captureCount === active.shotCount);
  const finalsReady = capturesReady && active?.finalCount === active?.shotCount;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw Object.assign(new Error(detail?.error || t('图片实验室请求失败，请重试。', 'Artwork Lab request failed. Try again.')), {
        draftRevision: detail?.draftRevision,
      });
    }
    return response.json();
  }

  const post = <T,>(url: string, payload: object) => request<T>(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });

  useEffect(() => {
    let current = true;
    request<Summary[]>(base).then(list => {
      if (current) setSets(list);
    }).catch(error => {
      if (current) setError(error.message);
    }).finally(() => {
      if (current) setBusy(false);
    });
    return () => { current = false; };
  }, [base]);

  useEffect(() => {
    if (copySource) copyDialog.current?.showModal();
  }, [copySource]);

  function closeCopy() {
    setCopySource(null);
    setError('');
  }

  function show(set: ArtworkSet) {
    setActive(set);
    setReplaceRevision('');
    setView('detail');
  }

  function showList() {
    setView('list');
    setActive(null);
    setVersions(null);
    setVersionId('');
    setReplaceRevision('');
  }

  function returnToList() {
    showList();
    void run(async () => setSets(await request<Summary[]>(base)));
  }

  function deleteSet(set: ArtworkSet) {
    if (!window.confirm(t(
      '确定删除此方案？方案中的原始截图和最终成图会一并删除。已提交的 ASO 图片草稿会保留。',
      'Delete this brief and its original and final images? Any saved ASO image draft will be kept.',
    ))) return;
    setReplaceRevision('');
    void run(async () => {
      await request(`${base}/${set.id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: set.revision }),
      });
      setSets(current => current.filter(item => item.id !== set.id));
      showList();
      notify?.(t('已删除方案', 'Brief deleted'));
    });
  }

  function deleteShot(set: ArtworkSet, shot: Shot) {
    if (!window.confirm(t(
      `删除「${shot.title}」？该项的原始截图和成图会一并删除。已提交的 ASO 图片草稿会保留。`,
      `Delete “${shot.title}”? Its screenshots and final image will be removed. Saved ASO image drafts will be kept.`,
    ))) return;
    void run(async () => {
      const updated = await request<ArtworkSet>(`${base}/${set.id}/shots/${shot.key}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: set.revision }),
      });
      show(updated);
      notify?.(t('已删除图项', 'Artwork item deleted'));
    });
  }

  function supplementTask(set: ArtworkSet, requirements: string) {
    const args = JSON.stringify({ productId: product.id, setId: set.id });
    const context = `${product.name} / ${label(set.target)}`;
    return t(
      `为 Growmory ASO 图片实验室的现有方案补充图项。
目标：${context}
补充要求：${requirements}

1. 用 get_aso_artwork_set 读取现有图项、目标和最新 revision。参数：${args}。每个方案最多 ${maxShots} 项。按补充要求确定新增数量，未指定时补 1 项。现有图项已满足要求时，直接告知用户。
2. 结合现有卖点，用 get_aso_context 核对真实功能。为每个新项写一个卖点、目标语言的主标题和可选副标题。给出未占用的 key，并用一句话在 capture 中描述要看到的页面和内容。
3. 调用 append_aso_artwork_shots，传入上述 productId、setId、最新 revision 和仅含新增图项的 shots 数组。新项追加到末尾，保留已有图项、顺序和图片。
4. 告知用户刷新并确认补充后的方案。截图另行发起。`,
      `Add artwork items to the existing Growmory ASO brief.
Target: ${context}
Requirements: ${requirements}

1. Read the existing items, target and latest revision with get_aso_artwork_set: ${args}. A brief can contain up to ${maxShots} items. Follow the requested count or add one if unspecified. If the existing items already cover the request, report that to the user.
2. Verify the app's real features with get_aso_context. Give each new item one benefit, a localized headline and optional subtitle, and a unique unused key. Use one sentence in capture to describe the screen and what must be visible.
3. Call append_aso_artwork_shots with the productId, setId, latest revision and a shots array containing only the new items. Append the items at the end and preserve the existing items, order and images.
4. Ask the user to refresh and confirm the updated brief. Capture begins separately.`,
    );
  }

  const imageUrl = (set: ArtworkSet, key: string, final = false) =>
    `${base}/${set.id}/${final ? 'final/' : ''}${key}.png?revision=${set.revision}`;

  function captureTask(set: ArtworkSet, shot?: Shot) {
    const args = JSON.stringify({ productId: product.id, setId: set.id });
    const context = `${product.name} / ${label(set.target)}`;
    const duo = set.target.profile === 'IPHONE_DUO_PROFILE';
    const iphone = set.target.profile.startsWith('IPHONE_');
    return t(
      `${shot ? '只为已确认的 Growmory ASO 方案中的指定图项获取一张原始截图。' : '为已确认的 Growmory ASO 方案补齐原始截图。'}本任务只允许离屏渲染目标 App 的实际视图。
禁止启动或使用模拟器、真机、Device Hub、simctl、XCUITest 或 capture_aso_artwork_screenshot 取图。方案确认只适用于离屏渲染。只有用户明确要求改用其他取图方式后，才按新指令执行。
目标：${context}
用 get_aso_artwork_set 读取方案、确认状态、已有截图和最新 revision。参数：${args}${shot ? `\n指定图项：${shot.title}（shot.key = ${shot.key}）\n预期截图：${shot.capture}\n仅处理此 key。以最新方案中该项的 capture 为准。若图项已移除或方案尚未确认，报告原因后结束。` : ''}

- ${shot ? '以指定图项的 capture 验收画面。' : '把 shots[].capture 当作画面验收条件。'}先在目标 App 工程找可复用的视图、预览和样本。只通过 App 的数据层加载画面需要的样本，用内存数据库或独立临时存储，固定会影响画面的日期、语言和选中状态。
- 复用项目的离屏渲染入口。没有现成入口时，在隔离副本里创建临时渲染入口，先尝试导出并检查一张。若目标界面走 iOS 专用布局，复用实际的共用子视图，在临时入口中接入目标布局所需的容器和环境值。例如在 Mac 上用 NSHostingView 承载共用 SwiftUI 视图，在屏幕外完成布局，再从视图图层导出。按目标设备的逻辑尺寸、安全区和像素倍率渲染。若控件导出为空或占位，继续尝试能渲染这些控件的离屏入口。
- ${iphone ? '每张 iPhone 离屏截图都要渲染可见的状态栏，按目标设备的样式呈现时间、网络和电量。已有原生状态栏时直接保留。' : '画面需要状态栏时，按目标设备预留空间并模拟。'}${duo ? ' iPhone Duo 折叠时的外屏横屏和竖屏、展开后的内屏横屏，均使用右侧纵向状态栏。展开后的内屏竖屏使用顶部横向状态栏。' : iphone ? ' 按目标机型和方向适配状态栏，并考虑灵动岛或刘海的占位。横屏原生状态栏默认隐藏时，在安全区内模拟一条可见状态栏。' : ''} 无法离屏取得原生状态栏或系统工具栏时，在预览中模拟。工具栏只放项目实际定义的按钮。为栏位预留安全区，检查是否遮挡或裁掉关键信息。
- ${shot ? '该图位仍无法满足取景要求时，报告尝试过的离屏方式和具体阻塞。' : '个别图位仍无法满足取景要求时，保留空位，报告对应的 shot.key、尝试过的离屏方式和具体阻塞，继续完成其余图位。'}
- ${shot ? `核对取景、语言、尺寸和内容完整性，导出 ${shot.key}.png。只在该图位没有原始截图时，通过「上传原始截图」用最新 revision 回填此项。该图位已有截图或无法回填时，交付新 PNG 路径。报告图片来源和模拟的系统元素。` : '打开导出的图片，逐张核对取景、语言、尺寸和内容完整性。文件名用该图的 shot.key 加 .png 后缀。通过「上传原始截图」回填缺图，每次写入用最新 revision 并保留已有截图。报告每张图的来源和模拟的系统元素。无法回填时，给出 PNG 路径并列出缺图和原因。'}`,
      `${shot ? 'Capture one source screenshot for the specified item in the approved Growmory artwork brief.' : 'Fill the missing source screenshots for the approved Growmory artwork brief.'} This task only permits offscreen rendering of the actual app views.
Do not start or use a simulator, physical device, Device Hub, simctl, XCUITest, or capture_aso_artwork_screenshot to acquire images. Brief approval applies to offscreen rendering only. Switch capture methods only if the user explicitly requests the change.
Target: ${context}
Read the brief, approval, existing captures and latest revision with get_aso_artwork_set: ${args}${shot ? `\nSpecified item: ${shot.title} (shot.key = ${shot.key})\nIntended screen: ${shot.capture}\nWork on this key only. Follow its current capture field in the brief. If the item was removed or the brief is unapproved, report the reason and stop.` : ''}

- ${shot ? 'Verify the specified item against its capture field.' : 'Treat shots[].capture as the visible result to verify.'} Look for reusable views, previews and fixtures in the target app project. Seed only the data needed for the screen through the app’s data layer, using an in-memory database or isolated temporary store. Set dates, locale and selections that affect the result.
- Reuse the app’s offscreen renderer when available. Otherwise create a temporary render entry point in an isolated copy and try exporting and inspecting one shot first. For an iOS-specific layout, reuse the actual shared subviews and supply the layout containers and environment values in the temporary entry point. For example, on a Mac, use NSHostingView to host reusable SwiftUI views, lay them out offscreen and export from the view layer. Use the device’s logical size, safe areas and pixel scale. If controls render as blanks or placeholders, try an offscreen entry point that renders them.
- ${iphone ? 'Render a visible status bar in every iPhone offscreen screenshot. Show the time, network and battery in the target device’s style. Keep the native status bar if it is already present.' : 'Reserve room for a status bar and simulate it for the target device when the shot needs one.'}${duo ? ' On iPhone Duo, use a vertical status bar at the right edge for the closed outer display in either orientation and the open inner display in landscape. Use a horizontal status bar at the top for the open inner display in portrait.' : iphone ? ' Adapt the bar to the target model and orientation, accounting for the Dynamic Island or notch. If landscape normally hides the native bar, simulate a visible one within the safe area.' : ''} Simulate native status or toolbars that are unavailable offscreen and include only the app’s existing toolbar actions. Reserve safe areas and check for covered or clipped key content.
- ${shot ? 'If this shot cannot meet its acceptance conditions, report the offscreen approaches attempted and the concrete blocker.' : 'If a shot still cannot meet its acceptance conditions, leave its slot empty and report the shot.key, offscreen approach attempted, and concrete blocker. Continue with the remaining shots.'}
- ${shot ? `Verify the scene, language, dimensions and visible content, then export ${shot.key}.png. Use Upload original screenshot with the latest revision only if the specified slot is empty. If it already has a capture or you cannot upload, return the new PNG path. Report the source and any simulated system elements.` : 'Open each exported PNG and verify the scene, language, dimensions and visible content. Name each file after its shot.key with a .png extension. Fill the matching missing position via Upload original screenshot using the latest revision for each write, and keep existing captures. Report each image’s source and any simulated system elements. If you cannot upload, return the PNG paths and identify missing shots and blockers.'}`
    );
  }

  function planTask(set: ArtworkSet) {
    const args = JSON.stringify({ productId: product.id, setId: set.id });
    const context = `${product.name} / ${label(set.target)}`;
    return t(
      `为 Growmory ASO 图片实验室准备逐图方案，保存后等待用户确认。
目标：${context}
补充目标：${set.target.goal || '结合产品资料提炼卖点'}

1. 用 get_aso_artwork_set 读取目标和最新 revision。参数：${args}
2. 用 get_aso_context 核对真实功能，按需用 get_aso_media 参考现有商店素材。
3. 用 save_aso_artwork_plan 按上架顺序保存。每张只写一个卖点、目标语言主标题及可选副标题，并给出稳定的 key。用一句话在 capture 中描述「截图要看到什么」，只写页面和必须可见的内容。例如「书摘详情页，正文、书名和一条批注同时可见」。可选的 direction 只概括整组卖点。不写构图、排版、点击路径、测试数据结构或实现步骤。
4. 告知用户刷新并确认方案，待用户另行发起截图任务。${set.plan ? '\n\n本次是在同一方案上重新生成。先读现有方案，按用户本轮意见调整并保存回同一个 setId。已有原始截图的位置保持原 key 和 capture，已有成图的位置保留主副标题。确需改动这些位置时，说明需要用户处理的图片。' : ''}`,
      `Prepare a slide-by-slide Growmory artwork brief and wait for approval after saving it.
Target: ${context}
Goal: ${set.target.goal || 'Choose benefits grounded in product documentation'}

1. Read the target and latest revision with get_aso_artwork_set: ${args}
2. Verify actual features with get_aso_context and reference get_aso_media as needed.
3. Use save_aso_artwork_plan to save slides in store order. Give each slide one benefit, a localized headline and optional subtitle, and a stable key. Use one sentence in capture to describe the intended visible result, including only the screen and what must be visible. Example: “Excerpt detail showing the excerpt text, book title and one annotation.” Optionally use direction to summarize the series messaging. Omit composition, layout, navigation steps, data structures and implementation instructions.
4. Ask the user to refresh and approve the brief. Capture begins in a separate task.${set.plan ? '\n\nRegenerate this existing brief in place. Read the current brief, apply the user’s latest feedback, and save to the same setId. Keep the key and capture text for shots with attached screenshots, and preserve headlines and subtitles for shots with final artwork. If these must change, identify the images the user needs to handle.' : ''}`
    );
  }

  function handoff(set: ArtworkSet, numbered = false, templatePath?: string) {
    if (!set.plan?.shots.length) return '';
    const { target, plan } = set;
    const [first, ...later] = plan.shots;
    const name = t(product.name, product.englishName || product.name);
    const fileName = (shot: Shot, order: number) => screenshotFileName(shot, numbered ? order : undefined);
    const shotCopy = (shot: Shot, order: number) => [
      `${t('原始截图', 'Source screenshot')} — ${fileName(shot, order)}`,
      `${t('主标题', 'Headline')} — ${shot.headline}`,
      shot.subheadline && `${t('副标题', 'Subtitle')} — ${shot.subheadline}`,
    ].filter(Boolean).join('\n\n');
    return [
      t(
        `# ${name} App Store 上架图（使用图片生成，而不是agent模式）

本轮只输出首张成图，使用附件 ${fileName(first, 1)} 和下方首张文案。输出一张 ${pixels(target.size)} px 的不透明 RGB PNG，目标语言为 ${target.locale}。交付后停下来等待我确认。收到修改意见时只迭代首张。首张确认后，按我指定的图项继续，每轮只输出一张。

## 设计与验收

- 从 App 界面和随附的品牌素材提取配色、字体风格和视觉细节，转化为有辨识度的上架图风格。自主选择构图和视觉表现，让样图可以作为后续图片的风格基准。

- 围绕首张的一个卖点建立清晰的视觉层级。主标题和关键界面应在 App Store 搜索结果缩略图上仍能一眼看懂。用留白、对齐和对比组织画面，文字和关键内容与画布边缘留出足够距离。

- 让真实 App 的使用画面成为视觉主体。把提供的截图作为图层，保留关键界面、界面原文和操作信息。若附件含离屏渲染时模拟的状态栏或工具栏，沿用附件中的布局与按钮。背景、说明和装饰服务于功能展示，避免遮挡关键界面或加入产品没有的功能和卖点。

- 准确使用下方主标题及给定的副标题，检查拼写、断行和可读性。交付前核对像素尺寸、无透明通道和缩略图可读性。只交付一张可独立上传的成图文件。`,
        `# ${name} App Store artwork (use image generation, not agent mode)

Create only the first image in this round, using the attached ${fileName(first, 1)} and the first image's copy below. Deliver one opaque RGB PNG at ${pixels(target.size)} px in locale ${target.locale}. Stop after delivery and wait for my approval. If I request revisions, revise the first image only. Once it is approved, continue with the item I request, one image per round.

## Design and review

- Draw the palette, typographic character and visual details from the app UI and any attached logo. Develop a distinctive look that fits this product. Choose the composition and visual treatment, and use this image to establish a style for the series.

- Build a clear visual hierarchy around one benefit. The headline and key interface should read clearly at App Store search thumbnail size. Use spacing, alignment and contrast, and leave room between critical content and the canvas edges.

- Make the actual app in use the visual focus. Place the supplied screenshot as an image layer and preserve the key interface, in-app text and actions. If the attachment shows a status bar or toolbar simulated during offscreen rendering, keep its layout and controls. Keep supporting graphics and copy clear of the key interface and use claims supported by the product.

- Use the supplied headline and any specified subtitle accurately. Check spelling, line breaks, thumbnail legibility, exact pixel dimensions and opacity. Deliver one standalone image suitable for upload.`
      ),
      label(target),
      ...(templatePath ? [t(
        `设备模具 — ${templatePath}。将原始截图等比嵌入屏幕区域。`,
        `Device template — ${templatePath}. Fit the source screenshot proportionally in the screen area.`,
      )] : []),
      `## ${t('本轮首张', 'First image for this round')} · ${first.title}\n\n${shotCopy(first, 1)}`,
      ...(later.length ? [
        t('## 后续图项\n\n仅供首张通过后按需制作。', '## Later images\n\nUse these only when requested after the first image is approved.'),
        ...later.map((shot, i) => `### ${i + 2}. ${shot.title}\n\n${shotCopy(shot, i + 2)}`),
      ] : []),
    ].join('\n\n');
  }

  async function copy(text: string, message: string) {
    await navigator.clipboard.writeText(text);
    notify?.(message);
  }

  async function fetchScreenshot(set: ArtworkSet, shot: Shot) {
    const response = await fetch(imageUrl(set, shot.key));
    if (!response.ok) throw new Error(t('读取截图失败，请刷新方案后重试。', 'Unable to read the screenshot. Refresh the brief and try again.'));
    return response.blob();
  }

  async function copyImage(set: ArtworkSet, shot: Shot) {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      throw new Error(t('当前浏览器不支持复制图片，请下载原图。', 'Image clipboard is unavailable. Download the original PNG.'));
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': fetchScreenshot(set, shot) })]);
    notify?.(t('已复制截图', 'Screenshot copied'));
  }

  async function download(set: ArtworkSet) {
    if (!set.plan) return;
    const zip = new JSZip();
    const template = await fetch(`${base}/${set.id}/device-template`);
    const templatePath = template.status === 204 ? undefined : 'device/device-template.png';
    zip.file('brief.md', handoff(set, true, templatePath));
    if (templatePath) {
      if (!template.ok || template.headers.get('content-type') !== 'image/png') {
        throw new Error(t('无法读取平台的设备模具，请重试。', 'Unable to read the platform device template. Try again.'));
      }
      zip.file(templatePath, await template.blob(), { createFolders: false });
    }
    if (product.icon) {
      try {
        const response = await fetch(product.icon);
        if (!response.ok) throw new Error();
        const logo = await response.blob();
        zip.file(productLogoPath, logo.type === 'image/png' ? logo : await encodePng(logo), { createFolders: false });
      } catch {
        throw new Error(t('无法读取产品 Logo，请在产品资料中检查 Logo 后重试。', 'Unable to read the product logo. Check the logo in the product details and try again.'));
      }
    }
    for (const [index, shot] of set.plan.shots.entries()) {
      zip.file(screenshotFileName(shot, index + 1), await fetchScreenshot(set, shot));
    }
    const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `aso-artwork-${set.target.locale}-${set.target.size}.zip`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function encodePng(file: Blob, finalSize?: string) {
    const bitmap = await createImageBitmap(file).catch(() => {
      throw new Error(t('无法读取这张图片。', 'Unable to read this image.'));
    });
    try {
      const { width, height } = bitmap;
      const [targetWidth, targetHeight] = finalSize ? finalSize.split('x').map(Number) : [width, height];
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d', { alpha: !finalSize });
      if (!ctx) throw new Error(t('无法读取这张图片。', 'Unable to read this image.'));
      if (finalSize) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
      }
      const scale = Math.min(targetWidth / width, targetHeight / height);
      const scaledWidth = Math.max(1, Math.round(width * scale));
      const scaledHeight = Math.max(1, Math.round(height * scale));
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, Math.floor((targetWidth - scaledWidth) / 2), Math.floor((targetHeight - scaledHeight) / 2), scaledWidth, scaledHeight);
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(t('无法导出 PNG。', 'Unable to export PNG.'))), 'image/png'));
    } finally { bitmap.close(); }
  }

  async function uploadImage(set: ArtworkSet, shot: Shot, file: Blob, final: boolean) {
    const image = final ? await encodePng(file, set.target.size) : file;
    show(await request<ArtworkSet>(imageUrl(set, shot.key, final), { method: 'PUT', body: image }));
  }

  function importAsset(set: ArtworkSet, shot: Shot, asset: Asset) {
    void run(async () => {
      const response = await fetch(assetUrl(asset));
      if (!response.ok) throw new Error(t('无法读取这张素材，请重新选择。', 'Unable to read this asset. Choose another image.'));
      const file = await response.blob();
      await uploadImage(set, shot, file.type === 'image/png' ? file : await encodePng(file), false);
      setAssetShot(null);
      notify?.(t('已从素材库添加截图', 'Screenshot added from library'));
    });
  }

  function imageBox(set: ArtworkSet, shot: Shot, final: boolean) {
    const capture = final ? undefined : set.captures.find(item => item.slot === shot.key);
    const filled = final ? set.finals.includes(shot.key) : !!capture;
    const url = imageUrl(set, shot.key, final);
    const title = final ? t('最终成图', 'Final artwork') : t('原始截图', 'Original screenshot');
    const uploadLabel = final ? t('上传成图', 'Upload final artwork') : t('上传原始截图', 'Upload original screenshot');
    const locked = final ? !capturesReady : !set.confirmedAt || set.finals.includes(shot.key);
    const Icon = final ? Image : Camera;
    const actionsDisabled = busy || locked;
    const upload = <label className={`button ${filled ? 'secondary small' : 'secondary'} aso-artwork-upload`} data-disabled={actionsDisabled}>
      <Upload size={14} aria-hidden="true" />
      {filled ? t('更换', 'Replace') : uploadLabel}
      <input className="sr-only" aria-label={uploadLabel} type="file" accept={final ? 'image/png,image/jpeg' : 'image/png,.png'} disabled={actionsDisabled}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void run(() => uploadImage(set, shot, file, final));
        }} />
    </label>;
    const library = !final && <button type="button" className={`button secondary${filled ? ' small' : ''}`}
      disabled={actionsDisabled} onClick={() => { setError(''); setAssetShot(shot); }}>
      <Images size={14} aria-hidden="true" />{t('从素材库选择', 'Choose from Library')}
    </button>;
    return <section className="aso-artwork-image" aria-label={title}>
      <header className="aso-artwork-image-heading">
        <h4><Icon size={15} aria-hidden="true" />{title}</h4>
        {filled && <span className="aso-artwork-image-size">{capture ? `${capture.width} × ${capture.height}` : pixels(set.target.size)} px</span>}
      </header>
      {filled
        ? <a href={url} className="aso-artwork-image-stage" target="_blank" rel="noreferrer" aria-label={t('查看高清图片', 'Open at full resolution')}>
          <img src={url} alt={`${shot.title} · ${title}`} loading="lazy" decoding="async" />
          <ArrowUpRight className="aso-artwork-expand" size={15} aria-hidden="true" />
        </a>
        : <div className="aso-artwork-image-stage aso-artwork-image-empty">
          <span className="aso-artwork-empty-icon"><Icon size={22} aria-hidden="true" /></span>
          <p>{final ? (capturesReady ? t('上传对应的 Chat AI 成图', 'Add the matching Chat AI artwork') : t('原始截图补齐后可上传', 'Available once screenshots are ready'))
            : (set.confirmedAt ? t('等待原始截图', 'Awaiting source screenshot') : t('确认方案后可上传', 'Available after approval'))}</p>
          {upload}
          {library}
        </div>}
      {filled && <footer className="aso-artwork-image-footer">
        <small title={`${shot.key}.png`}>{capture ? `${shot.key}.png · ${capture.source === 'simulator' ? t('模拟器', 'Simulator') : t('已上传', 'Uploaded')}` : `${shot.key}.png`}</small>
        <div className="aso-artwork-actions">
          {!locked && upload}
          {!locked && library}
          {!final && <>
            <button type="button" className="icon-button" title={t('复制截图', 'Copy screenshot')} aria-label={t('复制截图', 'Copy screenshot')}
              disabled={busy} onClick={() => void run(() => copyImage(set, shot))}><Clipboard size={15} aria-hidden="true" /></button>
            <a className="icon-button" href={url} download={shot.key + '.png'} title={t('下载原图', 'Download PNG')} aria-label={t('下载原图', 'Download PNG')}><Download size={15} aria-hidden="true" /></a>
          </>}
          <button type="button" className="icon-button danger" disabled={busy || (!final && set.finals.includes(shot.key))}
            title={final ? t('移除成图', 'Remove artwork') : t('移除截图', 'Remove screenshot')}
            aria-label={final ? t('移除成图', 'Remove artwork') : t('移除截图', 'Remove screenshot')}
            onClick={() => void run(async () => show(await request<ArtworkSet>(url, { method: 'DELETE' })))}>
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </footer>}
    </section>;
  }

  async function loadVersions(set: ArtworkSet) {
    const response = await request<{ versions: Version[] }>(`/api/aso/media/${encodeURIComponent(product.id)}/versions`);
    const matching = response.versions.filter(item => item.platform === platformFor(set.target.profile));
    setVersions(matching);
    setVersionId('');
    setDraftMode('');
  }

  async function submitDraft(set: ArtworkSet) {
    if (!versionId || !draftMode) return;
    try {
      const submitted = await post<ArtworkSet>(`${base}/${set.id}/submit-draft`, {
        revision: set.revision, versionId, mode: draftMode, ...(replaceRevision && { replaceRevision }),
      });
      show(submitted);
      setVersions(null);
      notify?.(t('已提交到 ASO 图片草稿，原始截图与成图已同步到素材库', 'Saved to ASO image drafts and synced screenshots and artwork to the asset library'));
    } catch (error) {
      setReplaceRevision((error as { draftRevision?: string }).draftRevision || '');
      throw error;
    }
  }

  return <div className="aso-artwork-lab">
    <header className="aso-artwork-header">
      <div>
        {view !== 'list' && <button type="button" className="text-button aso-artwork-back" disabled={busy} onClick={returnToList}>
          <ArrowLeft size={14} />{t('方案列表', 'All briefs')}
        </button>}
        <h2>{view === 'create' ? t('创建方案', 'Create brief') : view === 'detail' ? t('方案详情', 'Brief details') : t('ASO 图片实验室', 'ASO Artwork Lab')}</h2>
        {view === 'list' && <p>{t('管理上架图方案、原始截图和成图。', 'Manage artwork briefs, screenshots and final images.')}</p>}
      </div>
      <div className="aso-artwork-actions">
        {view === 'list' && <>
          <button type="button" className="button secondary" disabled={busy} onClick={() => void run(async () => setSets(await request<Summary[]>(base)))}><RefreshCw size={14} />{t('刷新列表', 'Refresh list')}</button>
          <button type="button" className="button primary" disabled={busy} onClick={() => {
            setError(''); setTarget(defaultTarget); setView('create');
          }}><Plus size={16} />{t('创建方案', 'Create brief')}</button>
        </>}
        {active && view === 'detail' && <>
          <button type="button" className="button secondary" disabled={busy}
            onClick={() => void run(async () => show(await request<ArtworkSet>(`${base}/${active.id}`)))}>
            <RefreshCw size={14} />{t('刷新方案', 'Refresh brief')}
          </button>
          <button type="button" className="button danger-subtle" disabled={busy} onClick={() => deleteSet(active)}>
            <Trash2 size={14} />{t('删除方案', 'Delete brief')}
          </button>
        </>}
      </div>
    </header>
    {error && !replaceRevision && !assetShot && !copySource && <div className="aso-artwork-error" role="alert">{error}</div>}
    {copySource && <dialog ref={copyDialog} className="aso-artwork-dialog" aria-labelledby="aso-artwork-copy-title"
      onCancel={event => { event.preventDefault(); if (!busy) closeCopy(); }}>
      <form onSubmit={event => {
        event.preventDefault();
        if (!copyLocale || busy) return;
        void run(async () => {
          const copied = await post<ArtworkSet>(`${base}/${copySource.id}/copy`, { locale: copyLocale });
          closeCopy();
          show(copied);
          notify?.(t('已复制方案', 'Brief copied'));
        });
      }}>
        <header className="modal-top-bar">
          <h3 id="aso-artwork-copy-title" className="modal-title">{t('复制方案', 'Copy brief')}</h3>
        </header>
        <label>{t('目标语言', 'Target localization')}
          <select autoFocus required disabled={busy} value={copyLocale} onChange={event => setCopyLocale(event.target.value)}>
            <option value="">{t('请选择语言', 'Choose a localization')}</option>
            {Object.entries(APP_STORE_LOCALES).map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
          </select>
        </label>
        {(copySource.shotCount > 0 || copySource.target.goal) && <p className="faint">
          {t('复制时，内置 AI 会把设计目标和逐图文案转换成所选语言。', 'Built-in AI localizes the design goal and artwork copy when creating the new brief.')}
        </p>}
        {error && <p className="aso-artwork-error" role="alert">{error}</p>}
        <footer className="modal-bottom-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={closeCopy}>{t('取消', 'Cancel')}</button>
          <button type="submit" className="button primary" disabled={busy || !copyLocale}>{busy
            ? t('正在复制…', 'Copying…') : t('复制方案', 'Copy brief')}</button>
        </footer>
      </form>
    </dialog>}
    {active && assetShot && <AssetPickerModal
      allAssets={assetLibrary?.assets || []}
      products={products.length ? products : [product]}
      folders={assetLibrary?.assetFolders}
      releases={assetLibrary?.releases}
      preferredProductIds={[product.id]}
      defaultLanguage={active.target.locale?.startsWith('zh') ? 'zh-Hans' : 'en-US'}
      screenshot={{ title: assetShot.title, busy, error, onAdd: asset => importAsset(active, assetShot, asset) }}
      onClose={() => { setError(''); setAssetShot(null); }}
    />}
    {active && showSupplement && <ArtworkSupplementDialog remaining={remainingShots} close={() => setShowSupplement(false)}
      onCopy={requirements => copy(supplementTask(active, requirements), t('已复制补充项提示词', 'Supplement prompt copied'))} />}
    {view === 'list' && <section className="panel aso-artwork-list" aria-label={t('方案列表', 'All briefs')}>
      {sets.length ? <>
        <div className="aso-artwork-list-head" aria-hidden="true">
          <span>{t('方案', 'Brief')}</span><span>{t('创建时间', 'Created')}</span><span>{t('图片数量', 'Images')}</span><span>{t('状态', 'Status')}</span>
        </div>
        <ul className="aso-artwork-set-list">
          {sets.map(set => <li key={set.id}><button type="button" className="aso-artwork-set-row" disabled={busy}
            onClick={() => void run(async () => show(await request<ArtworkSet>(`${base}/${set.id}`)))}>
            <span className="aso-artwork-set-name">
              <span className="aso-artwork-set-icon"><Images size={18} aria-hidden="true" /></span>
              <span>
                <strong>{set.target.goal || `${profileName(set.target.profile)} · ${set.target.locale}`}</strong>
                <small>{label(set.target)}</small>
              </span>
            </span>
            <span className="aso-artwork-list-date">
              <span className="aso-artwork-row-label">{t('创建时间', 'Created')}</span>
              {set.createdAt ? <time dateTime={set.createdAt}>{dateFormat.format(new Date(set.createdAt))}</time> : t('未记录', 'Unavailable')}
            </span>
            <span className="aso-artwork-list-count">
              <span className="aso-artwork-row-label">{t('图片数量', 'Image count')}</span>
              {t(`${set.shotCount} 张`, `${set.shotCount} images`)}
            </span>
            <span className="aso-artwork-state" data-status={set.status}>{statusText[set.status]}</span>
            <ChevronRight size={16} className="aso-artwork-row-arrow" aria-hidden="true" />
          </button>
            <button type="button" className="icon-button" disabled={busy}
              aria-label={t('复制方案', 'Copy brief')} title={t('复制方案', 'Copy brief')} onClick={() => {
                setCopyLocale(''); setError(''); setCopySource(set);
              }}><Copy size={16} aria-hidden="true" /></button>
          </li>)}
        </ul>
      </> : <div className="empty aso-artwork-list-empty" role="status">
        <span className="aso-artwork-empty-icon"><Images size={25} aria-hidden="true" /></span>
        <h3>{busy ? t('正在读取方案…', 'Loading briefs…') : t('还没有方案', 'No briefs yet')}</h3>
        {!busy && <p>{t('点击右上角「创建方案」，选择语言和设备规格。', 'Create a brief above to select its language and device.')}</p>}
      </div>}
    </section>}

    {view === 'create' && <div className="aso-artwork-create">
      <form className="panel aso-artwork-form" onSubmit={event => {
        event.preventDefault();
        void run(async () => show(await post<ArtworkSet>(base, target)));
      }}>
        <div className="aso-artwork-panel-head"><h3>{t('目标规格', 'Artwork settings')}</h3></div>
        <div className="aso-artwork-form-body">
          <div className="aso-artwork-fields">
            <label>{t('本地化语言', 'Localization')}<select aria-label={t('本地化语言', 'Localization')} value={target.locale} onChange={event => setTarget({ ...target, locale: event.target.value })}>
              {Object.entries(APP_STORE_LOCALES).map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
            </select></label>
            <label>{t('设备组', 'Device group')}<select aria-label={t('设备组', 'Device group')} value={target.profile} onChange={event => {
              const profile = event.target.value as Profile;
              setTarget({ ...target, profile, size: firstSize(profile) });
            }}>{keys.map(profile => <option key={profile} value={profile}>{profileName(profile)}</option>)}</select></label>
            <label>{t('成品尺寸', 'Output size')}<select aria-label={t('成品尺寸', 'Output size')} value={target.size} onChange={event => setTarget({ ...target, size: event.target.value })}>
              {profiles[target.profile].map(pair => <option key={pair.join('x')} value={pair.join('x')}>{sizeLabel(target.profile, pair.join('x'))}</option>)}
            </select></label>
          </div>
          <label>{t('重点卖点或视觉方向（选填）', 'Benefits or art direction (optional)')}
            <textarea rows={4} maxLength={1000} value={target.goal} onChange={event => setTarget({ ...target, goal: event.target.value })}
              placeholder={t('例如：首图突出随手摘录，第二张展示重读回响。', 'Example: Lead with quick capture, then show how readers revisit excerpts.')} />
          </label>
        </div>
        <div className="aso-artwork-form-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={returnToList}>{t('取消', 'Cancel')}</button>
          <button className="button primary" disabled={busy}>{t('保存方案', 'Save brief')}</button>
        </div>
      </form>
      <aside className="panel aso-artwork-format">
        <div className="aso-artwork-panel-head"><h3>{t('画幅预览', 'Canvas preview')}</h3></div>
        <div className="aso-artwork-format-stage">
          <div className="aso-artwork-format-frame" aria-hidden="true" style={{ aspectRatio: canvasRatio, width: Math.min(208, 186 * canvasRatio) }}>
            <Image size={21} />
          </div>
        </div>
        <div className="aso-artwork-format-caption">
          <strong>{profileName(target.profile)}</strong>
          <span>{sizeLabel(target.profile, target.size)}</span>
        </div>
      </aside>
    </div>}

    {view === 'detail' && active && <div className="aso-artwork-detail">
      <aside className="panel aso-artwork-workflow" aria-label={t('制作流程', 'Artwork workflow')}>
        <div className="aso-artwork-panel-head"><h3>{t('制作流程', 'Artwork workflow')}</h3></div>
        <ol className="aso-artwork-steps">
          {[
            { title: t('方案与确认', 'Brief approval'), description: active.confirmedAt ? t('已确认', 'Approved') : statusText[plan ? 'review' : 'planning'] },
            { title: t('原始截图', 'Source screenshots'), description: active.shotCount ? `${active.captureCount} / ${active.shotCount}` : '' },
            { title: t('最终成图', 'Final artwork'), description: active.shotCount ? `${active.finalCount} / ${active.shotCount}` : '' },
            { title: t('ASO 图片草稿', 'ASO image draft'), description: active.submission ? t('已提交草稿', 'Saved to drafts') : '' },
          ].map((step, i) => <li key={step.title} data-step={i === phase ? 'current' : i < phase ? 'done' : 'pending'} aria-current={i === phase ? 'step' : undefined}>
            <span className="aso-artwork-step-number" aria-hidden="true">{i < phase ? <Check size={12} strokeWidth={2.5} /> : i + 1}</span>
            <span className="aso-artwork-step-text"><strong>{step.title}</strong>{step.description && <small>{step.description}</small>}</span>
          </li>)}
        </ol>
      </aside>

      <div className="aso-artwork-editor">
        <section className="panel aso-artwork-overview">
          <div className="aso-artwork-panel-head">
            <h3>{t('方案概览', 'Brief overview')}</h3>
            <span className="aso-artwork-state" data-status={active.status}>{statusText[active.status]}</span>
          </div>
          <div className="aso-artwork-overview-body">
            <dl className="aso-artwork-specs">
              <div><dt>{t('设备组', 'Device')}</dt><dd>{profileName(active.target.profile)}</dd></div>
              <div><dt>{t('成品尺寸', 'Output size')}</dt><dd>{sizeLabel(active.target.profile, active.target.size)}</dd></div>
              <div><dt>{t('本地化语言', 'Localization')}</dt><dd>{active.target.locale}</dd></div>
            </dl>
            {(active.target.goal || plan?.direction) && <dl className="aso-artwork-notes">
              {active.target.goal && <div><dt>{t('制作目标', 'Creative goal')}</dt><dd>{active.target.goal}</dd></div>}
              {plan?.direction && <div><dt>{t('整组思路', 'Series messaging')}</dt><dd>{plan.direction}</dd></div>}
            </dl>}
          </div>
          <footer className="aso-artwork-stage-actions">
            {!plan && <p>{t('把任务交给已连接 Growmory MCP 的 Agent。回填后，点击「刷新方案」。', 'Send the task to an agent connected to Growmory MCP. Refresh after it saves the brief.')}</p>}
            {plan && !active.confirmedAt && <p>{t('核对逐图文案和预期截图，确认后开始截图。', 'Review the copy and intended screens before approving the brief.')}</p>}
            {plan && !active.confirmedAt && <button type="button" className="button primary" disabled={busy}
              onClick={() => void run(async () => show(await post<ArtworkSet>(`${base}/${active.id}/confirm`, { revision: active.revision })))}>
              <Check size={15} />{t('确认方案', 'Approve brief')}
            </button>}
            {!active.confirmedAt && <button type="button" className={`button ${plan ? 'secondary' : 'primary'}`} disabled={busy}
              onClick={() => void run(() => copy(planTask(active), plan
                ? t('已复制重新生成任务', 'Regeneration task copied')
                : t('已复制 Agent 方案任务', 'Brief task copied')))}>
              <Clipboard size={15} />{plan ? t('重新生成方案', 'Regenerate brief') : t('复制 Agent 方案任务', 'Copy brief task for agent')}
            </button>}
            {active.confirmedAt && !capturesReady && <>
              <p>{t('交给 Agent 离屏渲染，也可在逐图工作区上传原始 PNG。', 'Ask the agent to render offscreen, or upload the original PNGs here.')}</p>
              <button type="button" className="button primary" disabled={busy}
                onClick={() => void run(() => copy(captureTask(active), t('已复制 Agent 截图任务', 'Capture task copied')))}>
                <Clipboard size={15} />{t('复制 Agent 截图任务', 'Copy capture task for agent')}
              </button>
            </>}
            {capturesReady && <>
              {active.submission && <p className="aso-artwork-receipt" role="status">{t(`已提交到版本 ${active.submission.version}（${active.target.locale}）。`, `Saved to version ${active.submission.version} (${active.target.locale}).`)}</p>}
              {finalsReady && (versions === null
                ? <>
                  {!active.submission && <p>{t('成图齐全，选择 App Store 版本后即可保存草稿。', 'Choose an App Store version to save your artwork draft.')}</p>}
                  <button type="button" className="button primary" disabled={busy} onClick={() => void run(() => loadVersions(active))}>
                    {active.submission ? t('提交到 ASO 图片草稿', 'Save to ASO image drafts') : t('选择商店版本', 'Choose store version')}
                  </button>
                </>
                : <form className="aso-artwork-submit-form" onSubmit={event => {
                  event.preventDefault();
                  void run(() => submitDraft(active));
                }}>
                  <label>{t('商店版本', 'Store version')}
                    <select aria-label={t('商店版本', 'Store version')} value={versionId} required disabled={busy || !versions.length} onChange={event => {
                      setVersionId(event.target.value); setReplaceRevision(''); setError('');
                    }}>
                      <option value="">{versions.length ? t('请选择版本', 'Choose version') : t('没有匹配平台的版本', 'No versions for this platform')}</option>
                      {versions.map(version => <option key={version.id} value={version.id}>{version.version} · {version.platform}</option>)}
                    </select>
                  </label>
                  <label>{t('处理方式', 'Save mode')}
                    <select value={draftMode} required disabled={busy} onChange={event => {
                      const mode = event.target.value;
                      setDraftMode(mode === 'replace' || mode === 'append' ? mode : '');
                      setReplaceRevision(''); setError('');
                    }}>
                      <option value="">{t('请选择处理方式', 'Choose how to save')}</option>
                      <option value="replace">{t('覆盖', 'Replace')}</option>
                      <option value="append">{t('增加', 'Append')}</option>
                    </select>
                  </label>
                  <button className="button primary" disabled={busy || !versionId || !draftMode}>{replaceRevision ? t('确认覆盖', 'Confirm replacement') : t('提交到 ASO 图片草稿', 'Save to ASO image drafts')}</button>
                  {replaceRevision
                    ? <p className="aso-artwork-warning" role="alert">{t('这个版本、语言和设备组已有草稿。继续会替换该组的截图。', 'This device group already has a draft for the selected version and locale. Continuing replaces its screenshots.')}</p>
                    : draftMode && <p>{draftMode === 'replace'
                      ? t('用本方案的成图替换该组截图。', 'Replace the screenshots in this group with this brief’s final images.')
                      : t('保留该组已有截图，把成图加到末尾。', 'Keep existing screenshots in this group and add the final images at the end.')}</p>}
                </form>)}
              {!finalsReady && <p>{t('把成图方案和原始 PNG 交给 Chat AI，先确认首张效果，再逐张制作和上传。', 'Send the brief and source PNGs to Chat AI. Approve the first image, then create and upload the rest one at a time.')}</p>}
              <div className="aso-artwork-export">
                <button type="button" className={`button ${phase === 2 ? 'primary' : 'secondary'}`} disabled={busy}
                  onClick={() => void run(() => copy(handoff(active), t('已复制成图方案', 'Image brief copied')))}><Clipboard size={15} />{t('复制成图方案', 'Copy image brief')}</button>
                <button type="button" className="button secondary" disabled={busy} onClick={() => void run(() => download(active))}>
                  <Download size={15} />{t('下载交付包', 'Download handoff ZIP')}
                </button>
              </div>
            </>}
            {active.confirmedAt && <button type="button" className="button secondary" disabled={busy} onClick={() => {
              if (!window.confirm(t('返回方案阶段后需要重新确认。已有截图、成图和 ASO 图片草稿会保留。',
                'Return to the brief stage? Approval will be required again. Existing images and ASO drafts will be kept.'))) return;
              void run(async () => {
                show(await post<ArtworkSet>(`${base}/${active.id}/reopen`, { revision: active.revision }));
                setVersions(null);
                setVersionId('');
              });
            }}>
              <ArrowLeft size={15} />{t('返回方案阶段', 'Return to brief stage')}
            </button>}
          </footer>
        </section>
        <section className="panel aso-artwork-board">
          <div className="aso-artwork-panel-head">
            <h3>{t('逐图工作区', 'Artwork boards')}</h3>
            <div className="aso-artwork-actions">
              <span className="aso-artwork-figure-count">{t(`共 ${active.shotCount} 张`, `${active.shotCount} images`)}</span>
              <button type="button" className="button secondary small" disabled={busy || remainingShots <= 0}
                title={remainingShots <= 0 ? t('已达到方案图项上限', 'Brief item limit reached') : undefined}
                onClick={() => setShowSupplement(true)}><Plus size={14} />{t('补充项', 'Add items')}</button>
            </div>
          </div>
          {plan ? (
          <ol className="aso-artwork-shot-list" aria-label={t('上架图顺序', 'Artwork order')}>
            {plan.shots.map((shot, index) => <li className="aso-artwork-shot-row" key={shot.key}>
              <div className="aso-artwork-shot-brief">
                <div className="aso-artwork-shot-title">
                  <span className="aso-artwork-shot-number">{index + 1}</span>
                  <h4>{shot.title}</h4>
                  <button type="button" className="icon-button danger" disabled={busy}
                    aria-label={t(`删除图项 ${shot.title}`, `Delete artwork item ${shot.title}`)}
                    title={t('删除图项', 'Delete item')} onClick={() => deleteShot(active, shot)}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
                <div className="aso-artwork-shot-headline">
                  <small>{t('上架文案', 'Store copy')}</small>
                  <strong>{shot.headline}</strong>
                  {shot.subheadline && <p>{shot.subheadline}</p>}
                </div>
                <dl className="aso-artwork-shot-notes">
                  <div><dt>{t('预期截图', 'Intended screen')}</dt><dd>{shot.capture}</dd></div>
                </dl>
              </div>
              <div className="aso-artwork-shot-images">{imageBox(active, shot, false)}{imageBox(active, shot, true)}</div>
              <button type="button" className="button secondary small aso-artwork-shot-capture" disabled={busy || !active.confirmedAt}
                title={!active.confirmedAt ? t('确认方案后可复制', 'Available after approval') : undefined}
                onClick={() => void run(() => copy(captureTask(active, shot), t('已复制本项截图任务', 'Single-shot capture task copied')))}>
                <Clipboard size={14} aria-hidden="true" />{t('复制本项截图任务', 'Copy capture task for this item')}
              </button>
            </li>)}
          </ol>
          ) : <p className="aso-artwork-board-empty">{t('暂无图项', 'No artwork items yet')}</p>}
        </section>
      </div>
    </div>}
  </div>;
}

function ArtworkSupplementDialog({ remaining, close, onCopy }: {
  remaining: number;
  close: () => void;
  onCopy: (requirements: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [requirements, setRequirements] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copying, setCopying] = useState(false);

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function copyPrompt() {
    setCopying(true);
    try {
      await onCopy(requirements.trim());
      close();
    } catch {
      setCopyError(t('未能复制提示词，请重试。', 'Could not copy the prompt. Try again.'));
    } finally { setCopying(false); }
  }

  return <dialog ref={dialog} className="aso-artwork-dialog" aria-labelledby="aso-artwork-supplement-title"
    onCancel={event => { event.preventDefault(); if (!copying) close(); }}>
    <form onSubmit={event => { event.preventDefault(); void copyPrompt(); }}>
      <header className="modal-top-bar">
        <h3 id="aso-artwork-supplement-title" className="modal-title">{t('补充图项', 'Add artwork items')}</h3>
      </header>
      <label className="section-label" htmlFor="aso-artwork-supplement-requirements">{t('补充要求', 'Requirements')}</label>
      <textarea id="aso-artwork-supplement-requirements" autoFocus rows={4} maxLength={1000} value={requirements}
        placeholder={t('例如：追加一张展示周视图的截图，突出拖拽排程。', 'Example: Add one shot of the week view highlighting drag-to-schedule.')}
        onChange={event => { setRequirements(event.target.value); setCopyError(''); }} />
      <p className="faint">{t(`还可添加 ${remaining} 项。将提示词交给 Agent，回填后刷新方案。`, `${remaining} slots available. Send the prompt to the agent, then refresh the brief.`)}</p>
      {copyError && <p className="aso-artwork-error" role="alert">{copyError}</p>}
      <footer className="modal-bottom-actions">
        <button type="button" className="button secondary" disabled={copying} onClick={close}>{t('取消', 'Cancel')}</button>
        <button type="submit" className="button primary" disabled={copying || !requirements.trim() || remaining <= 0}>
          <Clipboard size={15} />{t('复制提示词', 'Copy prompt')}
        </button>
      </footer>
    </form>
  </dialog>;
}
