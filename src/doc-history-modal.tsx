import { useState, useEffect } from "react";
import {
  X,
  Clock,
  Cpu,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Copy,
  Check,
  FileText,
  ChevronsUpDown,
  History,
  Leaf,
} from "lucide-react";
import type { Doc, DocHistoryItem } from "./types";
import { useI18n } from "./i18n";

function DocHistoryEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Leaf size={28} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  );
}

export type DocHistoryModalProps = {
  doc: Doc;
  lang: string;
  onClose: () => void;
  onRestore: (item: DocHistoryItem) => Promise<boolean | void>;
  notify: (msg: string) => void;
};

export function DocHistoryModal({
  doc,
  lang,
  onClose,
  onRestore,
  notify,
}: DocHistoryModalProps) {
  const { t } = useI18n();
  // 默认折叠全文：expandedIndexes 为空集合
  const [expandedIndexes, setExpandedIndexes] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [restoringIndex, setRestoringIndex] = useState<number | null>(null);

  // 快捷键 ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const toggleExpand = (index: number) => {
    setExpandedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const isAllExpanded =
    doc.history.length > 0 && expandedIndexes.size === doc.history.length;

  const toggleAll = () => {
    if (isAllExpanded) {
      setExpandedIndexes(new Set());
    } else {
      setExpandedIndexes(new Set(doc.history.map((_, i) => i)));
    }
  };

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      notify(t("已复制", "Copied"));
      setTimeout(() => {
        setCopiedIndex((curr) => (curr === index ? null : curr));
      }, 2000);
    } catch {
      notify(t("复制失败", "Failed to copy"));
    }
  };

  const handleRestoreClick = async (item: DocHistoryItem, index: number) => {
    setRestoringIndex(index);
    try {
      const ok = await onRestore(item);
      if (ok !== false) {
        notify(t("已恢复历史版本", "Restored historical revision"));
        onClose();
      }
    } finally {
      setRestoringIndex(null);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      return date.toLocaleString(lang === "en" ? "en-US" : "zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="overlay doc-history-overlay" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("文档历史", "Document History")}
        className="drawer doc-history-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-heading doc-history-header">
          <div className="doc-history-header-main">
            <div className="doc-history-title-row">
              <span className="doc-history-header-icon">
                <History size={20} />
              </span>
              <h2>
                {t("「{title}」的历史版本", "Revision History of \"{title}\"", {
                  title: doc.title,
                })}
              </h2>
              {doc.history.length > 0 && (
                <span className="doc-history-count-badge">
                  {t("共 {count} 个历史版本", "{count} revisions", {
                    count: doc.history.length,
                  })}
                </span>
              )}
            </div>
            <p className="doc-history-header-desc">
              {t(
                "查看文档演进历史，默认折叠全文；可按需展开对比，支持一键恢复历史版本。",
                "Browse document revision history with collapsed full texts by default. Expand as needed and restore any revision with one click."
              )}
            </p>
          </div>
          <div className="doc-history-header-actions">
            {doc.history.length > 0 && (
              <button
                type="button"
                className="button secondary small doc-history-toggle-all-btn"
                onClick={toggleAll}
                title={isAllExpanded ? t("全部折叠", "Collapse All") : t("全部展开", "Expand All")}
              >
                <ChevronsUpDown size={14} />
                <span>{isAllExpanded ? t("全部折叠", "Collapse All") : t("全部展开", "Expand All")}</span>
              </button>
            )}
            <button
              className="icon-button"
              aria-label={t("关闭历史", "Close history")}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="doc-history-body">
          {doc.history.length === 0 ? (
            <div className="doc-history-empty-wrap">
              <DocHistoryEmpty
                title={t("还没有历史修改", "No revisions yet")}
                description={t(
                  "每次保存文档修改，都会在这里留下记录。",
                  "Every time you save doc edits, revisions will be recorded here."
                )}
              />
            </div>
          ) : (
            <div className="doc-history-timeline">
              {doc.history.map((h, i) => {
                const isExpanded = expandedIndexes.has(i);
                // 文档版本号：若有 h.version 优先使用，否则智能降级计算 v1.x
                const versionNumber =
                  h.version && h.version.trim()
                    ? h.version.trim()
                    : `v1.${doc.history.length - i}`;
                // 文档版本标题
                const versionTitle = h.title?.trim() || doc.title;
                // 文档版本概述
                const versionSummary = h.summary?.trim();
                const displayTime = formatTime(h.at);

                return (
                  <article key={i} className={`doc-history-card ${isExpanded ? "expanded" : ""}`}>
                    {/* 卡片顶部元信息条 */}
                    <div className="doc-history-card-header">
                      <div className="doc-history-card-meta-left">
                        {/* 文档版本号 */}
                        <span className="doc-history-version-badge" title={t("文档版本号", "Version Number")}>
                          {versionNumber}
                        </span>

                        {/* 修改时间 */}
                        <span className="doc-history-time-badge" title={h.at}>
                          <Clock size={12} />
                          <time dateTime={h.at}>{displayTime}</time>
                        </span>

                        {/* 修改来源 */}
                        {h.source && (
                          <span className="doc-history-source-badge" title={h.source}>
                            <Cpu size={11} />
                            <span>{h.source}</span>
                          </span>
                        )}
                      </div>

                      <div className="doc-history-card-actions">
                        {/* 展开/收起全文切换按钮 */}
                        <button
                          type="button"
                          className="button secondary small doc-history-expand-btn"
                          onClick={() => toggleExpand(i)}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          <span>{isExpanded ? t("收起全文", "Collapse Full Text") : t("展开全文", "Expand Full Text")}</span>
                        </button>

                        {/* 恢复版本按钮 */}
                        <button
                          type="button"
                          className="button primary small doc-history-restore-btn"
                          disabled={restoringIndex === i}
                          onClick={() => handleRestoreClick(h, i)}
                          title={t("恢复此版本", "Restore Revision")}
                        >
                          <RotateCcw size={13} />
                          <span>{restoringIndex === i ? t("恢复中…", "Restoring...") : t("恢复此版本", "Restore Revision")}</span>
                        </button>
                      </div>
                    </div>

                    {/* 文档版本标题 */}
                    <div className="doc-history-title-area">
                      <span className="doc-history-field-label">{t("文档版本标题", "Version Title")}</span>
                      <h3 className="doc-history-version-title">{versionTitle}</h3>
                    </div>

                    {/* 文档版本概述 */}
                    <div className="doc-history-summary-area">
                      <div className="doc-history-summary-header">
                        <FileText size={13} />
                        <span className="doc-history-field-label">{t("文档版本概述", "Version Summary")}</span>
                      </div>
                      <div className={`doc-history-summary-box ${!versionSummary ? "empty-summary" : ""}`}>
                        {versionSummary ? (
                          <p className="doc-history-summary-text">{versionSummary}</p>
                        ) : (
                          <p className="doc-history-summary-placeholder">
                            {t("暂无版本概述", "No version summary recorded")}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 折叠的正文区域（默认折叠） */}
                    {isExpanded && (
                      <div className="doc-history-content-collapsible">
                        <div className="doc-history-content-bar">
                          <span className="doc-history-content-info">
                            {t("正文字数：{count} 字符", "{count} characters", {
                              count: h.body.length,
                            })}
                          </span>
                          <button
                            type="button"
                            className="text-button small doc-history-copy-btn"
                            onClick={() => handleCopy(h.body, i)}
                            title={t("复制全文", "Copy Full Text")}
                          >
                            {copiedIndex === i ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copiedIndex === i ? t("已复制", "Copied") : t("复制正文", "Copy Body")}</span>
                          </button>
                        </div>
                        <div className="doc-history-pre-wrapper">
                          <pre className="doc-history-pre">{h.body}</pre>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
