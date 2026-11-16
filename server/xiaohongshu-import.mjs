import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { saveSocial } from './social-analytics.mjs';
const columns = { '曝光': 'impressions', '观看量': 'views', '封面点击率': 'coverClickRate', '点赞': 'likes', '评论': 'comments', '收藏': 'saves', '涨粉': 'gainedFollowers', '分享': 'shares', '人均观看时长': 'avgViewDuration', '弹幕': 'danmaku' };
const digest = value => createHash('sha256').update(value).digest('hex');
function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('formula' in value || 'sharedFormula' in value) throw Error('包含公式，请使用平台直接导出的原始文件');
    if ('richText' in value) return value.richText.map(t => t.text).join('');
    if ('text' in value) return value.text;
    throw Error('单元格格式不支持');
  }
  return value;
}
function publishedTime(value) {
  // Excel date cells are wall-clock dates; the export uses Beijing time.
  const raw = value instanceof Date ? value.toISOString().slice(0, 19) : String(value || '').trim();
  const match = raw.match(/^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?[ T]?(\d{1,2})[时:](\d{1,2})[分:](\d{1,2})秒?$/) || raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) throw Error('首次发布时间格式无法识别');
  const [, y, m, d, h, min, sec] = match;
  const local = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min.padStart(2, '0')}:${sec.padStart(2, '0')}`;
  const time = new Date(local + 'Z');
  if (Number.isNaN(+time) || time.toISOString().slice(0, 19) !== local) throw Error('首次发布时间无效');
  return local + '+08:00';
}
function metric(value, label) {
  if (value === null || value === undefined || String(value).trim() === '' || ['—', '--', '-'].includes(String(value).trim())) return undefined;
  const raw = String(value).replace(/,/g, '').trim();
  const percent = raw.endsWith('%');
  const number = Number(percent ? raw.slice(0, -1) : raw);
  const n = percent ? number / 100 : number;
  if (!Number.isFinite(n) || n < 0 || (label === '封面点击率' ? n > 1 : label !== '人均观看时长' && !Number.isSafeInteger(n)) || (percent && label !== '封面点击率')) throw Error(`${label}不是有效${label === '封面点击率' ? '比例' : '数值'}`);
  return n;
}
export async function parseXiaohongshu(buffer) {
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw Error('请选择不超过 8 MB 的小红书 .xlsx 文件');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { throw Error('无法读取 Excel，请使用小红书直接导出的 .xlsx 文件'); }
  const candidates = [];
  for (const sheet of workbook.worksheets) {
    for (let row = 1; row <= Math.min(sheet.rowCount, 10); row++) {
      const headers = new Map(), duplicates = new Set();
      sheet.getRow(row).eachCell((cell, col) => { const label = String(cellValue(cell) || '').replace(/[\s\uFEFF]/g, ''); if (headers.has(label)) duplicates.add(label); headers.set(label, col); });
      if (headers.has('笔记标题') && headers.has('首次发布时间')) { if (duplicates.size) throw Error('表头列名重复'); candidates.push({ sheet, row, headers }); break; }
    }
  }
  if (candidates.length !== 1) throw Error(candidates.length ? '发现多张笔记明细表，请每次导入一张表' : '未找到小红书表头：需要“笔记标题”和“首次发布时间”');
  const { sheet, row: headerRow, headers } = candidates[0];
  const found = Object.keys(columns).filter(k => headers.has(k));
  if (!found.length) throw Error('没有找到支持的小红书指标列');
  if (sheet.rowCount > 1100) throw Error('一次最多导入 1000 条笔记，请使用未增加空行的原始文件');
  const rows = [], issues = [], identities = new Set();
  for (let n = headerRow + 1; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    if (!row.hasValues) continue;
    try {
      const title = String(cellValue(row.getCell(headers.get('笔记标题'))) || '').trim();
      if (title.length > 500) throw Error('笔记标题过长');
      const time = publishedTime(cellValue(row.getCell(headers.get('首次发布时间'))));
      const metrics = {};
      for (const label of found) { const value = metric(cellValue(row.getCell(headers.get(label))), label); if (value !== undefined) metrics[columns[label]] = value; }
      if (!Object.keys(metrics).length) throw Error('没有可导入的指标');
      const externalId = 'xhs-report:' + digest(JSON.stringify([title, time]));
      if (identities.has(externalId)) throw Error('标题与首次发布时间重复，无法确定是否为同一笔记');
      identities.add(externalId);
      rows.push({ row: n, title: title || '无标题笔记', titleMissing: !title, publishedTime: time, publishedAt: time.slice(0, 10), contentType: headers.has('体裁') ? String(cellValue(row.getCell(headers.get('体裁'))) || '') : '', externalId, metrics });
    } catch (e) { issues.push({ row: n, message: e.message }); }
    if (rows.length + issues.length > 1000) throw Error('一次最多导入 1000 条笔记');
  }
  if (!rows.length && !issues.length) throw Error('表中没有笔记数据');
  const untitled = rows.filter(r => r.titleMissing).length;
  const exportedAt = workbook.created instanceof Date && !Number.isNaN(+workbook.created) ? workbook.created.toISOString() : null;
  return { rows, issues, exportedAt, fileHash: digest(buffer), columns: found, sheetName: sheet.name, headerRow, warnings: [...(untitled ? [`${untitled} 条笔记没有标题，显示为“无标题笔记”，使用原始发布时间区分。`] : []), '此导出按标题与完整首次发布时间识别记录；同标题唯一候选会自动关联，多个候选可在数据行内确认。', ...(!headers.has('体裁') ? ['文件没有体裁列。'] : [])] };
}
const inputSchema = z.object({ action: z.enum(['preview', 'save']), fileName: z.string().min(1).max(200).regex(/\.xlsx$/i), fileData: z.string().min(1).max(12 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/), accountId: z.string().optional(), expectedRevision: z.number().int().nonnegative().optional(), observedAt: z.string().datetime({ offset: true }).optional(), period: z.enum(['lifetime', 'range']).optional(), periodStart: z.string().optional() }).strict();
export async function importXiaohongshu(store, input) {
  const args = inputSchema.parse(input);
  const parsed = await parseXiaohongshu(Buffer.from(args.fileData, 'base64'));
  if (args.action === 'preview') return parsed;
  if (parsed.issues.length) throw Error(`文件中有 ${parsed.issues.length} 行需要修正，请检查预览`);
  if (!args.observedAt || !args.period || args.expectedRevision === undefined) throw Error('请确认数据截止时间与统计口径');
  const account = store.read().data.socialAnalytics?.accounts.find(a => a.id === args.accountId);
  if (account?.platform !== 'xiaohongshu') throw Error('请选择一个小红书账号');
  const periodEnd = new Date(Date.parse(args.observedAt) + 8 * 3600000).toISOString().slice(0, 10);
  if (parsed.rows.some(r => Date.parse(r.publishedTime) > Date.parse(args.observedAt))) throw Error('数据截止时间早于笔记发布时间，请核对');
  return saveSocial(store, { expectedRevision: args.expectedRevision, snapshots: parsed.rows.map(({ row, titleMissing, ...record }) => ({ ...record, accountId: account.id, kind: 'content', observedAt: args.observedAt, period: args.period, ...(args.period === 'range' ? { periodStart: args.periodStart } : {}), periodEnd, source: 'report', sourceNote: `小红书导出：${args.fileName}；原表第 ${row} 行${titleMissing ? '；原表标题为空' : ''}；观看时长保留原表数值；按标题与首次发布时间识别，无笔记链接`, reportFileHash: parsed.fileHash })) });
}
