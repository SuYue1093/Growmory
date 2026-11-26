import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sourcePackAssets } from './aso-design-source-packs.mjs';
import { svgCollectionAssets } from './aso-svg-collections.mjs';

const apple = 'https://developer.apple.com/design/resources/#product-bezels';
const thumbnail = 'https://developer.apple.com/design/resources/images/thumbnails/';
const bezels = 'https://devimages-cdn.apple.com/design/resources/download/';
const frames = [
  ['iphone-17', 'iPhone 17', 'iPhone17', 'Bezel-iPhone-17.dmg'],
  ['ipad-pro-m5', 'iPad Pro (M5)', 'iPad-Pro', 'Bezel-iPad-Pro-%28M5%29.dmg'],
  ['macbook-air-m5', 'MacBook Air (M5)', 'MacBook-Air-M5', 'Bezel-MacBook-Air-M5.dmg'],
].map(([id, name, slug, archive]) => ({
  id, name, kind: 'frame', file: `${id}.png`, source: apple,
  download: thumbnail + `Thumbnail-Bezel-${slug}_2x.png`, original: bezels + archive,
  license: 'Apple Design Resources', usage: 'preview-only',
}));

const fonts = [
  ['inter', 'Inter', 'Inter[opsz,wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['sourceserif4', 'Source Serif 4', 'SourceSerif4[opsz,wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['manrope', 'Manrope', 'Manrope[wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['dmsans', 'DM Sans', 'DMSans[opsz,wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['fraunces', 'Fraunces', 'Fraunces[SOFT,WONK,opsz,wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['zcoolxiaowei', '站酷小薇体', 'ZCOOLXiaoWei-Regular', ['zh-Hans']],
  ['mashanzheng', '马善政楷书', 'MaShanZheng-Regular', ['zh-Hans']],
  ['zcoolkuaile', '站酷快乐体', 'ZCOOLKuaiLe-Regular', ['zh-Hans']],
  ['spacegrotesk', 'Space Grotesk', 'SpaceGrotesk[wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['chivo', 'Chivo', 'Chivo[wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['longcang', '龙藏体', 'LongCang-Regular', ['zh-Hans']],
  ['lxgwwenkaitc', '霞鹜文楷 TC', 'LXGWWenKaiTC-Regular', ['zh-Hant']],
  ['archivo', 'Archivo', 'Archivo[wdth,wght]', ['en', 'fr', 'de', 'es']],
  ['barlowcondensed', 'Barlow Condensed Bold', 'BarlowCondensed-Bold', ['en', 'fr', 'de', 'es']],
  ['bricolagegrotesque', 'Bricolage Grotesque', 'BricolageGrotesque[opsz,wdth,wght]', ['en', 'fr', 'de', 'es']],
  ['instrumentsans', 'Instrument Sans', 'InstrumentSans[wdth,wght]', ['en', 'fr', 'de', 'es']],
  ['instrumentserif', 'Instrument Serif', 'InstrumentSerif-Regular', ['en', 'fr', 'de', 'es']],
  ['playfairdisplay', 'Playfair Display', 'PlayfairDisplay[wght]', ['en', 'fr', 'de', 'es']],
  ['worksans', 'Work Sans', 'WorkSans[wght]', ['en', 'fr', 'de', 'es']],
  ['lexend', 'Lexend', 'Lexend[wght]', ['en', 'fr', 'de', 'es']],
  ['zcoolqingkehuangyou', '站酷庆科黄油体', 'ZCOOLQingKeHuangYou-Regular', ['zh-Hans']],
  ['liujianmaocao', '刘建毛草', 'LiuJianMaoCao-Regular', ['zh-Hans']],
  ['zhimangxing', '志莽行书', 'ZhiMangXing-Regular', ['zh-Hans']],
  ['notosanssc', 'Noto Sans SC', 'NotoSansSC[wght]', ['zh-Hans']],
  ['notosanstc', 'Noto Sans TC', 'NotoSansTC[wght]', ['zh-Hant']],
  ['notosansjp', 'Noto Sans JP', 'NotoSansJP[wght]', ['ja']],
  ['notosanskr', 'Noto Sans KR', 'NotoSansKR[wght]', ['ko']],
  ['notosansarabic', 'Noto Sans Arabic', 'NotoSansArabic[wdth,wght]', ['ar']],
  ['notosansthai', 'Noto Sans Thai', 'NotoSansThai[wdth,wght]', ['th']],
  ['notoseriftc', 'Noto Serif TC', 'NotoSerifTC[wght]', ['zh-Hant']],
  ['notoserifjp', 'Noto Serif JP', 'NotoSerifJP[wght]', ['ja']],
  ['notoserifsc', 'Noto Serif SC', 'NotoSerifSC[wght]', ['zh-Hans'], true],
  ['notoserifkr', 'Noto Serif KR', 'NotoSerifKR[wght]', ['ko'], true],
  ['iansui', '芫荽 Iansui', 'Iansui-Regular', ['zh-Hant']],
  ['huninn', '粉圓 Huninn', 'Huninn-Regular', ['zh-Hant']],
  ['lxgwmarkergothic', '霞鹜漫黑', 'LXGWMarkerGothic-Regular', ['zh-Hans']],
  ['notosansdevanagari', 'Noto Sans Devanagari', 'NotoSansDevanagari[wdth,wght]', ['hi', 'mr', 'ne']],
  ['notosanshebrew', 'Noto Sans Hebrew', 'NotoSansHebrew[wdth,wght]', ['he']],
  ['notosansbengali', 'Noto Sans Bengali', 'NotoSansBengali[wdth,wght]', ['bn']],
  ['notosanstamil', 'Noto Sans Tamil', 'NotoSansTamil[wdth,wght]', ['ta']],
  ['notosansgeorgian', 'Noto Sans Georgian', 'NotoSansGeorgian[wdth,wght]', ['ka']],
  ['notonaskharabic', 'Noto Naskh Arabic', 'NotoNaskhArabic[wght]', ['ar']],
  ['ibmplexsansthai', 'IBM Plex Sans Thai', 'IBMPlexSansThai-Regular', ['th']],
  ['notosans', 'Noto Sans', 'NotoSans[wdth,wght]', ['en', 'fr', 'de', 'es', 'el', 'ru', 'uk', 'vi']],
  ['rubik', 'Rubik', 'Rubik[wght]', ['en', 'fr', 'de', 'es', 'he', 'ru']],
  ['bebasneue', 'Bebas Neue', 'BebasNeue-Regular', ['en', 'fr', 'de', 'es']],
  ['spacemono', 'Space Mono', 'SpaceMono-Regular', ['en', 'fr', 'de', 'es', 'vi']],
  ['jetbrainsmono', 'JetBrains Mono', 'JetBrainsMono[wght]', ['en', 'fr', 'de', 'es', 'el', 'ru', 'uk', 'vi']],
  ['outfit', 'Outfit', 'Outfit[wght]', ['en', 'fr', 'de', 'es']],
  ['plusjakartasans', 'Plus Jakarta Sans', 'PlusJakartaSans[wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['redhatdisplay', 'Red Hat Display', 'RedHatDisplay[wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['cormorantgaramond', 'Cormorant Garamond', 'CormorantGaramond[wght]', ['en', 'fr', 'de', 'es', 'ru', 'uk', 'vi']],
  ['librebaskerville', 'Libre Baskerville', 'LibreBaskerville[wght]', ['en', 'fr', 'de', 'es']],
  ['literata', 'Literata', 'Literata[opsz,wght]', ['en', 'fr', 'de', 'es', 'el', 'ru', 'uk', 'vi']],
  ['dmseriftext', 'DM Serif Text', 'DMSerifText-Regular', ['en', 'fr', 'de', 'es']],
  ['rethinksans', 'Rethink Sans', 'RethinkSans[wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['ibmplexmono', 'IBM Plex Mono', 'IBMPlexMono-Regular', ['en', 'fr', 'de', 'es', 'vi']],
  ['geist', 'Geist', 'Geist[wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['geistmono', 'Geist Mono', 'GeistMono[wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['archivoblack', 'Archivo Black', 'ArchivoBlack-Regular', ['en', 'fr', 'de', 'es']],
  ['nunito', 'Nunito', 'Nunito[wght]', ['en', 'fr', 'de', 'es', 'vi']],
  ['spectral', 'Spectral', 'Spectral-Regular', ['en', 'fr', 'de', 'es', 'vi']],
  ['zenkakugothicnew', 'Zen Kaku Gothic New', 'ZenKakuGothicNew-Regular', ['ja']],
  ['zenmarugothic', 'Zen Maru Gothic', 'ZenMaruGothic-Regular', ['ja']],
  ['nanummyeongjo', 'Nanum Myeongjo', 'NanumMyeongjo-Regular', ['ko']],
  ['cascadiacode', 'Cascadia Code', 'CascadiaCode[wght]', ['en', 'fr', 'de', 'es']],
  ['atkinsonhyperlegiblenext', 'Atkinson Hyperlegible Next', 'AtkinsonHyperlegibleNext[wght]', ['en', 'fr', 'de', 'es']],
  ['chocolateclassicalsans', 'Chocolate Classical Sans', 'ChocolateClassicalSans-Regular', ['zh-Hant']],
  ['alexandria', 'Alexandria', 'Alexandria[wght]', ['ar', 'en']],
  ['kantumruypro', 'Kantumruy Pro', 'KantumruyPro[wght]', ['km', 'en']],
].map(([id, name, filename, locales, useGitHub]) => ({
  id, name, kind: 'font', locales, file: `${id}.ttf`, license: 'OFL-1.1',
  source: `https://github.com/google/fonts/tree/main/ofl/${id}`,
  download: `${useGitHub ? 'https://raw.githubusercontent.com/google/fonts/main' : 'https://cdn.jsdelivr.net/gh/google/fonts@main'}/ofl/${id}/${encodeURIComponent(filename)}.ttf`,
  licenseUrl: `https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/${id}/OFL.txt`,
}));

const iphoneOverlay = {
  id: 'iphone-17-overlay', name: 'iPhone 17 · Front', kind: 'frame', file: 'iphone-17-overlay.png',
  source: frames[0].download, license: frames[0].license, usage: 'screen-overlay',
  screen: [21, 17, 427, 929], radius: 68,
};
const airOverlay = {
  id: 'iphone-air-mobilefirst', name: 'iPhone Air · Front', kind: 'frame',
  file: 'iphone-air-mobilefirst.png', usage: 'screen-overlay', screen: [16, 13, 356, 775], radius: 53,
  source: 'https://www.webmobilefirst.com/en/mockups/apple-iphone-air-2025/',
  license: 'Mobile FIRST · commercial design use; standalone redistribution prohibited',
  download: 'https://www.webmobilefirst.com/img/mockups/mockup-apple-iphone-air-2025-transparent.png',
};
const iphoneModel = {
  id: 'iphone-17-pro-max-3d', name: 'iPhone 17 Pro Max · 3D', kind: 'model',
  file: 'iphone-17-pro-max.glb', usage: 'screen-texture',
  screenOrientation: 'upright-portrait', screenMaterial: 'screen.001', screenNormal: [-1, 0, 0],
  bodyMaterials: ['basecolor.001', 'metalframe.002', 'Material.005', 'Material.006', 'backpanel.001', 'logo_face'],
  source: 'https://sketchfab.com/3d-models/iphone-17-pro-max-87fc1df741384124a8ce0226d2b2058d',
  license: 'CC BY 4.0', licensePage: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'iPhone 17 Pro Max by MajdyModels (@MG990)',
  download: 'https://cdn.jsdelivr.net/gh/quentin-pla/phone-mockup-studio@main/source/iphone_17_pro_max.glb',
};
const additionalAssets = [
  {
    id: 'tablet-13-low-poly', name: '13-inch tablet · Low poly', kind: 'model',
    file: 'tablet-13-low-poly.glb', usage: 'render-to-png-first', license: 'CC0-1.0',
    source: 'https://3dassets.dev/assets/computers-and-desk-gadgets-tablet-13-pro-21268870',
    download: 'https://cdn.3dassets.dev/assets/38845/v1/model.glb',
  },
  {
    id: 'book-paper-2k', name: 'Book paper · 2K', kind: 'texture',
    file: 'book-paper-2k.jpg', usage: 'image-layer', license: 'CC0-1.0',
    source: 'https://polyhaven.com/a/book_pattern',
    download: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/book_pattern/book_pattern_page_2k.jpg',
  },
  {
    id: 'ambient-paper002-1k', name: 'Paper 002 · 1K', kind: 'texture',
    file: 'ambient-paper002-1k.jpg', usage: 'image-layer', license: 'CC0-1.0',
    source: 'https://ambientcg.com/view?id=Paper002',
    original: 'https://ambientcg.com/get?file=Paper002_1K-JPG.zip',
  },
  ...[
    ['crepe_satin', 'Crepe satin'],
    ['rough_linen', 'Rough linen'],
    ['white_plaster_02', 'White plaster'],
    ['velour_velvet', 'Velour velvet'],
    ['quatrefoil_jacquard_fabric', 'Quatrefoil jacquard'],
    ['denim_fabric_04', 'Denim weave'],
    ['leather_white', 'White leather'],
    ['clay_plaster', 'Clay plaster'],
    ['blue_plaster_wall', 'Blue plaster'],
    ['brushed_concrete_04', 'Brushed concrete'],
    ['marble_01', 'Marble veins'],
    ['terrazzo_tiles', 'Terrazzo'],
    ['yellow_plaster_02', 'Yellow plaster'],
    ['painted_plaster_wall', 'Painted plaster'],
    ['patterned_slate_tiles', 'Patterned slate'],
    ['stenciled_brick_floor', 'Stenciled brick'],
    ['rubber_tiles', 'Rubber tile'],
    ['painted_metal_shutter', 'Painted metal shutter'],
    ['blue_floor_tiles_01', 'Blue ceramic tile'],
    ['terracotta_floor_tiles', 'Terracotta tile'],
    ['rusty_painted_metal', 'Weathered painted metal'],
    ['rough_wood', 'Rough wood'],
    ['raw_wooden_floor_01', 'Natural wood floor'],
    ['brown_floor_tiles', 'Brown tile'],
    ['painted_worn_brick', 'Worn painted brick'],
  ].map(([slug, name]) => ({
    id: `${slug.replaceAll('_', '-')}-2k`, name: `${name} · 2K`, kind: 'texture',
    file: `${slug.replaceAll('_', '-')}-2k.jpg`, usage: 'image-layer', license: 'CC0-1.0',
    source: `https://polyhaven.com/a/${slug}`,
    download: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/${slug}/${slug}_diff_2k.jpg`,
  })),
  ...['col1', 'col2'].map((channel, index) => ({
    id: `book-cloth-2k-${index + 1}`, name: `Book cover cloth ${index + 1} · 2K`, kind: 'texture',
    file: `book-cloth-2k-${index + 1}.jpg`, usage: 'image-layer', license: 'CC0-1.0',
    source: 'https://polyhaven.com/a/book_pattern',
    download: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/book_pattern/book_pattern_${channel}_2k.jpg`,
  })),
];
const illustrations = [
  ['reading', 'Reading'], ['reading-side', 'Reading on the side'], ['sitting-reading', 'Reading seated'],
  ['coffee', 'Coffee break'], ['meditating', 'Meditating'], ['plant', 'Plant'],
  ['swinging', 'Swinging'], ['unboxing', 'Unboxing'], ['dancing', 'Dancing'],
  ['running', 'Running'], ['strolling', 'Strolling'], ['dog-jump', 'Jumping dog'], ['selfie', 'Selfie'],
].map(([slug, name]) => ({
  id: `open-doodles-${slug}`, name, kind: 'illustration', collection: 'Open Doodles', file: `open-doodles-${slug}.png`,
  usage: 'image-layer', source: 'https://www.opendoodles.com/',
  license: 'CC0-1.0', licensePage: 'https://www.opendoodles.com/about', attribution: 'Open Doodles by Pablo Stanley',
  download: `https://opendoodles.s3-us-west-1.amazonaws.com/${slug}.png`,
  original: `https://opendoodles.s3-us-west-1.amazonaws.com/${slug}.svg`,
}));
export const designFiles = [...frames, iphoneOverlay, airOverlay, iphoneModel, ...additionalAssets, ...illustrations, ...sourcePackAssets, ...svgCollectionAssets, ...fonts];
export const designFilePath = file => fileURLToPath(new URL(`../data/aso-design/${file}`, import.meta.url));

const elements = JSON.parse(readFileSync(new URL('./aso-design-elements.json', import.meta.url), 'utf8'))
  .map(({ lines = [], circles = [], polygons = [], defaultFill = false, strokeWidth = 1.6, ...metadata }) => {
    const fill = defaultFill ? 'currentColor' : 'none';
    const paths = lines.map(points => `<polyline points="${points.map(point => point.join(',')).join(' ')}"/>`);
    const areas = polygons.map(points => `<polygon fill="${fill}" points="${points.map(point => point.join(',')).join(' ')}"/>`);
    const rings = circles.map(([x, y, r]) => `<circle fill="${fill}" cx="${x}" cy="${y}" r="${r}"/>`);
    return {
      ...metadata, kind: 'element', fillable: Boolean(polygons.length || circles.length),
      defaultFill, strokeWidth,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${[...paths, ...areas, ...rings].join('')}</svg>`,
    };
  });

export const elementCategories = [...new Set(elements.map(item => item.category))];
export const svgCollections = [...new Set(designFiles.map(item => item.collection).filter(Boolean))];
const screenshotProfiles = JSON.parse(readFileSync(new URL('./aso-screenshot-profiles.json', import.meta.url), 'utf8'));

export function designResources(kind, category, collection) {
  return {
    resources: [
      ...designFiles.map(item => {
        const available = existsSync(designFilePath(item.file));
        return {
          ...item, available,
          ...(available && { path: designFilePath(item.file), url: `/api/aso/design-resources/${item.file}` }),
          ...(item.previewFile && existsSync(designFilePath(item.previewFile)) && { previewUrl: `/api/aso/design-resources/${item.previewFile}` }),
          ...(item.sourceFile && existsSync(designFilePath(item.sourceFile)) && {
            sourcePath: designFilePath(item.sourceFile),
            sourceUrl: `/api/aso/design-resources/${item.sourceFile}`,
          }),
        };
      }),
      ...elements,
    ].filter(item => (!kind || item.kind === kind) && (!category || item.category === category) && (!collection || item.collection === collection)),
    elementCategories,
    svgCollections,
    backgrounds: {
      modes: ['solid', 'linear-gradient', 'radial-gradient', 'image'],
      examples: [['#14233F', '#ADC7F5'], ['#271F40', '#E8C3EA'], ['#073D36', '#A1E3C4']],
      guide: 'For new App Store creatives, generate a clean background plate with an image tool and save it separately. Match the brand and leave quiet space for the headline and real screenshot. Exclude devices, UI, text, logos and watermarks from the image-generation input and output.',
      source: 'https://github.com/0xn0v/ai-skills/blob/main/app-store-screenshot-imagegen/SKILL.md',
    },
    renderer: {
      scope: 'App Store product-page screenshots only.',
      htmlCommand: 'node scripts/render-aso-html.mjs design.html output.png --profile SCREENSHOT_GROUP --thumb thumb-160.png',
      screenshotProfiles,
      deviceModelCommand: 'node scripts/render-aso-device-model.mjs MODEL_ID UI.png OUTPUT.png [yaw] [pitch] [roll] [original|graphite|titanium|champagne|silver|black] [--trim]',
      deviceModelGuide: 'Use a model with usage: screen-texture. The command fits UI.png onto its display and renders a transparent PNG. Supported finishes on iPhone 17 Pro Max include original, graphite, titanium, champagne, silver, and black. Pass --trim to crop outer transparent margins cleanly for custom HTML composition. Retain source attribution.',
      deviceModelViews: [
        { name: 'Front', yaw: 0, pitch: 0, roll: 0 },
        { name: 'Editorial hero', yaw: -12, pitch: 5, roll: -4 },
        { name: 'Left', yaw: -33, pitch: 4, roll: 0 },
        { name: 'Right', yaw: 33, pitch: 4, roll: 0 },
        { name: 'Left floating', yaw: -27, pitch: -27, roll: -16 },
        { name: 'Right floating', yaw: 27, pitch: -27, roll: 16 },
        { name: 'Low angle', yaw: 32, pitch: -55, roll: 30 },
      ],
      designSystem: {
        preferredRenderer: 'render-aso-html.mjs (bespoke design.html HTML/CSS/SVG rendered in headless Chrome at exact App Store pixels, with automatic @font-face injection for all installed data/aso-design/*.ttf fonts, <i data-lucide="..."> inline SVG hydration, backdrop-filter glassmorphism, opaque 24-bit RGB PNG output, and automated [ASO QA] DOM/contrast audit).',
        freedomOfComposition: 'No layout presets: design a bespoke composition and visual rhythm per app screenshot in custom HTML/CSS/SVG based on product docs (get_aso_context) and real UI.',
        factAndLocaleBoundary: 'Ground ALL product facts, feature counts, and selling points in product data/docs (get_aso_context) rather than guessing or overriding from UI; ONLY validate that the screenshot UI language matches the target storefront locale (if mismatched or onboarding-heavy, adapt framing/UI pop-outs or highlight localized callouts so raw foreign text never dominates).',
        backgroundStrategy: 'If an ImageGen tool is available, generate a pure atmospheric editorial background plate (exclude devices, UI, text, logos, watermarks) and reference it in design.html with a soft readability scrim. If no ImageGen tool is available, compose saturated editorial gradients, rich depth lighting, and subtle textures from /aso-design/*—ensure outer edges clearly separate from App Store white (#FFFFFF) search pages rather than washing out into near-white beige.',
        typographyCraft: 'Match font personality to the app UI: use crisp heavy/geometric Chinese sans & display fonts (notosanssc weight 800-900, zcoolqingkehuangyou, lxgwmarkergothic, huninn) for modern utility/card apps, or expressive literary/brush fonts (zcoolxiaowei, notoserifsc, mashanzheng, lxgwwenkaitc) for reading/editorial apps; mix with Latin display accents (fraunces, instrumentserif, archivoblack, bricolagegrotesque, spacegrotesk) when bilingual.',
        headlineCraft: 'Give every headline real poster design tension: push hero scale to 96px-132px with tight line-height (1.05-1.18) and deliberate tracking (-0.02em). NEVER render uniform single-color equal-size centered 2-line prose or sandwich the title between two pill badges. Sculpt 1-2 focal keywords using dual-tone accent contrast, gradient clip fill, SVG brush/highlighter strokes behind words, dramatic line-scale/weight pairing, or asymmetric editorial alignment anchored by the real App Logo.',
        compositionCraft: 'Keep vertical gap between headline block and device/callout stage tight (40px-110px; forbid >130px dead middle void). Let device + popped-out UI magnification slices fill 65%-75% of canvas height, while keeping floating badges/callouts clear of core screen controls and >= 26px everywhere.',
      },
      studio: {
        purpose: 'Optional iPhone or iPad layout studies with editable frames, shapes, callouts and text. The Growmory compositor builds the final image from the generated background and original assets.',
        setup: 'npm run aso:studio -- setup',
        validate: 'npm run aso:studio -- validate PROJECT_DIR VALIDATION_DIR',
        render: 'npm run aso:studio -- render PROJECT_DIR OUTPUT_DIR --slides 1 --locale STUDIO_LOCALE',
        bundle: 'npm run aso:studio -- bundle PROJECT_DIR OUTPUT_DIR',
      },
    },
    labSample: {
      appName: '拾页',
      tagline: '阅读摘录与读书笔记',
      screenshotPath: 'public/aso-lab/sample-screenshot.png',
      screenshotUrl: '/aso-lab/sample-screenshot.png',
      iconPath: 'public/aso-lab/sample-icon.png',
      iconUrl: '/aso-lab/sample-icon.png',
      defaultProfile: 'IPHONE_FACE_ID_LARGE_PROFILE',
      defaultSize: [1242, 2688],
    },
    productAssets: 'Use list_records with collection assets and productId, then get_record for the original asset.',
  };
}
