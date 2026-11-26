import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { read as readWorkbook, utils as workbookUtils } from '@e965/xlsx';
import { parseString } from 'fast-csv';
import { z } from 'zod';
import { saveSocial } from './social-analytics.mjs';

const platformSchema = z.enum(['wechat', 'juejin']);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().startsWith(s));
const accountIdSchema = z.string().min(1).max(500);
const columns = {
  impressions: ['曝光', '曝光量', '曝光次数', '展现量', '展现次数'],
  views: ['浏览', '浏览量', '浏览次数', '阅读量', '阅读次数', '图文页阅读次数'],
  likes: ['点赞', '点赞量', '点赞数', '点赞次数'],
  comments: ['评论', '评论量', '评论数', '评论次数'],
  saves: ['收藏', '收藏量', '收藏数', '收藏次数'],
  shares: ['分享', '分享量', '分享数', '分享次数'],
};
const labels = Object.values(columns).map(([label]) => label);
const digest = value => createHash('sha256').update(value).digest('hex');
const chinaDay = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

function requireAccount(store, platform, accountId) {
  const account = store.read().data.socialAnalytics?.accounts.find(a => a.id === accountId && a.platform === platform);
  if (!account) throw Error('请选择对应平台的自媒体账号');
}

async function readTable(buffer, fileName) {
  if (/\.csv$/i.test(fileName)) {
    const csv = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return new Promise((resolve, reject) => {
      const rows = [];
      parseString(csv, { ignoreEmpty: true }).on('error', reject)
        .on('data', row => rows.push(row)).on('end', () => resolve(rows));
    });
  }
  if (/\.xls$/i.test(fileName)) {
    if (buffer.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1') throw Error('不是有效的旧版 Excel 文件');
    const book = readWorkbook(buffer, { type: 'buffer', sheets: 0, cellDates: true, sheetRows: 2002 });
    return workbookUtils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' });
  }
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.worksheets[0];
  const rows = [];
  sheet?.eachRow(row => rows.push(row.values.slice(1)));
  return rows;
}

const cell = value => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === 'object') {
    if ('hyperlink' in value) return String(value.hyperlink);
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('');
    throw Error('包含不支持的单元格，请导出原始值');
  }
  return String(value ?? '').trim();
};

function reportDay(value) {
  const input = cell(value);
  const compact = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  const separated = input.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|\s|T|$)/);
  const parts = compact || separated;
  return day.parse(parts ? [parts[1], ...parts.slice(2).map(part => part.padStart(2, '0'))].join('-') : input);
}

function count(value, label) {
  const input = cell(value);
  if (!input || /^[-—]+$/.test(input)) return undefined;
  const digits = input.replaceAll(',', '');
  if (!/^\d+$/.test(digits) || !Number.isSafeInteger(Number(digits))) throw Error(`${label}不是有效整数`);
  return Number(digits);
}

function nativeReport(table, platform, common) {
  if (table.some(row => row.map(cell).includes('首次发布时间') && row.map(cell).includes('笔记标题'))) {
    throw Error('这是小红书笔记列表明细表，请切换到小红书导入');
  }
  const header = table.findIndex(row => cell(row[0]) === '日期' &&
    (platform === 'wechat' ? cell(row[1]) === '渠道' && cell(row[2]) === '阅读人数' && cell(row[4]) === '日期' && cell(row[5]) === '分享人数'
      : row.map(cell).includes('文章展现数') && row.map(cell).includes('文章阅读数')));
  if (header < 0) return null;
  const headings = table[header].map(cell);
  const rows = table.slice(header + 1);
  const period = (start, end = start) => ({ period: 'range', periodStart: start, periodEnd: end });
  if (platform === 'wechat') {
    if (['传播渠道', '发表日期', '内容标题', '阅读人数'].some((label, i) => label !== headings[10 + i])) throw Error('公众号报表缺少文章来源明细');
    const range = cell(table[header - 1]?.[10]).match(/(\d{4}[.-]\d{2}[.-]\d{2})\s*[-~至]\s*(\d{4}[.-]\d{2}[.-]\d{2})/);
    if (!range) throw Error('公众号文章来源明细缺少统计日期范围');
    const interval = period(reportDay(range[1]), reportDay(range[2]));
    const seen = new Set();
    return rows.flatMap(row => {
      if (cell(row[10]) !== '全部' || !cell(row[12])) return [];
      const title = cell(row[12]);
      const publishedAt = reportDay(row[11]);
      const readUsers = count(row[13], '文章阅读人数');
      if (readUsers === undefined) return [];
      const externalId = `wechat-report:${digest(JSON.stringify([title.normalize('NFKC').trim(), publishedAt]))}`;
      if (seen.has(externalId)) throw Error('存在同日同标题的文章来源明细，无法安全归集');
      seen.add(externalId);
      return [{ ...common, ...interval, kind: 'content', title, publishedAt, externalId, metrics: { readUsers } }];
    });
  }

  const daily = new Map();
  const trendColumns = { impressions: '文章展现数', views: '文章阅读数', likes: '文章点赞数', comments: '文章评论数', saves: '文章收藏数' };
  for (const row of rows) {
    if (!cell(row[0])) continue;
    const date = reportDay(row[0]);
    const metrics = daily.get(date) || {};
    for (const [key, label] of Object.entries(trendColumns)) {
      const value = count(row[headings.indexOf(label)], label);
      if (value === undefined) continue;
      if (metrics[key] !== undefined && metrics[key] !== value) throw Error(`${date} 出现冲突的账号趋势数据`);
      metrics[key] = value;
    }
    if (Object.keys(metrics).length) daily.set(date, metrics);
  }
  return [...daily].sort(([a], [b]) => b.localeCompare(a)).map(([date, metrics]) => ({
    ...common, ...period(date), kind: 'account', externalId: 'juejin-trend', title: `账号趋势 ${date}`, metrics,
  }));

}

export async function importCreatorReport(store, platform, input) {
  platformSchema.parse(platform);
  const args = z.object({
    accountId: accountIdSchema, expectedRevision: z.number().int().nonnegative(),
    fileName: z.string().min(1).max(160).regex(/\.(xlsx?|csv)$/i),
    fileData: z.string().min(1).max(12 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/),
    period: z.enum(['range', 'lifetime']).optional(), periodStart: day.optional(), periodEnd: day.optional(),
  }).strict().parse(input);
  requireAccount(store, platform, args.accountId);
  const buffer = Buffer.from(args.fileData, 'base64');
  if (buffer.length > 8 * 1024 * 1024) throw Error('文件不可超过 8 MB');
  const table = await readTable(buffer, args.fileName);
  const common = { accountId: args.accountId, observedAt: new Date().toISOString(), source: 'report',
    sourceNote: `上传报表：${args.fileName}`, reportFileHash: digest(buffer) };
  const native = nativeReport(table, platform, common);
  if (native) {
    if (!native.length || native.length > 1000) throw Error('报表须包含 1 至 1000 条可导入记录');
    return saveSocial(store, { expectedRevision: args.expectedRevision, snapshots: native });
  }
  const titleLabels = ['标题', '文章标题', '图文标题', '内容标题'];
  const headerIndex = table.findIndex(row => row.some(v => titleLabels.includes(cell(v))) &&
    row.some(v => Object.values(columns).flat().includes(cell(v))));
  if (headerIndex < 0) throw Error('找不到可识别的趋势表或文章指标，请确认导出平台和报表类型');
  const header = table[headerIndex].map(cell);
  const rowValues = table.slice(headerIndex + 1).filter(row => row.some(v => cell(v) !== ''));
  if (!rowValues.length || rowValues.length > 1000) throw Error('报表须包含 1 至 1000 行数据');
  const seen = new Set();
  const snapshots = rowValues.map((row, i) => {
    const pick = names => {
      const index = names.map(name => header.indexOf(name)).find(index => index >= 0);
      return index === undefined ? '' : cell(row[index]);
    };
    const title = pick(titleLabels);
    const url = pick(['文章链接', '图文链接', '内容链接', '链接', 'URL']);
    const published = pick(['发布日期', '发布时间', '发表时间', '发文时间', '群发日期']);
    const publishedAt = published ? reportDay(published) : undefined;
    const metrics = Object.fromEntries(Object.entries(columns).flatMap(([key, aliases]) => {
      const value = count(pick(aliases), `第 ${i + 1} 条数据的${aliases[0]}`);
      return value === undefined ? [] : [[key, value]];
    }));
    if (!title || !Object.keys(metrics).length || (!url && !publishedAt)) throw Error(`第 ${i + 1} 条数据须包含标题、至少一个指标，以及文章链接或发布日期`);
    const externalId = `${platform}-report:${digest(JSON.stringify([title.normalize('NFKC').trim(), publishedAt]))}`;
    const periodStart = pick(['统计开始']) || args.periodStart;
    const periodEnd = pick(['统计截止']) || args.periodEnd;
    const period = pick(['统计口径']) || args.period || (periodStart ? 'range' : undefined);
    if (!period || !periodEnd || (period === 'range' && !periodStart)) throw Error('通用文章表缺少统计口径或日期，请在文件中添加「统计口径」「统计开始」「统计截止」列');

    const key = JSON.stringify([url || externalId, period, periodStart, periodEnd]);
    if (seen.has(key)) throw Error(`第 ${i + 1} 条数据重复；同日同标题文章请提供各自链接`);
    seen.add(key);
    return { ...common, kind: 'content', title, externalId, ...(url ? { url } : {}),
      ...(publishedAt ? { publishedAt } : {}), period, ...(period === 'range' ? { periodStart } : {}), periodEnd, metrics };
  });
  return saveSocial(store, { expectedRevision: args.expectedRevision, snapshots });
}

export async function exportCreatorReport(store, platform, accountId, template = false) {
  platformSchema.parse(platform);
  if (!template) requireAccount(store, platform, accountId);
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('内容数据');
  sheet.addRow(['标题', '文章链接', '发布日期', '统计口径', '统计开始', '统计截止', ...labels]);
  if (!template) {
    const snapshots = store.read().data.socialAnalytics?.snapshots || [];
    // Export one latest observation per article and period so the file can be re-imported.
    const seen = new Set();
    for (const row of [...snapshots].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))) {
      if (row.accountId !== accountId || row.kind !== 'content') continue;
      const key = JSON.stringify([row.url || row.externalId, row.period, row.periodStart, row.periodEnd]);
      if (seen.has(key) || !Object.keys(columns).some(metric => row.metrics[metric] != null)) continue;
      seen.add(key);
      sheet.addRow([row.title, row.url, row.publishedAt, row.period, row.periodStart, row.periodEnd,
        ...Object.keys(columns).map(metric => row.metrics[metric])]);
    }
  }
  return book.xlsx.writeBuffer();
}

const firstWechatDay = '2014-12-01';
const previousDay = value => new Date(Date.parse(value) - 86400000).toISOString().slice(0, 10);

export async function syncWechatReport(store, input, fetcher = fetch) {
  const args = z.object({
    accountId: accountIdSchema, expectedRevision: z.number().int().nonnegative(),
    appId: z.string().trim().regex(/^wx[a-zA-Z0-9]{16}$/), secret: z.string().trim().min(1).max(128),
    publishedDay: day.optional(), cursor: day.optional(),
  }).strict().parse(input);
  requireAccount(store, 'wechat', args.accountId);
  if (store.read().revision !== args.expectedRevision) throw Error('工作区已更新，请重新读取');
  let cursor = args.publishedDay || args.cursor || previousDay(chinaDay());
  if (cursor >= chinaDay() || cursor < firstWechatDay) throw Error('超出微信公众号可查询的日期范围');
  async function call(path, payload) {
    let result;
    try {
      const response = await fetcher(`https://api.weixin.qq.com/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      if (!response.ok) throw Error();
      result = await response.json();
    } catch { throw Error('微信公众号官方接口连接失败，请稍后重试'); }
    if (Number(result.errcode) === 40164) {
      const ip = /invalid ip\s+([\da-f:.]+)(?=\s|$)/i.exec(result.errmsg || '')?.[1];
      throw Error(isIP(ip || '') ? `微信公众号 IP 白名单拒绝（40164）。请添加微信识别的出口 IP：${ip}` : '微信公众号 IP 白名单拒绝（40164）。请核对运行 Growmory 的公网出口 IP');
    }
    if (Number(result.errcode) === 48001) throw Error('微信公众号图文统计接口未授权（48001）。请在微信开发者平台核对该公众号的图文统计权限，或上传后台导出的报表');
    if (Number(result.errcode) === 45009) throw Error('微信公众号接口已达到调用额度，请在额度恢复后继续同步');
    if (result.errcode) throw Error(`微信公众号接口返回错误 ${Number(result.errcode) || '未知'}，请检查凭据、接口权限和 IP 白名单`);
    return result;
  }
  const token = await call('cgi-bin/stable_token', { grant_type: 'client_credential', appid: args.appId, secret: args.secret });
  if (!token.access_token) throw Error('微信公众号未返回访问令牌');
  async function fetchDay(publishedDay) {
    const report = await call(`datacube/getarticletotal?access_token=${encodeURIComponent(token.access_token)}`, {
      begin_date: publishedDay, end_date: publishedDay,
    });
    if (!Array.isArray(report.list)) throw Error('微信公众号返回了无法识别的统计结果');
    return report.list.flatMap(article => {
      const detail = (Array.isArray(article.details) ? [...article.details] : []).filter(d => day.safeParse(d.stat_date).success && d.stat_date >= publishedDay)
        .sort((a, b) => b.stat_date.localeCompare(a.stat_date))[0];
      if (!detail || !article.msgid || !article.title) return [];
      const metrics = Object.fromEntries(Object.entries({ views: detail.int_page_read_count, readUsers: detail.int_page_read_user, shares: detail.share_count, saves: detail.add_to_fav_count })
        .filter(([, value]) => Number.isSafeInteger(value) && value >= 0));
      if (!Object.keys(metrics).length) return [];
      return [{ accountId: args.accountId, kind: 'content', title: article.title, externalId: `wechat-api:${article.msgid}`,
        publishedAt: publishedDay, observedAt: new Date().toISOString(), period: 'range',
        periodStart: publishedDay, periodEnd: detail.stat_date, source: 'api', sourceNote: '微信公众号官方接口：图文群发总数据', metrics }];
    });
  }
  const snapshots = [];
  let failure;
  let checkedDays = 0;
  for (; checkedDays < (args.publishedDay ? 1 : 14) && cursor >= firstWechatDay; checkedDays++, cursor = previousDay(cursor)) {
    try {
      const rows = await fetchDay(cursor);
      if (snapshots.length + rows.length > 1000) {
        if (!checkedDays) throw Error('单日数据超过可保存条数');
        break;
      }
      snapshots.push(...rows);
    } catch (error) {
      if (args.publishedDay || !checkedDays) throw error;
      failure = error.message;
      break;
    }
  }
  const saved = snapshots.length ? saveSocial(store, { expectedRevision: args.expectedRevision, snapshots })
    : { inserted: 0, updated: 0, revision: store.read().revision };
  return { ...saved, checkedDays, nextCursor: !args.publishedDay && cursor >= firstWechatDay ? cursor : null, ...(failure ? { error: failure } : {}) };
}
