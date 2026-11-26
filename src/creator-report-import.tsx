import { useRef, useState } from 'react';
import { encodeSocialFile, SocialImportFile, uploadSocialFile } from './social-import-file';
import { useI18n } from './i18n';

export function CreatorReportImport({ platform, accounts, defaultAccountId, wechatAppIds, revision, onSaved, onBusyChange }: {
  platform: 'wechat' | 'juejin'; accounts: { id: string; name: string }[];
  defaultAccountId?: string; wechatAppIds?: Record<string, string>; revision: number;
  onSaved: (message: string) => Promise<void>; onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useI18n();
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id || '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [syncProgress, setSyncProgress] = useState('');
  const syncing = useRef(false);
  const pause = useRef(false);
  async function run(action: () => Promise<{ inserted: number; updated: number; paused?: boolean }>) {
    setError(''); setBusy(true); onBusyChange(true);
    try {
      const { inserted, updated, paused } = await action();
      await onSaved(paused ? t('已暂停同步，下次会从上次进度继续。', 'Sync paused. The next run will resume.') : t(`处理完成：新增 ${inserted} 条，更新 ${updated} 条`, `Completed: ${inserted} added, ${updated} updated`));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); onBusyChange(false); }
  }

  async function syncAll() {
    const key = `growmory:wechat-sync:${accountId}:${wechatAppIds?.[accountId]}`;
    let cursor = localStorage.getItem(key) || undefined;
    const current = await fetch('/api/social-analytics').then(response => response.json());
    let expectedRevision = current.revision;
    let inserted = 0, updated = 0;
    syncing.current = true; pause.current = false;
    setSyncProgress(t('正在检查可用历史数据…', 'Checking available history…'));
    try {
      do {
        const response = await fetch('/api/social-analytics/wechat-sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, expectedRevision, cursor }),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
        inserted += result.inserted; updated += result.updated;
        expectedRevision = result.revision;
        cursor = result.nextCursor || undefined;
        if (cursor) {
          localStorage.setItem(key, cursor);
          setSyncProgress(t(`已同步到 ${cursor} 之后，正在向前检查…`, `Checked dates after ${cursor}. Continuing…`));
        } else localStorage.removeItem(key);
        if (result.error) throw Error(result.error);
      } while (cursor && !pause.current);
      return { inserted, updated, paused: !!cursor };
    } finally {
      syncing.current = false;
      setSyncProgress('');
    }
  }

  return <section className="social-form">
    {error && <p role="alert" className="social-feedback error">{error}</p>}
    <label className="field"><span>{t('账号', 'Account')}</span><select value={accountId} disabled={busy} onChange={e => setAccountId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <form className="social-form" onSubmit={e => {
      e.preventDefault();
      if (!file || !accountId) return;
      void run(async () => uploadSocialFile(platform, { accountId, expectedRevision: revision, fileName: file.name,
        fileData: await encodeSocialFile(file) }));
    }}>
      <SocialImportFile accept=".xls,.xlsx,.csv" label={t('创作者报表', 'Creator report')} hint={t('支持 XLS、XLSX 或 UTF-8 CSV，最大 8 MB。', 'XLS, XLSX or UTF-8 CSV, up to 8 MB.')} disabled={busy} onFile={value => {
        const valid = /\.(xlsx?|csv)$/i.test(value.name) && value.size > 0 && value.size <= 8 * 1024 * 1024;
        setFile(valid ? value : null); setError(valid ? '' : t('请选择有效的 Excel 或 CSV 文件。', 'Choose a valid Excel or CSV file.'));
      }}/>
      {file && <>
        <p>{file.name}</p>
        <button type="submit" className="button primary" disabled={busy}>{t('确认导入', 'Import report')}</button>
      </>}
    </form>
    {platform === 'wechat' && <details open>
      <summary>{t('使用微信公众号官方 API 同步', 'Sync via WeChat official API')}</summary>
      <div className="social-form">
        {!wechatAppIds?.[accountId] && <p className="fine-print">{t('请先在自媒体账号中配置 AppID 和 AppSecret。', 'Set AppID and AppSecret in Social Accounts first.')}</p>}
        {syncProgress && <p role="status">{syncProgress}</p>}
        <div className="social-heading-actions">
          <button className="button primary" type="button" disabled={busy || !wechatAppIds?.[accountId]} onClick={() => void run(syncAll)}>{t('同步图文数据', 'Sync article data')}</button>
          {syncProgress && <button className="button secondary" type="button" onClick={() => { if (syncing.current) pause.current = true; }}>{t('暂停同步', 'Pause sync')}</button>}
        </div>
      </div>
    </details>}
  </section>;
}
