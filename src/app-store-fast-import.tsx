import { useState, useEffect } from "react";
import { Search, Download, X, Star } from "lucide-react";
import type { Product } from "./types";
import { uid } from "./types";
import { useI18n } from "./i18n.ts";
import { formatDisplayPrice } from "./currency";

export type PublicAppItem = {
  id: number | string;
  appId: string;
  title: string;
  url: string;
  description?: string;
  icon: string;
  iconBase64?: string;
  genres?: string[];
  genre?: string;
  primaryGenre?: string;
  price?: number;
  currency?: string;
  free?: boolean;
  developer?: string;
  developerWebsite?: string;
  developerUrl?: string;
  score?: number;
  reviews?: number;
  version?: string;
  releaseNotes?: string;
  supportedDevices?: string[];
};

export function AppStoreFastImportModal({
  onClose,
  onImport,
  onSelectApp,
  notify,
}: {
  onClose: () => void;
  onImport?: (newProduct: Product) => Promise<boolean>;
  onSelectApp?: (app: PublicAppItem) => void;
  notify: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("cn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<PublicAppItem[]>([]);

  // Auto-fetch suggestions when user types keywords (debounce 300ms)
  useEffect(() => {
    const raw = query.trim();
    if (!raw || raw.startsWith("http://") || raw.startsWith("https://") || /^\d+$/.test(raw)) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch("/api/app-store/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ term: raw, country }),
        });
        if (resp.ok) {
          const list = await resp.json();
          if (Array.isArray(list)) setSuggestions(list.slice(0, 6));
        }
      } catch {
        // ignore suggestions error
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, country]);

  async function handleSearch(searchTerm?: string) {
    const term = (searchTerm || query).trim();
    if (!term) return;
    setBusy(true);
    setError("");
    setResults([]);

    try {
      // 1. Check if input is URL, ID or Bundle
      const parseResp = await fetch("/api/app-store/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: term }),
      });
      const parseData = await parseResp.json();
      const parsed = parseData?.parsed;

      if (parsed && (parsed.id || parsed.appId)) {
        // Direct lookup with high-res base64 icon
        const lookupResp = await fetch("/api/app-store/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: parsed.id,
            appId: parsed.appId,
            country: parsed.country || country,
            withIconBase64: true,
          }),
        });
        const app = await lookupResp.json();
        if (!lookupResp.ok) throw new Error(app.error || t("未找到该应用", "App not found"));
        setResults([app]);
      } else {
        // Search by keyword
        const searchResp = await fetch("/api/app-store/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            term: parsed?.term || term,
            country,
            num: 12,
          }),
        });
        const list = await searchResp.json();
        if (!searchResp.ok) throw new Error(list.error || t("搜索失败", "Search failed"));
        if (!Array.isArray(list) || list.length === 0) {
          setError(t("未检索到相关 App，请尝试更换关键词或切换区域。", "No related App found, please try another keyword or region."));
        } else {
          setResults(list);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePickApp(app: PublicAppItem) {
    if (onSelectApp) {
      // If we don't have iconBase64 yet, fetch full details with iconBase64
      if (!app.iconBase64) {
        setBusy(true);
        try {
          const lookupResp = await fetch("/api/app-store/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: String(app.id),
              country,
              withIconBase64: true,
            }),
          });
          if (lookupResp.ok) {
            const fullApp = await lookupResp.json();
            onSelectApp(fullApp);
            onClose();
            return;
          }
        } catch {
          // fallback to current app
        } finally {
          setBusy(false);
        }
      }
      onSelectApp(app);
      onClose();
      return;
    }

    if (onImport) {
      setBusy(true);
      setError("");
      try {
        let appToImport = app;
        if (!app.iconBase64) {
          const lookupResp = await fetch("/api/app-store/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: String(app.id),
              country,
              withIconBase64: true,
            }),
          });
          if (lookupResp.ok) {
            appToImport = await lookupResp.json();
          }
        }

        const priceText = appToImport.free ? t("免费", "Free") : formatDisplayPrice(appToImport.price, appToImport.free, appToImport.currency);
        const platformText = appToImport.supportedDevices?.some(d => d.toLowerCase().includes("ipad"))
          ? "iPhone、iPad"
          : "iPhone";

        const newProduct: Product = {
          id: uid(),
          name: appToImport.title,
          englishName: appToImport.appId || "",
          summary: (appToImport.description || "").slice(0, 300),
          appId: String(appToImport.id),
          price: priceText,
          platform: platformText,
          website: appToImport.developerWebsite || appToImport.developerUrl || appToImport.url || "",
          icon: appToImport.iconBase64 || "",
          color: "blue",
        };

        const ok = await onImport(newProduct);
        if (ok) {
          notify(t(`已成功导入产品「${appToImport.title}」`, `Successfully imported product "${appToImport.title}"`));
          onClose();
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box app-store-import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h3>{t("从 App Store 公开检索与导入", "Search & Import from App Store")}</h3>
          <button className="icon-button" onClick={onClose} aria-label={t("关闭", "Close")}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p className="fine-print" style={{ margin: "0 0 12px 0" }}>
            {t("无需配置 Apple 开发者凭据与私钥，支持直接通过 App Store 链接、App ID（如 414478124）或关键词搜索任何已上架 App。", "No Apple developer credentials required. Search any published App directly by App Store URL, App ID, or keywords.")}
          </p>

          <form
            onSubmit={e => {
              e.preventDefault();
              void handleSearch();
            }}
            style={{ display: "flex", gap: 8, marginBottom: 12 }}
          >
            <div style={{ display: "flex", flex: 1, gap: 6 }}>
              <input
                type="text"
                className="input-text"
                style={{ flex: 1 }}
                placeholder={t("粘贴 App Store 链接、App ID 或输入应用名称（如 微信、Notion）", "Paste App Store link, App ID, or enter app name (e.g. WeChat, Notion)")}
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
              <select
                className="input-select"
                style={{ width: 110 }}
                value={country}
                onChange={e => setCountry(e.target.value)}
              >
                <option value="cn">{t("中国 (CN)", "China (CN)")}</option>
                <option value="us">{t("美国 (US)", "United States (US)")}</option>
                <option value="jp">{t("日本 (JP)", "Japan (JP)")}</option>
                <option value="gb">{t("英国 (GB)", "United Kingdom (GB)")}</option>
                <option value="hk">{t("香港 (HK)", "Hong Kong (HK)")}</option>
                <option value="tw">{t("台湾 (TW)", "Taiwan (TW)")}</option>
              </select>
            </div>
            <button className="button primary" type="submit" disabled={busy || !query.trim()}>
              <Search size={15} /> {busy ? t("检索中…", "Searching...") : t("检索", "Search")}
            </button>
          </form>

          {/* Search suggestions from Apple hints */}
          {suggestions.length > 0 && (
            <div className="app-store-hints" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              <span className="fine-print" style={{ alignSelf: "center", marginRight: 4 }}>{t("热搜建议：", "Suggestions:")}</span>
              {suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  className="tag"
                  style={{ cursor: "pointer", background: "var(--bg-tag, #f1f5f9)", border: "none" }}
                  onClick={() => {
                    setQuery(s);
                    void handleSearch(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {error && <p role="alert" style={{ color: "var(--color-danger, #ef4444)", margin: "8px 0" }}>{error}</p>}

          {/* Results list */}
          {results.length > 0 && (
            <div className="app-store-results" style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map(app => (
                <div
                  key={app.id}
                  className="app-store-result-card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 10,
                    border: "1px solid var(--border-color, #e2e8f0)",
                    borderRadius: 8,
                    background: "var(--bg-card, #ffffff)",
                  }}
                >
                  <img
                    src={app.icon}
                    alt={app.title}
                    style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {app.title}
                      </strong>
                      {app.primaryGenre && <span className="tag small">{app.primaryGenre}</span>}
                    </div>
                    <div className="fine-print" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2, flexWrap: "nowrap" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                        {app.developer || t("未知", "Unknown")}
                      </span>
                      {app.score != null && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "#eab308", whiteSpace: "nowrap", flexShrink: 0 }}>
                          <Star size={12} fill="#eab308" /> {app.score.toFixed(1)} ({app.reviews || 0})
                        </span>
                      )}
                      <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                        {app.free ? t("免费", "Free") : formatDisplayPrice(app.price, app.free, app.currency)}
                      </span>
                      <span style={{ whiteSpace: "nowrap", flexShrink: 0, opacity: 0.7 }}>
                        ID: {app.id}
                      </span>
                    </div>
                  </div>
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => void handlePickApp(app)}
                    style={{ flexShrink: 0 }}
                  >
                    <Download size={14} /> {onSelectApp ? t("填入表单", "Fill Form") : t("导入产品", "Import Product")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="button secondary" onClick={onClose}>
            {t("关闭", "Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
