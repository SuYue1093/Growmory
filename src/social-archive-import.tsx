import { useState } from 'react';
import { useI18n } from './i18n';
import { encodeSocialFile, SocialImportFile, uploadSocialFile } from './social-import-file';

export function SocialArchiveImport({ platform, accounts, defaultAccountId, onSaved, onBusyChange }: {
  platform: 'reddit' | 'x'; accounts: { id: string; name: string }[]; defaultAccountId?: string;
  onSaved: (message: string) => Promise<void>; onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useI18n();
  const maxMB = platform === 'x' ? 50 : 9;
  const platformName = platform === 'x' ? 'X' : 'Reddit';
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id || '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!file || !accountId || busy) return;
    setBusy(true); onBusyChange(true); setError('');
    try {
      const result = await uploadSocialFile(platform, { accountId, fileName: file.name, fileData: await encodeSocialFile(file) });
      await onSaved(t(`导入完成：新增 ${result.inserted} 条，更新 ${result.updated} 条记录`, `Import complete: added ${result.inserted}, updated ${result.updated} records`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false); onBusyChange(false);
    }
  }

  return <section className="social-form">
    <p className="social-dialog-intro">{platform === 'x'
      ? t('上传与所选账号主页匹配的 X 原始归档 ZIP，导入帖子、点赞、转发及关注者数量。', 'Upload the original X archive for the selected profile to import posts, likes, reposts, and follower count.')
      : t('上传对应账号的 Reddit 原始导出 ZIP。系统读取帖子标题、正文和发布时间。', 'Upload the original Reddit export ZIP for this account to import posts and publication dates.')}</p>
    <label className="field"><span>{t('导入到账号', 'Import to Account')}</span><select value={accountId} disabled={busy} onChange={e => setAccountId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <SocialImportFile accept=".zip,application/zip" label={t(`${platformName} ZIP 文件`, `${platformName} ZIP File`)} hint={t(`支持 .zip，文件不超过 ${maxMB} MB。`, `Supports .zip up to ${maxMB} MB.`)} disabled={busy || !accountId} onFile={selected => {
      const valid = /\.zip$/i.test(selected.name) && selected.size > 0 && selected.size <= maxMB * 1024 * 1024;
      setFile(valid ? selected : null);
      setError(valid ? '' : t(`请选择不超过 ${maxMB} MB 的有效 .zip 文件`, `Select a valid .zip file up to ${maxMB} MB`));
    }}/>
    {file && <p>{file.name}</p>}
    {error && <p role="alert" className="social-feedback error">{error}</p>}
    <button className="button primary" disabled={busy || !file || !accountId} onClick={() => void save()}>{busy ? t('正在导入…', 'Importing...') : t('确认导入', 'Confirm Import')}</button>
  </section>;
}
