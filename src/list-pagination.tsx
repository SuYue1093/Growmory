import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from './i18n';

export const listPageSize = 20;

export function ListPagination({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / listPageSize));
  if (!total) return null;
  const first = (page - 1) * listPageSize + 1;
  const last = Math.min(total, page * listPageSize);
  return <nav className="list-pagination" aria-label={t('列表分页', 'List pagination')}>
    <span>{t(`第 ${first}–${last} 条，共 ${total} 条`, `${first}–${last} of ${total}`)}</span>
    {pages > 1 && <div className="list-pagination-buttons">
      <button type="button" className="icon-button" aria-label={t('上一页', 'Previous page')} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16}/></button>
      <span aria-live="polite">{page} / {pages}</span>
      <button type="button" className="icon-button" aria-label={t('下一页', 'Next page')} disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={16}/></button>
    </div>}
  </nav>;
}
