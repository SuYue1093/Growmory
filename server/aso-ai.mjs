import { aiRequest } from './ai-request.mjs';
import { plainText } from './release-ai.mjs';

/**
 * Clean and optimize keywords against App Name and Subtitle to avoid wasted quota.
 * In Apple App Store, any keyword appearing in Name or Subtitle is already indexed with higher weight.
 */
export function optimizeAsoKeywords({ name = '', subtitle = '', keywords = '' }) {
  const normName = name.trim().toLowerCase();
  const normSubtitle = subtitle.trim().toLowerCase();
  const titleText = `${normName} ${normSubtitle}`;

  // Split keywords by Chinese or English commas, newlines, or semicolons
  const rawWords = keywords
    .split(/[,，;\n]+/)
    .map(w => w.trim())
    .filter(Boolean);

  const seen = new Set();
  const duplicateWords = [];
  const redundantInTitleOrSubtitle = [];
  const validWords = [];

  for (const word of rawWords) {
    const lower = word.toLowerCase();
    if (seen.has(lower)) {
      duplicateWords.push(word);
      continue;
    }
    seen.add(lower);

    // If word is contained in Name or Subtitle (for words >= 2 chars)
    if (lower.length >= 2 && titleText.includes(lower)) {
      redundantInTitleOrSubtitle.push(word);
      continue;
    }

    validWords.push(word);
  }

  // Join by English half-width comma with NO spaces
  const after = validWords.join(',');
  const before = keywords.trim();

  return {
    before,
    after,
    beforeLength: [...before].length,
    afterLength: [...after].length,
    savedChars: Math.max(0, [...before].length - [...after].length),
    redundantInTitleOrSubtitle,
    duplicateWords,
    validWords
  };
}

/**
 * Generate ASO copy using AI or smart rule-based template
 */
export async function generateAsoAi({
  product,
  docs = [],
  seedKeywords = [],
  locale = 'zh-Hans',
  ai,
  fetcher = fetch
}) {
  const docText = docs.map(d => `${d.title}：\n${plainText(d.body)}`).join('\n\n').slice(0, 3000);
  const keywordsHint = Array.isArray(seedKeywords) && seedKeywords.length ? seedKeywords.join('、') : '';

  if (ai?.configured) {
    const prompt = `你是一名精通苹果 App Store 算法的资深 ASO（应用商店优化）专家。
请根据以下产品信息和知识库文档，为该 App 制定一套符合苹果最新审核与搜索排名的 ASO 元数据文案。

产品名称：${product.name}
产品英文名/标识：${product.englishName || '无'}
产品一句话简介：${product.summary || '无'}
产品支持平台：${product.platform || 'iPhone'}
种子/参考关键词：${keywordsHint || '无'}
已确认产品资料：
${docText || '暂无详细文档'}

【严格遵守苹果规范与中文字符计算标准】：
【极重要：中文字符数计数规则，切勿误判】：
苹果 App Store Connect 的字符数计算以实际单字（Unicode 长度 / str.length）为准，不是按字节（Bytes）或 Token 计算！
- 1 个汉字 = 1 个字符！半角逗号「,」= 1 个字符！
- 100 字符就是实打实的 100 个中文字符（含英文半角逗号）！
- 严禁将 1 个汉字误判为 2 或 3 个字符而少填！绝对不要只写二三十个汉字就草草了事！

1. name (应用名称)：≤ 30 字符（实打实 30 个汉字）。格式通常为「品牌词 - 核心品类词」，如「${product.name} - 极简待办与习惯打卡」。
2. subtitle (副标题)：≤ 30 字符（实打实 30 个汉字）。提炼核心差异化与使用场景。严禁重复标题中已有的词汇！
3. keywords (100字符关键词)：≤ 100 字符（实打实 100 个中文字符额度，含英文半角逗号）！
   - 以英文半角逗号分隔（如 "词A,词B,词C"），词与词之间绝不能有空格！
   - 【极重要去重规则】：标题和副标题中已经出现的词，绝对不要放进 keywords 里，因为苹果会自动提取标题词权重，重复放入只会浪费配额！
   - 【充分利用预算】：100 字符就是 100 个中文字符配额！请务必充分利用 90~100 字符的满额预算，尽可能覆盖更多高相关的高频词、长尾词和场景词，切勿只填二三十个汉字浪费流量！
4. promotionalText (推广文本)：≤ 170 字符（实打实 170 个汉字），简短有力。
5. description (应用描述)：≤ 4000 字符（实打实 4000 个汉字），结构清晰，包含一句话定位、核心功能亮点清单、适用人群与隐私承诺，排版舒适。

请返回纯 JSON 格式：
{
  "name": "...",
  "subtitle": "...",
  "keywords": "...",
  "promotionalText": "...",
  "description": "..."
}`;

    try {
      const response = await aiRequest('aso-generate', `${ai.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
        body: JSON.stringify({
          model: ai.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: '你是一名只返回标准 JSON 的专业 ASO 专家。' },
            { role: 'user', content: prompt }
          ]
        })
      }, fetcher);

      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        if (parsed.name && parsed.keywords) {
          // Run optimizer to ensure strict compliance
          const opt = optimizeAsoKeywords({
            name: parsed.name,
            subtitle: parsed.subtitle || '',
            keywords: parsed.keywords || ''
          });
          return {
            name: parsed.name.slice(0, 30),
            subtitle: (parsed.subtitle || '').slice(0, 30),
            keywords: opt.after.slice(0, 100),
            promotionalText: (parsed.promotionalText || '').slice(0, 170),
            description: (parsed.description || '').slice(0, 4000),
            source: 'ai',
            optimization: opt
          };
        }
      }
    } catch {
      // If AI call fails, fallback to template below
    }
  }

  // Rule-based smart template generation fallback
  const baseName = product.name;
  const brandSub = product.summary ? product.summary.slice(0, 25) : '极简好用的日常效率工具';
  const rawPool = [
    ...(seedKeywords || []),
    '效率', '工具', '助手', '轻量', '待办', '打卡', '规划', '日历', '笔记', '管理'
  ];

  const opt = optimizeAsoKeywords({
    name: baseName,
    subtitle: brandSub,
    keywords: rawPool.join(',')
  });

  return {
    name: baseName.slice(0, 30),
    subtitle: brandSub.slice(0, 30),
    keywords: opt.after.slice(0, 100),
    promotionalText: (product.summary || '轻量高效，助你专注每一天。').slice(0, 170),
    description: `${product.name} —— ${product.summary || '轻量本地优先的产品与日常工具'}\n\n【核心功能】\n• 极简易用：开箱即用，纯净无广告\n• 本地优先：数据保存在本地，安全放心\n• 顺畅体验：专为效率与专注设计\n\n如有任何建议或问题，欢迎在应用内反馈交流！`,
    source: 'template',
    tip: ai?.configured ? undefined : '当前为基于产品资料的规则生成。在「工作区设置 → AI」中配置大模型密钥后，可解锁更深度的高权重智能选词。',
    optimization: opt
  };
}
