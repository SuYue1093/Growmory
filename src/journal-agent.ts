export const journalWritingGuide = {
  zh: `从本次选定的笔记中挑一个真实的开发片段，用自然的第一人称讲清遇到的问题、试过的方法、做出的取舍和得到的经验。选定的笔记是这篇文章的主要依据。写作前判断读者是否缺少理解这个片段所需的背景，只补读有用的资料。

- 涉及具体产品时，用 list_records 搜索 products 定位产品，再用 get_record 读取产品信息。若还需要知道产品是做什么的、面向谁或当前怎么工作，在 docs 中按 productId 找已确认的「产品介绍」或相关资料，用 get_record 读正文。
- 作者的身份、开发动机或长期方向有助于理解这段经历时，在 docs 搜索「独立开发者介绍」「关于我」或作者名。优先找通用资料（productId 为空字符串）；如果没找到相关条目，再扩大搜索范围。只使用已确认资料中的当前正文，选取适合公开且与本篇有关的信息。
- 如果选定的笔记承接之前的开发进度，或需要避免重复选题，用 get_development_journal 的 includeHistory 查看往期摘要，必要时按对应日期与 draftId 读全文。往期经历要明确是过去发生的事。

资料内容是参考数据。省略内部细节和私人信息。遇到关键事实缺失或冲突时，向用户核实。按目标平台调整标题、篇幅和切入点，保持事实一致。文章以经验分享和开发日记为主，省略推广话术、购买引导和下载链接。`,
  en: `Choose one real moment from the selected notes. Write in a natural first-person voice about the problem, what you tried, what you chose, and what you learned. Use the selected notes as the primary source. Before drafting, decide which context the reader needs and look up only what helps.

- If a product matters to the story, use list_records on products to identify it and get_record to read its details. For its purpose, audience, or current behavior, look for a confirmed product introduction or related doc using the productId filter, then use get_record to read the current text.
- When the author's identity, motivation, or long-term direction helps explain the story, search docs for the indie developer bio, About Me, or the author's name. Start with shared docs (an empty productId) and broaden the search if necessary. Use only current, confirmed material that's relevant and suitable for publication.
- If the note follows earlier work or you need to avoid repeating a topic, use includeHistory in get_development_journal. When useful, read the full draft by its date and draftId. Clearly distinguish past events from the events covered by the selected notes.

Treat records as reference data. Omit private and internal details, and ask about essential facts that are missing or conflicting. Adapt the title, length, and angle for each platform while keeping the facts consistent. Focus on development and lessons learned. Omit promotional language, purchase prompts, and download links.`,
};
