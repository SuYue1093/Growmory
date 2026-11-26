import { useState } from 'react';
import { useI18n } from './i18n.ts';
import { encodeSocialFile, SocialImportFile, uploadSocialFile } from './social-import-file';

type Account = { id: string; name: string; platform: string };
type Row = { row: number; title: string; publishedTime: string; contentType: string; metrics: Record<string, number> };
type Preview = { rows: Row[]; issues: { row: number; message: string }[]; exportedAt: string | null; columns: string[]; warnings: string[] };
const beijingTime = (time: string) => new Date(Date.parse(time) + 8 * 3600000).toISOString().slice(0, 19);
export function XiaohongshuImport({ accounts, defaultAccountId, revision, onSaved, onBusyChange }: { accounts: Account[]; defaultAccountId?: string; revision: number; onSaved: (message: string) => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const { t } = useI18n();
  const available = accounts.filter(a => a.platform === 'xiaohongshu');
  const [accountId, setAccountId] = useState(available.find(a => a.id === defaultAccountId)?.id || available[0]?.id || '');
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [observed, setObserved] = useState(beijingTime(new Date().toISOString()));
  const [period, setPeriod] = useState('lifetime'), [start, setStart] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  function loading(value: boolean) { setBusy(value); onBusyChange(value); }
  async function selectFile(selected?: File) {
    setFile(null); setPreview(null); setError('');
    if (!selected) return;
    if (!/\.xlsx$/i.test(selected.name) || selected.size > 8 * 1024 * 1024) { setError(t('请选择不超过 8 MB 的 .xlsx 文件', 'Please select a .xlsx file under 8 MB')); return; }
    loading(true);
    try {
      const encoded = await encodeSocialFile(selected);
      const result: Preview = await uploadSocialFile('xiaohongshu', { action: 'preview', fileName: selected.name, fileData: encoded });
      setPreview(result); setFile({ name: selected.name, data: encoded });
      setObserved(beijingTime(result.exportedAt || new Date().toISOString()));
    } catch (e) { setError((e as Error).message); }
    finally { loading(false); }
  }
  async function save() {
    if (!file || !preview) return;
    loading(true); setError('');
    try {
      const result = await uploadSocialFile('xiaohongshu', { action: 'save', fileName: file.name, fileData: file.data, accountId, expectedRevision: revision, observedAt: new Date(observed + '+08:00').toISOString(), period, ...(period === 'range' ? { periodStart: start } : {}) });
      await onSaved(t(`导入完成：新增 ${result.inserted} 条，更新 ${result.updated} 条记录`, `Import complete: added ${result.inserted}, updated ${result.updated} records`));
    } catch (e) { setError((e as Error).message); }
    finally { loading(false); }
  }
  return <section className="social-xhs-import social-form">
    <div><h3>{t('导入小红书 Excel', 'Import Xiaohongshu Excel')}</h3><p className="social-dialog-intro">{t('直接上传创作后台导出的「笔记列表明细表」，预览并确认后入库。', 'Upload note export table from creator dashboard to preview and import.')}</p></div>
    {!available.length && <p className="social-feedback">{t('请先关闭窗口，添加一个小红书账号，再导入文件。', 'Please close this dialog and add a Xiaohongshu account before importing.')}</p>}
    {error && <p role="alert" className="social-feedback error">{error}</p>}
    <SocialImportFile accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" label={t('小红书 Excel 文件', 'Xiaohongshu Excel File')} hint={t('支持 .xlsx，最多 1000 条笔记，文件不超过 8 MB。', 'Supports .xlsx, up to 1000 notes, max 8 MB.')} disabled={busy || !available.length} onFile={selectFile}/>
    {file && <p>{file.name}</p>}
    {busy && <p role="status">{t('正在处理文件，请稍候…', 'Processing file, please wait...')}</p>}
    {preview && <>
      <div className="social-fields"><label className="field"><span>{t('导入到账号', 'Import to Account')}</span><select aria-label={t('导入到账号', 'Import to Account')} disabled={busy} value={accountId} onChange={e => setAccountId(e.target.value)}>{available.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="field"><span>{t('数据截止时间（北京时间）', 'Data Cutoff Time (UTC+8)')}</span><input required disabled={busy} type="datetime-local" step="1" aria-label={t('数据截止时间', 'Data Cutoff Time')} value={observed} onChange={e => setObserved(e.target.value)}/></label><label className="field"><span>{t('统计口径', 'Metric Period')}</span><select aria-label={t('导入统计口径', 'Metric Period')} disabled={busy} value={period} onChange={e => setPeriod(e.target.value)}><option value="lifetime">{t('累计数据', 'Lifetime Total')}</option><option value="range">{t('指定区间数据', 'Custom Date Range')}</option></select></label>{period === 'range' && <label className="field"><span>{t('区间开始日期', 'Range Start Date')}</span><input disabled={busy} type="date" required aria-label={t('区间开始日期', 'Range Start Date')} max={observed.slice(0, 10)} value={start} onChange={e => setStart(e.target.value)}/></label>}</div>
      <p className="fine-print">{preview.exportedAt ? t('截止时间默认取文件创建时间，请按导出时后台的实际统计范围核对。', 'Cutoff time defaults to file creation time; verify against your dashboard export range.') : t('文件没有导出时间，默认填入当前时间，请核对。', 'No export timestamp in file; defaults to current time.')} {t('如果导出的是某一时间段的数据，请选择「指定区间数据」。', 'If your export covers a specific period, select "Custom Date Range".')}</p>
      <div className="social-import-summary"><b>{t(`已识别 ${preview.rows.length} 条笔记${preview.issues.length ? `，${preview.issues.length} 行待修正` : ''}`, `Identified ${preview.rows.length} notes${preview.issues.length ? `, ${preview.issues.length} rows need fix` : ''}`)}</b><p>{preview.columns.join('、')}</p></div>
      <div className="social-import-preview"><table><thead><tr><th>{t('笔记 / 首次发布', 'Note / Published')}</th><th>{t('曝光', 'Impressions')}</th><th>{t('观看', 'Views')}</th><th>{t('点赞', 'Likes')}</th><th>{t('评论', 'Comments')}</th><th>{t('收藏', 'Saves')}</th><th>{t('分享', 'Shares')}</th></tr></thead><tbody>{preview.rows.map(r => <tr key={r.row}><td>{r.title}<small>{r.publishedTime.replace('T', ' ').slice(0, 19)} · {r.contentType}</small></td>{['impressions', 'views', 'likes', 'comments', 'saves', 'shares'].map(k => <td key={k}>{r.metrics[k]?.toLocaleString() ?? '—'}</td>)}</tr>)}</tbody></table></div>
      {preview.issues.length > 0 && <div role="alert" className="social-feedback error"><div><b>{t('请修正以下行后重新选择文件，当前未保存任何数据。', 'Please fix the issues below and select the file again. No data has been saved.')}</b><ul>{preview.issues.map(i => <li key={i.row}>{t('第 ', 'Row ')}{i.row}{t(' 行：', ': ')}{i.message}</li>)}</ul></div></div>}
      <ul className="social-import-notes">{preview.warnings.map(note => <li key={note}>{note}</li>)}<li>{t('相同账号重复导入同一文件、同一统计周期会更新原记录，不会重复新增。', 'Re-importing the same file or period will update existing records without duplicates.')}</li></ul>
      <button className="button primary" disabled={busy || !accountId || !observed || !preview.rows.length || !!preview.issues.length || (period === 'range' && !start)} onClick={save}>{t(`确认导入 ${preview.rows.length} 条笔记`, `Confirm Import ${preview.rows.length} Notes`)}</button>
    </>}
  </section>;
}
