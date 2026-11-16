export function normalizeHisuyueSlug(value: string, maxLength = 100): string {
  return value.normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, maxLength)
    .replace(/-+$/, "");
}

export const normalizeSiteSlug = normalizeHisuyueSlug;
