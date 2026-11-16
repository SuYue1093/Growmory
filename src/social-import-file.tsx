import { useState } from 'react';
import { useI18n } from './i18n';

export async function uploadSocialFile(platform: 'xiaohongshu' | 'reddit' | 'x' | 'wechat' | 'juejin', input: object) {
  const response = await fetch(`/api/social-analytics/${platform}-import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || '导入失败，请检查文件');
  return result;
}

export function encodeSocialFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function SocialImportFile({ accept, label, hint, disabled, onFile }: {
  accept: string; label: string; hint: string; disabled: boolean; onFile: (file: File) => void;
}) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  function select(files: FileList | null) {
    if (disabled || !files?.length) return;
    if (files.length !== 1) {
      setError(t('请一次上传一个文件', 'Upload one file at a time'));
      return;
    }
    setError('');
    onFile(files[0]);
  }
  return <>
    <label className={`social-file-input${dragging && !disabled ? ' is-dragging' : ''}`}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; if (!disabled) setDragging(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={e => { e.preventDefault(); setDragging(false); select(e.dataTransfer.files); }}>
      {t('拖入文件，或点击选择', 'Drop a file here or click to browse')}
      <input type="file" accept={accept} aria-label={label} disabled={disabled} onChange={e => { select(e.currentTarget.files); e.currentTarget.value = ''; }}/>
      <small>{hint}</small>
    </label>
    {error && <p role="alert" className="social-feedback error">{error}</p>}
  </>;
}
