import { aiRequest } from './ai-request.mjs';

/**
 * 依据数据分析报告划线引用内容，通过 AI 智能生成 20 字以内的精炼待办标题
 */
export async function generateTaskFromQuote({
  quote,
  productName = '',
  reportTitle = '',
  ai,
  fetcher = fetch,
}) {
  const fail = (message, status = 400) => {
    throw Object.assign(new Error(message), { status });
  };

  const rawQuote = typeof quote === 'string' ? quote.trim() : '';
  if (!rawQuote) {
    fail('请提供划线引用的报告内容。');
  }

  if (!ai?.configured) {
    return {
      configured: false,
      title: '',
    };
  }

  const prompt = `你是一名精通产品运营、商业增长与敏捷执行的项目管理专家。
用户在阅读数据分析报告时，划线选中了以下内容，希望将其转化为一项明确的待办事项（Task）。
请根据划线内容，提炼生成一个具体要做什么的待办标题（动宾结构，例如：优化副标题搜索热词、调整首图文案对比等）。
【严格要求】：
- 待办标题必须极简扼要，严格限制在 20 个字以内（绝不能超过 20 个汉字/字符）！

${productName ? `关联产品：${productName}\n` : ''}${reportTitle ? `报告标题：${reportTitle}\n` : ''}划线引用内容：
"""
${rawQuote.slice(0, 1500)}
"""

请必须返回纯 JSON 格式，不要返回任何 Markdown 标记或多余文字：
{
  "title": "20字以内的待办标题"
}`;

  try {
    const response = await aiRequest(
      'generate-task',
      `${ai.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(45000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ai.apiKey}`,
        },
        body: JSON.stringify({
          model: ai.model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: '你是一名只返回标准 JSON 的专业项目管理与产品运营专家。输出的待办标题严格不能超过20字。',
            },
            { role: 'user', content: prompt },
          ],
        }),
      },
      fetcher
    );

    if (!response.ok) {
      const errText = await response.text();
      fail(`AI 服务响应错误 (${response.status}): ${errText.slice(0, 200)}`, response.status || 502);
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content || '{}';
    let parsed = {};
    try {
      parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      // 容错处理
    }

    let title = (parsed.title || '').trim();
    // 强制截断，严格限制在 20 字以内
    if ([...title].length > 20) {
      title = [...title].slice(0, 20).join('');
    }

    return {
      configured: true,
      title,
    };
  } catch (error) {
    if (error.status) throw error;
    fail(error.message || 'AI 生成待办标题失败', 500);
  }
}

