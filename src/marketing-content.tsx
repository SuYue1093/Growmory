import { ListPagination, listPageSize } from './list-pagination';
import { platformCatalog, channelOptions, findPlatform, platformName, supportsInlineImages, isPersonalSiteChannel } from './platforms';

export const marketingGroupPageSize = 3;
import { PlatformLogo } from './platform-logo';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Copy,
  Plus,
  Search,
  X,
  ExternalLink,
  Sparkles,
  FolderKanban,
  Check,
  Layers,
  Globe,
  Trash2,
  ChevronDown,
  ChevronUp,
  Filter,
  Image,
  ImagePlus,
  Pencil,
  Upload,
  Eye,
  Images,
  FileCode2,
  FileText,
  Download
} from "lucide-react";
import type { Asset, AssetFolder, Content, ContentGroup, ContentTarget, Data, Product } from "./types";
import { today, uid, now, MARKETING_TAG_OPTIONS, isAiContent, formatCreatedTime, getContentGroupTargets } from "./types";
import {
  isForeignChannel,
  type MarketingPromptTarget,
  marketingGroupPrompt,
  marketingRewritePrompt,
  coverImagePrompt,
  COVER_SIZE_OPTIONS,
  getDefaultCoverSize,
  getPlatformCoverSizes,
} from "./marketing-agent";
import { useI18n } from "./i18n.ts";
import { downloadAssetsAsZip, downloadSingleAsset, formatBytes, isImageFile, readImageFile } from "./asset-library";
import {
  buildAssetFileUrl,
  buildAssetMarkdownSnippet,
  copyAssetImageToClipboard,
  copyMultipleAssetsToClipboard,
  copyMarketingBodyToClipboard,
  extractBodyAssetReferences,
  insertMarkdownImageAtCursor,
  resolveContentAssets,
  resolveImageSrc,
} from "./marketing-rich-copy";
import { MarketingRichEditor, type MarketingRichEditorHandle } from "./marketing-rich-editor";
import { AssetPickerModal, isImageAssetRecord } from "./asset-picker-modal";

export function generateCoverAssetName(
  file: File,
  content: Pick<Content, "title" | "channel">,
  products: Product[],
  existingAssets: Asset[]
): string {
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || "png").toLowerCase();
  const cleanTitle = (content.title || "").replace(/[\[\]\/\\:*?"<>|]/g, " ").trim();
  const prod = products[0];
  const prodPart = prod?.name?.split(/\s[-–—]\s/)[0]?.trim();

  let base = "";
  if (cleanTitle) {
    base = `[封面] ${cleanTitle.slice(0, 30)}`;
  } else if (prodPart) {
    base = `[封面] ${prodPart} 营销封面`;
  } else {
    base = `[封面] 营销内容`;
  }

  const targetName = `${base}.${ext}`;
  const existingNames = new Set(existingAssets.map((a) => (a.name || "").toLowerCase()));
  if (!existingNames.has(targetName.toLowerCase())) {
    return targetName;
  }
  let counter = 2;
  while (existingNames.has(`${base} (${counter}).${ext}`.toLowerCase())) {
    counter++;
  }
  return `${base} (${counter}).${ext}`;
}

function selectGroupImageAssets(assets: Asset[], productIds: string[]) {
  return assets.filter((a) => (!a.productId || productIds.includes(a.productId)) && isImageAssetRecord(a));
}

export function ProductIcon({
  product,
  size = 20,
}: {
  product?: Product;
  size?: number;
}) {
  const fallbackLetter = product?.name?.trim().slice(0, 1) || (product ? "P" : "?");
  const fontSize = Math.max(10, Math.round(size * 0.52));
  const borderRadius = Math.max(4, Math.round(size * 0.22));

  return product?.icon ? (
    <img
      className="app-icon"
      src={product.icon}
      alt=""
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius,
        objectFit: "cover",
      }}
    />
  ) : (
    <span
      className={`app-icon fallback ${product?.color || "blue"}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        fontSize,
        borderRadius,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {fallbackLetter}
    </span>
  );
}

export const marketingStatus = (status: string) => (status === "review" ? "ready" : status);
const labels: Record<string, string> = { draft: "草稿", ready: "待发布", published: "已发布", archived: "已归档" };
const defaultDomesticChannels = platformCatalog.filter(p => p.domestic && !isPersonalSiteChannel(p.id)).map(p => p.name);
const defaultForeignChannels = platformCatalog.filter(p => !p.domestic).map(p => p.name);

export function MarketingList({
  contents: allContents,
  data,
  filter,
  setFilter,
  scope = "all",
  setScope,
  edit,
  copy,
  save,
}: {
  contents: Content[];
  data: Data;
  filter: string;
  setFilter: (s: string) => void;
  scope?: string;
  setScope?: (s: string) => void;
  edit: (c?: Content, pid?: string, rid?: string, manual?: boolean) => void;
  copy: (s: string) => unknown;
  save: (mutator: (d: Data) => void) => Promise<boolean>;
}) {
  const { lang, t } = useI18n();
  const [channel, setChannel] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ContentGroup | null>(null);
  const [groupPromptModal, setGroupPromptModal] = useState<ContentGroup | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const socialAccounts = data.socialAnalytics?.accounts || [];
  const accountMap = useMemo(() => new Map(socialAccounts.map((a) => [a.id, a])), [socialAccounts]);
  const filteredAccountOptions = useMemo(() => {
    if (!channel) return socialAccounts;
    const pid = findPlatform(channel)?.id;
    return pid ? socialAccounts.filter((a) => a.platform === pid) : socialAccounts;
  }, [socialAccounts, channel]);

  useEffect(() => {
    if (accountFilter && accountFilter !== "unassigned" && !filteredAccountOptions.some((a) => a.id === accountFilter)) {
      setAccountFilter("");
    }
  }, [accountFilter, filteredAccountOptions]);

  const groups = data.contentGroups || [];
  const [groupPage, setGroupPage] = useState(1);
  const groupTotalPages = Math.max(1, Math.ceil(groups.length / marketingGroupPageSize));
  const currentGroupPage = Math.min(groupPage, groupTotalPages);
  const pageGroups = groups.slice((currentGroupPage - 1) * marketingGroupPageSize, currentGroupPage * marketingGroupPageSize);

  useEffect(() => {
    if (groupPage > groupTotalPages) {
      setGroupPage(groupTotalPages);
    }
  }, [groupPage, groupTotalPages]);

  // 个人主页文章不参与营销内容列表展示（含各处计数与筛选）
  const contents = allContents.filter((c) => !isPersonalSiteChannel(c.channel));

  const rows = contents
    .filter((c) => {
      const matchFilter = filter === "all" || marketingStatus(c.status) === marketingStatus(filter);
      const matchChannel = !channel || platformName(c.channel) === channel;
      const matchAccount =
        !accountFilter ||
        (accountFilter === "unassigned" ? !c.accountId : c.accountId === accountFilter);
      const matchGroup =
        selectedGroupId === "all" ||
        (selectedGroupId === "ungrouped" ? !c.groupId : c.groupId === selectedGroupId);
      const matchSearch =
        `${c.title}\n${c.body}\n${c.explanation || ""}\n${c.accountId ? accountMap.get(c.accountId)?.name || "" : ""}`.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchChannel && matchAccount && matchGroup && matchSearch;
    })
    .slice()
    .sort((a, b) => {
      const timeB = b.createdAt || (b.groupId ? groups.find((g) => g.id === b.groupId)?.createdAt : "") || b.publishedAt || b.date || "";
      const timeA = a.createdAt || (a.groupId ? groups.find((g) => g.id === a.groupId)?.createdAt : "") || a.publishedAt || a.date || "";
      return timeB.localeCompare(timeA);
    });

  const [listPage, setListPage] = useState(1);
  useEffect(() => setListPage(1), [filter, channel, accountFilter, search, selectedGroupId]);
  const page = Math.min(listPage, Math.max(1, Math.ceil(rows.length / listPageSize)));
  const pageRows = rows.slice((page - 1) * listPageSize, page * listPageSize);
  const allVisibleSelected = pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));
  const someVisibleSelected = pageRows.some((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageRows.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageRows.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function deleteSingle(id: string, title: string) {
    if (!window.confirm(t("确定要删除文案「{title}」吗？此操作无法撤销。", "Delete copy \"{title}\"? This action cannot be undone.", { title: title || t("未命名", "Untitled") }))) return;
    await save((d) => {
      d.contents = d.contents.filter((c) => c.id !== id);
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(t("确定要删除选中的 {count} 篇文案吗？此操作无法撤销。", "Delete selected {count} articles? This action cannot be undone.", { count }))) return;
    await save((d) => {
      d.contents = d.contents.filter((c) => !selectedIds.has(c.id));
    });
    setSelectedIds(new Set());
  }

  async function deleteGroup(groupId: string) {
    if (!window.confirm(t("确定删除此营销内容组吗？已生成的内容将保留并标记为未分组。", "Delete this content group? Generated content will be kept and marked ungrouped."))) return;
    await save((d) => {
      d.contentGroups = (d.contentGroups || []).filter((g) => g.id !== groupId);
      d.contents.forEach((c) => {
        if (c.groupId === groupId) delete c.groupId;
      });
    });
    if (selectedGroupId === groupId) setSelectedGroupId("all");
  }

  const activeGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <div className="marketing-workspace">
      {(creatingGroup || editingGroup) && (
        <ContentGroupModal
          initial={editingGroup || undefined}
          data={data}
          save={save}
          copy={copy}
          close={() => {
            setCreatingGroup(false);
            setEditingGroup(null);
          }}
        />
      )}

      {groupPromptModal && (
        <GroupPromptViewerModal
          group={groupPromptModal}
          data={data}
          copy={copy}
          onEdit={(g) => {
            setGroupPromptModal(null);
            setEditingGroup(g);
          }}
          close={() => setGroupPromptModal(null)}
        />
      )}

      {/* 顶部营销内容组模块 */}
      <section className="marketing-groups-panel">
        <div className="panel-heading marketing-groups-panel-heading">
          <div className="marketing-groups-heading-text">
            <div className="panel-title-with-badge">
              <FolderKanban size={18} className="panel-title-icon" />
              <h2>{t("营销内容组", "Content Groups")}</h2>
              <span className="group-count-badge">
                {groups.length ? (lang === "en" ? `${groups.length} groups` : `${groups.length} 个规划`) : t("多平台协同", "Multi-platform Matrix")}
              </span>
            </div>
            <p className="subtle">
              {t("选定多个产品、内容方向与推广平台，由外部 Agent 统一生成文案并回填", "Define products, directions & platforms; let Agent generate and backfill.")}
            </p>
          </div>
          <div className="marketing-panel-actions">
            <button className="button primary" onClick={() => { setCreatingGroup(true); setGroupPage(1); }}>
              <Plus size={16} />
              {t("新建营销内容组", "New Content Group")}
            </button>
            {groups.length > 0 && (
              <button
                type="button"
                className="icon-button collapse-toggle"
                aria-expanded={groupsOpen}
                title={groupsOpen ? t("收起内容组列表", "Collapse content groups") : t("展开内容组列表", "Expand content groups")}
                onClick={() => setGroupsOpen(!groupsOpen)}
              >
                {groupsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
          </div>
        </div>

        {groupsOpen && (
          <>
            {groups.length > 0 ? (
              <>
                <div className="content-groups-grid">
                {pageGroups.map((g) => {
                  const groupContents = contents.filter((c) => c.groupId === g.id);
                  const isSelected = selectedGroupId === g.id;
                  const products = data.products.filter((p) => (g.productIds || []).includes(p.id));
                  const groupTargets = getContentGroupTargets(g);
                  const progressPct = groupTargets.length
                    ? Math.min(100, Math.round((groupContents.length / groupTargets.length) * 100))
                    : 0;

                  return (
                    <div
                      key={g.id}
                      className={`content-group-card ${isSelected ? "selected" : ""}`}
                    >
                      <div className="content-group-header">
                        <h3 className="content-group-title" title={g.title || g.direction}>
                          {g.title || g.direction.slice(0, 30) || t("未命名内容组", "Untitled Group")}
                        </h3>
                        <div className="content-group-header-actions">
                          <button
                            type="button"
                            className="icon-button"
                            title={t("编辑内容组", "Edit Group")}
                            aria-label={t("编辑内容组", "Edit Group")}
                            onClick={() => setEditingGroup(g)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-button danger"
                            title={t("删除内容组", "Delete Group")}
                            aria-label={t("删除内容组", "Delete Group")}
                            onClick={() => void deleteGroup(g.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="content-group-body">
                        <div className="content-group-products" title={products.map((p) => p.name).join("、") || undefined}>
                          {products.length ? (
                            <>
                              <span className="tag product-tag">{products[0].name}</span>
                              {products.length > 1 && (
                                <span className="tag faint">
                                  +{products.length - 1}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="tag faint">{t("通用 / 无产品", "General / No Product")}</span>
                          )}
                        </div>
                        <p className="content-group-direction" title={g.direction}>
                          {g.direction}
                        </p>

                        <div className="content-group-channels-strip">
                          <div className="channel-badges">
                            {groupTargets.map((target, idx) => {
                              const ch = target.channel;
                              const targetAcc = target.accountId ? accountMap.get(target.accountId) : undefined;
                              const sameChannelCount = groupTargets.filter((item) => platformName(item.channel) === platformName(ch)).length;
                              const itemContent = target.accountId
                                ? groupContents.find((c) => c.accountId === target.accountId) ||
                                  (sameChannelCount === 1 ? groupContents.find((c) => platformName(c.channel) === platformName(ch) && !c.accountId) : undefined)
                                : groupContents.find((c) => platformName(c.channel) === platformName(ch) && !c.accountId) ||
                                  groupContents.find((c) => platformName(c.channel) === platformName(ch));
                              const hasContent = !!itemContent;
                              const isForeign = isForeignChannel(ch);
                              const targetLabel = targetAcc ? `${platformName(ch)} · ${targetAcc.name}` : platformName(ch);
                              return (
                                <span
                                  key={`${ch}:${target.accountId || idx}`}
                                  className={`tag channel-tag ${hasContent ? "has-content" : "pending"} ${isForeign ? "is-foreign" : ""}`}
                                  title={
                                    hasContent
                                      ? (lang === "en" ? `${targetLabel} · Generated: ${itemContent.title} (Click to edit)` : `${targetLabel} · 已生成回填内容：${itemContent.title} (点击编辑)`)
                                      : (lang === "en" ? `${targetLabel} · Waiting for Agent backfill` : `${targetLabel} · 等待 Agent 回填`)
                                  }
                                  onClick={hasContent ? () => edit(itemContent) : undefined}
                                  style={hasContent ? { cursor: "pointer" } : undefined}
                                >
                                  <PlatformLogo platform={ch} size={14} />
                                  {targetLabel}
                                  {hasContent ? (
                                    <Check size={11} className="badge-icon success" />
                                  ) : (
                                    <span className="badge-dot pending" />
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="content-group-footer">
                        <div className="group-progress-wrap">
                          <div className="group-progress-bar">
                            <div
                              className="group-progress-fill"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="group-count-text">
                            {lang === "en" ? `${groupContents.length} / ${groupTargets.length} generated` : `已生成 ${groupContents.length} / ${groupTargets.length} 篇`}
                          </span>
                        </div>
                        <div className="group-action-buttons">
                          <button
                            type="button"
                            className="text-button prompt-button"
                            onClick={() => setGroupPromptModal(g)}
                          >
                            <Copy size={13} />
                            {t("提示词", "Prompt")}
                          </button>
                          <button
                            type="button"
                            className={`button small ${isSelected ? "primary" : "secondary"}`}
                            onClick={() => setSelectedGroupId(isSelected ? "all" : g.id)}
                          >
                            {isSelected ? t("显示全部", "Show All") : t("筛选此组", "Filter Group")}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="marketing-groups-footer">
                <ListPagination
                  page={currentGroupPage}
                  total={groups.length}
                  pageSize={marketingGroupPageSize}
                  itemUnit={{ zh: "组", en: "groups" }}
                  onPage={setGroupPage}
                />
              </div>
            </>
          ) : (
              <div className="content-groups-empty">
                <FolderKanban size={30} className="empty-icon" />
                <div className="content-groups-empty-text">
                  <b>{t("规划你的首个营销矩阵", "Plan your first marketing matrix")}</b>
                  <p>{t("点击上方「新建营销内容组」，一次设定多个推广产品与平台，复制 Agent 提示词自动回填各平台文案。", "Click New Content Group above to configure products and platforms, then copy prompt to Agent.")}</p>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* 营销单篇内容管理区 */}
      <section className="marketing-list">
        <div className="marketing-toolbar-unified">
          <div className="segmented marketing-tabs">
            {["all", "draft", "ready", "published"].map((s) => (
              <button
                key={s}
                className={marketingStatus(filter) === s ? "active" : ""}
                onClick={() => setFilter(s)}
              >
                {s === "all" ? t("全部", "All") : t(labels[s])}{" "}
                <small>
                  {
                    contents.filter((c) => {
                      const matchGroup =
                        selectedGroupId === "all" ||
                        (selectedGroupId === "ungrouped" ? !c.groupId : c.groupId === selectedGroupId);
                      return matchGroup && (s === "all" || marketingStatus(c.status) === s);
                    }).length
                  }
                </small>
              </button>
            ))}
          </div>

          <div className="marketing-tools-right">
            {data.products.length > 0 && (
              <div className="marketing-product-filter-wrap" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <select
                  aria-label={t("产品筛选", "Filter by product")}
                  value={scope || "all"}
                  onChange={(e) => setScope?.(e.target.value)}
                  className="marketing-filter-select"
                >
                  <option value="all">{t("全部产品", "All Products")}</option>
                  {data.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name.split(/\s[-–—]\s/)[0]}
                    </option>
                  ))}
                  {scope && scope !== "all" && !data.products.some((p) => p.id === scope) && (
                    <option value={scope} disabled>{t("未知产品", "Unknown Product")}</option>
                  )}
                </select>
                {scope && scope !== "all" && (
                  <button
                    type="button"
                    className="icon-button"
                    style={{ padding: 4, height: 28, width: 28, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    title={t("清除产品筛选", "Clear product filter")}
                    aria-label={t("清除产品筛选", "Clear product filter")}
                    onClick={() => setScope?.("all")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            {groups.length > 0 && (
              <select
                aria-label={t("内容组筛选", "Filter by group")}
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="marketing-filter-select"
              >
                <option value="all">{t("全部内容组", "All Groups")} ({contents.length})</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title || g.direction.slice(0, 18)} (
                    {contents.filter((c) => c.groupId === g.id).length})
                  </option>
                ))}
                <option value="ungrouped">
                  {t("未分组", "Ungrouped")} ({contents.filter((c) => !c.groupId).length})
                </option>
              </select>
            )}

            <select
              aria-label={t("发布渠道筛选", "Filter by channel")}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="marketing-filter-select"
            >
              <option value="">{t("全部渠道", "All Channels")}</option>
              {channelOptions(contents.map(c => c.channel))
                .filter(Boolean)
                .filter((c) => !isPersonalSiteChannel(c))
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>

            {socialAccounts.length > 0 && (
              <select
                aria-label={t("发布账号筛选", "Filter by account")}
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="marketing-filter-select"
              >
                <option value="">{t("全部账号", "All Accounts")}</option>
                {filteredAccountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {channel ? a.name : `${platformName(a.platform)} · ${a.name}`}
                  </option>
                ))}
                <option value="unassigned">{t("未绑定账号", "Unbound Account")}</option>
              </select>
            )}

            <label className="marketing-search">
              <Search size={15} />
              <input
                aria-label={t("搜索营销内容", "Search content")}
                placeholder={t("搜索标题、正文、中文解释", "Search title, body, translation")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-button"
                  title={t("清空搜索", "Clear search")}
                  onClick={() => setSearch("")}
                >
                  <X size={13} />
                </button>
              )}
            </label>

            <button
              type="button"
              className="button primary marketing-create-trigger"
              aria-label={t("新建内容", "New Content")}
              title={t("新建内容", "New Content")}
              onClick={() => edit(undefined, undefined, undefined, true)}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* 正在筛选内容组提示条 */}
        {selectedGroupId !== "all" && (
          <div className="marketing-filter-banner">
            <div className="filter-banner-text">
              <Filter size={13} />
              <span>
                {t("正在筛选内容组：", "Filtering group: ")}
                <b>
                  {selectedGroupId === "ungrouped"
                    ? t("未分组文案", "Ungrouped Articles")
                    : activeGroup?.title || activeGroup?.direction || selectedGroupId}
                </b>
                ({rows.length} {lang === "en" ? "articles" : "篇"})
              </span>
            </div>
            <div className="filter-banner-actions">
              {activeGroup && (
                <button
                  type="button"
                  className="text-button"
                  style={{ marginRight: 12 }}
                  onClick={() => setEditingGroup(activeGroup)}
                >
                  <Pencil size={12} />
                  {t("编辑此组", "Edit Group")}
                </button>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => setSelectedGroupId("all")}
              >
                {t("清除筛选", "Clear Filter")}
              </button>
            </div>
          </div>
        )}

        {/* 批量操作工具条 */}
        {selectedIds.size > 0 && (
          <div className="marketing-batch-bar">
            <div className="batch-bar-left">
              <span>
                {lang === "en" ? `Selected ${selectedIds.size} articles` : `已选择 ${selectedIds.size} 篇文案`}
              </span>
            </div>
            <div className="batch-bar-actions">
              <button
                type="button"
                className="button danger small"
                aria-label={t("批量删除", "Batch Delete")}
                onClick={() => void deleteSelected()}
              >
                <Trash2 size={13} />
                {t("批量删除", "Batch Delete")} ({selectedIds.size})
              </button>
              <button
                type="button"
                className="text-button small"
                onClick={() => setSelectedIds(new Set())}
              >
                {t("取消选择", "Deselect")}
              </button>
            </div>
          </div>
        )}

        <div className="marketing-table">
          <table>
            <thead>
              <tr>
                <th className="col-checkbox">
                  <input
                    type="checkbox"
                    aria-label={t("全选本页", "Select this page")}
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
                    }}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="col-title">{t("标题与正文摘要", "Title & Summary")}</th>
                <th className="col-product">{t("营销产品", "Product")}</th>
                <th className="col-channel">{t("发布渠道", "Channel")}</th>
                <th className="col-group">{t("所属内容组", "Group")}</th>
                <th className="col-status">{t("状态", "Status")}</th>
                <th className="col-created">{t("创建时间", "Created At")}</th>
                <th className="col-actions">{t("操作", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const group = groups.find((g) => g.id === c.groupId);
                const isForeign = isForeignChannel(c.channel);
                const products = data.products.filter(p => p.id === c.productId || c.productIds?.includes(p.id));
                const createdRaw = c.createdAt || group?.createdAt || c.publishedAt || c.date || "";
                return (
                  <tr key={c.id} className={selectedIds.has(c.id) ? "selected" : ""}>
                    <td className="col-checkbox" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={t("选择", "Select")}
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                      />
                    </td>
                    <td className="col-title">
                      <button className="marketing-title" onClick={() => edit(c)}>
                        <div className="marketing-title-row">
                          <b title={c.title}>{c.title}</b>
                          <div className="marketing-title-badges">
                            {isAiContent(c) && (
                              <span className="marketing-ai-badge" title={t("AI 生成文案", "AI Generated Copy")}>
                                <Sparkles size={10} />
                                <span>AI</span>
                              </span>
                            )}
                            {c.tags && c.tags.length > 0 &&
                              c.tags.map((tagId) => {
                                const opt = MARKETING_TAG_OPTIONS.find((o) => o.id === tagId);
                                return opt ? (
                                  <span
                                    key={tagId}
                                    className="marketing-tag-badge"
                                    style={{
                                      background: `${opt.color}15`,
                                      color: opt.color,
                                      borderColor: `${opt.color}35`,
                                    }}
                                  >
                                    {t(opt.label)}
                                  </span>
                                ) : null;
                              })}
                            {c.explanation && (
                              <span className="tag foreign-badge" title={c.explanation}>
                                {t("含中文解释", "With Translation")}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="marketing-snippet" title={c.explanation || c.body}>
                          {c.explanation
                            ? `【${t("中文解释", "Translation")}】${c.explanation}`
                            : c.body.replace(/\s+/g, " ")}
                        </span>
                      </button>
                    </td>
                    <td className="col-product">
                      {products.length ? products.map(p => (
                        <div key={p.id} className="table-product-cell" title={p.name}>
                          <ProductIcon product={p} size={20} />
                          <span className="table-product-name">{p.name.split(/\s[-–—]\s/)[0]}</span>
                        </div>
                      )) : t("未分配产品", "Unassigned")}
                    </td>
                    <td className="col-channel">
                      <div className="channel-cell-stack">
                        <span className={`channel-pill ${isForeign ? "foreign" : ""}`}>
                          <PlatformLogo platform={c.channel} size={15} />
                          {platformName(c.channel) || t("未设置", "Not set")}
                        </span>
                        {c.accountId && accountMap.get(c.accountId) && (
                          <span className="channel-account-badge" title={accountMap.get(c.accountId)?.name}>
                            {accountMap.get(c.accountId)?.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="col-group">
                      {group ? (
                        <span
                          className="group-badge"
                          title={t("点击筛选此组", "Filter this group")}
                          onClick={() => setSelectedGroupId(group.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <Layers size={11} />
                          {group.title || group.direction.slice(0, 12)}
                        </span>
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                    <td className="col-status">
                      <span className={`badge ${marketingStatus(c.status)}`}>
                        {labels[marketingStatus(c.status)]}
                      </span>
                    </td>
                    <td className="col-created">
                      <span className="marketing-date" title={createdRaw || undefined}>
                        {formatCreatedTime(createdRaw)}
                      </span>
                    </td>
                    <td className="col-actions">
                      <div className="marketing-row-actions">
                        <button
                          className="icon-button danger"
                          aria-label={lang === "en" ? `Delete ${c.title || "Untitled"}` : `删除${c.title || "未命名"}`}
                          title={t("删除文案", "Delete Copy")}
                          onClick={() => void deleteSingle(c.id, c.title)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!rows.length && (
          <div className="marketing-empty">
            <h2>{contents.length ? t("没有符合条件的营销内容", "No matching marketing content") : t("开始准备营销内容", "Start preparing marketing content")}</h2>
            <p>
              {contents.length
                ? t("调整内容组、状态、渠道或搜索关键词后再试。", "Try adjusting filters or search keywords.")
                : t("点击上方「新建营销内容组」规划多渠道推广，或点击「+」按钮编写文案。", "Click 'New Content Group' above or '+' to create an article.")}
            </p>
          </div>
        )}
        <div className="marketing-list-footer">
          <ListPagination page={page} total={rows.length} onPage={setListPage} />
        </div>
      </section>
    </div>
  );
}

/**
 * 创建 / 编辑营销内容组弹窗
 */
export function ContentGroupModal({
  data,
  save,
  copy,
  close,
  initial,
  defaultValues,
}: {
  data: Data;
  save: (mutator: (d: Data) => void) => Promise<boolean>;
  copy: (s: string) => unknown;
  close: () => void;
  initial?: ContentGroup;
  defaultValues?: {
    productIds?: string[];
    title?: string;
    direction?: string;
    channels?: string[];
  };
}) {
  const isEditing = Boolean(initial && data.contentGroups?.some((g) => g.id === initial.id));
  const dialog = useRef<HTMLDialogElement>(null);
  const [groupId] = useState(() => initial?.id || uid());
  const [title, setTitle] = useState(() => initial?.title || defaultValues?.title || "");
  const [direction, setDirection] = useState(() => initial?.direction || defaultValues?.direction || "");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(() =>
    initial?.productIds && initial.productIds.length > 0
      ? initial.productIds
      : defaultValues?.productIds && defaultValues.productIds.length > 0
        ? defaultValues.productIds
        : []
  );
  const [channels, setChannels] = useState<string[]>(() =>
    initial?.channels && initial.channels.length > 0
      ? initial.channels
      : defaultValues?.channels && defaultValues.channels.length > 0
        ? defaultValues.channels
        : [
          "小红书",
          "X",
          "Reddit",
          "Product Hunt",
        ]
  );
  const [selectedAccountsByChannel, setSelectedAccountsByChannel] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    if (initial?.targets?.length) {
      for (const item of initial.targets) {
        if (item.accountId) {
          map[item.channel] = [...(map[item.channel] || []), item.accountId];
        }
      }
    }
    return map;
  });
  const [customChannel, setCustomChannel] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const { lang, t } = useI18n();
  const socialAccounts = data.socialAnalytics?.accounts || [];
  const accountsForChannel = (ch: string) => {
    const pid = findPlatform(ch)?.id;
    if (!pid) return [];
    return socialAccounts.filter((a) => a.platform === pid);
  };
  const effectiveTargets: ContentTarget[] = channels.flatMap((ch) => {
    const validIds = (selectedAccountsByChannel[ch] || []).filter((id) =>
      socialAccounts.some((a) => a.id === id)
    );
    if (!validIds.length) return [{ channel: ch }];
    return validIds.map((accountId) => ({ channel: ch, accountId }));
  });
  const promptTargets: MarketingPromptTarget[] = effectiveTargets.map((target) => {
    const acc = target.accountId ? socialAccounts.find((a) => a.id === target.accountId) : undefined;
    return {
      channel: target.channel,
      ...(acc ? {
        accountId: acc.id,
        accountName: acc.name,
        ...(acc.contentDirection ? { contentDirection: acc.contentDirection } : {}),
        ...(acc.writingStyle ? { writingStyle: acc.writingStyle } : {}),
      } : {}),
    };
  });

  const selectedProducts = data.products.filter((p) => selectedProductIds.includes(p.id));
  const availableGroupAssets = selectGroupImageAssets(data.assets || [], selectedProductIds);
  const availableAssetNames = availableGroupAssets.map((a) => a.name);

  const prompt = marketingGroupPrompt({
    groupId,
    title: title.trim() || direction.trim().slice(0, 30) || (lang === 'en' ? "Marketing Group" : "营销内容组"),
    direction: direction.trim(),
    products: selectedProducts.map((p) => ({ id: p.id, name: p.name, summary: p.summary })),
    channels,
    targets: promptTargets,
    assetNames: availableAssetNames,
    assets: availableGroupAssets.map((a) => ({ id: a.id, name: a.name })),
  }, lang);

  function toggleProduct(pid: string) {
    setSelectedProductIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  }

  function toggleChannel(ch: string) {
    setChannels((prev) => {
      const exists = prev.includes(ch);
      if (exists) {
        setSelectedAccountsByChannel((accPrev) => {
          const next = { ...accPrev };
          delete next[ch];
          return next;
        });
        return prev.filter((c) => c !== ch);
      }
      return [...prev, ch];
    });
  }

  function toggleChannelAccount(ch: string, accId: string) {
    setSelectedAccountsByChannel((prev) => {
      const current = prev[ch] || [];
      const next = current.includes(accId) ? current.filter((id) => id !== accId) : [...current, accId];
      return { ...prev, [ch]: next };
    });
  }

  function addCustomChannel() {
    const val = customChannel.trim();
    if (!val || channels.includes(val)) return;
    setChannels((prev) => [...prev, val]);
    setCustomChannel("");
  }

  async function handleCopyPrompt() {
    try {
      await copy(prompt);
      setMessage(t("✅ 提示词已复制！请发送给已连接 Growmory MCP 的 AI Agent，Agent 将自动完成创作并回填草稿。", "✅ Prompt copied! Please send to your MCP-connected AI Agent."));
    } catch {
      setMessage(t("⚠️ 复制失败，请在下方预览区手动选择文字复制。", "⚠️ Copy failed, please manually select and copy text below."));
    }
  }

  async function handleSubmit(andCopy = false) {
    if (!direction.trim()) {
      setMessage(t("⚠️ 请填写内容方向。", "⚠️ Please fill in content direction."));
      return;
    }
    if (!channels.length) {
      setMessage(t("⚠️ 请至少选择一个推广平台。", "⚠️ Please select at least one channel."));
      return;
    }

    setBusy(true);
    try {
      const hasBoundAccounts = effectiveTargets.some((item) => Boolean(item.accountId));
      const groupPayload: ContentGroup = {
        id: groupId,
        title: title.trim() || direction.trim().slice(0, 30),
        direction: direction.trim(),
        productIds: selectedProductIds,
        channels,
        ...(hasBoundAccounts ? { targets: effectiveTargets } : {}),
        createdAt: initial?.createdAt || now(),
        updatedAt: now(),
      };

      const ok = await save((d) => {
        d.contentGroups = d.contentGroups || [];
        const idx = d.contentGroups.findIndex((g) => g.id === groupId);
        if (idx >= 0) {
          d.contentGroups[idx] = groupPayload;
        } else {
          d.contentGroups.unshift(groupPayload);
        }
      });

      if (ok) {
        if (andCopy) {
          await handleCopyPrompt();
        }
        close();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="marketing-group-dialog"
      aria-labelledby="group-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <div>
          <h2 id="group-dialog-title">
            {isEditing ? t("编辑营销内容组", "Edit Content Group") : t("创建营销内容组", "Create Content Group")}
          </h2>
          <p>
            {isEditing
              ? t("修改营销产品、推广平台与内容方向，可重新生成并复制提示词。", "Edit products, channels, and direction to regenerate prompt.") : t("设定多产品、推广平台与内容方向，一键生成结构化提示词交给外部 Agent，自动按平台回填。", "Define products, channels, and direction to generate prompts for Agent backfill.")}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={t("关闭", "Close")}
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>

      <div className="group-dialog-form">
        {/* 1. 选择营销产品 */}
        <fieldset className="group-field-section">
          <legend>
            <span className="step-num">1</span> {t("选择营销产品（选填，可不选或多选）", "Select Products (Optional)")}
          </legend>
          {data.products.length > 0 && (
            <div className="product-select-toolbar">
              <span className="subtle">
                {selectedProductIds.length
                  ? (lang === "en" ? `${selectedProductIds.length} products selected` : `已选 ${selectedProductIds.length} 个产品`)
                  : t("未选择产品（作为品牌通用或独立营销内容组）", "No product selected (General / Independent)")}
              </span>
              <div className="product-select-quick-actions">
                <button
                  type="button"
                  className="text-button small"
                  onClick={() => setSelectedProductIds(data.products.map((p) => p.id))}
                >
                  {t("全选", "Select All")}
                </button>
                {selectedProductIds.length > 0 && (
                  <button
                    type="button"
                    className="text-button small"
                    onClick={() => setSelectedProductIds([])}
                  >
                    {t("清空", "Clear")}
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="product-checkbox-grid">
            {data.products.map((p) => {
              const checked = selectedProductIds.includes(p.id);
              return (
                <label key={p.id} className={`product-select-card ${checked ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProduct(p.id)}
                  />
                  <div className="product-select-info">
                    <strong>{p.name}</strong>
                    {p.summary && <small>{p.summary}</small>}
                  </div>
                </label>
              );
            })}
          </div>
          {!data.products.length && (
            <p className="notice">{t("工作区暂无产品，将作为通用营销内容组。", "No products in workspace. This will be a general marketing group.")}</p>
          )}
        </fieldset>

        {/* 2. 填写内容方向 */}
        <fieldset className="group-field-section">
          <legend>
            <span className="step-num">2</span> {t("填写内容方向", "Content Direction")}
          </legend>
          <label className="field-group">
            <span className="subtle">{t("内容组标题 / 核心话题（选填）", "Group Title / Core Topic (Optional)")}</span>
            <input
              type="text"
              aria-label={t("内容组标题", "Group Title")}
              placeholder={t("例如：2.0 新版本核心特性推广、黑五限时折扣", "e.g. 2.0 Feature Launch, Black Friday Promo")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field-group">
            <span className="subtle">{t("具体内容方向与诉求（必填）", "Content Direction & Requirements (Required)")}</span>
            <textarea
              rows={4}
              aria-label={t("具体内容方向", "Content Direction")}
              placeholder={t("详细描述文案重点、想要解决的受众痛点、场景故事或切入角度。例如：重点介绍新功能如何帮独立开发者节省时间，强调无缝同步与沉浸式体验，语气真诚且专业。", "Describe the key focus, user pain points, user stories or angles. e.g. How the new feature saves indie developers time...")}
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            />
          </label>
        </fieldset>

        {/* 3. 选择推广平台 */}
        <fieldset className="group-field-section">
          <legend>
            <span className="step-num">3</span> {t("选择推广平台（可多选）", "Select Channels")}
          </legend>
          <div className="channel-section-wrap">
            <div className="channel-group-block">
              <span className="channel-group-title">{t("国内平台", "Domestic Platforms")}</span>
              <div className="channel-options-wrap">
                {defaultDomesticChannels.map((ch) => (
                  <label
                    key={ch}
                    className={`channel-checkbox-pill ${channels.includes(ch) ? "checked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={channels.includes(ch)}
                      onChange={() => toggleChannel(ch)}
                    />
                    <span className="platform-label"><PlatformLogo platform={ch} size={18} />{ch}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="channel-group-block">
              <span className="channel-group-title">
                {t("国外平台", "International Platforms")} <small className="faint">({t("Agent 会生成外文正文 + 中文解释", "Agent generates foreign text + translation")})</small>
              </span>
              <div className="channel-options-wrap">
                {defaultForeignChannels.map((ch) => (
                  <label
                    key={ch}
                    className={`channel-checkbox-pill foreign ${channels.includes(ch) ? "checked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={channels.includes(ch)}
                      onChange={() => toggleChannel(ch)}
                    />
                    <span className="platform-label"><PlatformLogo platform={ch} size={18} />{ch}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="channel-custom-add">
              <input
                type="text"
                placeholder={t("添加其他平台（如 知乎专栏）", "Add other platform")}
                value={customChannel}
                onChange={(e) => setCustomChannel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomChannel();
                  }
                }}
              />
              <button
                type="button"
                className="button secondary small"
                onClick={addCustomChannel}
              >
                {t("添加", "Add")}
              </button>
            </div>

            {channels.some((ch) => accountsForChannel(ch).length > 0) && (
              <div className="group-account-selector">
                <span className="channel-group-title">
                  {t("指定发布账号（可选，同平台可多选）", "Target Accounts (Optional, multi-select)")}
                </span>
                {channels.map((ch) => {
                  const accs = accountsForChannel(ch);
                  if (!accs.length) return null;
                  const chosen = selectedAccountsByChannel[ch] || [];
                  return (
                    <div key={ch} className="group-account-row">
                      <span className="group-account-platform">
                        <PlatformLogo platform={ch} size={14} />
                        {ch}
                      </span>
                      <div className="group-account-pills">
                        {accs.map((acc) => {
                          const checked = chosen.includes(acc.id);
                          const hint = [acc.contentDirection, acc.writingStyle].filter(Boolean).join(" / ");
                          return (
                            <label
                              key={acc.id}
                              className={`channel-checkbox-pill compact ${checked ? "checked" : ""}`}
                              title={hint || undefined}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleChannelAccount(ch, acc.id)}
                              />
                              <span>{acc.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </fieldset>

        {/* 4. 预览与复制提示词 */}
        <fieldset className="group-field-section">
          <legend>
            <span className="step-num">4</span> {t("复制提示词，给到外部 Agent", "Copy Prompt for External Agent")}
          </legend>
          <details className="prompt-preview-details">
            <summary>{t("查看拼合后的完整提示词", "View Combined Full Prompt")}</summary>
            <textarea
              readOnly
              className="prompt-preview-textarea"
              value={prompt}
              onFocus={(e) => e.target.select()}
            />
          </details>
        </fieldset>
      </div>

      {message && <p className="notice" role="alert">{message}</p>}

      <footer>
        {isEditing && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={close}
          >
            {t("取消", "Cancel")}
          </button>
        )}
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void handleCopyPrompt()}
        >
          <Copy size={15} />
          {t("仅复制提示词", "Copy Prompt Only")}
        </button>
        {isEditing && (
          <button
            type="button"
            className="button secondary"
            disabled={busy || !direction.trim() || !channels.length}
            onClick={() => void handleSubmit(false)}
          >
            {t("保存修改", "Save Changes")}
          </button>
        )}
        <button
          type="button"
          className="button primary"
          disabled={busy || !direction.trim() || !channels.length}
          onClick={() => void handleSubmit(true)}
        >
          <Sparkles size={15} />
          {isEditing ? t("保存并复制提示词", "Save & Copy Prompt") : t("保存内容组并复制提示词", "Save & Copy Prompt")}
        </button>
      </footer>
    </dialog>
  );
}

/**
 * 查看已有内容组提示词弹窗
 */
function GroupPromptViewerModal({
  group,
  data,
  copy,
  close,
  onEdit,
}: {
  group: ContentGroup;
  data: Data;
  copy: (s: string) => unknown;
  close: () => void;
  onEdit?: (g: ContentGroup) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const { lang, t } = useI18n();
  const products = data.products.filter((p) => (group.productIds || []).includes(p.id));
  const availableGroupAssets = selectGroupImageAssets(data.assets || [], group.productIds || []);
  const availableAssetNames = availableGroupAssets.map((a) => a.name);
  const socialAccounts = data.socialAnalytics?.accounts || [];
  const promptTargets: MarketingPromptTarget[] = getContentGroupTargets(group).map((target) => {
    const acc = target.accountId ? socialAccounts.find((a) => a.id === target.accountId) : undefined;
    return {
      channel: target.channel,
      ...(acc ? {
        accountId: acc.id,
        accountName: acc.name,
        ...(acc.contentDirection ? { contentDirection: acc.contentDirection } : {}),
        ...(acc.writingStyle ? { writingStyle: acc.writingStyle } : {}),
      } : {}),
    };
  });

  const prompt = marketingGroupPrompt({
    groupId: group.id,
    title: group.title,
    direction: group.direction,
    products: products.map((p) => ({ id: p.id, name: p.name, summary: p.summary })),
    channels: group.channels,
    targets: promptTargets,
    assetNames: availableAssetNames,
    assets: availableGroupAssets.map((a) => ({ id: a.id, name: a.name })),
  }, lang);

  async function handleCopy() {
    try {
      await copy(prompt);
      setMessage(t("✅ 提示词已复制！请发送给已连接 Growmory MCP 的 AI Agent。", "✅ Prompt copied! Send to your MCP-connected AI Agent."));
    } catch {
      setMessage(t("⚠️ 复制失败，请手动选择复制。", "⚠️ Copy failed, please manually select and copy text."));
    }
  }

  return (
    <dialog
      ref={dialog}
      className="marketing-group-dialog"
      aria-labelledby="viewer-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <div>
          <h2 id="viewer-title">{t("营销内容组提示词", "Content Group Prompt")}</h2>
          <p>{group.title || group.direction}</p>
        </div>
        <button type="button" className="icon-button" onClick={close}>
          <X size={20} />
        </button>
      </header>

      <div style={{ padding: "10px 0" }}>
        <textarea
          readOnly
          className="prompt-preview-textarea"
          style={{ height: "300px" }}
          value={prompt}
          onFocus={(e) => e.target.select()}
        />
      </div>

      {message && <p className="notice">{message}</p>}

      <footer>
        {onEdit && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              close();
              onEdit(group);
            }}
          >
            <Pencil size={15} />
            {t("编辑内容组", "Edit Group")}
          </button>
        )}
        <button type="button" className="button secondary" onClick={close}>
          {t("关闭", "Close")}
        </button>
        <button type="button" className="button primary" onClick={() => void handleCopy()}>
          <Copy size={15} />
          {t("复制提示词", "Copy Prompt")}
        </button>
      </footer>
    </dialog>
  );
}

export function MarketingCoverModal({
  open,
  onClose,
  product,
  content,
  onUploadCover,
}: {
  open: boolean;
  onClose: () => void;
  product?: Product;
  content: Content;
  onUploadCover?: (file: File) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const defaultSize = getDefaultCoverSize(content.channel);
  const platformSizes = useMemo(() => getPlatformCoverSizes(content.channel), [content.channel]);
  const [selectedSizeId, setSelectedSizeId] = useState(defaultSize.id);
  const selectedSize = platformSizes.find((s) => s.id === selectedSizeId) || COVER_SIZE_OPTIONS.find((s) => s.id === selectedSizeId) || defaultSize;
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const modalCoverUploadInput = useRef<HTMLInputElement>(null);

  const promptText = coverImagePrompt(
    {
      product: product
        ? {
            id: product.id,
            name: product.name,
            summary: product.summary,
            englishName: product.englishName,
          }
        : undefined,
      content: {
        id: content.id,
        title: content.title,
        body: content.body,
        channel: content.channel,
        explanation: content.explanation,
      },
      size: selectedSize,
      notes,
    },
    lang
  );

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Copy fallback handled */
    }
  };

  if (!open) return null;

  return (
    <div className="marketing-cover-backdrop" onClick={onClose}>
      <div
        className="marketing-cover-modal-card marketing-cover-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cover-modal-title"
      >
        <header className="marketing-cover-modal-header">
          <div className="marketing-cover-header-text">
            <h2 id="cover-modal-title" className="marketing-cover-modal-title">
              <ImagePlus size={20} className="cover-title-icon" />
              <span>{t("制作封面图", "Create Cover Image")}</span>
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("关闭", "Close")}>
            <X size={18} />
          </button>
        </header>

        <div className="marketing-cover-modal-body">
          {/* 目标平台与关联产品元信息 */}
          <div className="marketing-cover-meta-grid">
            <div className="cover-meta-item">
              <span className="cover-meta-label">{t("推广渠道", "Target Channel")}</span>
              <div className="cover-meta-val">
                <PlatformLogo platform={content.channel} size={18} />
                <b>{content.channel || t("未指定", "Unspecified")}</b>
              </div>
            </div>
            {product && (
              <div className="cover-meta-item">
                <span className="cover-meta-label">{t("关联产品", "Product")}</span>
                <div className="cover-meta-val">
                  <ProductIcon product={product} size={18} />
                  <span>{product.name}</span>
                </div>
              </div>
            )}
            <div className="cover-meta-item cover-meta-title-item">
              <span className="cover-meta-label">{t("文章标题", "Article Title")}</span>
              <div className="cover-meta-val cover-title-val" title={content.title}>
                <span>{content.title || t("（暂无标题）", "(No title)")}</span>
              </div>
            </div>
          </div>

          {/* 尺寸规格多选/切换区 */}
          <div className="cover-size-selector-section">
            <div className="cover-size-selector-header">
              <span className="cover-meta-label">
                {content.channel
                  ? t(`针对「${content.channel}」推荐的封面尺寸与比例`, `Recommended Cover Dimensions for "${content.channel}"`)
                  : t("选择封面图尺寸与比例", "Cover Aspect Ratio & Dimensions")}
              </span>
              <span className="cover-selected-size-badge">
                {selectedSize.ratio} · {selectedSize.dimensions}
              </span>
            </div>
            <div className="cover-size-options-grid">
              {platformSizes.map((opt) => {
                const isSelected = opt.id === selectedSize.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`cover-size-btn ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedSizeId(opt.id)}
                  >
                    <div className="cover-size-btn-top">
                      <span className="cover-size-badge">{opt.ratio}</span>
                      <span className="cover-size-label">{lang === "en" ? opt.nameEn : opt.name}</span>
                    </div>
                    <span className="cover-size-desc">{opt.dimensions}</span>
                  </button>
                );
              })}
            </div>
            {/* 封面规格设计指引提示 */}
            <div className="cover-size-guidance-note">
              <span className="cover-guidance-icon">💡</span>
              <span className="cover-guidance-text">
                {lang === "en" ? selectedSize.descEn : selectedSize.desc}
              </span>
            </div>
          </div>

          {/* 封面图设计备注输入 */}
          <div className="cover-notes-field">
            <label htmlFor="cover-notes-input" className="cover-notes-label">
              <span>{t("封面图设计要求与备注（可选）", "Design Requirements & Notes (Optional)")}</span>
            </label>
            <textarea
              id="cover-notes-input"
              className="cover-notes-textarea"
              rows={2}
              placeholder={t(
                "例如：突出限免或价格优势、暗黑质感风格、画面中间放主界面截图、重点强调某句大标题等...",
                "e.g. Emphasize limited-time free tag, dark theme aesthetic, main screenshot in center, highlight specific bold headline..."
              )}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* AI 提示词预览 */}
          <div className="cover-prompt-preview-wrap">
            <div className="cover-prompt-preview-header">
              <span>{t("AI 生成封面图指令预览", "AI Cover Generation Prompt Preview")}</span>
              <span className="cover-prompt-tip">
                {t("粘贴至具备生图能力的 AI（如 ChatGPT、Gemini 等）直接输出封面图", "Paste into image-capable AI (ChatGPT, Gemini, etc.) to generate directly")}
              </span>
            </div>
            <div className="cover-prompt-preview-box">
              <pre>{promptText}</pre>
            </div>
          </div>
        </div>

        <footer className="marketing-cover-modal-footer">
          <input
            ref={modalCoverUploadInput}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={t("上传封面图", "Upload Cover Image")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && onUploadCover) {
                void onUploadCover(file);
              }
              e.target.value = "";
            }}
          />
          <div className="group-dialog-footer-actions">
            <button type="button" className="button secondary" onClick={onClose}>
              {t("关闭", "Close")}
            </button>
            {onUploadCover && (
              <button
                type="button"
                className="button secondary"
                onClick={() => modalCoverUploadInput.current?.click()}
                title={t("上传已有封面图并同步至素材库", "Upload cover image")}
              >
                <Upload size={16} />
                <span>{t("上传封面图", "Upload Cover Image")}</span>
              </button>
            )}
            <button
              type="button"
              className={`button primary cover-copy-btn ${copied ? "copied" : ""}`}
              onClick={() => void handleCopyPrompt()}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? t("生图指令已复制", "Cover prompt copied") : t("复制生图指令", "Copy Generation Prompt")}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * 营销内容编辑页：
 * 1. 简化右边栏内容
 * 2. 如果是国外平台，添加中文解释（MCP返回或用户可编辑）
 */
export function MarketingEditor({
  initial,
  data,
  save,
  appendAssets,
  close,
  copy,
  remove,
}: {
  initial: Content;
  data: Data;
  save: (c: Content, previous?: Content) => Promise<Content | undefined>;
  appendAssets?: (assets: Asset[], folders?: AssetFolder[], isFinal?: boolean) => Promise<boolean | void>;
  close: () => void;
  copy: (s: string) => unknown;
  remove: () => void;
}) {
  const { lang, t } = useI18n();
  const draftKey = "growmory:marketing:" + initial.id;
  const [value, setValue] = useState<Content>(() => {
    try {
      const draft = sessionStorage.getItem(draftKey);
      const saved = draft ? JSON.parse(draft) : null;
      return (saved?.base === JSON.stringify(initial) || (saved?.value?.id === initial.id && !initial.title && !initial.body))
        ? saved.value
        : { ...initial, status: marketingStatus(initial.status), channel: initial.channel || "" };
    } catch {
      return { ...initial, status: marketingStatus(initial.status), channel: initial.channel || "" };
    }
  });

  const savedRecord = useRef(data.contents.some(c => c.id === initial.id) ? initial : undefined);
  const saved = Boolean(savedRecord.current);
  const [busy, setBusy] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<"title" | "body" | "markdown" | "translation" | null>(null);
  const [copyFeedbackNote, setCopyFeedbackNote] = useState("");
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);
  const [uploadingAssets, setUploadingAssets] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [batchCopied, setBatchCopied] = useState(false);
  const [copyingBatch, setCopyingBatch] = useState(false);
  const [isDraggingAsset, setIsDraggingAsset] = useState(false);
  const [sessionAssets, setSessionAssets] = useState<Asset[]>([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [selectedLinkedIds, setSelectedLinkedIds] = useState<string[]>([]);
  const [downloadingLinked, setDownloadingLinked] = useState(false);
  const [lightboxAssetId, setLightboxAssetId] = useState<string | null>(null);
  const [bodyMode, setBodyMode] = useState<"rich" | "markdown">("rich");
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [showRewrite, setShowRewrite] = useState(false);
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const coverUploadInput = useRef<HTMLInputElement>(null);

  async function handleCopy(type: "title" | "body" | "markdown" | "translation", text: string) {
    if (!text) return;
    try {
      await copy(text);
      setCopyFeedbackNote("");
      setCopiedTarget(type);
      setTimeout(() => {
        setCopiedTarget((prev) => (prev === type ? null : prev));
      }, 2000);
    } catch {
      /* Copy feedback handled */
    }
  }
  const dialog = useRef<HTMLDialogElement>(null);
  const allowCloseRef = useRef(false);
  const requestClose = () => {
    allowCloseRef.current = true;
    close();
  };
  const form = useRef<HTMLFormElement>(null);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  const richEditorRef = useRef<MarketingRichEditorHandle>(null);
  const assetUploadInput = useRef<HTMLInputElement>(null);
  const explanationInput = useRef<HTMLTextAreaElement>(null);
  const prevBodyRef = useRef(value.body);
  const prevExplanationRef = useRef(value.explanation || "");

  function safeResizeTextarea(
    input: HTMLTextAreaElement | null,
    minHeight = 0,
    force = false,
    prevText = ""
  ) {
    if (!input) return;

    const currentText = input.value;
    const isUnset = !input.style.height;
    const needsAccurateMeasure =
      force ||
      isUnset ||
      currentText.length < prevText.length ||
      currentText.split("\n").length < prevText.split("\n").length;

    // Fast path: 当文字仅在输入增长且行高未溢出时，直接拓展高度，
    // 避免重置 height="auto" 导致的瞬间高度塌陷与布局重排
    if (!needsAccurateMeasure) {
      if (input.scrollHeight > input.clientHeight) {
        input.style.height = `${Math.max(minHeight, input.scrollHeight)}px`;
      }
      return;
    }

    // 精确测高路径（文字删除缩短、初始加载、窗口缩放或强制刷新）：
    // 1. 记录所有祖先滚动容器（如 dialog、window）的当前滚动位置
    const scrollPositions: { el: HTMLElement; top: number; left: number }[] = [];
    let p = input.parentElement;
    while (p) {
      if (p.scrollTop > 0 || p.scrollLeft > 0 || p === dialog.current) {
        scrollPositions.push({ el: p, top: p.scrollTop, left: p.scrollLeft });
      }
      p = p.parentElement;
    }
    const winTop = window.scrollY || window.pageYOffset;
    const winLeft = window.scrollX || window.pageXOffset;

    // 2. 临时锁定编辑容器的最小高度，防止重置高度测量时 dialog 滚动高度塌陷
    // 从而导致浏览器将 scrollTop 强制归零/被 clamp
    const container = input.closest<HTMLElement>(".marketing-writing") || input.parentElement;
    const prevMinHeight = container?.style.minHeight;
    if (container) {
      container.style.minHeight = `${container.offsetHeight}px`;
    }

    // 3. 计算最新实际内容高度
    input.style.height = "auto";
    const targetHeight = Math.max(minHeight, input.scrollHeight);
    input.style.height = `${targetHeight}px`;

    // 4. 释放编辑容器的临时高度锁定
    if (container) {
      container.style.minHeight = prevMinHeight || "";
    }

    // 5. 同步还原所有滚动容器的位置，彻底消除页面上下跳动
    for (const item of scrollPositions) {
      item.el.scrollTop = item.top;
      item.el.scrollLeft = item.left;
    }
    if (winTop > 0 || winLeft > 0) {
      window.scrollTo(winLeft, winTop);
    }
  }

  function resizeBody(force = false) {
    safeResizeTextarea(bodyInput.current, 240, force, prevBodyRef.current);
    prevBodyRef.current = value.body;
  }

  function resizeExplanation(force = false) {
    safeResizeTextarea(explanationInput.current, 80, force, prevExplanationRef.current);
    prevExplanationRef.current = value.explanation || "";
  }

  useLayoutEffect(() => {
    resizeBody(false);
  }, [value.body]);

  useLayoutEffect(() => {
    resizeExplanation(false);
  }, [value.explanation]);

  useEffect(() => {
    resizeBody(true);
    resizeExplanation(true);
    const onResize = () => {
      resizeBody(true);
      resizeExplanation(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const baseline = useRef(JSON.stringify(initial));
  const dirty = JSON.stringify(value) !== baseline.current;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    try {
      if (dirty)
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ base: baseline.current, value })
        );
      else sessionStorage.removeItem(draftKey);
    } catch {
      setError(t("浏览器无法暂存草稿，请及时保存。", "Browser cannot cache draft, please save promptly."));
    }
  }, [draftKey, value, dirty, initial]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const patch = (next: Partial<Content>) => setValue((v) => ({ ...v, ...next }));

  const selectedProductIds = value.productIds ?? (value.productId ? [value.productId] : []);
  const selectedProducts = data.products.filter(p => selectedProductIds.includes(p.id));
  const selectedRelease = data.releases.find(
    (r) => r.id === value.releaseId && selectedProductIds.includes(r.productId)
  );
  const doc = data.docs.find(
    (d) => d.id === reference && selectedProductIds.includes(d.productId) && d.status === "confirmed"
  );
  const currentGroup = data.contentGroups?.find((g) => g.id === value.groupId);
  const isForeign = isForeignChannel(value.channel) || Boolean(value.explanation);
  const inlineSupported = supportsInlineImages(value.channel);

  const allAssets = useMemo(() => {
    const existingIds = new Set((data.assets || []).map((a) => a.id));
    return [...(data.assets || []), ...sessionAssets.filter((a) => !existingIds.has(a.id))];
  }, [data.assets, sessionAssets]);

  const { linkedAssets, unmatchedNames } = useMemo(
    () => resolveContentAssets(value, allAssets),
    [value, allAssets],
  );
  const bodyAssetRefs = useMemo(
    () => extractBodyAssetReferences(value.body, allAssets),
    [value.body, allAssets],
  );
  const lightboxAsset = lightboxAssetId ? allAssets.find((a) => a.id === lightboxAssetId) ?? null : null;
  const selectedLinkedSet = useMemo(
    () => new Set(selectedLinkedIds.filter((id) => linkedAssets.some((a) => a.id === id))),
    [selectedLinkedIds, linkedAssets],
  );
  const selectedLinkedAssets = useMemo(
    () => linkedAssets.filter((a) => selectedLinkedSet.has(a.id)),
    [linkedAssets, selectedLinkedSet],
  );
  const allLinkedSelected = linkedAssets.length > 0 && selectedLinkedAssets.length === linkedAssets.length;

  const coverAsset = useMemo(() => {
    if (!value.coverAssetId) return null;
    return allAssets.find((a) => a.id === value.coverAssetId) || null;
  }, [value.coverAssetId, allAssets]);

  const coverSpec = useMemo(() => getDefaultCoverSize(value.channel), [value.channel]);

  function linkAssetsById(assetsToLink: Asset[]) {
    if (!assetsToLink.length) return;
    setValue((prev) => {
      const nextIds = [...(prev.assetIds || [])];
      for (const asset of assetsToLink) {
        if (!nextIds.includes(asset.id)) nextIds.push(asset.id);
      }
      return { ...prev, assetIds: nextIds };
    });
  }

  function unlinkAssets(assetsToRemove: Asset[]) {
    if (!assetsToRemove.length) return;
    const removeIds = new Set(assetsToRemove.map((a) => a.id));
    const removeNames = new Set<string>();
    for (const asset of assetsToRemove) {
      if (asset.name?.trim()) removeNames.add(asset.name.trim().toLowerCase());
      if (asset.fileName?.trim()) removeNames.add(asset.fileName.trim().toLowerCase());
    }

    let nextBody = value.body;
    for (const asset of assetsToRemove) {
      const fileUrl = buildAssetFileUrl(asset.id);
      const escapedFileUrl = fileUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      nextBody = nextBody.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escapedFileUrl}\\)\\n?`, "gi"), "");
      if (asset.url && asset.url.length > 20 && !asset.url.startsWith("data:")) {
        const escapedUrl = asset.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        nextBody = nextBody.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escapedUrl}\\)\\n?`, "gi"), "");
      }
    }

    setValue((prev) => ({
      ...prev,
      assetIds: (prev.assetIds || []).filter((id) => !removeIds.has(id)),
      assetNames: (prev.assetNames || []).filter((n) => !removeNames.has(n.trim().toLowerCase())),
      coverAssetId: removeIds.has(prev.coverAssetId || "") ? "" : prev.coverAssetId,
      body: nextBody,
    }));
    setSelectedLinkedIds((prev) => prev.filter((id) => !removeIds.has(id)));
  }

  function toggleLinkedAssetSelection(assetId: string) {
    setSelectedLinkedIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId],
    );
  }

  function toggleSelectAllLinkedAssets() {
    if (allLinkedSelected) {
      setSelectedLinkedIds([]);
    } else {
      setSelectedLinkedIds(linkedAssets.map((a) => a.id));
    }
  }

  async function handleDownloadLinkedAssets(targets: Asset[]) {
    if (!targets.length) return;
    const resolvedTargets = targets.map((asset) => ({
      ...asset,
      url: resolveImageSrc(buildAssetFileUrl(asset.id), allAssets),
    }));
    if (resolvedTargets.length === 1) {
      downloadSingleAsset(resolvedTargets[0]);
      return;
    }
    setDownloadingLinked(true);
    setError("");
    try {
      await downloadAssetsAsZip(resolvedTargets, `growmory-content-assets-${today()}.zip`);
    } catch {
      setError(t("批量下载关联图片失败，请重试。", "Failed to batch download linked images, please retry."));
    } finally {
      setDownloadingLinked(false);
    }
  }

  function unlinkUnmatchedName(name: string) {
    setValue((prev) => ({
      ...prev,
      assetNames: (prev.assetNames || []).filter((n) => n !== name),
    }));
  }

  function insertAssetIntoBody(asset: Asset) {
    linkAssetsById([asset]);
    const src = buildAssetFileUrl(asset.id);
    const alt = (asset.name || asset.fileName || "image").replace(/[\[\]\r\n]/g, " ").trim() || "image";
    if (inlineSupported && bodyMode === "rich" && richEditorRef.current) {
      richEditorRef.current.insertImage(src, alt);
      return;
    }
    const snippet = buildAssetMarkdownSnippet(asset);
    const el = bodyInput.current;
    const start = el?.selectionStart ?? value.body.length;
    const end = el?.selectionEnd ?? value.body.length;
    const { nextBody, nextCursor } = insertMarkdownImageAtCursor(value.body, start, end, snippet);
    patch({ body: nextBody });
    requestAnimationFrame(() => {
      if (bodyInput.current) {
        bodyInput.current.focus();
        bodyInput.current.setSelectionRange(nextCursor, nextCursor);
      }
    });
  }

  async function handleUploadAssetFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter(isImageFile);
    if (!files.length) {
      setError(t("请选择 PNG、JPG、WebP、GIF 或 SVG 图片文件。", "Please choose PNG, JPG, WebP, GIF, or SVG image files."));
      return;
    }
    setUploadingAssets(true);
    setError("");
    try {
      const created: Asset[] = [];
      const timestamp = now();
      for (const file of files) {
        const { dataUrl, width, height } = await readImageFile(file);
        created.push({
          id: uid(),
          name: file.name,
          productId: value.productId || selectedProductIds[0] || "",
          fileName: file.name,
          fileType: file.type || "image/png",
          fileSize: file.size,
          width,
          height,
          url: dataUrl,
          createdAt: timestamp,
          updatedAt: timestamp,
          languages: ["all"],
        });
      }
      setSessionAssets((prev) => [...created, ...prev]);
      linkAssetsById(created);
      if (appendAssets) {
        await appendAssets(created, [], true);
      }
    } catch {
      setError(t("上传图片失败，请重试。", "Failed to upload image, please retry."));
    } finally {
      setUploadingAssets(false);
    }
  }

  async function handleUploadCover(targetFile: FileList | File[] | File) {
    const file = targetFile instanceof File ? targetFile : Array.from(targetFile).find(isImageFile);
    if (!file) {
      setError(t("请选择 PNG、JPG、WebP、GIF 或 SVG 图片文件作为封面图。", "Please choose a valid image file for cover."));
      return;
    }
    setUploadingCover(true);
    setError("");
    try {
      const { dataUrl, width, height } = await readImageFile(file);
      const autoName = generateCoverAssetName(file, value, selectedProducts, allAssets);
      const timestamp = now();
      const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || "png").toLowerCase();

      const newAsset: Asset = {
        id: uid(),
        name: autoName,
        fileName: autoName,
        productId: value.productId || selectedProductIds[0] || "",
        fileType: file.type || `image/${ext}`,
        fileSize: file.size,
        width,
        height,
        url: dataUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
        languages: ["all"],
      };

      setSessionAssets((prev) => [newAsset, ...prev]);
      linkAssetsById([newAsset]);
      patch({ coverAssetId: newAsset.id });

      if (appendAssets) {
        await appendAssets([newAsset], [], true);
      }
      setCopyFeedbackNote(
        t(
          `封面图「${autoName}」已上传并同步保存至素材库`,
          `Cover "${autoName}" uploaded and saved to asset library`,
        ),
      );
      setTimeout(() => setCopyFeedbackNote(""), 3500);
      if (showCoverModal) setShowCoverModal(false);
    } catch {
      setError(t("上传封面图失败，请重试。", "Failed to upload cover image, please retry."));
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleBatchCopyImages(targets: Asset[]) {
    if (!targets.length) return;
    setCopyingBatch(true);
    setError("");
    try {
      if (targets.length === 1) {
        await copyAssetImageToClipboard(targets[0]);
        setBatchCopied(true);
        setCopyFeedbackNote(t("已复制图片到剪贴板", "Image copied to clipboard"));
        setTimeout(() => {
          setBatchCopied(false);
          setCopyFeedbackNote("");
        }, 3000);
        return;
      }
      const res = await copyMultipleAssetsToClipboard(targets, allAssets);
      setBatchCopied(true);
      setCopyFeedbackNote(
        t(
          `已批量复制 ${res.count} 张图片到剪贴板，可直接粘贴到微信公众号 / 知乎等编辑器`,
          `Batch copied ${res.count} images to clipboard for direct paste`,
        ),
      );
      setTimeout(() => {
        setBatchCopied(false);
        setCopyFeedbackNote("");
      }, 3000);
    } catch {
      setError(t("批量复制图片失败，当前浏览器环境可能不支持图片剪贴板写入。", "Batch copy failed, clipboard write may not be supported."));
    } finally {
      setCopyingBatch(false);
    }
  }

  function handleLinkedAssetsDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingAsset(false);
    if (e.dataTransfer.files?.length) {
      void handleUploadAssetFiles(e.dataTransfer.files);
    }
  }

  function handleCoverDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingCover(false);
    if (e.dataTransfer.files?.length) {
      void handleUploadCover(e.dataTransfer.files);
    }
  }

  async function handleCopyRichBody() {
    if (!value.body?.trim()) return;
    try {
      const res = await copyMarketingBodyToClipboard(value.body, {
        assets: allAssets,
        channel: value.channel,
      });
      setCopiedTarget("body");
      if (res.mode === "rich") {
        setCopyFeedbackNote(
          res.imageCount > 0
            ? t(
                `已复制富文本与 ${res.inlinedCount}/${res.imageCount} 张图片，可直接粘贴到公众号 / 知乎 / 掘金富文本`,
                `Copied rich HTML with ${res.inlinedCount}/${res.imageCount} inline images for direct paste`,
              )
            : t("已复制排版正文，可直接粘贴到目标平台", "Copied formatted body for direct paste"),
        );
      } else {
        setCopyFeedbackNote(t("当前环境降级为 Markdown 纯文本复制", "Fell back to Markdown plain text copy"));
      }
      setTimeout(() => {
        setCopiedTarget((prev) => (prev === "body" ? null : prev));
        setCopyFeedbackNote("");
      }, 3200);
    } catch {
      await handleCopy("body", value.body);
    }
  }

  async function handleCopySingleAssetImage(asset: Asset) {
    try {
      await copyAssetImageToClipboard(asset);
      setCopiedAssetId(asset.id);
      setCopyFeedbackNote(t("已复制图片到剪贴板", "Image copied to clipboard"));
      setTimeout(() => {
        setCopiedAssetId((prev) => (prev === asset.id ? null : prev));
        setCopyFeedbackNote("");
      }, 2000);
    } catch {
      setError(t("当前浏览器不支持直接复制图片文件，请在查看弹窗中右键复制图片。", "Clipboard image copy failed; please open preview to save or copy."));
    }
  }

  async function persist(status = value.status) {
    if (!form.current?.reportValidity()) return;
    if (!value.channel) {
      setError(t("请选择发布渠道", "Please select a channel"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = { ...value, status };
      const record = await save(next, savedRecord.current);
      if (record) {
        savedRecord.current = record;
        baseline.current = JSON.stringify(record);
        setValue(record);
        try {
          sessionStorage.removeItem(draftKey);
        } catch {
          /* Saved data remains available. */
        }
      } else {
        setError(t("保存未完成，请核对提示后重试，当前文案已保留。", "Save incomplete, please verify prompts and retry."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (<>
    <dialog
      ref={dialog}
      className="marketing-editor"
      aria-labelledby="marketing-editor-title"
      {...({ closedby: "none" } as Record<string, string>)}
      onCancel={(e) => {
        e.preventDefault();
        if (lightboxAssetId) {
          setLightboxAssetId(null);
          return;
        }
        if (showCoverModal) {
          setShowCoverModal(false);
          return;
        }
        // 营销内容详情页按 ESC 不退出当前编辑页
      }}
      onClose={() => {
        if (!allowCloseRef.current && dialog.current?.isConnected && !dialog.current.open) {
          dialog.current.showModal();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          if (lightboxAssetId) {
            setLightboxAssetId(null);
          } else if (showCoverModal) {
            setShowCoverModal(false);
          }
        }
      }}
    >
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          void persist();
        }}
      >
        <header>
          <div className="marketing-editor-header-left">
            <button
              type="button"
              className="text-button editor-back-btn"
              disabled={busy}
              onClick={requestClose}
            >
              {t("← 营销内容", "← Marketing Content")}
            </button>
            <div className="marketing-editor-title-row">
              <h1 id="marketing-editor-title">
                {saved ? t("营销内容", "Marketing Content") : t("手动创建营销内容", "Create Marketing Content")}
              </h1>
              <span className={`badge ${marketingStatus(value.status)}`}>
                {t(labels[marketingStatus(value.status)])}
              </span>
            </div>
            <div className="marketing-editor-header-meta">
              {isAiContent(value) && (
                <span className="editor-badge ai-badge" title={t("AI 生成文案", "AI Generated Copy")}>
                  <Sparkles size={13} />
                  <span>{t("AI 生成", "AI Generated")}</span>
                </span>
              )}
              {selectedProducts.map(currentProduct => (
                <span key={currentProduct.id} className="editor-badge product-badge" title={lang === "en" ? `Product: ${currentProduct.name}` : `产品：${currentProduct.name}`}>
                  <ProductIcon product={currentProduct} size={16} />
                  <span>{currentProduct.name}</span>
                </span>
              ))}
              {value.channel && (
                <span className="editor-badge channel-badge" title={lang === "en" ? `Channel: ${platformName(value.channel)}` : `发布渠道：${platformName(value.channel)}`}>
                  <PlatformLogo platform={value.channel} size={16} />
                  <span>{platformName(value.channel)}</span>
                </span>
              )}
            </div>
          </div>
          <div className="marketing-editor-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy || !saved || dirty}
              title={!saved || dirty ? t("请先保存文章", "Save the article first") : undefined}
              onClick={() => setShowRewrite(true)}
            >
              <Sparkles size={15} />
              {t("AI 重写", "AI Rewrite")}
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? t("正在保存…", "Saving...") : t("保存", "Save")}
            </button>
            <button
              type="button"
              className="button secondary"
              aria-label={t("关闭营销编辑", "Close marketing editor")}
              disabled={busy}
              onClick={requestClose}
            >
              <X size={15} />
              {t("关闭", "Close")}
            </button>
          </div>
        </header>

        {error && <p role="alert" className="notice">{error}</p>}

        <div className="marketing-editor-layout">
          {/* 左侧主编辑区 */}
          <section className="marketing-writing">
            <div className="marketing-title-wrapper">
              <input
                aria-label={t("营销标题", "Article Title")}
                placeholder={t("文章标题", "Article Title")}
                required
                disabled={busy}
                value={value.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
              <span className="marketing-title-counter" title={t("标题字数", "Title Count")}>
                {value.title.length} {lang === "en" ? "chars" : "字"}
              </span>
            </div>

            {value.channel.trim().toLowerCase() === "reddit" && (
              <RedditCommunities key={value.id} communities={value.redditCommunities} />
            )}

            {/* 国外平台专属：中文解释（全文翻译，由 MCP 返回或用户编辑） */}
            {isForeign && (
              <div className="foreign-explanation-card">
                <div className="foreign-explanation-header">
                  <span className="foreign-badge-lead">
                    <Globe size={13} /> {t("国外平台 · 中文全文翻译", "International Platform · Translation")}
                  </span>
                  <small className="faint">
                    {t("仅国外平台提供。由 Agent 回填整篇文案的完整中文对照翻译（包含标题与正文翻译），方便直接审核。", "Available for overseas platforms. Agent backfills translation for review.")}
                  </small>
                  {value.explanation && (
                    <button
                      type="button"
                      className={`text-button small copy-btn ${copiedTarget === "translation" ? "copied" : ""}`}
                      onClick={() => void handleCopy("translation", value.explanation || "")}
                    >
                      {copiedTarget === "translation" ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                      <span>{copiedTarget === "translation" ? t("翻译已复制", "Translation Copied") : t("复制翻译", "Copy Translation")}</span>
                    </button>
                  )}
                </div>
                <textarea
                  ref={explanationInput}
                  aria-label={t("国外平台中文解释", "Translation")}
                  className="foreign-explanation-textarea"
                  placeholder={t("在此输入或查看此篇海外营销内容的完整中文翻译（含标题与逐段正文翻译）...", "Enter or view translation here...")}
                  disabled={busy}
                  value={value.explanation || ""}
                  onChange={(e) => patch({ explanation: e.target.value })}
                />
              </div>
            )}

            {/* 封面图模块：位于标题下方、关联素材上方，集中提供封面图展示、上传与制作 */}
            <div className="marketing-cover-module">
              <input
                ref={coverUploadInput}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label={t("上传封面图", "Upload Cover Image")}
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void handleUploadCover(e.target.files[0]);
                  }
                  e.target.value = "";
                }}
              />
              <div className="marketing-cover-module-header">
                <div className="marketing-cover-module-title">
                  <ImagePlus size={14} />
                  <span>{t("封面图", "Cover Image")}</span>
                  {coverAsset ? (
                    <span className="cover-module-badge configured">{t("已设置", "Configured")}</span>
                  ) : (
                    <span className="cover-module-badge unset">{t("未设置", "Not Set")}</span>
                  )}
                </div>
                <div className="marketing-cover-module-toolbar">
                  <button
                    type="button"
                    className="button secondary small cover-upload-btn"
                    onClick={() => coverUploadInput.current?.click()}
                    disabled={busy || uploadingCover}
                    title={t("上传封面图并同步保存至素材库（自动命名）", "Upload cover image and sync to asset library")}
                  >
                    <Upload size={13} />
                    <span>{uploadingCover ? t("上传中...", "Uploading...") : coverAsset ? t("更换封面", "Replace") : t("上传封面图", "Upload Cover")}</span>
                  </button>
                  <button
                    type="button"
                    className="button secondary small cover-btn"
                    onClick={() => setShowCoverModal(true)}
                    disabled={busy}
                    title={t("制作封面图", "Create Cover Image")}
                  >
                    <Sparkles size={13} />
                    <span>{t("制作封面图", "Create Cover Image")}</span>
                  </button>
                  {coverAsset && (
                    <button
                      type="button"
                      className="button secondary small danger"
                      disabled={busy}
                      onClick={() => patch({ coverAssetId: "" })}
                      title={t("移除封面图设置（不会从素材库删除文件）", "Remove cover")}
                    >
                      <X size={13} />
                      <span>{t("移除封面", "Remove")}</span>
                    </button>
                  )}
                </div>
              </div>

              {coverAsset ? (
                <div className="marketing-cover-card">
                  <button
                    type="button"
                    className="marketing-cover-thumb"
                    onClick={() => setLightboxAssetId(coverAsset.id)}
                    title={t("点击放大查看封面图", "Click to preview cover image")}
                  >
                    <img src={resolveImageSrc(buildAssetFileUrl(coverAsset.id), allAssets)} alt={coverAsset.name} />
                    <span className="marketing-cover-badge">{t("文章封面图", "Cover")}</span>
                  </button>
                  <div className="marketing-cover-info">
                    <div className="marketing-cover-header-row">
                      <span className="marketing-cover-tag">{t("封面图", "Cover")}</span>
                      <strong className="marketing-cover-name" title={coverAsset.name}>
                        {coverAsset.name}
                      </strong>
                    </div>
                    <span className="marketing-cover-meta">
                      {coverAsset.width}×{coverAsset.height} · {formatBytes(coverAsset.fileSize)} · {t("已同步至素材库", "Saved in Library")}
                    </span>
                  </div>
                  <div className="marketing-cover-actions">
                    <button
                      type="button"
                      className="text-button small"
                      disabled={busy}
                      onClick={() => void handleCopySingleAssetImage(coverAsset)}
                      title={t("复制封面图到剪贴板", "Copy cover image to clipboard")}
                    >
                      {copiedAssetId === coverAsset.id ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                      <span>{copiedAssetId === coverAsset.id ? t("已复制", "Copied") : t("复制封面", "Copy Cover")}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`marketing-cover-placeholder ${isDraggingCover ? "dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingCover(true);
                  }}
                  onDragLeave={() => setIsDraggingCover(false)}
                  onDrop={handleCoverDrop}
                >
                  <div
                    className="cover-placeholder-frame"
                    onClick={() => coverUploadInput.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        coverUploadInput.current?.click();
                      }
                    }}
                    title={t("点击上传封面图片", "Click to upload cover image")}
                  >
                    <div className="cover-placeholder-art">
                      <Image size={22} className="cover-placeholder-icon" />
                      <span className="cover-placeholder-ratio">{coverSpec.ratio}</span>
                    </div>
                    <span className="cover-placeholder-dim">{coverSpec.dimensions.replace("px", "").trim()}</span>
                  </div>

                  <div className="cover-placeholder-content">
                    <div className="cover-placeholder-title-row">
                      <span className="cover-placeholder-title">{t("文章封面展位", "Article Cover Slot")}</span>
                      <span className="cover-placeholder-spec-tag">
                        {lang === "en" ? coverSpec.nameEn : coverSpec.name}
                      </span>
                    </div>
                    <p className="cover-placeholder-hint">
                      {t(
                        "暂未设置封面。点击或拖拽图片至此处上传（自动命名并同步至素材库），或点击「制作封面图」使用 AI 智能设计。",
                        "No cover image yet. Click or drop an image here to upload (synced to library), or use AI to craft one.",
                      )}
                    </p>
                    <div className="cover-placeholder-actions">
                      <button
                        type="button"
                        className="button secondary small cover-action-upload"
                        onClick={() => coverUploadInput.current?.click()}
                        disabled={busy || uploadingCover}
                        title={t("上传封面图并同步保存至素材库（自动命名）", "Upload cover image and sync to asset library")}
                      >
                        <Upload size={13} />
                        <span>{uploadingCover ? t("上传中...", "Uploading...") : t("上传封面图", "Upload Cover")}</span>
                      </button>
                      <button
                        type="button"
                        className="button secondary small cover-action-ai"
                        onClick={() => setShowCoverModal(true)}
                        disabled={busy}
                        title={t("制作封面图", "Create Cover Image")}
                      >
                        <Sparkles size={13} />
                        <span>{t("制作封面图", "Create Cover Image")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 关联素材模块：查看、添加（素材库/上传）、移除与插入正文 */}
            <div
              className={`marketing-linked-assets ${isDraggingAsset ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingAsset(true);
              }}
              onDragLeave={() => setIsDraggingAsset(false)}
              onDrop={handleLinkedAssetsDrop}
            >
              <div className="marketing-linked-assets-header">
                <div className="marketing-linked-assets-title">
                  <Images size={14} />
                  <span>{t("关联素材", "Linked Assets")}</span>
                  <span className="linked-assets-count">{linkedAssets.length}</span>
                  {inlineSupported && (
                    <span className="linked-assets-inline-hint">
                      {t("当前平台支持正文插图与带图复制", "Inline images & rich copy supported")}
                    </span>
                  )}
                </div>
                <div className="marketing-linked-assets-toolbar">
                  <input
                    ref={assetUploadInput}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    aria-label={t("上传关联图片", "Upload linked images")}
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        void handleUploadAssetFiles(e.target.files);
                      }
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={busy || uploadingAssets}
                    onClick={() => setShowAssetPicker(true)}
                  >
                    <Plus size={13} />
                    <span>{t("从素材库添加", "Pick from Library")}</span>
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={busy || uploadingAssets}
                    onClick={() => assetUploadInput.current?.click()}
                  >
                    <Upload size={13} />
                    <span>{uploadingAssets ? t("上传中...", "Uploading...") : t("上传图片", "Upload Image")}</span>
                  </button>
                </div>
              </div>

              {linkedAssets.length === 0 && unmatchedNames.length === 0 ? (
                <div className="marketing-linked-assets-empty">
                  {t(
                    "暂无关联素材。可从素材库选择、点击上传或直接拖放图片到此处",
                    "No linked assets yet. Pick from Asset Library, upload, or drag & drop images here",
                  )}
                  {inlineSupported
                    ? t("；添加后可直接插入文章正文并在复制时自动带图。", "; insert directly into the body and copy with images intact.")
                    : "。"}
                </div>
              ) : (
                <>
                  {linkedAssets.length > 0 && (
                    <>
                      <div className="marketing-linked-batchbar">
                        <label className="linked-select-all-label">
                          <input
                            type="checkbox"
                            checked={allLinkedSelected}
                            onChange={toggleSelectAllLinkedAssets}
                            aria-label={t("全选关联素材", "Select all linked assets")}
                          />
                          <span>
                            {allLinkedSelected ? t("取消全选", "Deselect All") : t("全选", "Select All")}
                          </span>
                          <span className="linked-selected-summary">
                            {selectedLinkedAssets.length > 0
                              ? t(`已选 ${selectedLinkedAssets.length} / ${linkedAssets.length}`, `${selectedLinkedAssets.length}/${linkedAssets.length} selected`)
                              : t("勾选图片可批量移出或下载", "Select images to batch remove or download")}
                          </span>
                        </label>
                        <div className="marketing-linked-batch-actions">
                          <button
                            type="button"
                            className="button secondary small"
                            disabled={busy || downloadingLinked || selectedLinkedAssets.length === 0}
                            onClick={() => void handleDownloadLinkedAssets(selectedLinkedAssets)}
                            title={t("下载所选图片（多张自动打包为 ZIP）", "Download selected images (packaged as ZIP when multiple)")}
                          >
                            <Download size={12} />
                            <span>
                              {downloadingLinked
                                ? t("打包中...", "Packaging...")
                                : selectedLinkedAssets.length > 0
                                  ? t(`批量下载 (${selectedLinkedAssets.length})`, `Download (${selectedLinkedAssets.length})`)
                                  : t("批量下载", "Download")}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="button secondary small batch-copy-btn"
                            disabled={busy || copyingBatch || selectedLinkedAssets.length === 0}
                            onClick={() => void handleBatchCopyImages(selectedLinkedAssets)}
                            title={t("批量复制所选图片到剪贴板（可直接粘贴到微信公众号/知乎等编辑器）", "Batch copy selected images to clipboard")}
                          >
                            {batchCopied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                            <span>
                              {batchCopied
                                ? t("已批量复制", "Copied")
                                : copyingBatch
                                  ? t("复制中...", "Copying...")
                                  : selectedLinkedAssets.length > 0
                                    ? t(`批量复制 (${selectedLinkedAssets.length})`, `Batch Copy (${selectedLinkedAssets.length})`)
                                    : t("批量复制", "Batch Copy")}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="button secondary small batch-unlink-btn"
                            disabled={busy || selectedLinkedAssets.length === 0}
                            onClick={() => unlinkAssets(selectedLinkedAssets)}
                            title={t("从当前文章批量移出所选图片（不会删除素材库原文件）", "Remove selected images from this article")}
                          >
                            <Trash2 size={12} />
                            <span>
                              {selectedLinkedAssets.length > 0
                                ? t(`批量移出 (${selectedLinkedAssets.length})`, `Remove (${selectedLinkedAssets.length})`)
                                : t("批量移出", "Remove")}
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="linked-assets-grid">
                        {linkedAssets.map((asset) => {
                          const imgSrc = resolveImageSrc(buildAssetFileUrl(asset.id), allAssets);
                          const inBody = bodyAssetRefs.usedAssetIds.has(asset.id);
                          const isSelected = selectedLinkedSet.has(asset.id);
                          return (
                            <div key={asset.id} className={`linked-asset-card ${isSelected ? "selected" : ""}`}>
                              <div className="linked-asset-media">
                                <button
                                  type="button"
                                  className="linked-asset-thumb"
                                  onClick={() => setLightboxAssetId(asset.id)}
                                  title={t("点击查看大图", "Click to inspect image")}
                                >
                                  <img src={imgSrc} alt={asset.name} loading="lazy" />
                                  {inBody && (
                                    <span className="linked-asset-inbody-badge">
                                      {t("已插入正文", "In Body")}
                                    </span>
                                  )}
                                </button>
                                <input
                                  type="checkbox"
                                  className="linked-asset-checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleLinkedAssetSelection(asset.id)}
                                  aria-label={t(`选择关联素材 ${asset.name}`, `Select linked asset ${asset.name}`)}
                                />
                              </div>
                              <div className="linked-asset-info">
                                <span className="linked-asset-name" title={asset.name}>
                                  {asset.name}
                                </span>
                                <span className="linked-asset-dims">
                                  {asset.width}×{asset.height}
                                </span>
                              </div>
                              <div className="linked-asset-actions">
                                {inlineSupported && (
                                  <button
                                    type="button"
                                    className="text-button small primary-action"
                                    disabled={busy}
                                    onClick={() => insertAssetIntoBody(asset)}
                                    title={t("将此图片插入正文当前光标位置", "Insert image into body at cursor")}
                                  >
                                    <ImagePlus size={12} />
                                    <span>{t("插入正文", "Insert")}</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="text-button small"
                                  disabled={busy}
                                  onClick={() => void handleCopySingleAssetImage(asset)}
                                  title={t("复制图片到剪贴板", "Copy image to clipboard")}
                                >
                                  {copiedAssetId === asset.id ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                                  <span>{copiedAssetId === asset.id ? t("已复制", "Copied") : t("复制图", "Copy")}</span>
                                </button>
                                <button
                                  type="button"
                                  className="text-button small"
                                  disabled={busy}
                                  onClick={() => void handleDownloadLinkedAssets([asset])}
                                  aria-label={t(`下载关联素材 ${asset.name}`, `Download linked asset ${asset.name}`)}
                                  title={t("下载图片", "Download image")}
                                >
                                  <Download size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="text-button small"
                                  onClick={() => setLightboxAssetId(asset.id)}
                                  title={t("查看大图", "Preview")}
                                >
                                  <Eye size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="text-button small danger"
                                  disabled={busy}
                                  onClick={() => unlinkAssets([asset])}
                                  aria-label={t(`移除关联素材 ${asset.name}`, `Remove linked asset ${asset.name}`)}
                                  title={t("移出关联（不会从素材库删除原文件）", "Unlink from this article")}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {unmatchedNames.length > 0 && (
                    <div className="linked-unmatched-row">
                      <span className="linked-unmatched-label">{t("待匹配配图建议：", "Suggested asset names:")}</span>
                      {unmatchedNames.map((name) => (
                        <span key={name} className="linked-unmatched-chip">
                          <span>{name}</span>
                          <button
                            type="button"
                            onClick={() => unlinkUnmatchedName(name)}
                            disabled={busy}
                            aria-label={t(`移除建议配图 ${name}`, `Remove suggestion ${name}`)}
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {inlineSupported && (
              <div className="marketing-body-modebar">
                <div className="marketing-body-modetabs" role="tablist" aria-label={t("正文编辑模式", "Body Editor Mode")}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={bodyMode === "rich"}
                    className={`mode-tab ${bodyMode === "rich" ? "active" : ""}`}
                    onClick={() => setBodyMode("rich")}
                  >
                    <FileText size={13} />
                    <span>{t("图文排版", "Visual Rich Text")}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={bodyMode === "markdown"}
                    className={`mode-tab ${bodyMode === "markdown" ? "active" : ""}`}
                    onClick={() => {
                      setBodyMode("markdown");
                      requestAnimationFrame(() => resizeBody(true));
                    }}
                  >
                    <FileCode2 size={13} />
                    <span>Markdown</span>
                  </button>
                </div>
                <span className="marketing-body-mode-tip">
                  {t(
                    "公众号 / 知乎 / B站 / Medium / 掘金富文本请用「复制正文（含图片）」；掘金 Markdown 模式可点「复制 Markdown」后配合「复制图」粘贴。",
                    "Use 'Copy Body + Images' to paste directly into WeChat / Zhihu / Juejin Rich Text / Medium.",
                  )}
                </span>
              </div>
            )}

            {inlineSupported && bodyMode === "rich" ? (
              <MarketingRichEditor
                ref={richEditorRef}
                value={value.body}
                onChange={(nextBody) => patch({ body: nextBody })}
                assets={allAssets}
                disabled={busy}
                onOpenAssetPicker={() => setShowAssetPicker(true)}
              />
            ) : (
              <textarea
                ref={bodyInput}
                aria-label={t("营销正文", "Article Body")}
                placeholder={t("文章正文（支持 Markdown）", "Article body (Markdown supported)")}
                disabled={busy}
                value={value.body}
                onChange={(e) => patch({ body: e.target.value })}
              />
            )}

            <div className="marketing-writing-tools">
              <div className="marketing-copy-btn-group">
                <button
                  type="button"
                  className={`button secondary copy-btn ${copiedTarget === "title" ? "copied" : ""}`}
                  onClick={() => void handleCopy("title", value.title)}
                  disabled={busy || !value.title?.trim()}
                  title={t("复制标题", "Copy Title")}
                >
                  {copiedTarget === "title" ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                  <span>{copiedTarget === "title" ? t("标题已复制", "Title Copied") : t("复制标题", "Copy Title")}</span>
                </button>
                {inlineSupported ? (
                  <>
                    <button
                      type="button"
                      className={`button secondary copy-btn rich-copy-btn ${copiedTarget === "body" ? "copied" : ""}`}
                      onClick={() => void handleCopyRichBody()}
                      disabled={busy || !value.body?.trim()}
                      title={t("将图文正文转为带内嵌图片的富文本复制，可直接粘贴至公众号/知乎/掘金等平台", "Copy rendered HTML with embedded images for direct paste")}
                    >
                      {copiedTarget === "body" ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                      <span>{copiedTarget === "body" ? t("已复制图文正文", "Rich Body Copied") : t("复制正文（含图片）", "Copy Body + Images")}</span>
                    </button>
                    <button
                      type="button"
                      className={`button secondary copy-btn ${copiedTarget === "markdown" ? "copied" : ""}`}
                      onClick={() => void handleCopy("markdown", value.body)}
                      disabled={busy || !value.body?.trim()}
                      title={t("仅复制 Markdown 源码", "Copy raw Markdown source")}
                    >
                      {copiedTarget === "markdown" ? <Check size={14} color="#16a34a" /> : <FileCode2 size={14} />}
                      <span>{copiedTarget === "markdown" ? t("Markdown 已复制", "Markdown Copied") : t("复制 Markdown", "Copy Markdown")}</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={`button secondary copy-btn ${copiedTarget === "body" ? "copied" : ""}`}
                    onClick={() => void handleCopy("body", value.body)}
                    disabled={busy || !value.body?.trim()}
                    title={t("复制正文", "Copy Body")}
                  >
                    {copiedTarget === "body" ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                    <span>{copiedTarget === "body" ? t("正文已复制", "Body Copied") : t("复制正文", "Copy Body")}</span>
                  </button>
                )}
              </div>
              <div className="marketing-char-counts">
                <span className="char-count-item">
                  <span className="char-count-label">{t("标题", "Title")}:</span> <b>{value.title.length}</b> {lang === "en" ? "chars" : "字"}
                </span>
                <span className="char-count-sep">·</span>
                <span className="char-count-item">
                  <span className="char-count-label">{t("正文", "Body")}:</span> <b>{value.body.length}</b> {lang === "en" ? "chars" : "字"}
                </span>
                {inlineSupported && (
                  <>
                    <span className="char-count-sep">·</span>
                    <span className="char-count-item">
                      <span className="char-count-label">{t("插图", "Images")}:</span> <b>{bodyAssetRefs.refs.length}</b>
                    </span>
                  </>
                )}
              </div>
            </div>
            {copyFeedbackNote && <div className="marketing-copy-feedback">{copyFeedbackNote}</div>}
          </section>

          {/* 右侧边栏：简化且结构清晰 */}
          <aside className="marketing-properties simplified">
            <h2>{t("发布属性", "Publishing Attributes")}</h2>

            {/* 1. 基础元属性卡片 */}
            <div className="property-field-group">
              <fieldset className="marketing-product-options">
                <legend>{t("所属产品", "Products")}</legend>
                <div className="marketing-product-pills">
                  {data.products.map(p => {
                    const selected = selectedProductIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="marketing-product-pill"
                        aria-pressed={selected}
                        title={p.name}
                        disabled={busy}
                        onClick={() => {
                          const ids = selected ? selectedProductIds.filter(id => id !== p.id) : [...selectedProductIds, p.id];
                          patch({
                            productIds: ids,
                            productId: ids[0] || "",
                            releaseId: selectedRelease && ids.includes(selectedRelease.productId) ? value.releaseId : "",
                          });
                          if (doc && !ids.includes(doc.productId)) setReference("");
                        }}
                      >
                        <ProductIcon product={p} size={20} />
                        <span>{p.name.split(/\s[-–—]\s/)[0]}</span>
                        {selected && <Check size={13} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label>
                <span>{t("发布渠道", "Channel")}</span>
                <div className="select-with-icon-wrapper">
                  {value.channel && (
                    <div className="select-leading-icon">
                      <PlatformLogo platform={value.channel} size={18} />
                    </div>
                  )}
                  <select
                    disabled={busy}
                    aria-label={t("发布渠道", "Channel")}
                    value={value.channel ? (platformName(value.channel) || value.channel) : ""}
                    onChange={(e) => {
                      const nextChannel = e.target.value;
                      const nextPlatformId = findPlatform(nextChannel)?.id;
                      const currentAcc = (data.socialAnalytics?.accounts || []).find((a) => a.id === value.accountId);
                      const keepAccount = currentAcc && nextPlatformId && currentAcc.platform === nextPlatformId;
                      patch({ channel: nextChannel, ...(value.accountId && !keepAccount ? { accountId: "" } : {}) });
                    }}
                  >
                    <option value="">{t("请选择发布渠道", "Select Channel")}</option>
                    {channelOptions(value.channel ? [value.channel] : [])
                      .filter((c) => !isPersonalSiteChannel(c))
                      .map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                  </select>
                </div>
              </label>

              {(() => {
                const pid = findPlatform(value.channel || "")?.id;
                const matchingAccounts = pid ? (data.socialAnalytics?.accounts || []).filter((a) => a.platform === pid) : [];
                if (!matchingAccounts.length && !value.accountId) return null;
                return (
                  <label>
                    <span>{t("发布账号", "Publishing Account")}</span>
                    <select
                      disabled={busy}
                      aria-label={t("发布账号", "Publishing Account")}
                      value={value.accountId || ""}
                      onChange={(e) => patch({ accountId: e.target.value || undefined })}
                    >
                      <option value="">{t("不指定账号（仅按平台）", "No specific account (platform only)")}</option>
                      {matchingAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </label>
                );
              })()}

              {currentGroup && (
                <div className="group-info-pill">
                  <span className="subtle">{t("所属内容组：", "Content Group: ")}</span>
                  <strong>{currentGroup.title || currentGroup.direction}</strong>
                </div>
              )}

              {/* 2. 文章状态：可以直接点击修改 */}
              <div className="status-selection-group">
                <span>{t("文章状态", "Status")}</span>
                <div
                  className="segmented marketing-status-switch"
                  role="group"
                  aria-label={t("文章状态", "Status")}
                >
                  {(["draft", "ready", "published"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`status-btn-${s} ${marketingStatus(value.status) === s ? "active" : ""}`}
                      disabled={busy}
                      onClick={() => {
                        if (s === "ready" && (!value.body.trim() || !value.channel)) {
                          setError(t("请先填写正文并选择渠道，再标记待发布。", "Please fill body and choose channel before marking ready."));
                          return;
                        }
                        if (s === "published") {
                          patch({
                            status: "published",
                            publishedAt: value.publishedAt || today(),
                          });
                        } else {
                          patch({ status: s });
                        }
                      }}
                    >
                      {t(labels[s])}
                    </button>
                  ))}
                </div>
              </div>

              {marketingStatus(value.status) === "published" && (
                <fieldset className="marketing-publication publication-fields-box">
                  <legend>{t("实际发布记录", "Publishing Record")}</legend>
                  <label>
                    <span>{t("实际发布日期", "Publish Date")}</span>
                    <input
                      type="date"
                      aria-label={t("实际发布日期", "Publish Date")}
                      value={value.publishedAt || ""}
                      onChange={(e) => patch({ publishedAt: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>{t("发布链接（可选）", "Publish URL (Optional)")}</span>
                    <input
                      type="url"
                      value={value.url || ""}
                      onChange={(e) => patch({ url: e.target.value })}
                      placeholder="https://"
                    />
                  </label>
                  {value.url && (
                    <a
                      href={value.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-button"
                      style={{ marginTop: 4 }}
                    >
                      {t("打开链接", "Open Link")} <ExternalLink size={12} />
                    </a>
                  )}
                </fieldset>
              )}
            </div>

            {/* 内容标签选择：精简为限免、优惠 */}
            <div className="property-section-block">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <h3 className="property-section-title" style={{ margin: 0 }}>{t("内容标签", "Content Tags")}</h3>
                <span className="fine-print">{t("用于数据分析关键节点标记", "For analytics milestone tracking")}</span>
              </div>
              <div className="marketing-tag-picker" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {MARKETING_TAG_OPTIONS.map((tag) => {
                  const currentTags = value.tags || [];
                  const active = currentTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={`tag-pill ${active ? "active" : ""}`}
                      title={t(tag.hint)}
                      disabled={busy}
                      onClick={() => {
                        const nextTags = active
                          ? currentTags.filter((t) => t !== tag.id)
                          : [...currentTags, tag.id];
                        patch({ tags: nextTags });
                      }}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 14,
                        fontSize: 12,
                        border: active ? `1.5px solid ${tag.color}` : "1px solid #cbd5e1",
                        background: active ? `${tag.color}18` : "#fff",
                        color: active ? tag.color : "#475569",
                        fontWeight: active ? 700 : 500,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>{active ? "✓" : "+"}</span>
                      <span>{t(tag.label)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. 关联版本与资料：不要有收起展开，默认都展开 */}
            <div className="property-section-block">
              <h3 className="property-section-title">{t("关联版本与参考资料", "Associated Release & Docs")}</h3>
              <div className="property-section-content">
                <label>
                  <span>{t("关联版本", "Associated Release")}</span>
                  <select
                    disabled={busy}
                    value={value.releaseId || ""}
                    onChange={(e) => patch({ releaseId: e.target.value })}
                  >
                    <option value="">{t("独立内容", "Independent Content")}</option>
                    {data.releases
                      .filter((r) => selectedProductIds.includes(r.productId))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {selectedProducts.find(p => p.id === r.productId)?.name.split(/\s[-–—]\s/)[0]} · {r.version}
                        </option>
                      ))}
                  </select>
                </label>

                {selectedRelease && (
                  <div className="marketing-reference-compact">
                    <b>{t("版本", "v")} {selectedRelease.version}</b>
                    <p>{selectedRelease.changes}</p>
                  </div>
                )}

                <label>
                  <span>{t("产品资料参考", "Product Doc Reference")}</span>
                  <select
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  >
                    <option value="">{t("选择参考资料", "Select reference doc")}</option>
                    {data.docs
                      .filter(
                        (d) =>
                          selectedProductIds.includes(d.productId) && d.status === "confirmed"
                      )
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                  </select>
                </label>

                {doc && (
                  <div className="marketing-reference-compact">
                    <p>{doc.body}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 4. 底部操作按钮 */}
            <div className="marketing-state-actions simplified">
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  const next: Content = {
                    ...value,
                    sourcePromotionId: undefined,
                    id: uid(),
                    title: value.title ? `${value.title} ${t("（副本）", "(Copy)")}` : "",
                    status: "draft",
                    date: "",
                    publishedAt: "",
                    url: "",
                    createdAt: now(),
                    isAi: isAiContent(value),
                  };
                  if (!form.current?.reportValidity()) return;
                  if (
                    dirty &&
                    !window.confirm(t("当前修改保留在本地草稿中，继续复制为新草稿？", "Keep changes in local draft and duplicate as new draft?"))
                  )
                    return;
                  setBusy(true);
                  void save(next)
                    .then((ok) => {
                      if (ok) requestClose();
                      else setError(t("复制失败，请重试。", "Copy failed, please retry."));
                    })
                    .finally(() => setBusy(false));
                }}
              >
                <Plus size={13} />
                {t("复制为新草稿", "Duplicate as Draft")}
              </button>
              {(saved || data.contents.some((c) => c.id === initial.id)) && (
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busy}
                  onClick={remove}
                >
                  {t("删除内容", "Delete Content")}
                </button>
              )}
            </div>
          </aside>
        </div>

        <footer>
          {dirty
            ? t("未保存修改暂存在当前浏览器会话，重新打开可继续编辑。", "Unsaved changes cached in session.") : saved ? t("已保存", "Saved") : t("填写标题和正文，保存为营销内容草稿。", "Fill title and body, save as draft.")}
        </footer>
      </form>

      {showCoverModal && (
        <MarketingCoverModal
          open={showCoverModal}
          onClose={() => setShowCoverModal(false)}
          product={selectedProducts.find(p => p.id === value.productId)}
          content={value}
          onUploadCover={handleUploadCover}
        />
      )}

      {showAssetPicker && (
        <AssetPickerModal
          allAssets={allAssets}
          products={data.products}
          folders={data.assetFolders || []}
          releases={data.releases || []}
          preferredProductIds={selectedProductIds}
          channel={value.channel}
          linkedAssetIds={new Set(linkedAssets.map((a) => a.id))}
          inlineSupported={inlineSupported}
          onApplySelection={(selected, unselected) => {
            if (selected.length > 0) {
              linkAssetsById(selected);
            }
            if (unselected.length > 0) {
              unlinkAssets(unselected);
            }
            setShowAssetPicker(false);
          }}
          onInsertAndLink={(selected, unselected) => {
            if (unselected.length > 0) {
              unlinkAssets(unselected);
            }
            linkAssetsById(selected);
            const newlyAdded = selected.filter((a) => !bodyAssetRefs.usedAssetIds.has(a.id));
            const toInsert = newlyAdded.length > 0 ? newlyAdded : selected;
            for (const asset of toInsert) {
              insertAssetIntoBody(asset);
            }
            setShowAssetPicker(false);
          }}
          onClose={() => setShowAssetPicker(false)}
        />
      )}

      {lightboxAsset && (
        <div
          className="asset-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={lightboxAsset.name}
          onClick={() => setLightboxAssetId(null)}
        >
          <div className="asset-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <div className="asset-lightbox-header">
              <div>
                <strong>{lightboxAsset.name}</strong>
                <span className="faint" style={{ marginLeft: 10 }}>
                  {lightboxAsset.width}×{lightboxAsset.height} · {formatBytes(lightboxAsset.fileSize)}
                </span>
              </div>
              <div className="asset-lightbox-actions">
                {inlineSupported && (
                  <button
                    type="button"
                    className="button primary small"
                    onClick={() => {
                      insertAssetIntoBody(lightboxAsset);
                      setLightboxAssetId(null);
                    }}
                  >
                    <ImagePlus size={13} />
                    <span>{t("插入正文", "Insert into Body")}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => void handleDownloadLinkedAssets([lightboxAsset])}
                >
                  <Download size={13} />
                  <span>{t("下载图片", "Download")}</span>
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => void handleCopySingleAssetImage(lightboxAsset)}
                >
                  {copiedAssetId === lightboxAsset.id ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                  <span>{copiedAssetId === lightboxAsset.id ? t("已复制图片", "Image Copied") : t("复制图片", "Copy Image")}</span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("关闭图片预览", "Close preview")}
                  onClick={() => setLightboxAssetId(null)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="asset-lightbox-stage">
              <img src={resolveImageSrc(buildAssetFileUrl(lightboxAsset.id), allAssets)} alt={lightboxAsset.name} />
            </div>
          </div>
        </div>
      )}
    </dialog>
    {showRewrite && <MarketingRewriteDialog content={value} group={currentGroup} close={() => setShowRewrite(false)} />}
  </>);
}

function MarketingRewriteDialog({ content, group, close }: {
  content: Content;
  group?: ContentGroup;
  close: () => void;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [requirements, setRequirements] = useState("");
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);
  const preview = useRef<HTMLDetailsElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  const direction = group?.direction.trim();
  const groupTitle = group?.title.trim() || direction;
  const prompt = marketingRewritePrompt(content.id, requirements.trim(), {
    channel: content.channel,
    groupId: content.groupId,
    group: group && { title: group.title, direction: group.direction },
  });

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
      if (preview.current) preview.current.open = true;
    }
  }

  return (
    <dialog ref={dialog} className="marketing-brief marketing-rewrite" aria-labelledby="marketing-rewrite-title" onCancel={e => { e.preventDefault(); close(); }}>
      <header className="marketing-brief-header">
        <h2 id="marketing-rewrite-title">{t("AI 重写", "AI Rewrite")}</h2>
        <button type="button" className="icon-button brief-close-btn" aria-label={t("关闭 AI 重写", "Close AI rewrite")} onClick={close}><X size={18} /></button>
      </header>
      <section className="marketing-rewrite-context" aria-label={t("重写对象", "Rewrite target")}>
        <strong>{content.title}</strong>
        <div className="marketing-rewrite-meta">
          <span className="platform-label">
            {content.channel && <PlatformLogo platform={content.channel} size={16} />}
            {content.channel ? platformName(content.channel) : t("未指定平台", "No platform specified")}
          </span>
          <span>{groupTitle || (content.groupId ? t("小组资料不可用", "Group details unavailable") : t("未分组", "Ungrouped"))}</span>
        </div>
        {direction && direction !== groupTitle && <p>{direction}</p>}
      </section>
      <label className="marketing-rewrite-requirements">
        {t("重写要求", "Rewrite requirements")}
        <textarea autoFocus rows={4} value={requirements} onChange={e => { setRequirements(e.target.value); setCopyState(null); }}
          placeholder={t("例如：只改开头，用一个贴合小组主题的使用场景引出产品。", "For example: Revise only the opening and use a scenario that fits the group’s topic.")} />
      </label>
      {requirements.trim() && <details ref={preview} className="marketing-brief-preview">
        <summary>{t("查看提示词", "View prompt")}</summary>
        <textarea aria-label={t("重写提示词", "Rewrite prompt")} readOnly value={prompt} onFocus={e => e.target.select()} />
      </details>}
      <footer className="marketing-brief-footer">
        <span className="brief-footer-hint">{t("将提示词发给已连接 Growmory MCP 的 Agent，完成后重新打开文章查看。", "Send the prompt to a Growmory MCP-connected agent, then reopen the article after the rewrite.")}</span>
        <button type="button" className="button primary" disabled={!requirements.trim()} onClick={() => void copyPrompt()}>
          {copyState === "copied" ? <Check size={15} /> : <Copy size={15} />}{t("复制提示词", "Copy Prompt")}
        </button>
      </footer>
      <div role="status" className="marketing-rewrite-status">
        {copyState === "copied" && t("已复制提示词。", "Prompt copied.")}
        {copyState === "failed" && t("复制失败，请从预览中手动复制。", "Copy failed. Copy the text from the preview.")}
      </div>
    </dialog>
  );
}

function RedditCommunities({ communities = [] }: { communities?: Content["redditCommunities"] }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, communities.length - 1);
  const community = communities[active];
  const id = useId();
  const title = t("推荐发布的 Reddit 社区", "Recommended Reddit communities");

  return (
    <details className="foreign-explanation-card reddit-communities" open>
      <summary>{title}</summary>
      {communities.length > 1 && (
        <div className="reddit-community-tabs" role="tablist" aria-label={title}
          onKeyDown={(event) => {
            const next = {
              ArrowRight: (active + 1) % communities.length,
              ArrowLeft: (active + communities.length - 1) % communities.length,
              Home: 0,
              End: communities.length - 1,
            }[event.key];
            if (next === undefined) return;
            event.preventDefault();
            setSelected(next);
            event.currentTarget.querySelectorAll("button")[next]?.focus();
          }}>
          {communities.map((item, index) => (
            <button type="button" key={index} role="tab" id={`${id}-tab-${index}`}
              aria-selected={active === index} aria-controls={`${id}-panel`}
              tabIndex={active === index ? 0 : -1} onClick={() => setSelected(index)}>
              {item.name}
            </button>
          ))}
        </div>
      )}
      {community ? (
        <section id={`${id}-panel`}
          role={communities.length > 1 ? "tabpanel" : undefined}
          aria-labelledby={communities.length > 1 ? `${id}-tab-${active}` : undefined}>
          <h3>{community.name}</h3>
          <dl>
            {[
              [t("推荐理由", "Why it fits"), community.reason],
              [t("社区规则", "Community rules"), community.rules],
              [t("发布注意事项", "Posting notes"), community.notes],
            ].map(([label, value]) => (
              <div className="reddit-community-field" key={label}>
                <dt>{label}</dt>
                <dd>{value || t("暂无说明", "No details provided")}</dd>
              </div>
            ))}
          </dl>
          {community.sourceUrl && /^https?:\/\//i.test(community.sourceUrl) && (
            <a href={community.sourceUrl} target="_blank" rel="noreferrer">{t("查看规则来源", "View rule source")}</a>
          )}
          {community.checkedAt && <small>{t("核验日期", "Verified on")} · {community.checkedAt}</small>}
        </section>
      ) : <p>{t("暂无社区推荐。可通过外部 Agent 回填。", "No community recommendations yet. An external Agent can add them.")}</p>}
    </details>
  );
}
