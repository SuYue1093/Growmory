import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Eye, ImagePlus, Search, X } from "lucide-react";
import { formatBytes } from "./asset-library";
import { useI18n } from "./i18n";
import { isForeignChannel } from "./marketing-agent";
import { buildAssetFileUrl, resolveImageSrc } from "./marketing-rich-copy";
import { getAssetLanguageLabel, type Asset, type AssetFolder, type Product, type Release } from "./types";
import { compareVersionsDesc, assetMatchesLanguage } from "./asset-picker-utils";

export { compareVersionsDesc, assetMatchesLanguage };

export function isImageAssetRecord(asset: Asset): boolean {
  return Boolean(asset.fileType?.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(asset.name || asset.fileName));
}

function buildFolderPath(folderId: string, folderMap: Map<string, AssetFolder>): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let curr = folderMap.get(folderId);
  while (curr && !seen.has(curr.id)) {
    seen.add(curr.id);
    parts.unshift(curr.name);
    curr = curr.parentId ? folderMap.get(curr.parentId) : undefined;
  }
  return parts.join(" / ");
}

function collectSubtreeFolderIds(rootFolderId: string, folders: AssetFolder[]): Set<string> {
  const ids = new Set<string>([rootFolderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function detectAssetFormat(asset: Asset): string {
  const mime = (asset.fileType || "").toLowerCase();
  const extMatch = (asset.fileName || asset.name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch?.[1] || "";
  if (mime.includes("png") || ext === "png") return "png";
  if (mime.includes("jpeg") || mime.includes("jpg") || ext === "jpg" || ext === "jpeg") return "jpg";
  if (mime.includes("webp") || ext === "webp") return "webp";
  if (mime.includes("svg") || ext === "svg") return "svg";
  if (mime.includes("gif") || ext === "gif") return "gif";
  return ext || "other";
}

const noLinkedAssets = new Set<string>();

type SelectionMode = {
  screenshot: { title: string; busy: boolean; error: string; onAdd: (asset: Asset) => void };
  linkedAssetIds?: never;
  inlineSupported?: never;
  onApplySelection?: never;
  onInsertAndLink?: never;
} | {
  screenshot?: never;
  linkedAssetIds: Set<string>;
  inlineSupported: boolean;
  onApplySelection: (selected: Asset[], unselected: Asset[]) => void;
  onInsertAndLink: (selected: Asset[], unselected: Asset[]) => void;
};

export function AssetPickerModal({
  allAssets,
  products,
  folders = [],
  releases = [],
  preferredProductIds,
  channel,
  defaultLanguage,
  screenshot,
  linkedAssetIds = noLinkedAssets,
  inlineSupported,
  onApplySelection,
  onInsertAndLink,
  onClose,
}: {
  allAssets: Asset[];
  products: Product[];
  folders?: AssetFolder[];
  releases?: Release[];
  preferredProductIds: string[];
  channel?: string;
  defaultLanguage?: string;
  onClose: () => void;
} & SelectionMode) {
  const { t } = useI18n();
  const single = Boolean(screenshot);
  const busy = Boolean(screenshot?.busy);
  const dialogLabel = t("从素材库选择图片", "Select Images from Asset Library");
  const defaultProductFilter = preferredProductIds.length > 0 ? "current" : "all";

  // 国内选中文，其他选英文
  const defaultLanguageFilter = useMemo(() => {
    if (defaultLanguage) return defaultLanguage;
    if (channel) {
      return isForeignChannel(channel) ? "en-US" : "zh-Hans";
    }
    return "zh-Hans";
  }, [defaultLanguage, channel]);

  const [query, setQuery] = useState("");
  const [productFilter, setProductFilter] = useState<string>(defaultProductFilter);
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [languageFilter, setLanguageFilter] = useState<string>(defaultLanguageFilter);
  const [releaseFilter, setReleaseFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => Array.from(linkedAssetIds));
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);

  const allImageAssets = useMemo(() => allAssets.filter(asset => single
    ? /^image\/(png|jpe?g|webp|avif|bmp)$/i.test(asset.fileType) || /\.(png|jpe?g|webp|avif|bmp)$/i.test(asset.fileName)
    : isImageAssetRecord(asset)), [allAssets, single]);
  const productNameMap = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const folderOptions = useMemo(() => {
    return folders
      .filter((f) => {
        if (productFilter === "current" && preferredProductIds.length > 0) {
          return !f.productId || preferredProductIds.includes(f.productId);
        }
        if (productFilter === "shared") return !f.productId;
        if (productFilter !== "all" && productFilter !== "current") {
          return f.productId === productFilter;
        }
        return true;
      })
      .map((f) => ({
        id: f.id,
        label:
          (f.productId && productNameMap.get(f.productId) && (productFilter === "all" || preferredProductIds.length > 1)
            ? `[${productNameMap.get(f.productId)}] `
            : "") + buildFolderPath(f.id, folderMap),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  }, [folders, folderMap, productFilter, preferredProductIds, productNameMap]);

  const languageOptions = useMemo(() => {
    const codes = new Set<string>();
    codes.add("zh-Hans");
    codes.add("en-US");
    if (defaultLanguageFilter && defaultLanguageFilter !== "all") {
      codes.add(defaultLanguageFilter);
    }
    for (const a of allImageAssets) {
      for (const l of a.languages || []) {
        if (l) codes.add(l);
      }
    }
    return [...codes].sort();
  }, [allImageAssets, defaultLanguageFilter]);

  const releaseMap = useMemo(() => new Map((releases || []).map((r) => [r.id, r])), [releases]);

  // 正确读取版本并按版本号逆序排列
  const releaseOptions = useMemo(() => {
    let rels = releases || [];
    if (productFilter === "current" && preferredProductIds.length > 0) {
      rels = rels.filter((r) => preferredProductIds.includes(r.productId));
    } else if (productFilter === "shared") {
      rels = [];
    } else if (productFilter !== "all") {
      rels = rels.filter((r) => r.productId === productFilter);
    }

    const relMap = new Map(rels.map((r) => [r.id, r]));
    const additionalFromAssets: Release[] = [];
    for (const a of allImageAssets) {
      if (a.releaseId && !relMap.has(a.releaseId)) {
        const found = (releases || []).find((r) => r.id === a.releaseId);
        if (found && !relMap.has(found.id)) {
          relMap.set(found.id, found);
          additionalFromAssets.push(found);
        }
      }
    }
    return [...rels, ...additionalFromAssets].sort((a, b) => compareVersionsDesc(a.version, b.version));
  }, [releases, productFilter, preferredProductIds, allImageAssets]);

  const folderMatchSet = useMemo(() => {
    if (folderFilter === "all" || folderFilter === "root") return null;
    return collectSubtreeFolderIds(folderFilter, folders);
  }, [folderFilter, folders]);

  const imageAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = allImageAssets.filter((asset) => {
      if (productFilter === "current" && preferredProductIds.length > 0) {
        if (asset.productId && !preferredProductIds.includes(asset.productId)) return false;
      } else if (productFilter === "shared") {
        if (asset.productId) return false;
      } else if (productFilter !== "all") {
        if (asset.productId !== productFilter) return false;
      }

      if (folderFilter === "root") {
        if (asset.folderId) return false;
      } else if (folderMatchSet) {
        if (!asset.folderId || !folderMatchSet.has(asset.folderId)) return false;
      }

      if (languageFilter !== "all" && !assetMatchesLanguage(asset, languageFilter)) {
        return false;
      }

      if (releaseFilter !== "all") {
        if (releaseFilter === "unlinked") {
          if (asset.releaseId) return false;
        } else {
          const targetRelease = releaseMap.get(releaseFilter);
          const matchesId = asset.releaseId === releaseFilter;
          const matchesVersion = Boolean(
            targetRelease &&
              targetRelease.version &&
              (asset.releaseId === targetRelease.version ||
                asset.releaseId === `v${targetRelease.version}` ||
                asset.releaseId === targetRelease.version.replace(/^v/i, ""))
          );
          if (!matchesId && !matchesVersion) return false;
        }
      }

      if (!q) return true;
      const folderText = asset.folderId ? buildFolderPath(asset.folderId, folderMap).toLowerCase() : "";
      const prodText = asset.productId ? (productNameMap.get(asset.productId) || "").toLowerCase() : "";
      return (
        asset.name.toLowerCase().includes(q) ||
        asset.fileName.toLowerCase().includes(q) ||
        folderText.includes(q) ||
        prodText.includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const timeA = Date.parse(a.updatedAt || a.createdAt || "") || 0;
      const timeB = Date.parse(b.updatedAt || b.createdAt || "") || 0;
      return timeB - timeA;
    });
  }, [
    allImageAssets,
    productFilter,
    preferredProductIds,
    folderFilter,
    folderMatchSet,
    languageFilter,
    releaseFilter,
    releaseMap,
    query,
    folderMap,
    productNameMap,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (busy) return;
        if (previewAssetId) {
          setPreviewAssetId(null);
        } else {
          onClose();
        }
        return;
      }

      if (previewAssetId) {
        const active = document.activeElement;
        if (active) {
          const tag = active.tagName.toLowerCase();
          if (
            tag === "input" ||
            tag === "textarea" ||
            tag === "select" ||
            (active as HTMLElement).isContentEditable
          ) {
            return;
          }
        }

        const idx = imageAssets.findIndex((a) => a.id === previewAssetId);
        if (idx !== -1) {
          if (e.key === "ArrowLeft" && idx > 0) {
            e.preventDefault();
            e.stopPropagation();
            setPreviewAssetId(imageAssets[idx - 1].id);
          } else if (e.key === "ArrowRight" && idx < imageAssets.length - 1) {
            e.preventDefault();
            e.stopPropagation();
            setPreviewAssetId(imageAssets[idx + 1].id);
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [previewAssetId, onClose, busy, imageAssets]);

  const hasActiveFilters =
    Boolean(query.trim()) ||
    productFilter !== defaultProductFilter ||
    folderFilter !== "all" ||
    languageFilter !== defaultLanguageFilter ||
    releaseFilter !== "all";

  function resetFilters() {
    setQuery("");
    setProductFilter(defaultProductFilter);
    setFolderFilter("all");
    setLanguageFilter(defaultLanguageFilter);
    setReleaseFilter("all");
  }

  const selectedAssets = allImageAssets.filter((a) => selectedIds.includes(a.id));
  const unselectedAssets = allImageAssets.filter((a) => linkedAssetIds.has(a.id) && !selectedIds.includes(a.id));
  const previewAsset = previewAssetId ? allImageAssets.find((a) => a.id === previewAssetId) ?? null : null;

  function toggle(id: string) {
    if (busy) return;
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : single ? [id] : [...prev, id]);
  }

  function selectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const a of imageAssets) next.add(a.id);
      return [...next];
    });
  }

  return (
    <div className="asset-picker-backdrop" role="dialog" aria-modal="true" aria-label={dialogLabel} onClick={() => { if (!busy) onClose(); }}>
      <div className="asset-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="asset-picker-header">
          <div>
            <h3>{screenshot ? dialogLabel : t("从素材库选择关联图片", "Select Linked Images from Library")}</h3>
            <p className="faint">{screenshot?.title || t("支持多维筛选、放大预览与多选关联或直接插入正文", "Filter, preview, and multi-select images to link or insert")}</p>
          </div>
          <button type="button" className="icon-button" disabled={busy} aria-label={t("关闭素材选择器", "Close asset picker")} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="asset-picker-filters">
          <div className="asset-picker-filters-row">
            <div className="asset-picker-search">
              <Search size={14} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("搜索名称、文件名、文件夹或产品...", "Search name, filename, folder or product...")}
                autoFocus
              />
            </div>

            {preferredProductIds.length > 0 && (
              <div className="asset-picker-scopes">
                <button
                  type="button"
                  className={`button small ${productFilter === "current" ? "primary" : "secondary"}`}
                  onClick={() => {
                    setProductFilter("current");
                    setFolderFilter("all");
                  }}
                >
                  {t("当前产品素材", "Product Assets")}
                </button>
                <button
                  type="button"
                  className={`button small ${productFilter === "all" ? "primary" : "secondary"}`}
                  onClick={() => {
                    setProductFilter("all");
                    setFolderFilter("all");
                  }}
                >
                  {t("全部素材", "All Assets")}
                </button>
              </div>
            )}
          </div>

          <div className="asset-picker-facets">
            <select
              className="asset-picker-select"
              aria-label={t("按产品筛选", "Filter by product")}
              value={productFilter}
              onChange={(e) => {
                setProductFilter(e.target.value);
                setFolderFilter("all");
              }}
            >
              <option value="all">{t("全部产品与通用", "All Products")}</option>
              {preferredProductIds.length > 0 && (
                <option value="current">{screenshot ? t("当前产品与通用素材", "Current product and shared assets") : t("仅当前内容产品", "Current Content Product")}</option>
              )}
              <option value="shared">{t("通用共享素材", "Shared Assets")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              className="asset-picker-select"
              aria-label={t("按文件夹筛选", "Filter by folder")}
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
            >
              <option value="all">{t("全部文件夹", "All Folders")}</option>
              <option value="root">{t("根目录（未归类）", "Root (Unfiled)")}</option>
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>

            <select
              className="asset-picker-select"
              aria-label={t("按语言筛选", "Filter by language")}
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
            >
              <option value="all">{t("全部语言", "All Languages")}</option>
              {languageOptions.map((code) => (
                <option key={code} value={code}>
                  {code === "all" ? t("通用 / 全语言", "All / Universal") : getAssetLanguageLabel(code)}
                </option>
              ))}
            </select>

            {releaseOptions.length > 0 && (
              <select
                className="asset-picker-select"
                aria-label={t("按版本筛选", "Filter by release")}
                value={releaseFilter}
                onChange={(e) => setReleaseFilter(e.target.value)}
              >
                <option value="all">{t("全部版本", "All Releases")}</option>
                <option value="unlinked">{t("未关联版本", "Unlinked Releases")}</option>
                {releaseOptions.map((r) => {
                  const prodLabel =
                    (productFilter === "all" || preferredProductIds.length > 1) &&
                    r.productId &&
                    productNameMap.get(r.productId)
                      ? `[${productNameMap.get(r.productId)}] `
                      : "";
                  return (
                    <option key={r.id} value={r.id}>
                      {prodLabel}v{r.version}
                    </option>
                  );
                })}
              </select>
            )}

            {hasActiveFilters && (
              <button type="button" className="text-button small asset-picker-reset" onClick={resetFilters}>
                {t("重置筛选", "Reset")}
              </button>
            )}
          </div>

          <div className="asset-picker-statusbar">
            <span>
              {t(
                `显示 ${imageAssets.length} / ${allImageAssets.length} 张图片`,
                `Showing ${imageAssets.length} of ${allImageAssets.length} images`,
              )}
            </span>
            {!single && <div className="asset-picker-bulk-select">
              <button
                type="button"
                className="text-button small"
                disabled={imageAssets.length === 0}
                onClick={selectAllFiltered}
              >
                {t("全选当前结果", "Select Visible")}
              </button>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  className="text-button small"
                  onClick={() => setSelectedIds([])}
                >
                  {t("清空已选", "Clear")}
                </button>
              )}
            </div>}
          </div>
        </div>

        <div className="asset-picker-grid">
          {imageAssets.length === 0 ? (
            <div className="asset-picker-empty">
              <p>{t("没有符合筛选条件的图片素材。", "No matching image assets found.")}</p>
              {hasActiveFilters && (
                <button type="button" className="button secondary small" onClick={resetFilters}>
                  {t("重置筛选条件", "Reset Filters")}
                </button>
              )}
            </div>
          ) : (
            imageAssets.map((asset) => {
              const checked = selectedIds.includes(asset.id);
              const alreadyLinked = linkedAssetIds.has(asset.id);
              const fmt = detectAssetFormat(asset).toUpperCase();
              const folderLabel = asset.folderId && folderMap.get(asset.folderId) ? folderMap.get(asset.folderId)!.name : "";
              return (
                <div
                  key={asset.id}
                  className={`asset-picker-item ${checked ? "selected" : ""}`}
                  onClick={() => toggle(asset.id)}
                >
                  <div className="asset-picker-thumb">
                    <img src={resolveImageSrc(buildAssetFileUrl(asset.id), allAssets)} alt={asset.name} loading="lazy" />
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={single ? "original-screenshot" : undefined}
                      className="linked-asset-checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => toggle(asset.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t(`选择图片 ${asset.name}`, `Select image ${asset.name}`)}
                    />
                    {alreadyLinked && (
                      <span className="asset-picker-linked-tag">{t("已关联", "Linked")}</span>
                    )}
                    <button
                      type="button"
                      className="asset-picker-preview-btn"
                      disabled={busy}
                      aria-label={t(`预览图片 ${asset.name}`, `Preview ${asset.name}`)}
                      title={t("放大预览", "Quick preview")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewAssetId(asset.id);
                      }}
                    >
                      <Eye size={13} />
                    </button>
                    <span className="asset-picker-dims-badge">
                      {asset.width || 0}×{asset.height || 0}
                    </span>
                  </div>
                  <div className="asset-picker-meta">
                    <strong title={asset.name}>{asset.name}</strong>
                    <div className="asset-picker-submeta">
                      <span>{fmt} · {formatBytes(asset.fileSize)}</span>
                      {folderLabel && <span className="asset-picker-folder-chip" title={folderLabel}>{folderLabel}</span>}
                    </div>
                    {(asset.productId || (asset.languages && asset.languages.length > 0)) && (
                      <div className="asset-picker-tags">
                        {asset.productId && productNameMap.get(asset.productId) && (
                          <span className="asset-picker-pill product">{productNameMap.get(asset.productId)}</span>
                        )}
                        {(asset.languages || []).slice(0, 2).map((l) => (
                          <span key={l} className="asset-picker-pill">
                            {l === "all" ? t("全语言", "All") : getAssetLanguageLabel(l)}
                          </span>
                        ))}
                        {(asset.languages || []).length > 2 && (
                          <span className="asset-picker-pill">+{(asset.languages || []).length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {screenshot?.error && <p className="asset-picker-error" role="alert">{screenshot.error}</p>}
        <div className="asset-picker-footer">
          <span className="faint">
            {screenshot ? selectedAssets[0]?.name : t(
              `已勾选 ${selectedAssets.length} 张图片（已关联 ${selectedAssets.filter((a) => linkedAssetIds.has(a.id)).length} 张）`,
              `${selectedAssets.length} selected (${selectedAssets.filter((a) => linkedAssetIds.has(a.id)).length} already linked)`,
            )}
          </span>
          <div className="asset-picker-footer-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
              {t("取消", "Cancel")}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={single && (busy || !selectedAssets.length)}
              onClick={() => {
                if (screenshot && selectedAssets[0]) screenshot.onAdd(selectedAssets[0]);
                else onApplySelection?.(selectedAssets, unselectedAssets);
              }}
            >
              {screenshot ? (busy ? t("正在添加…", "Adding…") : t("添加截图", "Add screenshot")) : t("保存选择", "Save Selection")}
            </button>
            {inlineSupported && (
              <button
                type="button"
                className="button secondary"
                disabled={selectedAssets.length === 0}
                onClick={() => onInsertAndLink?.(selectedAssets, unselectedAssets)}
              >
                <ImagePlus size={14} />
                <span>{t("关联并插入正文", "Link & Insert")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {previewAsset && (
        <div className="asset-lightbox-overlay" role="dialog" aria-modal="true" aria-label={previewAsset.name} onClick={(e) => { e.stopPropagation(); setPreviewAssetId(null); }}>
          <div className="asset-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <div className="asset-lightbox-header">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>{previewAsset.name}</strong>
                  {imageAssets.length > 1 && (
                    <span className="lightbox-counter-badge">
                      {imageAssets.findIndex((a) => a.id === previewAsset.id) + 1} / {imageAssets.length}
                    </span>
                  )}
                </div>
                <span className="faint" style={{ marginTop: 2, display: "inline-block" }}>
                  {previewAsset.width || 0}×{previewAsset.height || 0} · {formatBytes(previewAsset.fileSize)}
                </span>
              </div>
              <div className="asset-lightbox-actions">
                <button
                  type="button"
                  className={`button small ${selectedIds.includes(previewAsset.id) ? "secondary" : "primary"}`}
                  onClick={() => toggle(previewAsset.id)}
                >
                  <Check size={13} />
                  <span>{selectedIds.includes(previewAsset.id) ? t("取消选择", "Deselect") : t("选中此图", "Select")}</span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("关闭图片放大预览 (Esc)", "Close zoom preview (Esc)")}
                  title={t("关闭预览 (Esc)", "Close Preview (Esc)")}
                  onClick={() => setPreviewAssetId(null)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="asset-lightbox-stage" style={{ position: "relative" }}>
              {imageAssets.length > 1 && (
                <>
                  <button
                    type="button"
                    className="lightbox-nav-btn prev"
                    disabled={imageAssets.findIndex((a) => a.id === previewAsset.id) <= 0}
                    onClick={() => {
                      const idx = imageAssets.findIndex((a) => a.id === previewAsset.id);
                      if (idx > 0) setPreviewAssetId(imageAssets[idx - 1].id);
                    }}
                    title={imageAssets.findIndex((a) => a.id === previewAsset.id) > 0 ? t("上一张 (←)", "Previous (←)") : t("已是第一张", "First image")}
                    aria-label={t("上一张", "Previous")}
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    type="button"
                    className="lightbox-nav-btn next"
                    disabled={imageAssets.findIndex((a) => a.id === previewAsset.id) >= imageAssets.length - 1}
                    onClick={() => {
                      const idx = imageAssets.findIndex((a) => a.id === previewAsset.id);
                      if (idx < imageAssets.length - 1) setPreviewAssetId(imageAssets[idx + 1].id);
                    }}
                    title={imageAssets.findIndex((a) => a.id === previewAsset.id) < imageAssets.length - 1 ? t("下一张 (→)", "Next (→)") : t("已是最后一张", "Last image")}
                    aria-label={t("下一张", "Next")}
                  >
                    <ChevronRight size={24} />
                  </button>
                </>
              )}
              <img key={previewAsset.id} src={resolveImageSrc(buildAssetFileUrl(previewAsset.id), allAssets)} alt={previewAsset.name} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
