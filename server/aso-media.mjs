import { createHash } from 'node:crypto';
import { lookupPublicApp } from './app-store-public.mjs';
import { aiRequest } from './ai-request.mjs';

export function getDefaultAsoMedia(product) {
  return {
    productId: product.id,
    updatedAt: new Date().toISOString(),
    searchResult: {
      iconUrl: product.icon || '',
      title: product.name || '',
      subtitle: product.englishName || product.summary?.slice(0, 30) || '',
      displayMode: 'portrait',
      screenshots: [],
      landscapeScreenshot: '',
      creativeUrl: '',
    },
    headerBanner: { url: '', title: '', description: '' },
    platformScreenshots: { iphone: [], ipad: [], mac: [] },
    aiDiagnosis: null,
  };
}

export async function fetchStoreAsoMedia(appId, country = 'cn') {
  const appData = await lookupPublicApp({ id: appId, country });
  const rawIphone = appData.screenshots || [];
  const rawIpad = appData.ipadScreenshots || [];

  const iphone = rawIphone.map((url, i) => ({
    id: `iphone-${i + 1}`,
    url,
    caption: i === 0 ? '首图 · 核心价值与品牌主张' : i === 1 ? '核心功能一览' : `特色场景 ${i + 1}`,
    subcaption: '',
    order: i + 1,
    deviceType: 'iphone_6_9',
  }));

  const ipad = rawIpad.map((url, i) => ({
    id: `ipad-${i + 1}`,
    url,
    caption: `iPad 专享大屏体验 ${i + 1}`,
    subcaption: '',
    order: i + 1,
    deviceType: 'ipad_13',
  }));

  return {
    iconUrl: appData.icon || '',
    title: appData.title || '',
    subtitle: appData.developer || '',
    rating: typeof appData.score === 'number' ? Number(appData.score.toFixed(1)) : undefined,
    ratingsCount: appData.reviews || 0,
    iphone,
    ipad,
  };
}

export async function getOrInitAsoMedia(store, productId) {
  const existing = store.asoMedia(productId);
  if (existing) {
    if (!existing.searchResult.displayMode) existing.searchResult.displayMode = 'portrait';
    if (existing.searchResult.landscapeScreenshot === undefined) existing.searchResult.landscapeScreenshot = '';
    const banner = existing.headerBanner;
    if (banner.url && (banner.url === existing.searchResult.iconUrl ||
        existing.platformScreenshots.iphone.some(shot => shot.url === banner.url))) {
      // Older versions automatically copied the icon or first screenshot into this slot.
      if (!banner.source && banner.aspectRatio === '4:1') banner.url = '';
    }
    return existing;
  }

  const data = store.read().data;
  const product = data.products.find(p => p.id === productId);
  if (!product) throw new Error('产品不存在');

  let media = getDefaultAsoMedia(product);
  if (product.appStore?.appId) {
    try {
      const storeData = await fetchStoreAsoMedia(product.appStore.appId);
      if (storeData.iphone.length > 0) {
        media.searchResult.iconUrl = storeData.iconUrl || media.searchResult.iconUrl;
        media.searchResult.title = storeData.title || media.searchResult.title;
        media.searchResult.rating = storeData.rating;
        media.searchResult.ratingsCount = storeData.ratingsCount;
        media.searchResult.screenshots = storeData.iphone.slice(0, 3).map(s => s.url);
        media.platformScreenshots.iphone = storeData.iphone;
        if (storeData.ipad.length > 0) {
          media.platformScreenshots.ipad = storeData.ipad;
        }
      }
    } catch {
      // 保持默认
    }
  }

  store.asoMedia(productId, media);
  return media;
}

export async function diagnoseAsoMedia(store, productId, aiConfig = null) {
  const media = await getOrInitAsoMedia(store, productId);
  const data = store.read().data;
  const product = data.products.find(p => p.id === productId);
  if (!product) throw new Error('产品不存在');

  const docs = data.docs.filter(d => d.productId === productId && d.status === 'confirmed');
  const insights = store.productInsights(productId);

  const iphoneCount = media.platformScreenshots?.iphone?.filter(shot => shot.url).length || 0;
  const hasSearchResultPics = Boolean(media.searchResult?.creativeUrl ||
    (media.searchResult?.displayMode === 'landscape' ? media.searchResult.landscapeScreenshot :
      media.platformScreenshots?.iphone?.some(shot => shot.url) || media.searchResult?.screenshots?.some(Boolean)));
  const headerBannerConfigured = Boolean(media.headerBanner?.url);

  // 1. 尝试使用 AI 增强分析（若配置）
  if (aiConfig && aiConfig.configured && aiConfig.configured()) {
    try {
      const prompt = `你是一位 App Store ASO 资深视觉转化率与图片优化专家。请结合以下产品事实和 ASO 图片配置，给出客观深度诊断和具体改进建议：
产品名称：${product.name}
产品定位与简介：${product.summary || '无'}
已确认产品核心功能/特性数量：${docs.length}
已配置 iPhone 上架截图数量：${iphoneCount} 张
搜索结果素材状态：${hasSearchResultPics ? '已有创意图或回退截图' : '尚未配置'}
宣传标题图（Header Banner）状态：${headerBannerConfigured ? '已配置' : '未配置'}
各图说明配文：${media.platformScreenshots?.iphone?.map(s => `#${s.order} 标题: "${s.caption || '未填'}" 卖点: "${s.subcaption || '未填'}"`).join('; ') || '无'}

请严格返回符合以下 JSON 结构的诊断结果（不要添加 markdown 格式外的多余字符）：
{
  "overallScore": 85,
  "summary": "简短的一句话整体评价",
  "dimensions": {
    "cvr": {
      "score": 85,
      "title": "搜索与商详页转化潜力 (CVR)",
      "findings": ["发现点1", "发现点2"],
      "suggestions": ["优化建议1", "优化建议2"]
    },
    "visuals": {
      "score": 80,
      "title": "视觉焦点与色彩对比度",
      "findings": ["发现点1", "发现点2"],
      "suggestions": ["建议1", "建议2"]
    },
    "typography": {
      "score": 88,
      "title": "文案排版与小图可读性",
      "findings": ["发现点1", "发现点2"],
      "suggestions": ["建议1", "建议2"]
    },
    "contentAlignment": {
      "score": 82,
      "title": "产品事实与核心卖点吻合度",
      "findings": ["发现点1", "发现点2"],
      "suggestions": ["建议1", "建议2"]
    }
  },
  "actionItems": [
    { "priority": "high", "title": "优化行动项1", "description": "具体怎么改" },
    { "priority": "medium", "title": "优化行动项2", "description": "具体怎么改" }
  ]
}`;

      const ai = aiConfig.get();
      const response = await aiRequest('aso-media-diagnosis', `${ai.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
        body: JSON.stringify({
          model: ai.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: '你是一名只返回标准 JSON 的专业 App Store ASO 图片与视觉转化率专家。' },
            { role: 'user', content: prompt }
          ]
        })
      });
      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        if (parsed && typeof parsed.overallScore === 'number') {
          const fullDiagnosis = {
            analyzedAt: new Date().toISOString(),
            ...parsed,
          };
          media.aiDiagnosis = fullDiagnosis;
          store.asoMedia(productId, media);
          return fullDiagnosis;
        }
      }
    } catch (e) {
      console.warn('ASO Media AI 诊断回退到规则分析:', e.message);
    }
  }

  // 2. 启发式专业规则分析引擎（无大模型或大模型网络异常时的高质量回退）
  let cvrScore = 75;
  const cvrFindings = [];
  const cvrSuggestions = [];
  if (hasSearchResultPics) {
    cvrScore += 15;
    cvrFindings.push('搜索结果已有创意图或回退截图可供预览。');
  } else {
    cvrScore -= 20;
    cvrFindings.push('本地方案缺少可预览的搜索素材。');
    cvrSuggestions.push('检查创意图或回退截图是否能快速说明应用用途。');
  }

  let visualScore = 78;
  const visualFindings = [];
  const visualSuggestions = [];
  if (headerBannerConfigured) {
    visualScore += 12;
    visualFindings.push('已配置宣传横幅 (Header Banner)，可在商品页顶部呈现品牌视觉。');
  } else {
    visualFindings.push('尚未配置顶部宣传横幅，可按品牌展示需要选配。');
    visualSuggestions.push('按 Apple 的 21:9 标题图或 16:9 通用图模板制作，突出核心品牌氛围。');
  }

  let typeScore = 80;
  const typeFindings = [];
  const typeSuggestions = [];
  const captionsFilled = media.platformScreenshots?.iphone?.filter(s => s.url && s.caption?.trim()).length || 0;
  if (captionsFilled >= 3) {
    typeScore += 10;
    typeFindings.push(`前 ${captionsFilled} 张截图均已配置标题文案，有助于用户在 2 秒内看懂功能。`);
    typeSuggestions.push('建议将首图标题字数精简到 8~12 个汉字以内，确保在 iPhone 屏幕上不折行。');
  } else {
    typeScore -= 15;
    typeFindings.push('部分截图缺少明确的主标文案，单纯的应用界面容易让普通用户缺乏理解抓手。');
    typeSuggestions.push('为每张截图添加醒目顶标（如“智能文案 · 一键生成”），字号建议占卡片高度的 10%~15%。');
  }

  let alignScore = 82;
  const alignFindings = [];
  const alignSuggestions = [];
  if (docs.length > 0) {
    alignFindings.push(`已关联知识库中 ${docs.length} 篇核心资料，包含「${docs[0].title}」等核心功能。`);
    alignSuggestions.push(`建议核对截图展现界面与最新版本功能保持一致，避免使用已被替代的历史 UI。`);
  } else {
    alignFindings.push('尚未在 Growmory 知识库中确认产品功能文档，无法自动校验界面元素与说明的时效性。');
    alignSuggestions.push('先在知识库中确认核心产品文档，以便 ASO 分析时精准对齐卖点。');
  }

  const overallScore = Math.round((cvrScore + visualScore + typeScore + alignScore) / 4);

  const diagnosis = {
    analyzedAt: new Date().toISOString(),
    overallScore,
    summary: overallScore >= 80 ? 'ASO 图片资产整体健康，搜索转化首屏基本齐备，建议进一步强化首图卖点反差与字号清晰度。' : 'ASO 图片资产存在待补齐项，前 3 图与标题文案直接关乎搜索转化，建议按高优先级项进行优化。',
    dimensions: {
      cvr: {
        score: cvrScore,
        title: '搜索与商详页转化潜力 (CVR)',
        findings: cvrFindings,
        suggestions: cvrSuggestions.length ? cvrSuggestions : ['持续监控搜索下载转化率，尝试对比不同首图主题的点击表现。'],
      },
      visuals: {
        score: visualScore,
        title: '视觉焦点与色彩对比度',
        findings: visualFindings,
        suggestions: visualSuggestions.length ? visualSuggestions : ['保持截图色系与品牌主色调（Logo）协调统一，增强色彩辨识度。'],
      },
      typography: {
        score: typeScore,
        title: '文案排版与小图可读性',
        findings: typeFindings,
        suggestions: typeSuggestions.length ? typeSuggestions : ['避免过长句子，大字主标 + 浅色副标结构最佳。'],
      },
      contentAlignment: {
        score: alignScore,
        title: '产品事实与核心卖点吻合度',
        findings: alignFindings,
        suggestions: alignSuggestions.length ? alignSuggestions : ['确保所有截图都真实反映当前线上版本已具备的特性。'],
      },
    },
    actionItems: [
      {
        priority: 'high',
        title: '精简并增强首图（第1张）主视觉与大标题',
        description: '在回退截图预览中核对首张图。主标题控制在 10 字内，字体加粗，高亮突出核心痛点解决方案。',
      },
      {
        priority: 'medium',
        title: '补全前 3 张截图的卖点副标题',
        description: '搜索结果可能展示首 1 至 3 张截图，副标题用简洁词组交代使用场景，形成连贯的故事流。',
      },
      {
        priority: 'low',
        title: '准备商品页标题图',
        description: '参考 Apple 的安全区模板，准备 3840×1646 的标题图或 5244×2950 的通用 PNG。',
      },
    ],
  };

  media.aiDiagnosis = diagnosis;
  store.asoMedia(productId, media);
  return diagnosis;
}

function placementPreview(asset) {
  const attrs = asset?.attributes;
  const video = asset?.type === 'appAssetLibraryVideos';
  const videoUrl = video && typeof attrs.videoAsset === 'string' &&
    /^https:\/\/[a-z0-9.-]+\.(?:itunes\.apple\.com|mzstatic\.com)\//i.test(attrs.videoAsset)
    ? attrs.videoAsset : undefined;
  const image = attrs?.imageAsset || attrs?.previewFrameImage?.image || attrs?.previewFrameImage;
  const width = Number(image?.width), height = Number(image?.height);
  if (!width || !height || typeof image.templateUrl !== 'string') return video ? { video, videoUrl } : null;
  const url = image.templateUrl.replaceAll('{w}', String(width)).replaceAll('{h}', String(height))
    .replaceAll('{c}', '').replaceAll('{f}', 'png');
  if (!/^https:\/\/[^/]+\.mzstatic\.com\//i.test(url) || /[{}]/.test(url)) return video ? { video, videoUrl } : null;
  return { url, width, height, video, ...(videoUrl && { videoUrl }) };
}

export async function readStoreCreativePlacements(client, appId) {
  const appPath = `/v1/apps/${encodeURIComponent(appId)}`;
  const [app, { data: versions }] = await Promise.all([
    client.request(`${appPath}?fields[apps]=primaryLocale`),
    client.paginate(`${appPath}/appStoreVersions?filter[platform]=IOS&filter[appVersionState]=READY_FOR_DISTRIBUTION`),
  ]);
  const version = versions[0];
  if (!version) return null;
  const { data: localizations } = await client.paginate(`/v1/appStoreVersions/${encodeURIComponent(version.id)}/appStoreVersionLocalizations`);
  const localization = localizations.find(item => item.attributes?.locale === app.data?.attributes?.primaryLocale);
  if (!localization) return null;
  const { data, included } = await client.paginate(
    `/v1/appStoreVersionLocalizations/${encodeURIComponent(localization.id)}/placements?include=image,video`,
  );
  const groups = new Map();
  for (const placement of data) {
    const { placementType, placementGroup, state } = placement.attributes || {};
    if (!['ACTIVE', 'PARENT_APPROVED'].includes(state) || !['APP_STORE_SEARCH_RESULTS_ASSET', 'PRODUCT_PAGE_HEADER_ASSET'].includes(placementType)) continue;
    const link = placement.relationships?.image?.data || placement.relationships?.video?.data;
    const preview = link && placementPreview(included.find(item => item.type === link.type && item.id === link.id));
    if (preview) {
      const assets = groups.get(placementType) || [];
      assets.push({ ...preview, group: placementGroup });
      groups.set(placementType, assets);
    }
  }
  return {
    version: version.attributes?.versionString,
    locale: localization.attributes?.locale,
    search: groups.get('APP_STORE_SEARCH_RESULTS_ASSET') || [],
    header: groups.get('PRODUCT_PAGE_HEADER_ASSET') || [],
  };
}

const mediaEditableStates = new Set(['PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW', 'REJECTED', 'DEVELOPER_REJECTED', 'METADATA_REJECTED']);

function mediaError(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

export async function readMediaVersions(client, appId) {
  const path = `/v1/apps/${encodeURIComponent(appId)}`;
  const [app, versions] = await Promise.all([
    client.request(`${path}?fields[apps]=primaryLocale`),
    client.paginate(`${path}/appStoreVersions`),
  ]);
  return {
    primaryLocale: app.data?.attributes?.primaryLocale,
    versions: versions.data
      .filter(item => (item.attributes?.appVersionState || item.attributes?.appStoreState) !== 'REPLACED_WITH_NEW_VERSION')
      .sort((a, b) => (b.attributes.createdDate || '').localeCompare(a.attributes.createdDate || ''))
      .map(({ id, attributes }) => ({
        id, platform: attributes.platform, version: attributes.versionString,
        state: attributes.appVersionState || attributes.appStoreState,
      })),
  };
}

async function mediaTarget(client, appId, versionId, locale) {
  if (typeof versionId !== 'string' || !versionId) mediaError('请选择商店版本。');
  const { data: version, included = [] } = await client.request(`/v1/appStoreVersions/${encodeURIComponent(versionId)}?include=app&fields[apps]=primaryLocale&fields[appStoreVersions]=app,platform,versionString,appVersionState,appStoreState`);
  if (version?.relationships?.app?.data?.id !== appId) mediaError('所选版本不属于当前 App。');
  const { data } = await client.paginate(`/v1/appStoreVersions/${encodeURIComponent(versionId)}/appStoreVersionLocalizations`);
  const locales = data.map(item => item.attributes.locale);
  if (!locale) return { locales };
  const localization = data.find(item => item.attributes.locale === locale);
  if (!localization) mediaError('所选版本没有这个本地化语言。');
  const primaryLocale = included.find(item => item.type === 'apps' && item.id === appId)?.attributes?.primaryLocale;
  return { locales, localization, version, localizations: data, primaryLocale };
}

export async function readMediaDraftTarget(client, appId, versionId, locale, screenshotGroup) {
  const { version, localization } = await mediaTarget(client, appId, versionId, locale);
  const screenshots = screenshotGroup ? (await readMediaPlacements(client, localization.id))
    .filter(asset => asset.type === 'APP_SCREENSHOT' && asset.group === screenshotGroup)
    .map(({ id }) => ({ id })) : undefined;
  return { id: versionId, name: version.attributes.versionString, platform: version.attributes.platform, screenshots };
}

async function readMediaPlacements(client, localizationId) {
  const { data, included } = await client.paginate(
    `/v1/appStoreVersionLocalizations/${encodeURIComponent(localizationId)}/placements?include=image,video&sort=placementGroupPosition`,
  );
  const library = new Map(included.map(item => [`${item.type}:${item.id}`, item]));
  return data.map(item => {
    const { placementType: type, placementGroup: group, state, lastModifiedDate } = item.attributes || {};
    const link = item.relationships?.image?.data || item.relationships?.video?.data;
    const asset = link && library.get(`${link.type}:${link.id}`);
    return {
      id: item.id, type, group, state, lastModifiedDate, assetId: link?.id,
      name: asset?.attributes?.referenceName || asset?.attributes?.fileName,
      ...placementPreview(asset),
    };
  });
}

async function readMediaFallbacks(client, localizations, locale, primaryLocale) {
  const { language, script } = new Intl.Locale(locale).maximize();
  const sameLanguage = code => {
    const candidate = new Intl.Locale(code).maximize();
    return candidate.language === language && candidate.script === script;
  };
  const sources = localizations.filter(({ attributes }) => attributes.locale !== locale &&
    (attributes.locale === primaryLocale || sameLanguage(attributes.locale)));
  const candidates = new Map();
  const results = await Promise.allSettled(sources.map(async source => ({
    sourceLocale: source.attributes.locale,
    assets: await readMediaPlacements(client, source.id),
  })));
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { sourceLocale, assets } = result.value;
    for (const asset of assets) {
      if (!editablePlacementTypes.has(asset.type) || !asset.group || (!asset.url && !asset.videoUrl) ||
          !['ACTIVE', 'PARENT_APPROVED', 'PARENT_PREPARE_FOR_SUBMISSION'].includes(asset.state)) continue;
      const key = JSON.stringify([asset.type, asset.group]);
      if (!candidates.has(key)) candidates.set(key, new Map());
      const byLocale = candidates.get(key);
      if (!byLocale.has(sourceLocale)) byLocale.set(sourceLocale, []);
      byLocale.get(sourceLocale).push({ ...asset, sourceLocale });
    }
  }
  const allSourcesRead = results.every(result => result.status === 'fulfilled');
  return [...candidates.entries()].flatMap(([key, byLocale]) => {
    const [type] = JSON.parse(key);
    const primary = byLocale.get(primaryLocale);
    const creative = type === 'APP_STORE_SEARCH_RESULTS_ASSET' || type === 'PRODUCT_PAGE_HEADER_ASSET';
    if (primary && (!creative || sameLanguage(primaryLocale))) return primary;
    if (!allSourcesRead) return [];
    const regional = [...byLocale.keys()].filter(sameLanguage);
    if (regional.length === 1) return byLocale.get(regional[0]);
    return regional.length === 0 ? primary || [] : [];
  });
}

export async function readLocalizedMedia(client, appId, versionId, locale, { includeFallbacks = false } = {}) {
  const { locales, localization, version, localizations, primaryLocale } = await mediaTarget(client, appId, versionId, locale);
  if (!localization) return { locales };
  const assets = await readMediaPlacements(client, localization.id);
  const fallbackAssets = includeFallbacks ? await readMediaFallbacks(client, localizations, locale, primaryLocale) : undefined;
  const state = version.attributes.appVersionState || version.attributes.appStoreState;
  const revision = createHash('sha256').update(JSON.stringify([localization.id, state, [...assets].sort((a, b) => (a.group || '').localeCompare(b.group || '')).map(
    ({ id, type, group, state, lastModifiedDate, assetId }) => [id, type, group, state, lastModifiedDate, assetId],
  )])).digest('hex');
  return { locales, locale, localizationId: localization.id, assets, fallbackAssets, revision, editable: mediaEditableStates.has(state),
    description: localization.attributes.description, promotionalText: localization.attributes.promotionalText, whatsNew: localization.attributes.whatsNew };
}

const submittingMedia = new Set();

export async function submitLocalizedMediaOrder(client, appId, { versionId, locale, group, revision, order } = {}) {
  if (typeof versionId !== 'string' || typeof locale !== 'string' || !locale || typeof group !== 'string' || !group ||
      typeof revision !== 'string' || !Array.isArray(order) || order.length < 2 || order.length > 10) {
    mediaError('请先读取并调整当前语言的截图顺序。');
  }
  const key = JSON.stringify([appId, versionId, locale]);
  if (submittingMedia.has(key)) mediaError('此语言的素材正在提交。', 409);
  submittingMedia.add(key);
  try {
    const current = await readLocalizedMedia(client, appId, versionId, locale);
    if (!current.editable) mediaError('当前版本状态不允许修改截图。', 409);
    if (current.revision !== revision) mediaError('商店素材已变化，请重新读取后再编辑。', 409);
    const placements = current.assets.filter(asset => asset.group === group);
    const original = placements.filter(asset => asset.type === 'APP_SCREENSHOT').map(asset => asset.id);
    if (order.length !== original.length || new Set(order).size !== order.length || order.some(id => !original.includes(id))) {
      mediaError('提交的截图必须全部属于当前语言和设备组。');
    }
    if (original.every((id, index) => id === order[index])) return current;
    let index = 0;
    await client.request('/v1/appAssetLibraryPlacementOrderingRequests', 'POST', {
      data: {
        type: 'appAssetLibraryPlacementOrderingRequests',
        attributes: { placementGroup: group },
        relationships: {
          orderedPlacements: { data: placements.map(asset => ({
            type: 'appAssetLibraryPlacements',
            id: asset.type === 'APP_SCREENSHOT' ? order[index++] : asset.id,
          })) },
          appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: current.localizationId } },
        },
      },
    });
    const verified = await readLocalizedMedia(client, appId, versionId, locale);
    const actual = verified.assets.filter(asset => asset.group === group && asset.type === 'APP_SCREENSHOT').map(asset => asset.id);
    if (JSON.stringify(actual) !== JSON.stringify(order)) mediaError('Apple 已接收请求，截图顺序尚未回读确认，请重新读取。', 409);
    return verified;
  } finally {
    submittingMedia.delete(key);
  }
}

const imagePlacementTypes = new Set(['APP_SCREENSHOT', 'PRODUCT_PAGE_HEADER_ASSET', 'APP_STORE_SEARCH_RESULTS_ASSET']);
const editablePlacementTypes = new Set([...imagePlacementTypes, 'APP_PREVIEW']);
const placementLimit = type => type === 'APP_SCREENSHOT' ? 10 : type === 'APP_PREVIEW' ? 3 : 1;
const ref = (type, id) => ({ data: { type, id } });

function imageUpload(file) {
  const match = typeof file?.data === 'string' && /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+=*)$/.exec(file.data);
  if (!match || typeof file.name !== 'string' || !file.name || file.name.length > 200 || /[/\\\x00-\x1f]/.test(file.name)) mediaError('请选择有效的 PNG 或 JPEG 图片。');
  const bytes = Buffer.from(match[2], 'base64');
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) : bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  if (!valid || bytes.length > 20 * 1024 * 1024) mediaError('图片格式无效，或单张超过 20 MB。');
  return { bytes, fileName: file.name.replace(/\.[^.]+$/, '') + (match[1] === 'png' ? '.png' : '.jpg') };
}

export const maxMediaDraftBytes = 256 * 1024 * 1024;

export function saveMediaDraftGroup(store, productId, appId, { versionId, locale, type, group, items }) {
  if (!editablePlacementTypes.has(type) || typeof group !== 'string' || !/^[A-Z0-9_]{1,100}$/.test(group) ||
      !Array.isArray(items) || items.length > placementLimit(type)) mediaError('素材展示位或数量无效。');
  const normalized = items.map(item => {
    if (typeof item?.id === 'string' && item.id && item.id.length <= 200) return { id: item.id };
    if (!imagePlacementTypes.has(type)) mediaError('此展示位仅支持调整已有素材。');
    imageUpload(item);
    return { name: item.name, data: item.data };
  });
  const current = store.asoMediaDraft(productId, appId, versionId, locale);
  const otherGroups = current.filter(entry => entry.type !== type || entry.group !== group);
  const size = [...otherGroups, { items: normalized }].reduce((total, entry) =>
    total + entry.items.reduce((sum, item) => sum + (item.data?.length || 0), 0), 0);
  if (size > maxMediaDraftBytes) mediaError('该版本和语言的图片草稿超过 256 MB。');
  store.asoMediaDraft(productId, appId, versionId, locale, [{ type, group, items: normalized }]);
}

async function uploadMediaImage(client, libraryId, file, type, fetcher) {
  const imageType = 'appAssetLibraryImages';
  const { data } = await client.request('/v1/appAssetLibraryImages', 'POST', {
    data: { type: imageType, attributes: { fileName: file.fileName, fileSize: file.bytes.length,
      category: type === 'APP_SCREENSHOT' ? 'APP_SCREENSHOTS_AND_PREVIEWS' : 'CREATIVE_ASSETS' },
    relationships: { assetLibrary: ref('appAssetLibraries', libraryId) } },
  });
  const operations = data?.attributes?.uploadOperations;
  if (!data?.id || !operations?.length) mediaError('Apple 没有返回图片上传地址。', 502);
  for (const part of operations) {
    const url = new URL(part.url);
    const host = url.hostname.toLowerCase();
    const isAllowedHost = host.endsWith('.apple.com') ||
      host.endsWith('.blobstore.apple.com') ||
      host.endsWith('.amazonaws.com') ||
      host.endsWith('.apple-cloudkit.com');
    const method = (part.method || 'PUT').toUpperCase();
    if (url.protocol !== 'https:' || url.username || url.password || !isAllowedHost ||
        !['PUT', 'POST'].includes(method) ||
        !Number.isSafeInteger(part.offset) || !Number.isSafeInteger(part.length) ||
        part.offset < 0 || part.offset >= file.bytes.length || part.length <= 0) {
      mediaError('Apple 返回的图片上传操作无效。', 502);
    }
    const chunkLength = Math.min(part.length, file.bytes.length - part.offset);
    const body = file.bytes.subarray(part.offset, part.offset + chunkLength);
    const headers = Object.fromEntries((part.requestHeaders || []).map(({ name, value }) => [name, value]));
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-length') headers[key] = String(chunkLength);
    }
    const response = await fetcher(url, {
      method, headers,
      body, redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) mediaError(`图片上传失败（HTTP ${response.status}）。`, 502);
  }
  const path = `/v1/appAssetLibraryImages/${encodeURIComponent(data.id)}`;
  await client.request(path, 'PATCH', { data: { type: imageType, id: data.id, attributes: { uploaded: true } } });
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: image } = await client.request(path);
    if (['PREPARE_FOR_SUBMISSION', 'APPROVED'].includes(image?.attributes?.state)) return { id: data.id, specId: image.attributes.specId };
    if (image?.attributes?.state === 'FAILED') mediaError(`Apple 无法处理图片「${file.fileName}」，请核对尺寸和格式。`, 422);
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  mediaError(`「${file.fileName}」已上传至素材库，Apple 仍在处理。当前展示位尚未变更。`, 409);
}

export async function submitLocalizedMedia(client, appId, input, fetcher = fetch) {
  const { versionId, locale, revision, changes } = input || {};
  if (typeof versionId !== 'string' || !versionId || typeof locale !== 'string' || !locale ||
      typeof revision !== 'string' || !Array.isArray(changes) || !changes.length || changes.length > 24) mediaError('请先读取版本与语言，再编辑素材。');
  const key = JSON.stringify([appId, versionId, locale]);
  if (submittingMedia.has(key)) mediaError('此语言的素材正在提交。', 409);
  submittingMedia.add(key);
  let touchedPlacements = false;
  try {
    const current = await readLocalizedMedia(client, appId, versionId, locale);
    if (!current.editable || current.revision !== revision) mediaError('版本状态或商店素材已变化，请重新读取。', 409);
    const groups = new Set();
    const plans = changes.map(change => {
      const { type, group, items } = change || {};
      const groupKey = JSON.stringify([type, group]);
      if (!editablePlacementTypes.has(type) || typeof group !== 'string' || !/^[A-Z0-9_]{1,100}$/.test(group) ||
          groups.has(groupKey) || !Array.isArray(items) || items.length > placementLimit(type)) mediaError('素材展示位或数量无效。');
      groups.add(groupKey);
      const original = current.assets.filter(asset => asset.type === type && asset.group === group);
      if (!original.length && (type === 'APP_PREVIEW' || (type !== 'APP_SCREENSHOT' && group !== 'DEFAULT_PROFILE'))) mediaError('所选素材组不存在。');
      const retained = new Set();
      const desired = items.map(item => {
        if (item?.id && original.some(asset => asset.id === item.id) && !retained.has(item.id)) {
          retained.add(item.id);
          return { id: item.id };
        }
        if (item?.id || !imagePlacementTypes.has(type)) mediaError('素材不属于当前版本、语言或展示位。');
        return { file: imageUpload(item) };
      });
      return { type, group, original, desired, removed: original.filter(asset => !retained.has(asset.id)) };
    });
    if (plans.some(plan => plan.desired.some(item => item.file))) {
      const [{ data: library }, { data: catalog }] = await Promise.all([
        client.request(`/v1/apps/${encodeURIComponent(appId)}/assetLibrary`),
        client.request('/v1/appAssetLibraryRefData?fields[appAssetLibraryRefData]=placementTypes'),
      ]);
      if (!library?.id) mediaError('找不到此 App 的 Apple 素材库。', 502);
      const types = catalog?.[0]?.attributes?.placementTypes || [];
      for (const plan of plans) for (const item of plan.desired) {
        if (!item.file) continue;
        const specs = types.find(type => type.placementTypeId === plan.type)?.specMappings
          ?.find(mapping => mapping.placementGroupId === plan.group)?.specs;
        if (!specs?.length) mediaError('Apple 未提供该展示位的图片规格。', 422);
        const uploaded = await uploadMediaImage(client, library.id, item.file, plan.type, fetcher);
        if (!specs.includes(uploaded.specId)) mediaError(`「${item.file.fileName}」的规格与目标展示位不匹配。`, 422);
        item.assetId = uploaded.id;
      }
      if ((await readLocalizedMedia(client, appId, versionId, locale)).revision !== revision) mediaError('上传期间商店素材已变化，请重新读取。', 409);
    }
    for (const plan of plans) {
      const remove = async asset => {
        touchedPlacements = true;
        await client.request(`/v1/appAssetLibraryPlacements/${encodeURIComponent(asset.id)}`, 'DELETE');
      };
      const removals = [...plan.removed];
      let count = plan.original.length;
      for (const item of plan.desired.filter(item => item.assetId)) {
        if (count >= placementLimit(plan.type)) { await remove(removals.shift()); count--; }
        touchedPlacements = true;
        const { data } = await client.request('/v1/appAssetLibraryPlacements', 'POST', { data: {
          type: 'appAssetLibraryPlacements', attributes: { placementType: plan.type, placementGroup: plan.group },
          relationships: { image: ref('appAssetLibraryImages', item.assetId), appStoreVersionLocalization: ref('appStoreVersionLocalizations', current.localizationId) },
        } });
        if (!data?.id) mediaError('Apple 未返回新展示位。', 502);
        item.id = data.id;
        count++;
      }
      for (const asset of removals) await remove(asset);
    }
    const matches = (assets, plan) => JSON.stringify(assets.filter(asset => asset.type === plan.type && asset.group === plan.group).map(asset => asset.id)) === JSON.stringify(plan.desired.map(item => item.id));
    let verified = await readLocalizedMedia(client, appId, versionId, locale);
    for (const group of new Set(plans.filter(plan => plan.desired.length > 1 && !matches(verified.assets, plan)).map(plan => plan.group))) {
      const assets = verified.assets.filter(asset => asset.group === group);
      const sequences = new Map(plans.filter(plan => plan.group === group).map(plan => [plan.type, plan.desired.map(item => item.id)]));
      for (const [type, ids] of sequences) {
        const actual = assets.filter(asset => asset.type === type);
        if (actual.length !== ids.length || actual.some(asset => !ids.includes(asset.id))) mediaError('商店素材尚未同步或已变化。', 409);
      }
      touchedPlacements = true;
      await client.request('/v1/appAssetLibraryPlacementOrderingRequests', 'POST', { data: {
        type: 'appAssetLibraryPlacementOrderingRequests', attributes: { placementGroup: group },
        relationships: {
          appStoreVersionLocalization: ref('appStoreVersionLocalizations', current.localizationId),
          orderedPlacements: { data: assets.map(asset => ({ type: 'appAssetLibraryPlacements', id: sequences.get(asset.type)?.shift() || asset.id })) },
        },
      } });
      verified = await readLocalizedMedia(client, appId, versionId, locale);
    }
    if (plans.some(plan => !matches(verified.assets, plan))) mediaError('Apple 尚未回读确认全部修改。', 409);
    return verified;
  } catch (error) {
    if (touchedPlacements) mediaError(`部分修改可能已写入 Apple，请重新读取后核对。 ${error.message}`, 409);
    throw error;
  } finally {
    submittingMedia.delete(key);
  }
}
