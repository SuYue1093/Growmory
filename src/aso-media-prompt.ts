import type { Lang } from './i18n.ts';

export const ASO_LAB_SAMPLE = {
  appName: '拾页',
  appNameEn: 'Shiye',
  tagline: '阅读摘录与读书笔记',
  taglineEn: 'Reading excerpts & book notes',
  screenshotPath: 'public/aso-lab/sample-screenshot.png',
  screenshotUrl: '/aso-lab/sample-screenshot.png',
  screenshotSize: '1260 × 2736',
  iconPath: 'public/aso-lab/sample-icon.png',
  iconUrl: '/aso-lab/sample-icon.png',
  outputProfile: 'IPHONE_FACE_ID_LARGE_PROFILE',
  outputSize: '1242 × 2688',
} as const;

export function buildAsoMediaPrompt(params: {
  target: string;
  sizes: string;
  hasStudio: boolean;
  lang: Lang;
}) {
  const { target, sizes, hasStudio, lang } = params;
  if (lang === 'en') {
    const studioTip = hasStudio
      ? ' For quick multi-slide studies you may inspect renderer.studio, outputting final deliverables via renderer.htmlCommand.'
      : '';
    return `Design high-converting App Store product-page screenshots (APP_SCREENSHOT) from an experienced ASO visual designer's perspective.
Task parameters: ${target}
Target sizes & groups:
${sizes}

[Context & Boundaries]
- Retrieve all product copy, version locales, brand assets, and design capabilities directly via Growmory MCP: get_aso_context, get_aso_media, list_records (assets), and list_aso_design_resources (3D models, fonts, textures, SVG assets, renderer commands).${studioTip}
- Ground all product facts and value propositions in product docs (get_aso_context), never overriding facts from UI demo text; only check UI screenshots for language alignment with the target storefront locale.

[ASO Design Mindset]
- Design for instant 3-second comprehension in App Store search results (3 side-by-side thumbnails on a white background) and high tap-through appeal: focus each slide on one core benefit with strong tonal separation, expressive headline typography, real App Logo presence, clean hierarchy, and zero UI occlusion.
- Compose freely in custom HTML/CSS/SVG without fixed layout or material templates.

[Workflow]
1. Inspect product facts, screenshot locale alignment, and design resources (if an ImageGen tool is available, use it strictly for pure atmospheric background plates without devices/text/logos).
2. Compare two distinct hero directions for the lead visual, render optional 3D perspective with renderer.deviceModelCommand (--trim), and build bespoke design.html.
3. Render full PNG + 160px thumbnail via renderer.htmlCommand and refine against both visual inspection and returned audit.issues.
4. After user approval of initial concepts, produce the full localized sets and save drafts via save_aso_media_draft (type: "APP_SCREENSHOT").`;
  }

  const studioTip = hasStudio
    ? ' 需要快速预演多页结构时也可参考 renderer.studio，正式成品统一通过 renderer.htmlCommand 输出。'
    : '';

  return `请以专业 ASO 视觉设计师视角，为下列任务设计高转化率的 App Store 上架图（APP_SCREENSHOT）。
任务参数：${target}
目标尺寸与分组：
${sizes}

【资料获取与边界】
- 通过 Growmory MCP 获取全部资料与设计能力：调用 get_aso_context、get_aso_media 与 list_records（assets）获取产品文案与原版 Logo/截图；调用 list_aso_design_resources 自主选用 3D 机模、本地字体、纹理、SVG 素材及渲染命令（renderer.deviceModelCommand、renderer.htmlCommand 等）。${studioTip}
- 产品事实与卖点描述一律以产品资料为准，不以 UI 示例反推；针对截图本身只需校对界面语言是否与目标上架 locale 一致。

【ASO 设计视角】
- 站在 App Store 搜索页 3 图并排与详情页首屏转化视角思考：单图聚焦一个核心卖点，确保 160px 缩略图下 3 秒看懂且边缘与白底搜索页有明确对比；用有记忆点的主标题排版、真实 Logo 锚定、紧致节奏与不遮挡核心交互的视觉呼应（可辅以局部 UI 放大切片）打动用户。
- 彻底摆脱模板束缚，结合产品气质自由完成配色、字体搭配与 HTML/CSS/SVG 版式创作。

【执行流程】
1. 盘点产品卖点、校对截图语言并检索设计资源（若有生图工具可仅生成纯氛围背景底图，不含设备、UI 与文字）。
2. 先对比两种不同构图思路的首屏方案选优深化，按需运行 renderer.deviceModelCommand（传 --trim）生成 3D 样机，并在自定义 design.html 中完成自由编排。
3. 调用 renderer.htmlCommand 输出成品 PNG 与 160px 缩略图，结合双尺度实图观感与返回的 audit.issues 体检结果打磨至过检满意。
4. 首轮方案经用户确认后，制作目标版本全语言套图，调用 save_aso_media_draft（type: "APP_SCREENSHOT"）回填本地草稿。`;
}

export function buildAsoLabTestPrompt(params: {
  artDirection?: string;
  lang?: Lang;
} = {}) {
  const direction = params.artDirection?.trim() || '';
  const lang = params.lang || 'zh';

  if (lang === 'en') {
    return `Using the connected Growmory MCP and acting as a senior ASO visual designer, create ONE high-craft App Store lead screenshot (APP_SCREENSHOT, ${ASO_LAB_SAMPLE.outputSize}, ${ASO_LAB_SAMPLE.outputProfile}) from scratch using ONLY the provided screenshot and app logo.

[Provided Inputs (No Preset Layouts or Materials)]
- Product docs: "${ASO_LAB_SAMPLE.appNameEn}" (${ASO_LAB_SAMPLE.taglineEn}) — ground copy in these product facts; check the screenshot only for UI locale alignment.
- UI Screenshot: ${ASO_LAB_SAMPLE.screenshotPath} (${ASO_LAB_SAMPLE.screenshotSize})
- App Logo: ${ASO_LAB_SAMPLE.iconPath} (1024 × 1024)${direction ? `\n- Art Direction: ${direction}` : ''}

[MCP Workflow]
1. Use the active Growmory MCP directly (list_aso_design_resources) to inspect available 3D models, local fonts, textures, SVG elements, and renderer commands (renderer.deviceModelCommand, renderer.htmlCommand).
2. Design freely for App Store 3-second search thumbnail impact, white-background contrast, bold expressive headline craft, authentic Logo integration, tight composition, and clear UI focus. Render an optional trimmed 3D phone to .tmp/aso-lab/phone-3d.png and compose custom HTML/CSS/SVG in .tmp/aso-lab/design.html (<meta name="aso-size" content="1242x2688" />).
3. Run renderer.htmlCommand:
   node scripts/render-aso-html.mjs .tmp/aso-lab/design.html .tmp/aso-lab/aso-lab-test-1242x2688.png --profile ${ASO_LAB_SAMPLE.outputProfile} --thumb .tmp/aso-lab/aso-lab-test-160.png
   Inspect the full output, 160 px thumbnail, and returned audit.issues, iterating until crisp and high-converting.
4. Keep deliverables in .tmp/aso-lab/ for live preview in ASO Artwork Lab and summarize your ASO design rationale and output paths.`;
  }

  return `请直接通过已连接的 Growmory MCP，以专业 ASO 视觉设计师视角为「ASO 图片实验室」仅基于下方截图与 Logo，从零设计 1 张高转化感的 App Store 首屏上架图（APP_SCREENSHOT，${ASO_LAB_SAMPLE.outputSize}，${ASO_LAB_SAMPLE.outputProfile}）。

【输入素材（仅截图与 Logo，无预设版式、无预设风格材质）】
- 产品资料：「${ASO_LAB_SAMPLE.appName}」（${ASO_LAB_SAMPLE.tagline}）——文案卖点以产品资料为准，截图仅校对 UI 语言一致性
- 真实截图：${ASO_LAB_SAMPLE.screenshotPath}（${ASO_LAB_SAMPLE.screenshotSize}）
- 应用 Logo：${ASO_LAB_SAMPLE.iconPath}（1024 × 1024）${direction ? `\n- 补充方向：${direction}` : ''}

【MCP 执行流程】
1. 直接调用 Growmory MCP 的 list_aso_design_resources 获取可用的 3D 模型、本地字体、纹理、SVG 素材及渲染命令（renderer.deviceModelCommand、renderer.htmlCommand）。
2. 从 App Store 搜索缩略图 3 秒辨识度与首屏转化视角出发自由创作：提炼核心卖点，打造有设计张力的主标题排版、自然融合真实 Logo、保持紧凑构图节奏与清晰的白底对比，按需用 renderer.deviceModelCommand（传 --trim）输出 3D 样机至 .tmp/aso-lab/phone-3d.png，并在 .tmp/aso-lab/design.html（声明 <meta name="aso-size" content="1242x2688" />）中自由装配。
3. 运行渲染命令，并结合 1242×2688 成品、160px 缩略图与返回的 audit.issues 体检结果打磨优化：
   node scripts/render-aso-html.mjs .tmp/aso-lab/design.html .tmp/aso-lab/aso-lab-test-1242x2688.png --profile ${ASO_LAB_SAMPLE.outputProfile} --thumb .tmp/aso-lab/aso-lab-test-160.png
4. 将最终产物保留在 .tmp/aso-lab/ 供实验室实时预览，并简要汇报你的 ASO 设计思路与输出路径。`;
}
