import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from './i18n';

export const listPageSize = 20;

export function ListPagination({
  page,
  total,
  onPage,
  pageSize = listPageSize,
  itemUnit,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
  pageSize?: number;
  itemUnit?: { zh: string; en: string };
}) {
  const { lang, t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (!total) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const countText = itemUnit
    ? (lang === 'en'
        ? `${first}–${last} of ${total} ${itemUnit.en}`
        : `第 ${first}–${last} ${itemUnit.zh}，共 ${total} ${itemUnit.zh}`)
    : t(`第 ${first}–${last} 条，共 ${total} 条`, `${first}–${last} of ${total}`);

  return <nav className="list-pagination" aria-label={t('列表分页', 'List pagination')}>
    <span>{countText}</span>
    {pages > 1 && <div className="list-pagination-buttons">
      <button type="button" className="icon-button" aria-label={t('上一页', 'Previous page')} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16}/></button>
      <span aria-live="polite">{page} / {pages}</span>
      <button type="button" className="icon-button" aria-label={t('下一页', 'Next page')} disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={16}/></button>
    </div>}
  </nav>;
}
