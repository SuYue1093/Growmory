import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Folder,
  FolderPlus,
  Search,
  Trash2,
  Pencil,
  Copy,
  Download,
  ChevronRight,
  Eye,
  LayoutGrid,
  List as ListIcon,
  Image as ImageIcon,
  X,
  Upload,
  FileImage,
  Globe,
  LoaderCircle,
} from "lucide-react";
import JSZip from "jszip";
import type { Data, Asset, AssetFolder } from "./types";
import { uid, now, COMMON_ASSET_LANGUAGES, getAssetLanguageLabel } from "./types";
import { useI18n } from "./i18n.ts";

/** Downloads a single image asset directly via a temporary anchor element. */
export function downloadSingleAsset(asset: Asset) {
  const href = asset.url || `/api/assets/file/${encodeURIComponent(asset.id)}`;
  const a = document.createElement("a");
  a.href = href;
  a.download = asset.fileName || `${asset.name}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Downloads one asset directly or packages multiple assets into a ZIP archive. */
export async function downloadAssetsAsZip(assets: Asset[], zipFileName?: string): Promise<"single" | "zip"> {
  if (!assets.length) throw new Error("No assets selected");
  if (assets.length === 1) {
    downloadSingleAsset(assets[0]);
    return "single";
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    let fileName = (asset.fileName || asset.name || `asset-${i + 1}`).trim();
    if (!/\.(png|jpe?g|webp|svg|gif|avif)$/i.test(fileName)) {
      const mimeExt = asset.fileType?.split("/")[1]?.split("+")[0] || "png";
      fileName = `${fileName}.${mimeExt === "jpeg" ? "jpg" : mimeExt}`;
    }

    let finalName = fileName;
    let counter = 1;
    const dotIndex = fileName.lastIndexOf(".");
    const baseName = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName;
    const ext = dotIndex !== -1 ? fileName.substring(dotIndex) : "";
    while (usedNames.has(finalName)) {
      finalName = `${baseName} (${counter})${ext}`;
      counter++;
    }
    usedNames.add(finalName);

    const src = asset.url || `/api/assets/file/${encodeURIComponent(asset.id)}`;
    if (src.startsWith("data:")) {
      const match = src.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        zip.file(finalName, match[2], { base64: true });
      } else {
        const res = await fetch(src);
        zip.file(finalName, await res.blob());
      }
    } else {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Failed to fetch asset ${asset.name}`);
      zip.file(finalName, await res.blob());
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const downloadUrl = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  const dateStr = new Date().toISOString().slice(0, 10);
  link.download = zipFileName || `growmory-assets-${dateStr}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  return "zip";
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|svg|gif|bmp|ico|avif)$/i.test(file.name);
}

export function readImageFile(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      return reject(new Error("请选择有效的图片文件（PNG、JPG、WebP、SVG、GIF等）"));
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
      const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");

      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth || 0;
        const height = img.naturalHeight || 0;

        // If a single image itself is oversized (> 30MB or > 3840px), downscale to 4K to guarantee it stays well below limits
        const MAX_DIM = 3840;
        const isOversized =
          !isSvg &&
          !isGif &&
          (file.size > 30 * 1024 * 1024 || width > MAX_DIM || height > MAX_DIM);

        if (isOversized && width > 0 && height > 0) {
          try {
            let targetW = width;
            let targetH = height;
            if (targetW > MAX_DIM || targetH > MAX_DIM) {
              if (targetW > targetH) {
                targetH = Math.round((targetH * MAX_DIM) / targetW);
                targetW = MAX_DIM;
              } else {
                targetW = Math.round((targetW * MAX_DIM) / targetH);
                targetH = MAX_DIM;
              }
            }
            const canvas = document.createElement("canvas");
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, targetW, targetH);
              const exportType =
                file.type === "image/png" ? "image/png" : "image/jpeg";
              const scaledUrl = canvas.toDataURL(exportType, 0.92);
              if (scaledUrl.length < dataUrl.length) {
                resolve({ dataUrl: scaledUrl, width: targetW, height: targetH });
                return;
              }
            }
          } catch {
            // fallback to original
          }
        }

        resolve({
          dataUrl,
          width,
          height,
        });
      };
      img.onerror = () => {
        // SVG or unmeasured image
        resolve({ dataUrl, width: 0, height: 0 });
      };
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error("读取图片文件失败"));
    reader.readAsDataURL(file);
  });
}

export interface ScannedFileItem {
  file: File;
  folderPath: string[]; // e.g. ["宣传素材", "iPad截屏"]
}

// Recursively traverse FileSystemEntry (file or directory) for drag-and-drop
export async function scanFileSystemEntry(
  entry: any,
  currentPath: string[] = []
): Promise<ScannedFileItem[]> {
  if (!entry) return [];
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file(
        (file: File) => {
          if (isImageFile(file)) {
            resolve([{ file, folderPath: currentPath }]);
          } else {
            resolve([]);
          }
        },
        () => resolve([])
      );
    });
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const nextPath = [...currentPath, entry.name];
    const childEntries: any[] = [];

    // WebKit / Chromium readEntries returns entries in batches of up to 100
    await new Promise<void>((resolve) => {
      const readNext = () => {
        dirReader.readEntries(
          (results: any[]) => {
            if (!results || results.length === 0) {
              resolve();
            } else {
              childEntries.push(...results);
              readNext();
            }
          },
          () => resolve()
        );
      };
      readNext();
    });

    const nested = await Promise.all(
      childEntries.map((child) => scanFileSystemEntry(child, nextPath))
    );
    return nested.flat();
  }
  return [];
}

// Extract files from DataTransfer (handles both dropped directories and files)
export async function extractDroppedFiles(dataTransfer: DataTransfer): Promise<ScannedFileItem[]> {
  const items = dataTransfer.items;
  if (items && items.length > 0 && typeof (items[0] as any).webkitGetAsEntry === "function") {
    const promises: Promise<ScannedFileItem[]>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const entry = (item as any).webkitGetAsEntry();
        if (entry) {
          promises.push(scanFileSystemEntry(entry, []));
        } else {
          const file = item.getAsFile();
          if (file && isImageFile(file)) {
            let folderPath: string[] = [];
            if (file.webkitRelativePath) {
              const parts = file.webkitRelativePath.split("/").filter(Boolean);
              if (parts.length > 1) {
                folderPath = parts.slice(0, -1);
              }
            }
            promises.push(Promise.resolve([{ file, folderPath }]));
          }
        }
      }
    }
    const scanned = (await Promise.all(promises)).flat();
    if (scanned.length > 0) return scanned;
  }

  // Fallback to dataTransfer.files
  const files = dataTransfer.files;
  const result: ScannedFileItem[] = [];
  if (files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!isImageFile(file)) continue;
      let folderPath: string[] = [];
      if (file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split("/").filter(Boolean);
        if (parts.length > 1) {
          folderPath = parts.slice(0, -1);
        }
      }
      result.push({ file, folderPath });
    }
  }
  return result;
}

// Synchronously resolve/create nested folders from folderPath hierarchy
export function resolveFolderHierarchy(
  items: { file: File; folderPath?: string[] }[],
  existingFolders: AssetFolder[],
  baseParentId: string,
  productId: string
): {
  newFolders: AssetFolder[];
  itemFolderIdList: string[];
} {
  const newFolders: AssetFolder[] = [];
  const itemFolderIdList: string[] = [];

  for (const item of items) {
    if (!item.folderPath || item.folderPath.length === 0) {
      itemFolderIdList.push(baseParentId || "");
      continue;
    }

    let currentParentId = baseParentId || "";
    for (const segment of item.folderPath) {
      const trimmed = segment.trim();
      if (!trimmed) continue;

      let found = existingFolders.find(
        (f) =>
          f.productId === productId &&
          (f.parentId || "") === currentParentId &&
          f.name === trimmed
      );
      if (!found) {
        found = newFolders.find(
          (f) =>
            f.productId === productId &&
            (f.parentId || "") === currentParentId &&
            f.name === trimmed
        );
      }

      if (found) {
        currentParentId = found.id;
      } else {
        const created: AssetFolder = {
          id: uid(),
          productId,
          parentId: currentParentId,
          name: trimmed,
        };
        newFolders.push(created);
        currentParentId = created.id;
      }
    }
    itemFolderIdList.push(currentParentId);
  }

  return { newFolders, itemFolderIdList };
}

// Split assets into batches if total payload is large to accurately stay within request limits
export function splitIntoBatches(
  assets: Asset[],
  maxBatchBytes: number = 18 * 1024 * 1024
): Asset[][] {
  if (assets.length <= 1) return [assets];
  const batches: Asset[][] = [];
  let currentBatch: Asset[] = [];
  let currentBatchBytes = 0;

  for (const asset of assets) {
    const assetBytes = (asset.url ? asset.url.length : 0) + (asset.fileSize || 0) + 600;
    if (currentBatch.length > 0 && currentBatchBytes + assetBytes > maxBatchBytes) {
      batches.push(currentBatch);
      currentBatch = [asset];
      currentBatchBytes = assetBytes;
    } else {
      currentBatch.push(asset);
      currentBatchBytes += assetBytes;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

export type UploadProgressCallback = (info: {
  current: number;
  total: number;
  batchCount: number;
}) => void;

type Props = {
  data: Data;
  owner: string; // "all" | "shared" | productId
  setOwner?: (owner: string) => void;
  folderId: string;
  setFolderId: (id: string) => void;
  onSave: (updater: (data: Data) => void) => Promise<boolean | void>;
  onAppend?: (
    assets: Asset[],
    folders?: AssetFolder[],
    isFinal?: boolean
  ) => Promise<boolean | void>;
  notify: (message: string) => void;
  setConfirm: (confirm: { title: string; body: string; action: () => void } | null) => void;
};

/**
 * 计算素材库中每个文件夹的素材总数（包含当前层级及所有下级、更深层级子文件夹的所有素材综合）
 */
export function calculateFolderTotalAssetCounts(
  allFolders: AssetFolder[] = [],
  allAssets: Asset[] = []
): Map<string, number> {
  const childrenMap = new Map<string, string[]>();
  for (const f of allFolders) {
    const p = f.parentId || "";
    if (!childrenMap.has(p)) childrenMap.set(p, []);
    childrenMap.get(p)!.push(f.id);
  }

  const directCounts = new Map<string, number>();
  for (const a of allAssets) {
    if (a.folderId) {
      directCounts.set(a.folderId, (directCounts.get(a.folderId) || 0) + 1);
    }
  }

  const memo = new Map<string, number>();

  function getCount(fid: string, stack: Set<string>): number {
    if (memo.has(fid)) return memo.get(fid)!;
    if (stack.has(fid)) return 0; // 防御循环引用
    stack.add(fid);

    let total = directCounts.get(fid) || 0;
    const children = childrenMap.get(fid) || [];
    for (const childId of children) {
      total += getCount(childId, stack);
    }
    stack.delete(fid);
    memo.set(fid, total);
    return total;
  }

  const result = new Map<string, number>();
  const stack = new Set<string>();
  for (const f of allFolders) {
    result.set(f.id, getCount(f.id, stack));
  }
  return result;
}

/**
 * 获取单个文件夹的素材总数（包含所有下级及深层子文件夹素材综合）
 */
export function getFolderTotalAssetCount(
  folderId: string,
  allFolders: AssetFolder[] = [],
  allAssets: Asset[] = []
): number {
  const counts = calculateFolderTotalAssetCounts(allFolders, allAssets);
  return counts.get(folderId) || 0;
}

export function AssetLibrary({
  data,
  owner,
  setOwner,
  folderId,
  setFolderId,
  onSave,
  onAppend,
  notify,
  setConfirm,
}: Props) {
  const { lang, t } = useI18n();
  const [query, setQuery] = useState("");
  const [versionFilter, setVersionFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [sort, setSort] = useState<"updated" | "name" | "size">("updated");
  const [includeSubfolders, setIncludeSubfolders] = useState(false);

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [folderModal, setFolderModal] = useState<{
    open: boolean;
    folder?: AssetFolder;
    parentId: string;
    productId: string;
  } | null>(null);

  // Drag & drop files/folders on workspace
  const [workspaceDragOver, setWorkspaceDragOver] = useState(false);
  const [preloadedFiles, setPreloadedFiles] = useState<ScannedFileItem[]>([]);

  // Clear selections when switching scope/folder/search/filters
  useEffect(() => {
    setSelectedIds([]);
  }, [owner, folderId, query, versionFilter, languageFilter]);

  const actualOwner = owner === "shared" ? "" : owner;

  const ownerLabel = (id?: string) => {
    if (!id) return t("通用素材", "General");
    const p = data.products.find((prod) => prod.id === id);
    return p ? p.name.split(/\s[-–—]\s/)[0] : t("未知产品", "Unknown Product");
  };

  const getProduct = (id?: string) => data.products.find((p) => p.id === id);
  const getRelease = (id?: string) => data.releases.find((r) => r.id === id);

  // Available folders for current owner scope
  const scopedFolders = useMemo(() => {
    const list = data.assetFolders || [];
    if (owner === "all") return list;
    return list.filter((f) => f.productId === actualOwner);
  }, [data.assetFolders, owner, actualOwner]);

  // Memoized recursive asset count for all folders (including direct assets and all descendant subfolders)
  const folderAssetCountMap = useMemo(() => {
    return calculateFolderTotalAssetCounts(data.assetFolders, data.assets);
  }, [data.assetFolders, data.assets]);

  const currentFolder = scopedFolders.find((f) => f.id === folderId);

  // Breadcrumb path calculation
  const breadcrumbPath: AssetFolder[] = useMemo(() => {
    const path: AssetFolder[] = [];
    let cur = currentFolder;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      path.unshift(cur);
      cur = (data.assetFolders || []).find((f) => f.id === cur?.parentId);
    }
    return path;
  }, [currentFolder, data.assetFolders]);

  // Subfolders of the current view
  const subfolders = useMemo(() => {
    const all = data.assetFolders || [];
    const pool =
      owner === "all"
        ? folderId
          ? all.filter((f) => f.parentId === folderId)
          : all.filter((f) => !f.parentId)
        : all.filter(
          (f) =>
            f.productId === actualOwner && (f.parentId || "") === folderId
        );

    return pool.filter(
      (f) => !query || f.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [data.assetFolders, owner, actualOwner, folderId, query]);

  // Set of all descendant folder IDs for current view (for subfolder filtering)
  const descendantFolderIds = useMemo(() => {
    if (!folderId) {
      return new Set(scopedFolders.map((f) => f.id));
    }
    const set = new Set<string>([folderId]);
    let added = true;
    while (added) {
      added = false;
      for (const f of scopedFolders) {
        if (f.parentId && set.has(f.parentId) && !set.has(f.id)) {
          set.add(f.id);
          added = true;
        }
      }
    }
    return set;
  }, [folderId, scopedFolders]);

  // Assets filtered
  const filteredAssets = useMemo(() => {
    const all = data.assets || [];
    return all
      .filter((asset) => {
        // Owner filter
        if (owner !== "all" && asset.productId !== actualOwner) return false;

        // Folder filter
        if (query) {
          // When searching, search all matching assets in scope
        } else if (includeSubfolders) {
          if (folderId) {
            if (!asset.folderId || !descendantFolderIds.has(asset.folderId)) return false;
          }
          // If at root and includeSubfolders is on, show all assets in scope
        } else {
          // Normal direct folder match
          if (owner === "all" && !folderId) {
            if (asset.folderId) return false;
          } else if (owner !== "all" || folderId) {
            if ((asset.folderId || "") !== folderId) return false;
          }
        }

        // Version filter
        if (versionFilter !== "all") {
          if (versionFilter === "unlinked") {
            if (asset.releaseId) return false;
          } else if (asset.releaseId !== versionFilter) {
            return false;
          }
        }
        // Language filter
        if (languageFilter !== "all") {
          const langs = asset.languages && asset.languages.length > 0 ? asset.languages : ["zh-Hans"];
          if (!langs.includes(languageFilter)) return false;
        }
        // Query filter
        if (query) {
          const q = query.toLowerCase();
          const matchName = asset.name.toLowerCase().includes(q);
          const matchFile = (asset.fileName || "").toLowerCase().includes(q);
          if (!matchName && !matchFile) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "zh-CN");
        if (sort === "size") return (b.fileSize || 0) - (a.fileSize || 0);
        return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      });
  }, [data.assets, owner, actualOwner, folderId, includeSubfolders, descendantFolderIds, versionFilter, languageFilter, query, sort]);

  // Select all calculations
  const allSelected =
    filteredAssets.length > 0 &&
    filteredAssets.every((a) => selectedIds.includes(a.id));
  const isIndeterminate =
    selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAssets.map((a) => a.id));
    }
  };

  // Keyboard shortcut: Cmd+A / Ctrl+A to select all filtered assets
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          target?.isContentEditable
        ) {
          return;
        }
        if (filteredAssets.length > 0) {
          e.preventDefault();
          setSelectedIds(filteredAssets.map((a) => a.id));
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredAssets]);

  // Total summary statistics
  const totalAssetsCount = (data.assets || []).filter(
    (a) => owner === "all" || a.productId === actualOwner
  ).length;
  const totalAssetsSize = (data.assets || [])
    .filter((a) => owner === "all" || a.productId === actualOwner)
    .reduce((sum, a) => sum + (a.fileSize || 0), 0);

  // Available releases for version filter dropdown
  const availableReleases = useMemo(() => {
    if (owner === "all") return data.releases || [];
    if (owner === "shared") return [];
    return (data.releases || []).filter((r) => r.productId === actualOwner);
  }, [data.releases, owner, actualOwner]);

  // Navigate folder
  const openFolder = (id: string) => {
    setFolderId(id);
    setQuery("");
  };

  // Folder CRUD handlers
  const handleCreateOrUpdateFolder = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error(t("请输入文件夹名称", "Please enter folder name"));
    const pid = folderModal?.productId ?? (owner === "all" ? "" : actualOwner);
    let parent = folderModal?.parentId ?? folderId;
    if (parent && !scopedFolders.some((f) => f.id === parent && f.productId === pid)) {
      parent = "";
    }
    const isEdit = !!folderModal?.folder;

    await onSave((d) => {
      d.assetFolders = d.assetFolders || [];
      const dup = d.assetFolders.some(
        (f) =>
          f.productId === pid &&
          (f.parentId || "") === parent &&
          f.name === trimmed &&
          f.id !== folderModal?.folder?.id
      );
      if (dup) throw new Error(t("同级目录下已有同名文件夹", "Folder with same name already exists here"));

      if (isEdit) {
        const item = d.assetFolders.find((f) => f.id === folderModal!.folder!.id);
        if (item) item.name = trimmed;
      } else {
        d.assetFolders.push({
          id: uid(),
          productId: pid,
          parentId: parent,
          name: trimmed,
        });
      }
    });

    notify(isEdit ? t("文件夹已重命名", "Folder renamed") : t("文件夹已创建", "Folder created"));
    setFolderModal(null);
  };

  const handleDeleteFolder = (folderToDelete: AssetFolder) => {
    // Find all subfolder IDs recursively
    const allFolders = data.assetFolders || [];
    const folderIdsToDelete = new Set<string>([folderToDelete.id]);
    let added = true;
    while (added) {
      added = false;
      for (const f of allFolders) {
        if (f.parentId && folderIdsToDelete.has(f.parentId) && !folderIdsToDelete.has(f.id)) {
          folderIdsToDelete.add(f.id);
          added = true;
        }
      }
    }

    const affectedAssets = (data.assets || []).filter(
      (a) => a.folderId && folderIdsToDelete.has(a.folderId)
    );

    const desc =
      affectedAssets.length > 0 || folderIdsToDelete.size > 1
        ? (lang === 'en'
          ? `This will delete ${affectedAssets.length} assets and ${folderIdsToDelete.size - 1} subfolders inside "${folderToDelete.name}". This action cannot be undone.`
          : `该操作将同时删除文件夹「${folderToDelete.name}」中的 ${affectedAssets.length} 个素材以及包含的 ${folderIdsToDelete.size - 1} 个子文件夹，此操作不可撤销。`)
        : (lang === 'en'
          ? `Are you sure you want to delete empty folder "${folderToDelete.name}"?`
          : `确定删除空文件夹「${folderToDelete.name}」？`);

    setConfirm({
      title: lang === 'en' ? `Delete folder "${folderToDelete.name}"?` : `删除文件夹「${folderToDelete.name}」？`,
      body: desc,
      action: async () => {
        await onSave((d) => {
          d.assetFolders = (d.assetFolders || []).filter(
            (f) => !folderIdsToDelete.has(f.id)
          );
          d.assets = (d.assets || []).filter(
            (a) => !a.folderId || !folderIdsToDelete.has(a.folderId)
          );
        });
        if (folderId === folderToDelete.id || folderIdsToDelete.has(folderId)) {
          setFolderId(folderToDelete.parentId || "");
        }
        setConfirm(null);
        notify(t("文件夹已删除", "Folder deleted"));
      },
    });
  };

  // Asset deletion
  const handleDeleteAsset = (asset: Asset) => {
    setConfirm({
      title: lang === 'en' ? `Delete asset "${asset.name}"?` : `删除素材「${asset.name}」？`,
      body: t("素材将从素材库中彻底移除，不可恢复。", "Asset will be permanently removed from library."),
      action: async () => {
        await onSave((d) => {
          d.assets = (d.assets || []).filter((a) => a.id !== asset.id);
        });
        if (previewAsset?.id === asset.id) setPreviewAsset(null);
        setConfirm(null);
        notify(t("素材已删除", "Asset deleted"));
      },
    });
  };

  // Download a single asset directly
  const handleDownloadAsset = (asset: Asset) => {
    downloadSingleAsset(asset);
    notify(t("已开始下载素材：{name}", "Downloading asset: {name}", { name: asset.name }));
  };

  // Batch download selected assets as a ZIP archive (or single file)
  const handleBatchDownload = async () => {
    if (!selectedIds.length) return;
    const targets = data.assets.filter((a) => selectedIds.includes(a.id));
    if (!targets.length) return;

    // Single item quick download
    if (targets.length === 1) {
      handleDownloadAsset(targets[0]);
      return;
    }

    setDownloading(true);
    notify(t("正在打包 {n} 个素材为 ZIP 文件...", "Packaging {n} assets into ZIP...", { n: targets.length }));

    try {
      await downloadAssetsAsZip(targets);
      notify(t("已完成打包并开始下载 {n} 个素材", "Zipped and started downloading {n} assets", { n: targets.length }));
    } catch (err) {
      notify((err as Error).message || t("批量打包下载失败，请重试", "Batch download failed, please retry"));
    } finally {
      setDownloading(false);
    }
  };

  // Batch delete
  const handleBatchDelete = () => {
    if (!selectedIds.length) return;
    setConfirm({
      title: lang === 'en' ? `Delete ${selectedIds.length} selected assets?` : `删除选中的 ${selectedIds.length} 个素材？`,
      body: t("选中的素材将被彻底删除，此操作不可撤销。", "Selected assets will be permanently deleted."),
      action: async () => {
        await onSave((d) => {
          const set = new Set(selectedIds);
          d.assets = (d.assets || []).filter((a) => !set.has(a.id));
        });
        setSelectedIds([]);
        if (previewAsset && selectedIds.includes(previewAsset.id)) {
          setPreviewAsset(null);
        }
        setConfirm(null);
        notify(lang === 'en' ? `Deleted ${selectedIds.length} assets` : `已删除 ${selectedIds.length} 个素材`);
      },
    });
  };

  return (
    <div
      className={`asset-library-workspace ${workspaceDragOver ? "workspace-drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!workspaceDragOver) setWorkspaceDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setWorkspaceDragOver(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setWorkspaceDragOver(false);
        const scanned = await extractDroppedFiles(e.dataTransfer);
        if (scanned.length > 0) {
          setPreloadedFiles(scanned);
          setUploadModalOpen(true);
        } else {
          notify(t("未在拖入的内容中找到支持的图片文件（PNG、JPG、WebP、SVG、GIF等）", "No supported image files found (PNG, JPG, WebP, SVG, GIF, etc.)"));
        }
      }}
    >
      {/* Workspace Drag-and-drop Overlay */}
      {workspaceDragOver && (
        <div className="asset-workspace-drop-overlay">
          <div className="asset-drop-banner">
            <Upload size={36} />
            <h3>{t("松开鼠标以导入图片或文件夹", "Release mouse to import images or folders")}</h3>
            <p>{t("支持拖入多层嵌套文件夹，将同步自动创建对应文件夹并导入素材", "Supports nested folders; will automatically recreate folder hierarchy and import assets")}</p>
          </div>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="asset-toolbar">
        {setOwner ? (
          <select
            className="asset-scope-select"
            aria-label={t("素材范围", "Asset Scope")}
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setFolderId("");
              setQuery("");
            }}
          >
            <option value="all">{t("全部素材（统一管理）", "All Assets (Unified)")}</option>
            <option value="shared">{t("通用素材 · 不归属App", "General Assets · Unassigned")}</option>
            {data.products.map((p) => (
              <option key={p.id} value={p.id}>
                {lang === "en" ? `${ownerLabel(p.id)} Assets` : `${ownerLabel(p.id)} 的素材`}
              </option>
            ))}
          </select>
        ) : (
          <div className="asset-owner-badge">
            <ImageIcon size={16} />
            <span>{ownerLabel(actualOwner)} · {t("素材库", "Asset Library")}</span>
          </div>
        )}

        {/* Search */}
        <div className="asset-search-input">
          <Search size={15} />
          <input
            placeholder={t("搜索素材名称或文件名...", "Search asset name or filename...")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="clear-btn" onClick={() => setQuery("")}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <button
          className="button secondary"
          onClick={() =>
            setFolderModal({
              open: true,
              parentId: folderId,
              productId: owner === "all" ? "" : actualOwner,
            })
          }
        >
          <FolderPlus size={15} />
          {t("新建文件夹", "New Folder")}
        </button>

        <button
          className="button primary"
          onClick={() => setUploadModalOpen(true)}
        >
          <Upload size={15} />
          {t("上传素材", "Upload Assets")}
        </button>
      </div>

      {/* Summary & Filters Bar */}
      <div className="asset-summary-bar">
        <div className="asset-summary-stats">
          {filteredAssets.length > 0 && (
            <label
              className="asset-select-all-label"
              title={allSelected ? t("取消全选", "Deselect All") : t("全选当前筛选的素材", "Select All Filtered Assets")}
            >
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = isIndeterminate;
                }}
                onChange={toggleSelectAll}
              />
              <span>
                {t("全选", "Select All")}
                {selectedIds.length > 0
                  ? ` (${selectedIds.length}/${filteredAssets.length})`
                  : ` (${filteredAssets.length})`}
              </span>
            </label>
          )}
          {filteredAssets.length > 0 && <span className="dot" />}
          <span>{lang === "en" ? `${totalAssetsCount} assets` : `共 ${totalAssetsCount} 个素材`}</span>
          <span className="dot" />
          <span>{lang === "en" ? `Total ${formatBytes(totalAssetsSize)}` : `总大小 ${formatBytes(totalAssetsSize)}`}</span>
          <span className="dot" />
          <span>{lang === "en" ? `${scopedFolders.length} folders` : `${scopedFolders.length} 个文件夹`}</span>
          {owner === "all" && (
            <small className="hint">{t("支持跨 App 与通用素材统一管理", "Unified asset management across apps")}</small>
          )}
        </div>

        <div className="asset-filters-group">
          {/* Version Filter */}
          {availableReleases.length > 0 && (
            <select
              aria-label={t("按版本筛选", "Filter by release")}
              value={versionFilter}
              onChange={(e) => setVersionFilter(e.target.value)}
            >
              <option value="all">{t("全部版本", "All Releases")}</option>
              <option value="unlinked">{t("未关联版本", "Unlinked Releases")}</option>
              {availableReleases.map((r) => (
                <option key={r.id} value={r.id}>
                  {t("版本", "v")} {r.version}
                </option>
              ))}
            </select>
          )}

          {/* Language Filter */}
          <select
            aria-label={t("按语言筛选", "Filter by language")}
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
          >
            <option value="all">{t("全部语言", "All Languages")}</option>
            {COMMON_ASSET_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {t(l.name)} ({l.code})
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            aria-label={t("排序方式", "Sort by")}
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
          >
            <option value="updated">{t("最近更新", "Recently Updated")}</option>
            <option value="name">{t("按名称", "By Name")}</option>
            <option value="size">{t("按文件大小", "By File Size")}</option>
          </select>

          {/* Subfolders toggle button */}
          <button
            type="button"
            className={`button small ${includeSubfolders ? "primary" : "secondary"} subfolders-toggle-btn`}
            title={t("平铺展开所有子文件夹中的素材", "Flatten and show all subfolder assets")}
            onClick={() => setIncludeSubfolders((prev) => !prev)}
          >
            <Folder size={13} />
            <span>{includeSubfolders ? t("已包含子文件夹", "Subfolders Included") : t("包含子文件夹", "Include Subfolders")}</span>
          </button>

          {/* View mode toggle */}
          <div className="segmented view-toggle">
            <button
              className={viewMode === "grid" ? "active" : ""}
              title={t("网格视图", "Grid View")}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={viewMode === "list" ? "active" : ""}
              title={t("列表视图", "List View")}
              onClick={() => setViewMode("list")}
            >
              <ListIcon size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumb Path */}
      <div className="asset-breadcrumb">
        <button
          className={`breadcrumb-item ${!folderId ? "active" : ""}`}
          onClick={() => openFolder("")}
        >
          {t("根目录", "Root")}
        </button>
        {breadcrumbPath.map((item) => (
          <React.Fragment key={item.id}>
            <ChevronRight size={12} className="breadcrumb-separator" />
            <button
              className={`breadcrumb-item ${folderId === item.id ? "active" : ""
                }`}
              onClick={() => openFolder(item.id)}
            >
              {item.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Subfolders Grid */}
      {subfolders.length > 0 && (
        <div className="asset-folders-grid">
          {subfolders.map((folder) => {
            const count = folderAssetCountMap.get(folder.id) || 0;
            const directCount = (data.assets || []).filter(
              (a) => a.folderId === folder.id
            ).length;
            const hasDescendants = count > directCount;
            return (
              <div key={folder.id} className="asset-folder-card">
                <button
                  className="folder-main-btn"
                  onClick={() => openFolder(folder.id)}
                  title={
                    hasDescendants
                      ? `包含当前及所有子文件夹共 ${count} {lang === "en" ? "assets" : "个素材"}（当前层级 ${directCount} 个，子文件夹 ${count - directCount} 个）`
                      : `包含 ${count} {lang === "en" ? "assets" : "个素材"}`
                  }
                >
                  <Folder size={20} className="folder-icon" />
                  <div className="folder-meta">
                    <span className="folder-name">{folder.name}</span>
                    <span className="folder-count">
                      {count} {lang === "en" ? "assets" : "个素材"}
                      {owner === "all" && (
                        <> · {ownerLabel(folder.productId)}</>
                      )}
                    </span>
                  </div>
                </button>
                <div className="folder-actions">
                  <button
                    className="icon-button"
                    title={t("重命名「{name}」", "Rename \"{name}\"", { name: folder.name })}
                    onClick={() =>
                      setFolderModal({
                        open: true,
                        folder,
                        parentId: folder.parentId,
                        productId: folder.productId,
                      })
                    }
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="icon-button danger"
                    title={t("删除「{name}」", "Delete \"{name}\"", { name: folder.name })}
                    onClick={() => handleDeleteFolder(folder)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assets Content: Grid or List */}
      {filteredAssets.length > 0 ? (
        viewMode === "grid" ? (
          <div className="asset-grid">
            {filteredAssets.map((asset) => {
              const isSelected = selectedIds.includes(asset.id);
              const prod = getProduct(asset.productId);
              const rel = getRelease(asset.releaseId);
              return (
                <div
                  key={asset.id}
                  className={`asset-card ${isSelected ? "selected" : ""}`}
                >
                  <div
                    className="asset-thumb-wrap"
                    onClick={() => setPreviewAsset(asset)}
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      loading="lazy"
                      className="asset-thumbnail"
                    />
                    <div className="asset-hover-overlay">
                      <button
                        className="preview-hover-btn"
                        title={t("查看大图与详情", "View Details & Preview")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewAsset(asset);
                        }}
                      >
                        <Eye size={18} />
                      </button>
                    </div>

                    {/* Select Checkbox */}
                    <label
                      className="asset-select-check"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds((prev) => [...prev, asset.id]);
                          } else {
                            setSelectedIds((prev) =>
                              prev.filter((id) => id !== asset.id)
                            );
                          }
                        }}
                      />
                    </label>

                    {/* Format / Dim Tag */}
                    <div className="asset-dim-tag">
                      {asset.width && asset.height
                        ? `${asset.width}×${asset.height}`
                        : formatBytes(asset.fileSize)}
                    </div>
                  </div>

                  <div className="asset-info">
                    <div className="asset-title-row">
                      <b className="asset-name" title={asset.name}>
                        {asset.name}
                      </b>
                      <div className="asset-card-actions">
                        <button
                          className="icon-button"
                          title={t("编辑素材", "Edit Asset")}
                          onClick={() => setEditingAsset(asset)}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          className="icon-button danger"
                          title={t("删除素材", "Delete Asset")}
                          onClick={() => handleDeleteAsset(asset)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="asset-tags-row">
                      <span className="asset-tag size-tag">
                        {formatBytes(asset.fileSize)}
                      </span>
                      {asset.productId ? (
                        <span className="asset-tag app-tag" title={prod?.name}>
                          {ownerLabel(asset.productId)}
                        </span>
                      ) : (
                        <span className="asset-tag general-tag">{t("通用素材", "General")}</span>
                      )}
                      {rel && (
                        <span className="asset-tag version-tag">
                          v{rel.version}
                        </span>
                      )}
                      {asset.languages && asset.languages.length > 0 && (
                        <span
                          className="asset-tag lang-tag"
                          title={lang === "en" ? `Languages: ${asset.languages.map(getAssetLanguageLabel).join(", ")}` : `适用语言：${asset.languages.map(getAssetLanguageLabel).join("、")}`}
                        >
                          <Globe size={10} />
                          {asset.languages.map(getAssetLanguageLabel).join("/")}
                        </span>
                      )}
                      {asset.folderId && (
                        <button
                          type="button"
                          className="asset-tag folder-tag"
                          title={lang === 'en' ? `Located in folder "${scopedFolders.find((f) => f.id === asset.folderId)?.name || "Subfolder"}", click to enter` : `位于文件夹「${scopedFolders.find((f) => f.id === asset.folderId)?.name || "子文件夹"}」，点击进入`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openFolder(asset.folderId!);
                          }}
                        >
                          <Folder size={10} />
                          {scopedFolders.find((f) => f.id === asset.folderId)?.name || (lang === 'en' ? "Subfolder" : "子文件夹")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="panel asset-list-panel">
            <div className="asset-list-head">
              <label className="check-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isIndeterminate;
                  }}
                  onChange={toggleSelectAll}
                />
                <span>{t("素材名称", "Asset Name")}</span>
              </label>
              <span className="col-lang">{t("适用语言", "Language")}</span>
              <span className="col-app">{t("所属 App", "Product")}</span>
              <span className="col-version">{t("关联版本", "Release")}</span>
              <span className="col-size">{t("尺寸 / 大小", "Dimensions / Size")}</span>
              <span className="col-date">{t("更新时间", "Updated At")}</span>
              <span className="col-actions">{t("操作", "Actions")}</span>
            </div>

            <div className="asset-list-body">
              {filteredAssets.map((asset) => {
                const isSelected = selectedIds.includes(asset.id);
                const rel = getRelease(asset.releaseId);
                return (
                  <div
                    key={asset.id}
                    className={`asset-list-row ${isSelected ? "selected" : ""
                      }`}
                  >
                    <div className="asset-list-name-col">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds((prev) => [...prev, asset.id]);
                          } else {
                            setSelectedIds((prev) =>
                              prev.filter((id) => id !== asset.id)
                            );
                          }
                        }}
                      />
                      <div
                        className="asset-row-thumb"
                        onClick={() => setPreviewAsset(asset)}
                        title={t("点击预览", "Click to preview")}
                      >
                        <img src={asset.url} alt={asset.name} />
                      </div>
                      <div
                        className="asset-row-text"
                        onClick={() => setPreviewAsset(asset)}
                      >
                        <b className="asset-row-title" title={asset.name}>{asset.name}</b>
                        <div className="asset-row-subtext">
                          <small className="asset-row-filename" title={asset.fileName}>{asset.fileName}</small>
                          {asset.folderId && (
                            <button
                              type="button"
                              className="asset-tag folder-tag mini"
                              title={lang === "en" ? `In folder "${scopedFolders.find((f) => f.id === asset.folderId)?.name || "Subfolder"}", click to open` : `位于文件夹「${scopedFolders.find((f) => f.id === asset.folderId)?.name || "子文件夹"}」，点击进入`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openFolder(asset.folderId!);
                              }}
                            >
                              <Folder size={10} />
                              <span>{scopedFolders.find((f) => f.id === asset.folderId)?.name || (lang === "en" ? "Subfolder" : "子文件夹")}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="asset-list-lang-col">
                      {asset.languages && asset.languages.length > 0 ? (
                        <div className="asset-lang-tags">
                          {asset.languages.map((code) => (
                            <span key={code} className="asset-tag lang-tag mini">
                              <Globe size={10} />
                              <span>{getAssetLanguageLabel(code)}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted-text">-</span>
                      )}
                    </div>

                    <div className="asset-list-app-col">
                      <span
                        className={`badge ${asset.productId ? "app" : "neutral"
                          }`}
                      >
                        {ownerLabel(asset.productId)}
                      </span>
                    </div>

                    <div className="asset-list-version-col">
                      {rel ? (
                        <span className="badge version">v{rel.version}</span>
                      ) : (
                        <span className="muted-text">{t("未关联", "Unlinked")}</span>
                      )}
                    </div>

                    <div className="asset-list-size-col">
                      <span className="asset-size-bytes">{formatBytes(asset.fileSize)}</span>
                      {asset.width && asset.height ? (
                        <small className="muted-text asset-size-dims">
                          {asset.width} × {asset.height}
                        </small>
                      ) : null}
                    </div>

                    <div className="asset-list-date-col">
                      <small>
                        {new Date(asset.updatedAt).toLocaleDateString("zh-CN")}
                      </small>
                    </div>

                    <div className="asset-list-actions-col">
                      <button
                        className="icon-button"
                        title={t("预览", "Preview")}
                        onClick={() => setPreviewAsset(asset)}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className="icon-button"
                        title={t("下载", "Download")}
                        onClick={() => handleDownloadAsset(asset)}
                      >
                        <Download size={14} />
                      </button>
                      <button
                        className="icon-button"
                        title={t("编辑", "Edit")}
                        onClick={() => setEditingAsset(asset)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button danger"
                        title={t("删除", "Delete")}
                        onClick={() => handleDeleteAsset(asset)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      ) : subfolders.length > 0 && !query ? (
        <div className="panel asset-empty-state folder-guide-state">
          <Folder size={40} className="empty-icon folder-guide-icon" />
          <h3>{t("当前目录暂无直接素材", "No direct assets in this folder")}</h3>
          <p>
            素材已收纳在上方的 {subfolders.length} 个文件夹中。你可以点击上方文件夹进入查看，或直接平铺浏览全部素材。
          </p>
          <div className="folder-guide-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setIncludeSubfolders(true)}
            >
              {t("平铺展示所有子文件夹素材", "Show all subfolder assets")}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => openFolder(subfolders[0].id)}
            >
              进入「{subfolders[0].name}」
            </button>
          </div>
        </div>
      ) : (
        <div className="panel asset-empty-state">
          <FileImage size={40} className="empty-icon" />
          <h3>{query ? "没有匹配的素材" : "素材库暂无图片"}</h3>
          <p>
            {query
              ? "尝试更改搜索词或版本筛选条件。"
              : "上传产品截图、宣传物料、Logo 变体或非 App 通用图片素材。"}
          </p>
          {!query && (
            <button
              className="button primary"
              onClick={() => setUploadModalOpen(true)}
            >
              <Upload size={15} />
              {t("上传第一张素材", "Upload First Asset")}
            </button>
          )}
        </div>
      )}

      {/* Floating Selection Bar */}
      {selectedIds.length > 0 && (
        <div className="asset-selection-bar">
          <span className="selection-count">
            已选择 <b>{selectedIds.length}</b> / {filteredAssets.length} 项素材
          </span>
          <div className="selection-actions">
            {!allSelected && (
              <button
                type="button"
                className="button secondary small asset-select-all-btn"
                onClick={() => setSelectedIds(filteredAssets.map((a) => a.id))}
              >
                {t("全选当前所有", "Select All Filtered")} ({filteredAssets.length})
              </button>
            )}
            <button
              type="button"
              className="button primary small"
              disabled={downloading}
              onClick={handleBatchDownload}
            >
              {downloading ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Download size={14} />
              )}
              {downloading
                ? t("正在打包...", "Packaging...")
                : t("批量下载", "Download Selected")}
            </button>
            <button
              className="button danger small"
              onClick={handleBatchDelete}
            >
              <Trash2 size={14} />
              {t("批量删除", "Batch Delete")}
            </button>
            <button
              className="text-button"
              onClick={() => setSelectedIds([])}
            >
              {t("取消选择", "Deselect")}
            </button>
          </div>
        </div>
      )}

      {/* Modal 1: Upload Asset */}
      {uploadModalOpen && (
        <UploadAssetModal
          data={data}
          initialOwner={owner === "all" ? "" : actualOwner}
          initialFolderId={folderId}
          initialFiles={preloadedFiles}
          onClose={() => {
            setUploadModalOpen(false);
            setPreloadedFiles([]);
          }}
          onUpload={async (newAssets, newFolders = [], onProgress) => {
            const batches = splitIntoBatches(newAssets);
            const totalBatches = batches.length;

            for (let i = 0; i < totalBatches; i++) {
              const batch = batches[i];
              if (totalBatches > 1) {
                notify(`正在上传第 ${i + 1}/${totalBatches} 批素材 (${batch.length} 个)...`);
                if (onProgress) {
                  onProgress({
                    current: i + 1,
                    total: totalBatches,
                    batchCount: batch.length,
                  });
                }
              }

              const isFinal = i === totalBatches - 1;
              let ok: boolean | void = false;
              if (onAppend) {
                // Use incremental append endpoint: sends ONLY the current batch over HTTP.
                // isFinal tells main to trigger top-level React re-render only on the last batch!
                ok = await onAppend(batch, i === 0 ? newFolders : [], isFinal);
              } else {
                // Fallback to onSave
                ok = await onSave((d) => {
                  if (i === 0 && newFolders.length > 0) {
                    d.assetFolders = [...(d.assetFolders || []), ...newFolders];
                  }
                  d.assets = [...(d.assets || []), ...batch];
                });
              }

              if (ok === false) {
                if (i > 0) {
                  notify(`前 ${i} 批素材已成功保存，第 ${i + 1} 批上传失败，请重试`);
                }
                return false;
              }
            }

            // Switch owner view if needed
            const targetProductId = newAssets[0]?.productId ?? newFolders[0]?.productId;
            if (setOwner && targetProductId !== undefined && owner !== "all" && targetProductId !== actualOwner) {
              setOwner(targetProductId ? targetProductId : "shared");
            }

            // Auto navigate to the created folder or asset's folder
            const targetFolderId = newFolders[0]?.id || newAssets[0]?.folderId;
            if (targetFolderId) {
              setFolderId(targetFolderId);
            }

            const folderMsg = newFolders.length > 0 ? `，同步创建了 ${newFolders.length} 个文件夹` : "";
            const batchMsg = totalBatches > 1 ? `（分 ${totalBatches} 批次完成）` : "";
            notify(`已成功上传 ${newAssets.length} 个素材${folderMsg}${batchMsg}`);
            setUploadModalOpen(false);
            setPreloadedFiles([]);
            return true;
          }}
        />
      )}

      {/* Modal 2: Edit Asset */}
      {editingAsset && (
        <EditAssetModal
          asset={editingAsset}
          data={data}
          onClose={() => setEditingAsset(null)}
          onSave={async (updated) => {
            await onSave((d) => {
              const idx = (d.assets || []).findIndex((a) => a.id === updated.id);
              if (idx !== -1) {
                d.assets[idx] = updated;
              }
            });
            notify(t("素材资料已更新", "Asset information updated"));
            setEditingAsset(null);
            if (previewAsset?.id === updated.id) {
              setPreviewAsset(updated);
            }
          }}
        />
      )}

      {/* Modal 3: Preview Lightbox */}
      {previewAsset && (
        <PreviewAssetModal
          asset={previewAsset}
          data={data}
          onClose={() => setPreviewAsset(null)}
          onEdit={() => {
            const a = previewAsset;
            setPreviewAsset(null);
            setEditingAsset(a);
          }}
          onDelete={() => handleDeleteAsset(previewAsset)}
          notify={notify}
        />
      )}

      {/* Modal 4: Folder Modal (Create/Rename) */}
      {folderModal?.open && (
        <FolderModal
          folder={folderModal.folder}
          parentId={folderModal.parentId}
          productId={folderModal.productId}
          data={data}
          onClose={() => setFolderModal(null)}
          onSave={handleCreateOrUpdateFolder}
        />
      )}
    </div>
  );
}

// ----------------- SUBMODAL: UPLOAD -----------------
export function UploadAssetModal({
  data,
  initialOwner,
  initialFolderId,
  initialReleaseId,
  initialFiles,
  onClose,
  onUpload,
}: {
  data: Data;
  initialOwner: string;
  initialFolderId: string;
  initialReleaseId?: string;
  initialFiles?: ScannedFileItem[];
  onClose: () => void;
  onUpload: (
    assets: Asset[],
    newFolders?: AssetFolder[],
    onProgress?: UploadProgressCallback
  ) => Promise<boolean | void>;
}) {
  const { t, lang } = useI18n();
  const [selectedProductId, setSelectedProductId] = useState(initialOwner);
  const [selectedReleaseId, setSelectedReleaseId] = useState(initialReleaseId || "");
  const [selectedFolderId, setSelectedFolderId] = useState(initialFolderId);
  const [languages, setLanguages] = useState<string[]>(["zh-Hans"]);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const [skipNotice, setSkipNotice] = useState("");
  const [dragOverDropzone, setDragOverDropzone] = useState(false);

  const [filesToUpload, setFilesToUpload] = useState<
    {
      file: File;
      name: string;
      dataUrl: string;
      width: number;
      height: number;
      folderPath: string[];
    }[]
  >([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Available releases for the selected product
  const releases = useMemo(() => {
    if (!selectedProductId) return [];
    return (data.releases || []).filter(
      (r) => r.productId === selectedProductId
    );
  }, [data.releases, selectedProductId]);

  // Available folders for the selected scope
  const availableFolders = useMemo(() => {
    return (data.assetFolders || []).filter(
      (f) => f.productId === selectedProductId
    );
  }, [data.assetFolders, selectedProductId]);

  // Process scanned items (both loose files and folder items)
  // Automatically skips unsupported file formats without aborting
  const processScannedItems = async (items: ScannedFileItem[]) => {
    if (!items || !items.length) return;
    setError("");
    setBusy(true);
    try {
      const results: {
        file: File;
        name: string;
        dataUrl: string;
        width: number;
        height: number;
        folderPath: string[];
      }[] = [];

      let skippedCount = 0;
      for (const item of items) {
        if (!isImageFile(item.file)) {
          skippedCount++;
          continue;
        }
        try {
          const { dataUrl, width, height } = await readImageFile(item.file);
          const defaultName = item.file.name.replace(/\.[^/.]+$/, "");
          results.push({
            file: item.file,
            name: defaultName,
            dataUrl,
            width,
            height,
            folderPath: item.folderPath || [],
          });
        } catch {
          // If unreadable or corrupted, skip safely
          skippedCount++;
        }
      }

      if (skippedCount > 0) {
        setSkipNotice(`已自动跳过 ${skippedCount} 个不支持或非图片格式的文件`);
      }
      setFilesToUpload((prev) => [...prev, ...results]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Preload files passed from workspace drag-and-drop
  const initialLoadedRef = useRef(false);
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0 && !initialLoadedRef.current) {
      initialLoadedRef.current = true;
      processScannedItems(initialFiles);
    }
  }, [initialFiles]);

  // Handle single/multi image file selection
  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const items: ScannedFileItem[] = [];
    let skipped = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (isImageFile(file)) {
        items.push({ file, folderPath: [] });
      } else {
        skipped++;
      }
    }
    if (skipped > 0) {
      setSkipNotice(`已自动跳过 ${skipped} 个不支持的格式文件`);
    }
    await processScannedItems(items);
  };

  // Handle folder picker selection (<input webkitdirectory />)
  const handleFolderInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    const items: ScannedFileItem[] = [];
    let skipped = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!isImageFile(file)) {
        skipped++;
        continue;
      }
      let folderPath: string[] = [];
      if (file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split("/").filter(Boolean);
        if (parts.length > 1) {
          folderPath = parts.slice(0, -1);
        }
      }
      items.push({ file, folderPath });
    }
    if (skipped > 0) {
      setSkipNotice(`已自动跳过 ${skipped} 个不支持的格式文件`);
    }
    e.target.value = "";
    await processScannedItems(items);
  };

  // Handle drag and drop on modal dropzone
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDropzone(false);
    const scanned = await extractDroppedFiles(e.dataTransfer);
    if (!scanned.length) {
      setError(t("未检测到有效图片文件（支持 PNG、JPG、WebP、SVG、GIF 等）", "No valid image files detected (supports PNG, JPG, WebP, SVG, GIF, etc.)"));
      return;
    }
    await processScannedItems(scanned);
  };

  // Count distinct folders detected in filesToUpload
  const detectedFolderCount = useMemo(() => {
    const set = new Set<string>();
    for (const item of filesToUpload) {
      if (item.folderPath && item.folderPath.length > 0) {
        let p = "";
        for (const seg of item.folderPath) {
          p = p ? `${p}/${seg}` : seg;
          set.add(p);
        }
      }
    }
    return set.size;
  }, [filesToUpload]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filesToUpload.length) {
      setError(t("请至少选择一张图片或拖入文件夹", "Please select at least one image or drag in a folder"));
      return;
    }
    setBusy(true);
    setError("");
    setUploadProgress("");
    try {
      const stamp = now();

      // Resolve and create folders synchronously
      const { newFolders, itemFolderIdList } = resolveFolderHierarchy(
        filesToUpload,
        data.assetFolders || [],
        selectedFolderId || "",
        selectedProductId
      );

      const newAssets: Asset[] = filesToUpload.map((item, idx) => ({
        id: uid(),
        name: item.name.trim() || item.file.name,
        url: item.dataUrl,
        productId: selectedProductId,
        releaseId: selectedProductId ? selectedReleaseId || undefined : undefined,
        languages: languages.length > 0 ? languages : ["zh-Hans"],
        fileSize: item.file.size,
        fileName: item.file.name,
        fileType: item.file.type || "image/png",
        folderId: itemFolderIdList[idx] || "",
        width: item.width || undefined,
        height: item.height || undefined,
        createdAt: stamp,
        updatedAt: stamp,
      }));

      const res = await onUpload(newAssets, newFolders, (info) => {
        setUploadProgress(
          `正在分批上传 (${info.current}/${info.total} 批次)...`
        );
      });
      if (res === false) {
        return;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setUploadProgress("");
    }
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-asset-title"
        className="drawer upload-asset-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-heading">
          <div>
            <h2 id="upload-asset-title">{t("上传图片素材", "Upload Image Assets")}</h2>
            <p>{t("支持单张/多张图片上传或文件夹拖拽，自动同步创建文件夹层级。", "Supports single/multiple image uploads and folder dragging; folder hierarchy is created automatically.")}</p>
          </div>
          <button className="icon-button" aria-label={t("关闭", "Close")} onClick={onClose}>
            <X size={21} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="notice danger">{error}</div>}
          {skipNotice && <div className="notice info">{skipNotice}</div>}

          <div className="form-fields">
            {/* Scope / Product select */}
            <label className="field">
              <span>{t("所属 App / 归属", "Product / Scope")}<i>*</i></span>
              <select
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  setSelectedReleaseId("");
                  setSelectedFolderId("");
                }}
              >
                <option value="">{t("通用素材（非 App）", "General Assets (Non-App)")}</option>
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.split(/\s[-–—]\s/)[0]}
                  </option>
                ))}
              </select>
            </label>

            {/* Version Select (if Product is selected) */}
            {selectedProductId ? (
              <label className="field">
                <span>{t("关联版本（可选）", "Associated Version (Optional)")}</span>
                <select
                  value={selectedReleaseId}
                  onChange={(e) => setSelectedReleaseId(e.target.value)}
                >
                  <option value="">{t("未关联特定版本（独立素材）", "Unlinked (Independent Asset)")}</option>
                  {releases.map((r) => (
                    <option key={r.id} value={r.id}>
                      {t("版本", "v")} {r.version}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {/* Folder Select */}
            <label className="field">
              <span>{t("存放根目录", "Destination Folder")}</span>
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
              >
                <option value="">{t("素材根目录", "Asset Root Folder")}</option>
                {availableFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Applicable Languages (Multi-select) */}
            <div className="field">
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span>{t("适用语言（支持多选）", "Applicable Languages (Multi-select)")}</span>
                <span className="fine-print" style={{ color: "#64748b" }}>
                  {languages.length > 0 ? t("已选 {n} 门语言", "Selected {n} languages", { n: languages.length }) : t("至少选择一门语言", "Select at least one")}
                </span>
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {COMMON_ASSET_LANGUAGES.map((langItem) => {
                  const isChecked = languages.includes(langItem.code);
                  return (
                    <button
                      key={langItem.code}
                      type="button"
                      className={`tag-pill ${isChecked ? "active" : ""}`}
                      onClick={() => {
                        if (isChecked) {
                          setLanguages(languages.filter((c) => c !== langItem.code));
                        } else {
                          setLanguages([...languages, langItem.code]);
                        }
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 14,
                        fontSize: 12,
                        border: isChecked ? "1.5px solid #2563eb" : "1px solid #cbd5e1",
                        background: isChecked ? "#eff6ff" : "#fff",
                        color: isChecked ? "#1d4ed8" : "#475569",
                        fontWeight: isChecked ? 600 : 400,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span>{t(langItem.name)}</span>
                      <small style={{ opacity: 0.75, fontSize: 10 }}>({langItem.code})</small>
                      {isChecked && <span style={{ fontWeight: 700, fontSize: 11 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drag & Drop File Zone */}
            <div
              className={`asset-dropzone ${dragOverDropzone ? "drag-active" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverDropzone(true);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverDropzone(false);
              }}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => handleFiles(e.target.files)}
              />
              <input
                ref={folderInputRef}
                type="file"
                {...({ webkitdirectory: "", directory: "" } as any)}
                multiple
                style={{ display: "none" }}
                onChange={handleFolderInput}
              />
              <Upload size={32} className="dropzone-icon" />
              <div className="dropzone-text">
                <b>{t("点击选择图片，或将图片/文件夹拖拽至此处", "Click to choose images or drag images / folders here")}</b>
                <small>{t("支持拖入整个文件夹（包括多层嵌套目录），系统将自动扫描图片并同步创建对应文件夹", "Drag entire folders (including nested ones); images are scanned and folders synced automatically.")}</small>
              </div>
              <div className="dropzone-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileImage size={14} />
                  {t("选择图片文件", "Choose Images")}
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <FolderPlus size={14} />
                  {t("选择文件夹", "Choose Folder")}
                </button>
              </div>
            </div>

            {/* Uploaded Items List */}
            {filesToUpload.length > 0 && (
              <div className="upload-items-list">
                <div className="upload-list-header-row">
                  <span className="upload-list-header">
                    {lang === 'en' ? `Selected ${filesToUpload.length} images` : `已选择 ${filesToUpload.length} 张图片`}
                    {detectedFolderCount > 0 && (lang === 'en' ? ` (${detectedFolderCount} folders to sync)` : `（包含 ${detectedFolderCount} 个待同步文件夹）`)}:
                  </span>
                  <button
                    type="button"
                    className="text-button small danger"
                    onClick={() => setFilesToUpload([])}
                  >
                    {t("清空全部", "Clear All")}
                  </button>
                </div>
                {filesToUpload.map((item, idx) => (
                  <div key={idx} className="upload-item-card">
                    <img
                      src={item.dataUrl}
                      alt={item.name}
                      className="upload-item-thumb"
                    />
                    <div className="upload-item-fields">
                      <input
                        type="text"
                        placeholder={t("素材名称", "Asset Name")}
                        value={item.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFilesToUpload((prev) =>
                            prev.map((f, i) =>
                              i === idx ? { ...f, name: val } : f
                            )
                          );
                        }}
                      />
                      <div className="upload-item-meta">
                        <span>{formatBytes(item.file.size)}</span>
                        {item.width && item.height ? (
                          <span>
                            {item.width} × {item.height}
                          </span>
                        ) : null}
                        <span>{item.file.name}</span>
                        {item.folderPath && item.folderPath.length > 0 && (
                          <span
                            className="upload-item-folder-badge"
                            title={`同步创建并存入：${item.folderPath.join(" / ")}`}
                          >
                            <Folder size={11} />
                            {item.folderPath.join(" / ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-button danger"
                      title={t("移除", "Remove")}
                      onClick={() =>
                        setFilesToUpload((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-footer">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={busy}
            >
              {t("取消", "Cancel")}
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={busy || filesToUpload.length === 0}
            >
              {busy
                ? uploadProgress || t("正在上传...", "Uploading...")
                : filesToUpload.length > 1
                  ? (lang === 'en'
                    ? `Upload ${filesToUpload.length} assets${detectedFolderCount > 0 ? ` (${detectedFolderCount} folders)` : ""}`
                    : `确认上传 ${filesToUpload.length} 个素材${detectedFolderCount > 0 ? `（同步创建 ${detectedFolderCount} 个文件夹）` : ""}`)
                  : t("确认上传", "Upload")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ----------------- SUBMODAL: EDIT ASSET -----------------
export function EditAssetModal({
  asset,
  data,
  onClose,
  onSave,
}: {
  asset: Asset;
  data: Data;
  onClose: () => void;
  onSave: (updated: Asset) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(asset.name);
  const [productId, setProductId] = useState(asset.productId || "");
  const [releaseId, setReleaseId] = useState(asset.releaseId || "");
  const [folderId, setFolderId] = useState(asset.folderId || "");
  const [languages, setLanguages] = useState<string[]>(
    asset.languages && asset.languages.length > 0 ? asset.languages : ["zh-Hans"]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const releases = useMemo(() => {
    if (!productId) return [];
    return (data.releases || []).filter((r) => r.productId === productId);
  }, [data.releases, productId]);

  const availableFolders = useMemo(() => {
    return (data.assetFolders || []).filter((f) => f.productId === productId);
  }, [data.assetFolders, productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("请输入素材名称", "Please enter asset name"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...asset,
        name: trimmed,
        productId,
        releaseId: productId ? releaseId || undefined : undefined,
        folderId: folderId || "",
        languages: languages.length > 0 ? languages : ["zh-Hans"],
        updatedAt: now(),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-asset-title"
        className="drawer edit-asset-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-heading">
          <div>
            <h2 id="edit-asset-title">{t("编辑素材信息", "Edit Asset Information")}</h2>
            <p>{t("修改素材名称、归属 App、关联版本或移动至其他文件夹。", "Edit asset name, product, associated release, or move to another folder.")}</p>
          </div>
          <button className="icon-button" aria-label={t("关闭", "Close")} onClick={onClose}>
            <X size={21} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="notice danger">{error}</div>}

          <div className="form-fields">
            {/* Thumbnail Preview */}
            <div className="edit-asset-preview">
              <img src={asset.url} alt={asset.name} />
              <div className="edit-asset-preview-meta">
                <b>{asset.fileName}</b>
                <span>{formatBytes(asset.fileSize)}</span>
                {asset.width && asset.height ? (
                  <span>
                    {asset.width} × {asset.height}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Name */}
            <label className="field">
              <span>{t("素材名称", "Asset Name")}<i>*</i></span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("例如 App Store 详情页截图 1", "e.g. App Store Screenshot 1")}
                required
              />
            </label>

            {/* Product */}
            <label className="field">
              <span>{t("所属 App / 归属", "Product / Scope")}</span>
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setReleaseId("");
                  setFolderId("");
                }}
              >
                <option value="">{t("通用素材（非 App）", "General Assets (Non-App)")}</option>
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.split(/\s[-–—]\s/)[0]}
                  </option>
                ))}
              </select>
            </label>

            {/* Version */}
            {productId ? (
              <label className="field">
                <span>{t("关联版本", "Release")}</span>
                <select
                  value={releaseId}
                  onChange={(e) => setReleaseId(e.target.value)}
                >
                  <option value="">{t("未关联特定版本（独立素材）", "Unlinked (Independent Asset)")}</option>
                  {releases.map((r) => (
                    <option key={r.id} value={r.id}>
                      {t("版本", "v")} {r.version}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {/* Folder */}
            <label className="field">
              <span>{t("所在文件夹", "Folder")}</span>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              >
                <option value="">{t("根目录", "Root")}</option>
                {availableFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Applicable Languages (Multi-select) */}
            <div className="field">
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span>{t("适用语言（支持多选）", "Applicable Languages (Multi-select)")}</span>
                <span className="fine-print" style={{ color: "#64748b" }}>
                  {languages.length > 0 ? t("已选 {n} 门语言", "Selected {n} languages", { n: languages.length }) : t("至少选择一门语言", "Select at least one")}
                </span>
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {COMMON_ASSET_LANGUAGES.map((langItem) => {
                  const isChecked = languages.includes(langItem.code);
                  return (
                    <button
                      key={langItem.code}
                      type="button"
                      className={`tag-pill ${isChecked ? "active" : ""}`}
                      onClick={() => {
                        if (isChecked) {
                          setLanguages(languages.filter((c) => c !== langItem.code));
                        } else {
                          setLanguages([...languages, langItem.code]);
                        }
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 14,
                        fontSize: 12,
                        border: isChecked ? "1.5px solid #2563eb" : "1px solid #cbd5e1",
                        background: isChecked ? "#eff6ff" : "#fff",
                        color: isChecked ? "#1d4ed8" : "#475569",
                        fontWeight: isChecked ? 600 : 400,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span>{t(langItem.name)}</span>
                      <small style={{ opacity: 0.75, fontSize: 10 }}>({langItem.code})</small>
                      {isChecked && <span style={{ fontWeight: 700, fontSize: 11 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="form-footer">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={busy}
            >
              {t("取消", "Cancel")}
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={busy}
            >
              {busy ? t("保存中...", "Saving...") : t("保存修改", "Save Changes")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ----------------- SUBMODAL: PREVIEW LIGHTBOX -----------------
export function PreviewAssetModal({
  asset,
  data,
  onClose,
  onEdit,
  onDelete,
  notify,
}: {
  asset: Asset;
  data: Data;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  notify: (msg: string) => void;
}) {
  const { t, lang } = useI18n();
  const prod = data.products.find((p) => p.id === asset.productId);
  const rel = data.releases.find((r) => r.id === asset.releaseId);
  const folder = (data.assetFolders || []).find((f) => f.id === asset.folderId);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = asset.url;
    a.download = asset.fileName || `${asset.name}.png`;
    a.click();
    notify(t("开始下载素材图片", "Downloading asset image"));
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(asset.url);
      notify(t("已复制图片数据链接", "Copied image data URL"));
    } catch {
      notify(t("复制失败，请手动下载", "Copy failed, please download directly"));
    }
  };

  return (
    <div className="asset-lightbox-backdrop" onClick={onClose}>
      <div
        className="asset-lightbox-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {/* Top bar */}
        <div className="asset-lightbox-header">
          <div className="lightbox-title-wrap">
            <h3>{asset.name}</h3>
            <small>{asset.fileName}</small>
          </div>
          <div className="lightbox-actions">
            <button
              className="button secondary small"
              onClick={handleCopyLink}
              title={t("复制图片链接", "Copy Image URL")}
            >
              <Copy size={14} />
              {t("复制", "Copy")}
            </button>
            <button
              className="button secondary small"
              onClick={handleDownload}
              title={t("下载原图", "Download Original")}
            >
              <Download size={14} />
              {t("下载", "Download")}
            </button>
            <button
              className="button secondary small"
              onClick={onEdit}
              title={t("编辑素材属性", "Edit Asset Properties")}
            >
              <Pencil size={14} />
              {t("编辑", "Edit")}
            </button>
            <button
              className="button danger small"
              onClick={onDelete}
              title={t("删除此素材", "Delete Asset")}
            >
              <Trash2 size={14} />
              {t("删除", "Delete")}
            </button>
            <button
              className="icon-button close-lightbox"
              onClick={onClose}
              title={t("关闭预览", "Close Preview")}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="asset-lightbox-body">
          {/* Image Display */}
          <div className="asset-lightbox-viewer">
            <div className="viewer-checkerboard">
              <img src={asset.url} alt={asset.name} />
            </div>
          </div>

          {/* Details Sidebar */}
          <div className="asset-lightbox-sidebar">
            <h4>{t("素材详细信息", "Asset Details")}</h4>
            <dl className="lightbox-meta-list">
              <div>
                <dt>{t("素材名称", "Asset Name")}</dt>
                <dd>{asset.name}</dd>
              </div>
              <div>
                <dt>{t("原文件名", "Original Filename")}</dt>
                <dd className="selectable">{asset.fileName || t("未知", "Unknown")}</dd>
              </div>
              <div>
                <dt>{t("所属 App", "Product")}</dt>
                <dd>
                  {prod ? (
                    <span className="badge app">
                      {prod.name.split(/\s[-–—]\s/)[0]}
                    </span>
                  ) : (
                    <span className="badge neutral">{t("通用素材（非 App）", "General (Non-App)")}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("关联版本", "Release")}</dt>
                <dd>
                  {rel ? (
                    <span className="badge version">v{rel.version}</span>
                  ) : (
                    <span className="muted-text">{t("未关联", "Unlinked")}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("适用语言", "Languages")}</dt>
                <dd>
                  {asset.languages && asset.languages.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {asset.languages.map((l) => (
                        <span key={l} className="badge neutral" style={{ fontSize: 11 }}>
                          {getAssetLanguageLabel(l)} ({l})
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="muted-text">{t("未标注语言", "Not labeled")}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("文件大小", "File Size")}</dt>
                <dd>{formatBytes(asset.fileSize)}</dd>
              </div>
              {asset.width && asset.height ? (
                <div>
                  <dt>{t("分辨率", "Resolution")}</dt>
                  <dd>
                    {asset.width} × {asset.height} {lang === "en" ? "px" : "像素"}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>{t("格式类型", "Format")}</dt>
                <dd>{asset.fileType || "image"}</dd>
              </div>
              <div>
                <dt>{t("存放目录", "Folder")}</dt>
                <dd>{folder ? folder.name : t("根目录", "Root")}</dd>
              </div>
              <div>
                <dt>{t("上传时间", "Uploaded At")}</dt>
                <dd>{new Date(asset.createdAt).toLocaleString("zh-CN")}</dd>
              </div>
              <div>
                <dt>{t("更新时间", "Updated At")}</dt>
                <dd>{new Date(asset.updatedAt).toLocaleString("zh-CN")}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------- SUBMODAL: FOLDER -----------------
function FolderModal({
  folder,
  parentId,
  productId,
  data,
  onClose,
  onSave,
}: {
  folder?: AssetFolder;
  parentId: string;
  productId: string;
  data: Data;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(folder?.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parentFolder = (data.assetFolders || []).find(
    (f) => f.id === parentId
  );
  const ownerName = productId
    ? data.products.find((p) => p.id === productId)?.name.split(/\s[-–—]\s/)[0] || t("产品", "Product")
    : t("通用素材", "General Assets");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-drawer-title"
        className="drawer asset-folder-drawer asset-folder-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-heading">
          <div>
            <h2 id="folder-drawer-title">
              {folder ? t("重命名文件夹", "Rename Folder") : t("新建文件夹", "New Folder")}
            </h2>
            <p>
              {folder
                ? t("修改当前文件夹名称，同级目录下不能重名。", "Edit folder name; names must be unique within same level.") : t("创建素材分类文件夹，支持多层级嵌套管理。", "Create categories for assets with nested folders.")}
            </p>
          </div>
          <button className="icon-button" aria-label={t("关闭", "Close")} onClick={onClose}>
            <X size={21} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="notice danger">{error}</div>}

          <div className="form-fields">
            {/* Folder Scope / Parent Info */}
            <div className="asset-folder-drawer-meta">
              <span className="folder-meta-badge">
                {t("归属：", "Scope: ")}<b>{ownerName}</b>
              </span>
              {parentFolder ? (
                <span className="folder-meta-badge">
                  {t("上级目录：", "Parent: ")}<b>{parentFolder.name}</b>
                </span>
              ) : (
                <span className="folder-meta-badge muted">
                  {t("存放位置：", "Location: ")}<b>{t("根目录", "Root")}</b>
                </span>
              )}
            </div>

            <label className="field">
              <span>{t("文件夹名称", "Folder Name")}<i>*</i></span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("例如：应用截屏、社交媒体物料", "e.g. App Screenshots, Social Media Graphics")}
                autoFocus
                required
              />
              <small>{t("输入清晰明确的文件夹名称，同级目录下不可重名。", "Enter a distinct folder name. Same level cannot have duplicates.")}</small>
            </label>
          </div>

          <div className="form-footer">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={busy}
            >
              {t("取消", "Cancel")}
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={busy || !name.trim()}
            >
              {busy ? t("保存中...", "Saving...") : folder ? t("确认重命名", "Rename") : t("确认创建", "Create")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
