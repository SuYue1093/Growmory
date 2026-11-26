import type { Asset } from "./types";

export function compareVersionsDesc(aVer?: string, bVer?: string): number {
  const cleanA = (aVer || "").replace(/^v/i, "").trim();
  const cleanB = (bVer || "").replace(/^v/i, "").trim();
  const partsA = cleanA.split(/[-.+_]/);
  const partsB = cleanB.split(/[-.+_]/);
  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const segA = partsA[i];
    const segB = partsB[i];
    if (segA === undefined) return 1;
    if (segB === undefined) return -1;
    const numA = Number(segA);
    const numB = Number(segB);
    const isNumA = !isNaN(numA) && segA.trim() !== "";
    const isNumB = !isNaN(numB) && segB.trim() !== "";
    if (isNumA && isNumB) {
      if (numA !== numB) return numB - numA;
    } else {
      const cmp = segB.localeCompare(segA, undefined, { numeric: true });
      if (cmp !== 0) return cmp;
    }
  }
  return cleanB.localeCompare(cleanA, undefined, { numeric: true });
}

export function assetMatchesLanguage(asset: Pick<Asset, "languages">, langFilter: string): boolean {
  if (langFilter === "all") return true;
  const langs = asset.languages && asset.languages.length > 0 ? asset.languages : ["zh-Hans"];
  if (langs.includes("all")) return true;
  if (langs.includes(langFilter)) return true;
  if (langFilter.startsWith("zh") && langs.some((l) => l.startsWith("zh") || l === "中文")) return true;
  if (langFilter.startsWith("en") && langs.some((l) => l.startsWith("en") || l === "英文")) return true;
  return false;
}
