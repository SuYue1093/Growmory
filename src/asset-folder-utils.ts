import type { Asset, AssetFolder } from "./types.ts";
import { uid } from "./types.ts";

export interface BaseFolder {
  id: string;
  productId: string;
  name: string;
  parentId: string;
}

export interface FolderTreeNode<T extends BaseFolder = AssetFolder> {
  folder: T;
  depth: number;
  fullPath: string;
}

/**
 * 递归构建文件夹层级树列表（带层级深度和完整路径信息），方便树状展示与筛选
 */
export function buildFolderTree<T extends BaseFolder = AssetFolder>(
  folders: T[],
  parentId: string = "",
  depth: number = 0,
  parentPath: string = "",
  visited = new Set<string>()
): FolderTreeNode<T>[] {
  const children = folders.filter((f) => (f.parentId || "") === parentId);
  children.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const result: FolderTreeNode<T>[] = [];
  for (const child of children) {
    if (visited.has(child.id)) continue;
    visited.add(child.id);
    const fullPath = parentPath ? `${parentPath} / ${child.name}` : child.name;
    result.push({ folder: child, depth, fullPath });
    const descendants = buildFolderTree(folders, child.id, depth + 1, fullPath, visited);
    result.push(...descendants);
  }
  return result;
}

/**
 * 计算每个文件夹的项目总数（包含当前层级及所有下级、更深层级子文件夹的所有项目综合）
 */
export function calculateFolderTotalItemCounts(
  allFolders: BaseFolder[] = [],
  allItems: { folderId?: string }[] = []
): Map<string, number> {
  const childrenMap = new Map<string, string[]>();
  for (const f of allFolders) {
    const p = f.parentId || "";
    if (!childrenMap.has(p)) childrenMap.set(p, []);
    childrenMap.get(p)!.push(f.id);
  }

  const directCounts = new Map<string, number>();
  for (const item of allItems) {
    if (item.folderId) {
      directCounts.set(item.folderId, (directCounts.get(item.folderId) || 0) + 1);
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
 * 计算素材库中每个文件夹的素材总数（包含当前层级及所有下级、更深层级子文件夹的所有素材综合）
 */
export function calculateFolderTotalAssetCounts(
  allFolders: AssetFolder[] = [],
  allAssets: Asset[] = []
): Map<string, number> {
  return calculateFolderTotalItemCounts(allFolders, allAssets);
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

/**
 * 递归解析拖拽或上传时的嵌套路径并创建缺失的文件夹层级
 */
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

/**
 * 将大体积素材分批以防超过单个 HTTP 请求限制
 */
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
