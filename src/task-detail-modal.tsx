import { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  Pencil,
  CheckCircle2,
  Circle,
  Calendar,
  Quote,
  FileText,
  Save,
  CheckSquare,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { Task, Product } from './types';
import { useI18n } from './i18n';

export interface TaskDetailModalProps {
  task: Task;
  products: Product[];
  onClose: () => void;
  onSaveTask: (task: Task) => Promise<boolean | void> | void;
  onDeleteTask?: (taskId: string) => Promise<boolean | void> | void;
  onNavigateTasks?: () => void;
  onNavigateReport?: (reportId: string, quote?: string) => void;
  initialEditing?: boolean;
}

function ProductIcon({ product, size = 16 }: { product?: Product; size?: number }) {
  if (!product) {
    return (
      <span
        className="app-icon-badge all-products"
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
      >
        <Layers size={Math.round(size * 0.6)} />
      </span>
    );
  }

  if (product.icon) {
    return (
      <img
        className="app-icon-img"
        src={product.icon}
        alt=""
        style={{ width: size, height: size, minWidth: size, minHeight: size, borderRadius: 4 }}
      />
    );
  }

  return (
    <span
      className={`app-icon-badge ${product.color || 'blue'}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size, fontSize: Math.round(size * 0.65) }}
    >
      {product.name?.slice(0, 1) || 'A'}
    </span>
  );
}

export function TaskDetailModal({
  task,
  products,
  onClose,
  onSaveTask,
  onDeleteTask,
  onNavigateTasks: _onNavigateTasks,
  onNavigateReport,
  initialEditing = false,
}: TaskDetailModalProps) {
  const { t } = useI18n();
  const [currentTask, setCurrentTask] = useState<Task>(task);
  const [isEditingTask, setIsEditingTask] = useState(initialEditing);
  const [editedTitle, setEditedTitle] = useState(task.title || '');
  const [editedNote, setEditedNote] = useState(task.note || '');
  const [editedDate, setEditedDate] = useState(task.date || '');
  const [editedProductId, setEditedProductId] = useState(task.productId || '');
  const [isEditingNote, setIsEditingNote] = useState(false);

  useEffect(() => {
    setCurrentTask(task);
    setEditedTitle(task.title || '');
    setEditedNote(task.note || '');
    setEditedDate(task.date || '');
    setEditedProductId(task.productId || '');
    setIsEditingNote(false);
  }, [task]);

  const handleToggleDone = async () => {
    const updated = { ...currentTask, done: !currentTask.done };
    setCurrentTask(updated);
    await onSaveTask(updated);
  };

  const handleDelete = async () => {
    if (confirm(t("确定要删除该待办事项吗？", "Are you sure you want to delete this task?"))) {
      await onDeleteTask?.(currentTask.id);
      onClose();
    }
  };

  const handleSaveFullEdit = async () => {
    if (!editedTitle.trim()) {
      alert(t("请输入待办标题", "Please enter task title"));
      return;
    }
    const updated: Task = {
      ...currentTask,
      title: editedTitle.trim(),
      note: editedNote.trim(),
      date: editedDate,
      productId: editedProductId,
    };
    setCurrentTask(updated);
    setIsEditingTask(false);
    await onSaveTask(updated);
  };

  const handleSaveNote = async () => {
    const updated: Task = {
      ...currentTask,
      note: editedNote.trim(),
    };
    setCurrentTask(updated);
    setIsEditingNote(false);
    await onSaveTask(updated);
  };

  const targetProduct = products.find(p => p.id === currentTask.productId);

  return (
    <div
      className="report-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="report-modal-content view-task-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-task-title"
      >
        <div className="modal-top-bar">
          <div className="task-header-status-wrap">
            <button
              type="button"
              className={`task-status-toggle-btn ${currentTask.done ? 'is-done' : ''}`}
              onClick={handleToggleDone}
              title={currentTask.done ? t("点击标记为未完成", "Click to mark as pending") : t("点击标记为已完成", "Click to mark as completed")}
            >
              {currentTask.done ? (
                <CheckCircle2 size={18} className="status-icon done" />
              ) : (
                <Circle size={18} className="status-icon pending" />
              )}
              <span className="status-label">
                {currentTask.done ? t("已完成", "Completed") : t("待处理", "Pending")}
              </span>
            </button>
          </div>

          <div className="modal-top-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={t("关闭", "Close")}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {isEditingTask ? (
          <div className="task-full-edit-body" style={{ marginTop: 12 }}>
            <div className="modal-section">
              <label className="section-label" htmlFor="edit-task-title-input">
                <CheckSquare size={13} className="label-icon" />
                <span>{t("待办标题", "Task Title")}</span>
                <span className="required-star">*</span>
              </label>
              <input
                id="edit-task-title-input"
                type="text"
                className="input full-width"
                value={editedTitle}
                onChange={e => setEditedTitle(e.target.value)}
                placeholder={t("例如：优化副标题搜索热词", "e.g., Optimize subtitle keywords")}
                autoFocus
              />
            </div>

            {currentTask.quote && (
              <div className="modal-section task-quote-section">
                <div className="quote-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label className="section-label" style={{ margin: 0 }}>
                    <Quote size={13} className="label-icon" />
                    <span>{t("报告引用原文", "Referenced Report Quote")}</span>
                  </label>
                  {currentTask.reportId && onNavigateReport && (
                    <button
                      type="button"
                      className="text-button small-btn quote-navigate-btn"
                      onClick={() => onNavigateReport(currentTask.reportId!, currentTask.quote)}
                      title={t("跳转至数据报告并定位至此段落", "View in report and jump to quote")}
                    >
                      <ExternalLink size={12} />
                      <span>{t("查看报告", "View in Report")}</span>
                    </button>
                  )}
                </div>
                <div className="report-quote-preview-card">
                  <p className="quote-text">{currentTask.quote}</p>
                </div>
              </div>
            )}

            <div className="modal-grid-row">
              <div className="modal-section flex-1">
                <label className="section-label" htmlFor="edit-task-product-select">
                  <Layers size={13} className="label-icon" />
                  <span>{t("关联产品", "Product")}</span>
                </label>
                <select
                  id="edit-task-product-select"
                  className="select full-width"
                  value={editedProductId}
                  onChange={e => setEditedProductId(e.target.value)}
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name.split(/\s[-–—]\s/)[0]}
                    </option>
                  ))}
                  <option value="">{t("全产品通用 / 不限", "All Products / None")}</option>
                </select>
              </div>

              <div className="modal-section flex-1">
                <label className="section-label" htmlFor="edit-task-date-input">
                  <Calendar size={13} className="label-icon" />
                  <span>{t("计划完成日期", "Due Date")}</span>
                </label>
                <input
                  id="edit-task-date-input"
                  type="date"
                  className="input full-width"
                  value={editedDate}
                  onChange={e => setEditedDate(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-section">
              <label className="section-label" htmlFor="edit-task-note-input">
                <FileText size={13} className="label-icon" />
                <span>{t("备注与行动计划", "Notes & Action Plan")}</span>
              </label>
              <textarea
                id="edit-task-note-input"
                className="input full-width"
                rows={3}
                value={editedNote}
                placeholder={t("输入备注说明或补充计划...", "Enter notes...")}
                onChange={e => setEditedNote(e.target.value)}
              />
            </div>

            <div className="modal-bottom-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setIsEditingTask(false)}
              >
                {t("取消", "Cancel")}
              </button>
              <button
                type="button"
                className="button primary"
                onClick={handleSaveFullEdit}
              >
                <Save size={14} />
                <span>{t("保存修改", "Save Changes")}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 待办标题 */}
            <h2 id="view-task-title" className={`view-task-title ${currentTask.done ? 'line-through' : ''}`}>
              {currentTask.title}
            </h2>

            {/* 属性元信息 */}
            <div className="view-task-meta-bar">
              {targetProduct && (
                <span className="task-meta-tag product-tag">
                  <ProductIcon product={targetProduct} size={16} />
                  <span>{targetProduct.name.split(/\s[-–—]\s/)[0]}</span>
                </span>
              )}
              {currentTask.date && (
                <span className="task-meta-tag date-tag">
                  <Calendar size={13} />
                  <span>{t("计划：", "Due: ")}{currentTask.date}</span>
                </span>
              )}
              <span className="task-meta-tag origin-tag">
                <FileText size={13} />
                <span>
                  {currentTask.reportId
                    ? t("源自分析报告", "From Analytics Report")
                    : currentTask.releaseId
                      ? t("版本发布任务", "Release Task")
                      : t("待办事项", "To-do Item")}
                </span>
              </span>
            </div>

            {/* 引用内容 */}
            {currentTask.quote && (
              <div className="modal-section task-quote-section">
                <div className="quote-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label className="section-label" style={{ margin: 0 }}>
                    <Quote size={13} className="label-icon" />
                    <span>{t("报告引用原文", "Referenced Report Quote")}</span>
                  </label>
                  {currentTask.reportId && onNavigateReport && (
                    <button
                      type="button"
                      className="text-button small-btn quote-navigate-btn"
                      onClick={() => onNavigateReport(currentTask.reportId!, currentTask.quote)}
                      title={t("跳转至数据报告并定位至此段落", "View in report and jump to quote")}
                    >
                      <ExternalLink size={12} />
                      <span>{t("查看报告", "View in Report")}</span>
                    </button>
                  )}
                </div>
                <div className="report-quote-preview-card">
                  <p className="quote-text">{currentTask.quote}</p>
                </div>
              </div>
            )}

            {/* 备注区域 */}
            <div className="modal-section task-notes-section">
              <div className="notes-header">
                <label className="section-label">
                  <FileText size={13} className="label-icon" />
                  <span>{t("备注与行动计划", "Notes & Action Plan")}</span>
                </label>
                {!isEditingNote && (
                  <button
                    type="button"
                    className="text-button small-btn"
                    onClick={() => {
                      setEditedNote(currentTask.note || '');
                      setIsEditingNote(true);
                    }}
                  >
                    <Pencil size={12} />
                    <span>{currentTask.note ? t("编辑备注", "Edit Note") : t("添加备注", "Add Note")}</span>
                  </button>
                )}
              </div>

              {isEditingNote ? (
                <div className="notes-edit-box">
                  <textarea
                    className="input full-width"
                    rows={3}
                    value={editedNote}
                    placeholder={t("输入备注说明或补充计划...", "Enter notes...")}
                    onChange={e => setEditedNote(e.target.value)}
                    autoFocus
                  />
                  <div className="notes-edit-actions">
                    <button
                      type="button"
                      className="button secondary button-compact"
                      onClick={() => {
                        setEditedNote(currentTask.note || '');
                        setIsEditingNote(false);
                      }}
                    >
                      {t("取消", "Cancel")}
                    </button>
                    <button
                      type="button"
                      className="button primary button-compact"
                      onClick={handleSaveNote}
                    >
                      <Save size={13} />
                      <span>{t("保存备注", "Save Note")}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="notes-content-box">
                  {currentTask.note ? (
                    <p className="notes-text">{currentTask.note}</p>
                  ) : (
                    <p className="notes-placeholder">{t("暂无备注说明", "No notes recorded")}</p>
                  )}
                </div>
              )}
            </div>

            {/* 底部按钮栏：移动编辑与删除至页面下方，移除前往待办列表与关闭按钮 */}
            <div className="modal-bottom-actions" style={{ justifyContent: 'space-between' }}>
              <div>
                {onDeleteTask && (
                  <button
                    type="button"
                    className="button danger-subtle"
                    onClick={handleDelete}
                  >
                    <Trash2 size={14} />
                    <span>{t("删除待办", "Delete Task")}</span>
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    setEditedTitle(currentTask.title || '');
                    setEditedNote(currentTask.note || '');
                    setEditedDate(currentTask.date || '');
                    setEditedProductId(currentTask.productId || '');
                    setIsEditingTask(true);
                  }}
                >
                  <Pencil size={14} />
                  <span>{t("编辑待办", "Edit Task")}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
