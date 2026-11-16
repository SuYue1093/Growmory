import { PlatformLogo } from './platform-logo';
import React, { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  LayoutDashboard,
  Layers3,
  Rocket,
  FileText,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Check,
  Sparkles,
  Globe,
  Download,
  Trash2,
  Pencil,
  CheckCircle2,
  BookOpen,
  Leaf,
  Menu,
  LoaderCircle,
  ExternalLink,
  ChartNoAxesCombined,
  AlertCircle,
  Cpu,
  Image as ImageIcon,
  Smartphone,
  Video,
  Key,
  Type,
  BadgeDollarSign,
  CreditCard,
  Bug,
  Layers,
  Split,
  Clock,
  Laptop,
  Tv,
  Glasses,
  Copy,
} from "lucide-react";
import type {
  Product,
  Doc,
  DocFolder,
  Asset,
  AssetFolder,
  Release,
  Content,
  Task,
  Data,
} from "./types";
import { uid, now, today, RELEASE_TAG_OPTIONS, RELEASE_TAG_CATEGORIES, HISTORICAL_RELEASE_TAGS, inferMarketingTags, isAiContent, COMMON_ASSET_LANGUAGES, getAssetLanguageLabel } from "./types";
import "./style.css";
import { readLogo } from "./images";
import { ReleasePublication } from "./release-publication";
import { AppStoreFastImportModal } from "./app-store-fast-import";
import { Analytics, requestInsights, type Insights } from "./trends";
import { WorkbenchHome, getReminderTagStyle, formatReminderTime, type ReminderItem } from "./workbench-home";
import { Aso } from "./aso";
import { ProductCustomPages } from "./product-custom-pages";
import { ProductPageOptimization } from "./product-page-optimization";
import { AppStoreConnect } from "./app-store-connect";
import { McpSettings } from "./mcp-settings";
import { AiSettings } from "./ai-settings";
import { Setup } from "./setup";
import { Library } from "./library";
import { AssetLibrary, UploadAssetModal, EditAssetModal, PreviewAssetModal, formatBytes, splitIntoBatches } from "./asset-library";
import { DocEditor } from "./doc-editor";
import { Operations } from "./operations";
import { findPlatform, platformName } from "./platforms";
import { MarketingBrief } from "./marketing-brief";
import { DevelopmentJournal } from "./development-journal";
import { MarketingList, MarketingEditor, marketingStatus, ContentGroupModal } from "./marketing-content";
import { reviseRelease } from "./release-workflow";
import { I18nProvider, useI18n, t as i18nT } from "./i18n.ts";
import { TaskDetailModal } from "./task-detail-modal";
import { useCurrency, formatDisplayPrice, replaceCurrencySymbol } from "./currency";

type Page =
  "operations" | "home" | "products" | "knowledge" | "assets" | "aso" | "analytics" | "setup" | "releases" | "contents" | "tasks" | "settings";
type Field = {
  key: string;
  label: string;
  type?: string;
  placeholder?: string;
  options?: string[];
  optionLabels?: Record<string, string>;
  required?: boolean;
};
type Form = {
  title: string;
  draftKey?: string;
  draftBase?: string;
  description?: string;
  fields: Field[];
  values: Record<string, string>;
  save: (values: Record<string, string>) => Promise<boolean | void>;
  onDelete?: () => void;
  deleteLabel?: string;
};
const nav = [
  { id: "home", label: "工作台", icon: LayoutDashboard },
  { id: "products", label: "产品", icon: Layers3 },
  { id: "knowledge", label: "资料库", icon: BookOpen },
  { id: "assets", label: "素材库", icon: ImageIcon },
  { id: "analytics", label: "App 数据分析", icon: ChartNoAxesCombined },
  { id: "operations", label: "运营", icon: Rocket },
  { id: "contents", label: "营销内容", icon: FileText },
] as const;
const productTabs = [
  ["overview", "概览"],
  ["docs", "产品资料"],
  ["assets", "素材库"],
  ["history", "版本发布"],
  ["aso", "ASO优化"],
  ["custom-pages", "自定义页面"],
  ["page-optimization", "产品页面优化"],
];
const platformText = (value: string) => value.split(/[、,]/).map(item => ({ MAC_OS: "macOS", IOS: "iOS", TV_OS: "tvOS", VISION_OS: "visionOS" })[item.trim()] || item.trim()).join(" / ");

export function getReleasePlatformText(r: Release, _prod?: Product): string {
  let plats: string[] = [];
  if (r.platforms && r.platforms.length > 0) {
    plats = r.platforms;
  } else if (r.platformDetails && Object.keys(r.platformDetails).length > 0) {
    plats = Object.keys(r.platformDetails);
  } else if (r.storeSources && Object.keys(r.storeSources).length > 0) {
    plats = Object.keys(r.storeSources);
  } else if (r.storeSource?.platform) {
    plats = [r.storeSource.platform];
  }
  if (!plats.length) return "";
  const map: Record<string, string> = {
    IOS: "iOS",
    MAC_OS: "macOS",
    TV_OS: "tvOS",
    VISION_OS: "visionOS",
    iOS: "iOS",
    macOS: "macOS",
    tvOS: "tvOS",
    visionOS: "visionOS",
  };
  return Array.from(new Set(plats.map(p => map[p] || p))).join(" / ");
}

export type PlatformOption = {
  id: string;
  label: string;
  ascPlatform?: "IOS" | "MAC_OS" | "TV_OS" | "VISION_OS";
};

export const ALL_APPLE_PLATFORMS: PlatformOption[] = [
  { id: "IOS", label: "iOS", ascPlatform: "IOS" },
  { id: "MAC_OS", label: "macOS", ascPlatform: "MAC_OS" },
  { id: "TV_OS", label: "tvOS", ascPlatform: "TV_OS" },
  { id: "VISION_OS", label: "visionOS", ascPlatform: "VISION_OS" },
];

export function getProductPlatforms(product?: Product): PlatformOption[] {
  const options: PlatformOption[] = [];
  const seen = new Set<string>();

  const add = (id: string, label: string, ascPlatform?: "IOS" | "MAC_OS" | "TV_OS" | "VISION_OS") => {
    if (!seen.has(id)) {
      seen.add(id);
      options.push({ id, label, ascPlatform });
    }
  };

  const normalizeToken = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (lower === "ios" || lower === "iphone" || lower === "ipad" || lower === "ipados" || lower.includes("iphone") || lower.includes("ipad")) {
      add("IOS", "iOS", "IOS");
    } else if (lower === "macos" || lower === "mac_os" || lower === "mac" || lower === "osx") {
      add("MAC_OS", "macOS", "MAC_OS");
    } else if (lower === "tvos" || lower === "tv_os" || lower === "apple tv") {
      add("TV_OS", "tvOS", "TV_OS");
    } else if (lower === "visionos" || lower === "vision_os" || lower === "vision pro" || lower.includes("vision")) {
      add("VISION_OS", "visionOS", "VISION_OS");
    } else {
      add(trimmed, trimmed);
    }
  };

  if (product?.platform) {
    const parts = product.platform.split(/[、,/;|\n]+/);
    for (const p of parts) normalizeToken(p);
  }

  if (product?.appStore?.versions?.length) {
    for (const v of product.appStore.versions) {
      if (v.platform === "IOS") add("IOS", "iOS", "IOS");
      else if (v.platform === "MAC_OS") add("MAC_OS", "macOS", "MAC_OS");
      else if (v.platform === "TV_OS") add("TV_OS", "tvOS", "TV_OS");
      else if (v.platform === "VISION_OS") add("VISION_OS", "visionOS", "VISION_OS");
    }
  }

  if (options.length === 0) {
    add("IOS", "iOS", "IOS");
  }

  return options;
}

export function PlatformIcon({ platform, size = 15, className = "" }: { platform: string; size?: number; className?: string }) {
  const p = platform.toUpperCase();
  if (p === "IOS" || p.includes("IPHONE") || p.includes("IPAD")) {
    return <Smartphone size={size} className={className} />;
  }
  if (p === "MAC_OS" || p.includes("MAC")) {
    return <Laptop size={size} className={className} />;
  }
  if (p === "TV_OS" || p.includes("TV")) {
    return <Tv size={size} className={className} />;
  }
  if (p === "VISION_OS" || p.includes("VISION")) {
    return <Glasses size={size} className={className} />;
  }
  return <Layers size={size} className={className} />;
}
const shortName = (p?: Product) => p?.name.split(/\s[-–—]\s/)[0] || i18nT("未知产品", "Unknown Product");
const readLocation = () => {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.get("page") === "products" && q.get("tab") === "contents") {
    q.set("page", "contents"); q.set("scope", q.get("product") || "all"); q.delete("product"); q.delete("tab");
  }
  if (q.get("page") === "promotion") q.set("page", "operations");
  const pages = ["operations", "home", "products", "releases", "contents", "tasks", "settings", "setup", "knowledge", "assets", "aso", "analytics"];
  return {
    page: (q.get("page") === "products" && q.get("tab") === "trends" ? "analytics" : pages.includes(q.get("page") || "") ? q.get("page") : "home") as Page,
    scope: q.get("page") === "products" && q.get("tab") === "trends" ? q.get("product") || "all" : q.get("scope") === "__shared" ? "all" : q.get("scope") || "all", library: q.get("library") || (q.get("scope") === "__shared" ? "shared" : "all"),
    assetScope: q.get("assetScope") || "all", assetFolder: q.get("assetFolder") || "",
    product: q.get("page") === "analytics" || q.get("tab") === "trends" ? null : q.get("product"), release: q.get("release"),
    tab: ((q.get("page") === "analytics" && ["stats", "reports"].includes(q.get("tab") || ""))
      || (q.get("page") === "contents" && ["articles", "journal"].includes(q.get("tab") || ""))
      || (q.get("page") === "operations" && findPlatform(q.get("tab") || "")))
      ? q.get("tab")!
      : productTabs.some(([id]) => id === q.get("tab"))
        ? q.get("tab")!
        : "overview",
    content: q.get("page") === "contents" ? q.get("content") : null,
    folder: q.get("folder") || "", filter: ["draft", "review", "ready", "published"].includes(q.get("filter") || "") ? q.get("filter")! : "all", doc: q.get("doc"), stage: ["update", "notes", "store", "promotion", "knowledge", "marketing"].includes(q.get("stage") || "") ? q.get("stage")! : "auto", settings: ["ai", "backup"].includes(q.get("settings") || "") ? q.get("settings")! : "connections"
  };
};
const getDocUrl = (doc: Doc) => {
  const q = new URLSearchParams();
  if (doc.productId) {
    q.set("page", "products");
    q.set("product", doc.productId);
    q.set("tab", "docs");
  } else {
    q.set("page", "knowledge");
    q.set("library", "shared");
  }
  q.set("doc", doc.id);
  if (doc.folderId) q.set("folder", doc.folderId);
  return `${window.location.origin}${window.location.pathname}#${q.toString()}`;
};
const statusLabel: Record<string, string> = {
  draft: "草稿",
  review: "待发布",
  published: "已发布",
  archived: "已归档",
  preparing: "准备中",
  ready: "待发布",
  confirmed: "已确认",
  pending: "待确认",
};
const dateText = (s: string) =>
  s
    ? new Date(s.includes("T") ? s : s + "T00:00:00").toLocaleDateString(
      i18nT("zh-CN", "en-US") === "en-US" ? "en-US" : "zh-CN",
      { month: "short", day: "numeric" },
    )
    : i18nT("未安排", "Unscheduled");
function Icon({ product, size = 42 }: { product?: Product; size?: number }) {
  return product?.icon ? (
    <img
      className="app-icon"
      src={product.icon}
      alt=""
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={`app-icon fallback ${product?.color || "blue"}`}
      style={{ width: size, height: size }}
    >
      {product?.name?.slice(0, 1) || "G"}
    </span>
  );
}
function Badge({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <span className={`badge ${value}`}>{t(statusLabel[value] || value)}</span>
  );
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Leaf size={28} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
type RecurringReminder = { kind: "operations" | "report" | "aso"; targetId: string; days: number; lastAt: string | null };

function App() {
  const { lang, setLang, t } = useI18n();
  const { toggle: toggleCurrency } = useCurrency();
  const [data, setData] = useState<Data | null>(null);
  const stateRef = useRef<{ data: Data; revision: number } | null>(null);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [initialRoute] = useState(readLocation);
  const [page, setPage] = useState<Page>(initialRoute.page);
  const [signals, setSignals] = useState<Record<string, Insights | null>>({});
  const [asoDrafts, setAsoDrafts] = useState<Record<string, { count: number; plans: any[] }>>({});
  const signalCache = useRef(signals);
  useEffect(() => { signalCache.current = signals; }, [signals]);
  const signalProducts = JSON.stringify(data?.products.map(p => [p.id, p.appStore?.appId, p.appStore?.syncedAt]) || []);

  const logoClickCountRef = useRef(0);
  const logoClickTimerRef = useRef<number | null>(null);
  const logoLastClickTimeRef = useRef<number>(0);

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const nowTime = Date.now();

    if (nowTime - logoLastClickTimeRef.current > 1000) {
      logoClickCountRef.current = 1;
    } else {
      logoClickCountRef.current += 1;
    }
    logoLastClickTimeRef.current = nowTime;

    if (logoClickTimerRef.current) {
      window.clearTimeout(logoClickTimerRef.current);
      logoClickTimerRef.current = null;
    }

    if (logoClickCountRef.current >= 5) {
      logoClickCountRef.current = 0;
      logoLastClickTimeRef.current = 0;
      const nextMode = toggleCurrency();
      notify(
        nextMode === 'USD'
          ? t('演示后门已激活：已切换为美元 ($)', 'Demo backdoor activated: switched to USD ($)')
          : t('演示后门已激活：已切换为人民币 (¥)', 'Demo backdoor activated: switched to CNY (¥)')
      );
      return;
    }

    if (logoClickCountRef.current === 1) {
      logoClickTimerRef.current = window.setTimeout(() => {
        if (logoClickCountRef.current === 1) {
          go('home');
          logoClickCountRef.current = 0;
        }
      }, 350);
    }
  };

  useEffect(() => {
    let active = true;
    const fetchAsoDrafts = async () => {
      if (!data?.products) return;
      const linked = data.products.filter(p => p.appStore?.appId);
      for (const p of linked) {
        try {
          const res = await fetch(`/api/app-store-connect/aso/${encodeURIComponent(p.id)}/research`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (!active) return;
          if (res.ok) {
            const workspace = await res.json();
            const drafts = (workspace.plans || []).filter((plan: any) => plan.status === 'draft');
            setAsoDrafts(prev => ({ ...prev, [p.id]: { count: drafts.length, plans: drafts } }));
          }
        } catch { }
      }
    };
    void fetchAsoDrafts();
    window.addEventListener("focus", fetchAsoDrafts);
    return () => {
      active = false;
      window.removeEventListener("focus", fetchAsoDrafts);
    };
  }, [data?.products]);
  useEffect(() => {
    let active = true;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const products = JSON.parse(signalProducts) as [string, string | undefined, string | undefined][];
        const entries = await Promise.all(products.map(async ([id, appId]) => {
          if (!appId) return [id, null] as const;
          const cached = signalCache.current[id];
          return [id, await requestInsights(id, 'latest', undefined, cached?.appId === appId ? cached : null).catch(() => undefined)] as const;
        }));
        if (active) setSignals(previous => Object.fromEntries(entries.map(([id, value]) => [
          id, value === undefined || (value && previous[id]?.appId === value.appId && previous[id]!.checkedAt > value.checkedAt)
            ? previous[id] ?? null : value,
        ])));
      } finally {
        running = false;
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    const timer = page === "analytics" ? window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000) : undefined;
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [signalProducts, page]);
  const [scope, setScope] = useState(initialRoute.scope);
  const [libraryScope, setLibraryScope] = useState(initialRoute.library);
  const [assetScope, setAssetScope] = useState(initialRoute.assetScope);
  const [assetFolderId, setAssetFolderId] = useState(initialRoute.assetFolder);
  const [productId, setProductId] = useState<string | null>(initialRoute.product);
  const [releaseId, setReleaseId] = useState<string | null>(initialRoute.release);
  const [tab, setTab] = useState(initialRoute.tab);
  const [recurring, setRecurring] = useState<RecurringReminder[]>([]);
  useEffect(() => {
    if (page !== "home" && page !== "tasks" && page !== "products") return;
    let active = true;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const response = await fetch("/api/recurring-reminders", { cache: "no-store" });
        if (!response.ok) return;
        const items = await response.json();
        if (active) setRecurring(items);
      } catch {
        // Keep the last successfully loaded reminders during a connection failure.
      } finally {
        running = false;
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [page, tab, productId]);
  const [query, setQuery] = useState("");
  const [mobile, setMobile] = useState(false);
  const [productsExpanded, setProductsExpanded] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [targetReportNav, setTargetReportNav] = useState<{ reportId: string; quote?: string } | null>(null);
  const [marketingBrief, setMarketingBrief] = useState<{ productId?: string; releaseId?: string } | null>(null);
  const [creatingContentGroup, setCreatingContentGroup] = useState<{
    productIds?: string[];
    title?: string;
    direction?: string;
    channels?: string[];
  } | null>(null);
  const [localEditingContent, setEditingContent] = useState<Content | null>(null);
  const [linkedContentId, setLinkedContentId] = useState(initialRoute.content);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    action: () => void;
  } | null>(null);
  const [activeDoc, setActiveDoc] = useState<string | null>(initialRoute.doc);
  const [folderId, setFolderId] = useState(initialRoute.folder);
  const [editingDoc, setEditingDoc] = useState<{
    doc?: Doc;
    productId: string;
    folderId: string;
  } | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [showAppStoreModal, setShowAppStoreModal] = useState(false);
  const [filter, setFilter] = useState(initialRoute.filter);
  const [releaseStage, setReleaseStage] = useState(initialRoute.stage);
  const [settingsTab, setSettingsTab] = useState(initialRoute.settings);
  const [aiSubTab, setAiSubTab] = useState<"internal" | "external">("internal");
  const listScope = useRef(initialRoute.scope);
  useEffect(() => {
    const restore = () => {
      const r = readLocation();
      setPage(r.page); setScope(r.scope); setLibraryScope(r.library); setAssetScope(r.assetScope); setAssetFolderId(r.assetFolder); setProductId(r.product); setReleaseId(r.release); setTab(r.tab); setFilter(r.filter); setActiveDoc(r.doc); setLinkedContentId(r.content); setEditingContent(null); setFolderId(r.folder); setReleaseStage(r.stage); setSettingsTab(r.settings); setQuery(""); setMobile(false);
    };
    window.addEventListener("popstate", restore); window.addEventListener("hashchange", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, []);
  useEffect(() => {
    const q = new URLSearchParams({ page, scope, tab, filter, stage: releaseStage, settings: settingsTab });
    if (productId) q.set("product", productId);
    if (releaseId) q.set("release", releaseId);
    if (activeDoc) q.set("doc", activeDoc);
    if (page === "contents" && linkedContentId) q.set("content", linkedContentId);
    if (folderId) q.set("folder", folderId);
    if (libraryScope !== "all") q.set("library", libraryScope);
    if (assetScope !== "all") q.set("assetScope", assetScope);
    if (assetFolderId) q.set("assetFolder", assetFolderId);
    const hash = "#" + q.toString();
    if (location.hash !== hash) {
      if (!location.hash) window.history.replaceState(null, "", hash);
      else window.history.pushState(null, "", hash);
    }
  }, [page, scope, productId, releaseId, tab, filter, activeDoc, linkedContentId, folderId, releaseStage, settingsTab, libraryScope, assetScope, assetFolderId]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [ai, setAi] = useState({ configured: false, model: "" });
  useEffect(() => {
    fetch("/api/state")
      .then((r) => {
        if (!r.ok) throw Error("无法读取本机工作区");
        return r.json();
      })
      .then((s) => {
        stateRef.current = s;
        setData(s.data);
      })
      .catch((e) => setError(e.message));
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then(setAi)
      .catch(() => { });
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (
        document.hidden ||
        saving.current ||
        form ||
        history ||
        confirm
      )
        return;
      try {
        const r = await fetch("/api/state");
        if (!r.ok) return;
        const next = await r.json();
        if (
          active &&
          !saving.current &&
          stateRef.current &&
          next.revision > stateRef.current.revision
        ) {
          stateRef.current = next;
          setData(next.data);
        }
      } catch {
        /* Keep the current workspace available during a transient disconnect. */
      }
    };
    const timer = setInterval(refresh, 2500);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [!!form, !!history, !!confirm]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = (s: string) => setToast(s);
  async function save(mut: (d: Data) => void, restoreBackup = false) {
    if (!stateRef.current || saving.current) {
      notify("正在保存，请稍候");
      return false;
    }
    saving.current = true;
    const next = structuredClone(stateRef.current.data);
    try {
      mut(next);
      const r = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: next,
          revision: stateRef.current.revision,
          ...(restoreBackup ? { restoreBackup: true } : {}),
        }),
      });
      const result = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          const latest = await fetch("/api/state").then((response) =>
            response.json(),
          );
          stateRef.current = latest;
          setData(latest.data);
          throw Error(
            "资料已在其他入口更新，已同步最新数据。请核对后再次保存。",
          );
        }
        throw Error(result.error);
      }
      stateRef.current = result;
      setData(result.data);
      return true;
    } catch (e) {
      notify(
        e instanceof TypeError
          ? "关联记录已改变，请关闭编辑后重新打开。"
          : (e as Error).message,
      );
      return false;
    } finally {
      saving.current = false;
    }
  }

  async function appendAssets(
    newAssets: Asset[],
    newFolders: AssetFolder[] = [],
    isFinal: boolean = true,
  ) {
    if (!stateRef.current) {
      notify("工作区尚未加载");
      return false;
    }
    saving.current = true;
    try {
      const r = await fetch("/api/assets/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assets: newAssets,
          folders: newFolders,
          revision: stateRef.current.revision,
        }),
      });
      const isJson = r.headers.get("content-type")?.includes("application/json");
      if (r.ok && isJson) {
        const result = await r.json();
        stateRef.current.revision = result.revision;
        if (stateRef.current.data) {
          if (newFolders.length > 0) {
            stateRef.current.data.assetFolders = [
              ...(stateRef.current.data.assetFolders || []),
              ...newFolders,
            ];
          }
          if (newAssets.length > 0) {
            stateRef.current.data.assets = [
              ...(stateRef.current.data.assets || []),
              ...newAssets,
            ];
          }
        }
        if (isFinal) {
          setData({ ...stateRef.current.data });
        }
        return true;
      }
      if (r.status === 404 || !isJson) {
        // Fallback to save() if backend endpoint does not exist or server returned HTML
        return await save((d) => {
          if (newFolders.length > 0) {
            d.assetFolders = [...(d.assetFolders || []), ...newFolders];
          }
          d.assets = [...(d.assets || []), ...newAssets];
        });
      }
      const result = await r.json();
      throw Error(result.error || "保存失败");
    } catch (e) {
      notify((e as Error).message);
      return false;
    } finally {
      if (isFinal) {
        saving.current = false;
      }
    }
  }
  useEffect(() => {
    if (!form && !history && !confirm) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(
      confirm
        ? "[role=alertdialog]"
        : history
          ? "[aria-label=文档历史]"
          : "[aria-labelledby=form-title]",
    );
    if (!dialog) return;
    const selectors = "button:not(:disabled),input,textarea,select,a[href]";
    const first = dialog.querySelector<HTMLElement>(
      form && !confirm ? "input,textarea,select" : selectors,
    );
    first?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const nodes = [...dialog.querySelectorAll<HTMLElement>(selectors)];
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (confirm) setConfirm(null);
        else if (history) setHistory(null);
        else if (editingDoc) setEditingDoc(null);
        else if (form && !formBusy) setForm(null);
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [!!form, !!history, !!confirm]);
  useEffect(() => {
    if (!mobile) return;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    sidebar?.querySelector<HTMLElement>("nav button")?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMobile(false); document.querySelector<HTMLElement>(".mobile-menu")?.focus(); }
      if (event.key === "Tab") {
        const nodes = [...(sidebar?.querySelectorAll<HTMLElement>("a,button") || [])];
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [mobile]);
  const openForm = (f: Form) => {
    setFormError("");
    if (f.draftKey) {
      f.draftBase = JSON.stringify(f.values);
      try {
        const draft = JSON.parse(sessionStorage.getItem("growmory:draft:" + f.draftKey) || "null");
        if (draft?.base === f.draftBase && draft.values && Object.keys(f.values).every(k => typeof draft.values[k] === "string")) { f.values = draft.values; notify("已恢复本会话未保存草稿"); }
      } catch { /* An unavailable draft does not block editing. */ }
    }
    setForm(f);
  };
  useEffect(() => {
    if (!form?.draftKey) return;
    try { sessionStorage.setItem("growmory:draft:" + form.draftKey, JSON.stringify({ base: form.draftBase, values: form.values })); }
    catch { setFormError("浏览器无法暂存草稿，请在关闭前保存。"); }
  }, [form]);
  const go = (p: Page) => {
    setPage(p);
    setProductId(null);
    setReleaseId(null);
    setQuery("");
    setActiveDoc(null);
    setFolderId("");
    setAssetFolderId("");
    setReleaseStage("auto");
    setMobile(false);
  };
  const viewProduct = (id: string) => {
    listScope.current = scope;
    go("products");
    setProductId(id);
    setFolderId("");
    setAssetFolderId("");
    setTab("overview");
    setActiveDoc(null);
  };
  const viewRelease = (id: string) => {
    const fromHistory = page === "products" && tab === "history";
    go("releases");
    setTab(fromHistory ? "history" : "overview");
    setReleaseId(id);
  };
  const openDocument = (doc: Doc) => {
    if (doc.productId) { viewProduct(doc.productId); setTab("docs"); }
    else { go("knowledge"); setLibraryScope("shared"); }
    setFolderId(doc.folderId || ""); setActiveDoc(doc.id);
  };
  const product = (id: string) => data?.products.find((p) => p.id === id);
  const scoped = <T extends { productId: string }>(items: T[]) =>
    items.filter((x) => scope === "all" || x.productId === scope);
  const chooseId = () =>
    productId || (scope !== "all" ? scope : data!.products[0]?.id || "");
  const productField: Field = {
    key: "productId",
    label: "所属产品",
    type: "product",
    required: true,
  };
  function editProduct(p?: Product) {
    const isNew = !p;
    const prodId = p?.id || uid();
    openForm({
      title: isNew ? "新建产品资料" : "完善产品资料",
      draftKey: "product:" + prodId,

      fields: [
        { key: "icon", label: "产品 Logo", type: "logo" },
        {
          key: "name",
          label: "产品名称",
          required: true,
          placeholder: "产品名称",
        },
        {
          key: "englishName",
          label: "产品英文名",
          placeholder: "例如 Growmory",
        },
        {
          key: "summary",
          label: "一句话介绍",
          placeholder: "它为用户解决什么问题？",
        },
        {
          key: "price",
          label: "价格说明",
          placeholder: "例如 免费 / ¥18 / 含内购",
        },
        {
          key: "platform",
          label: "支持平台",
          placeholder: "例如 iPhone、iPad、Mac",
        },
        { key: "website", label: "官网", type: "url", placeholder: "https://" },
      ],
      values: {
        name: p?.name || "",
        englishName: p?.englishName || "",
        summary: p?.summary || "",
        appId: p?.appId || "",
        price: p?.price || "",
        platform: p?.platform || "",
        website: p?.website || "",
        icon: p?.icon || "",
      },
      deleteLabel: isNew ? undefined : "删除产品",
      onDelete: isNew ? undefined : () => {
        const currentData = stateRef.current?.data || data;
        const docCount = currentData?.docs.filter((d) => d.productId === p.id).length || 0;
        const assetCount = currentData?.assets?.filter((a) => a.productId === p.id).length || 0;
        const releaseCount = currentData?.releases.filter((r) => r.productId === p.id).length || 0;
        const contentCount = currentData?.contents.filter((c) => (c.productId === p.id || c.productIds?.includes(p.id))).length || 0;
        const taskCount = currentData?.tasks.filter((t) => t.productId === p.id).length || 0;
        const relatedCount = docCount + assetCount + releaseCount + contentCount + taskCount;

        setConfirm({
          title: lang === 'en' ? `Delete product "${shortName(p)}"?` : `确定删除产品「${shortName(p)}」？`,
          body: relatedCount > 0
            ? (lang === 'en'
              ? `Deleting will permanently remove this product and its associated ${docCount} docs, ${assetCount} assets, ${releaseCount} releases, ${contentCount} articles, and ${taskCount} tasks from the workspace. This action cannot be undone.`
              : `删除后该产品及其关联的 ${docCount} 篇资料、${assetCount} 个素材、${releaseCount} 个版本、${contentCount} 篇内容和 ${taskCount} 项任务将一并从工作区移除，此操作不可撤销。`)
            : (lang === 'en'
              ? "Deleting will permanently remove this product from the workspace. This action cannot be undone."
              : "删除后该产品将从工作区中移除，此操作不可撤销。"),
          action: async () => {
            const ok = await save((d) => {
              d.products = d.products.filter((x) => x.id !== p.id);
              d.docs = d.docs.filter((x) => x.productId !== p.id);
              d.docFolders = d.docFolders.filter((x) => x.productId !== p.id);
              d.assets = (d.assets || []).filter((x) => x.productId !== p.id);
              d.assetFolders = (d.assetFolders || []).filter((x) => x.productId !== p.id);
              d.releases = d.releases.filter((x) => x.productId !== p.id);
              d.promotions = (d.promotions || []).filter(x => x.productId !== p.id);
              d.contents = d.contents.flatMap((content) => {
                const ids = (content.productIds ?? [content.productId]).filter(id => id !== p.id);
                if (ids.length === (content.productIds?.length ?? 1)) return [content];
                if (!ids.length) return [];
                const releaseId = d.releases.some(r => r.id === content.releaseId) ? content.releaseId : "";
                return [{ ...content, productId: ids[0], productIds: ids, releaseId }];
              });
              d.tasks = d.tasks.filter((x) => x.productId !== p.id);
            });
            if (ok) {
              try {
                sessionStorage.removeItem("growmory:draft:product:" + p.id);
              } catch { }
              setForm(null);
              setConfirm(null);
              notify(lang === 'en' ? `Deleted product "${shortName(p)}"` : `已删除产品「${shortName(p)}」`);
              if (productId === p.id) {
                go("products");
              }
            }
          },
        });
      },
      save: async (v) => {
        if (isNew) {
          const newProd: Product = {
            id: prodId,
            name: v.name,
            englishName: v.englishName || "",
            summary: v.summary || "",
            appId: v.appId || "",
            price: v.price || "",
            platform: v.platform || "",
            website: v.website || "",
            icon: v.icon || "",
            color: "blue",
          };
          const ok = await save((d) => {
            d.products.push(newProd);
          });
          if (ok) {
            notify(t("新产品已创建", "New product created"));
            viewProduct(prodId);
          }
          return ok;
        }
        const id = p.id;
        const ok = await save((d) => {
          Object.assign(
            d.products.find((x) => x.id === id)!,
            v,
          );
        });
        if (ok) {
          notify(t("产品资料已保存", "Product information saved"));
        }
        return ok;
      },
    });
  }
  const folders = data?.docFolders.filter((f) => f.productId === productId) || [];
  const currentFolder = folders.find((f) => f.id === folderId);
  const selectedFolderId = currentFolder?.id || "";
  function editFolder(folder?: DocFolder, owner = productId || "", parent = selectedFolderId) {
    const pid = folder?.productId ?? owner;
    openForm({
      title: folder ? "重命名文件夹" : "新建文件夹",
      fields: [{ key: "name", label: "文件夹名称", required: true }],
      values: { name: folder?.name || "" },
      save: async (v) => save((d) => {
        const name = v.name.trim();
        if (!name) throw Error("请输入文件夹名称");
        const parentId = folder?.parentId ?? parent;
        if (d.docFolders.some((f) => f.productId === pid && f.parentId === parentId && f.name === name && f.id !== folder?.id)) throw Error("此位置已有同名文件夹");
        if (folder) d.docFolders.find((f) => f.id === folder.id)!.name = name;
        else d.docFolders.push({ id: uid(), productId: pid, parentId, name });
      }),
    });
  }
  function deleteFolder(folder: DocFolder) {
    setConfirm({
      title: "删除文件夹？", body: "只能删除空文件夹，请先移走其中的文档和子文件夹。", action: () => {
        void save((d) => {
          if (d.docs.some((x) => x.folderId === folder.id) || d.docFolders.some((x) => x.parentId === folder.id)) throw Error("文件夹非空，请先移走其中的内容");
          d.docFolders = d.docFolders.filter((x) => x.id !== folder.id);
        });
        setConfirm(null);
      }
    });
  }
  function editDoc(doc?: Doc, pid = productId || chooseId(), parent = selectedFolderId) {
    pid = doc?.productId ?? pid;
    setEditingDoc({
      doc,
      productId: pid,
      folderId: doc?.folderId ?? parent ?? "",
    });
  }

  const handleSaveDoc = async (docData: {
    id?: string;
    productId: string;
    folderId: string;
    title: string;
    body: string;
    source: string;
    reviewBase?: { title: string; body: string };
    reviewChanges?: Doc["reviewChanges"];
    status?: "pending" | "confirmed";
  }) => {
    return save((d) => {
      if (docData.id) {
        const x = d.docs.find((x) => x.id === docData.id)!;
        const contentChanged = x.title !== docData.title || x.body !== docData.body;
        if (contentChanged) {
          x.history.unshift({
            title: x.title,
            body: x.body,
            at: x.updatedAt,
            source: x.source || "初始版本",
          });
        }
        Object.assign(x, {
          title: docData.title,
          body: docData.body,
          folderId: docData.folderId || "",
          productId: docData.productId || "",
          source: docData.source,
          reviewBase: docData.reviewBase,
          reviewChanges: docData.reviewChanges,
          status: docData.status ?? (contentChanged ? "pending" : x.status),
          updatedAt: now(),
        });
      } else {
        const newId = uid();
        d.docs.push({
          id: newId,
          productId: docData.productId || "",
          folderId: docData.folderId || "",
          title: docData.title,
          body: docData.body,
          status: docData.status ?? "pending",
          history: [],
          updatedAt: now(),
          source: docData.source,
          reviewBase: docData.reviewBase,
          reviewChanges: docData.reviewChanges,
        } as Doc);
        setActiveDoc(newId);
      }
    }).then((ok) => {
      if (ok) {
        setEditingDoc(null);
        if (docData.id) setActiveDoc(docData.id);
        notify("资料已保存");
      }
      return ok;
    });
  };
  function editRelease(r?: Release, pid = chooseId()) {
    if (!data!.products.length) {
      editProduct();
      return;
    }
    openForm({
      title: r ? "编辑版本" : "准备一次新发布",
      draftKey: "release:" + (r?.id || pid + ":new"),
      description: "只需整理这次改变，其余内容从这里开始。",
      fields: [
        ...(!r ? [productField] : []),
        {
          key: "version",
          label: "版本号",
          required: true,
          placeholder: "例如 2.1.0",
        },
        ...(r
          ? [
            {
              key: "status",
              label: "版本状态",
              type: "select" as const,
              options: ["preparing", "ready", "published"],
              optionLabels: {
                preparing: "准备中",
                ready: "待发布",
                published: "已发布",
              },
            },
            {
              key: "publishedAt",
              label: "正式上线日期",
              type: "date" as const,
              placeholder: "YYYY-MM-DD",
            },
          ]
          : []),
        {
          key: "changes",
          label: "本次更新",
          type: "textarea",
          required: true,
          placeholder: "新增：\n\n优化：\n\n修复：\n\n废弃：",
        },
      ],
      values: r
        ? {
          productId: r.productId,
          version: r.version,
          status: r.status || "preparing",
          publishedAt: r.publishedAt || (r.status === "published" ? r.createdAt?.slice(0, 10) : ""),
          changes: r.changes,
        }
        : {
          productId: pid,
          version: "",
          changes: "",
        },
      save: async (v) => {
        const id = r?.id || uid();
        const ok = await save((d) => {
          const fields = {
            version: v.version,
            changes: v.changes,
            ...(v.status ? { status: v.status } : {}),
            publishedAt: v.publishedAt ? v.publishedAt.trim() : (v.status === "published" ? (r?.publishedAt || now().slice(0, 10)) : undefined),
            tags: r?.tags || [],
            languages: r?.languages || [],
            channels: r?.channels || [],
          };
          if (r) {
            const item = d.releases.find((x) => x.id === id)!;
            Object.assign(item, reviseRelease(item, fields));
          } else {
            const targetProd = d.products.find(p => p.id === v.productId);
            const initPlats = getProductPlatforms(targetProd).map(p => p.id);
            const initDetails = Object.fromEntries(initPlats.map(pId => [pId, { version: v.version, changes: v.changes }]));
            d.releases.push({
              id,
              productId: v.productId,
              ...fields,
              platforms: initPlats,
              platformDetails: initDetails,
              status: v.status || "preparing",
              notes: [],
              proposals: [],
              createdAt: now(),
            });
          }
        });
        if (ok) {
          viewRelease(id);
          notify(t("版本已保存", "Release saved"));
        }
        return ok;
      },
    });
  }
  function editContent(c?: Content, pid = scope === "all" ? "" : scope, rid?: string, manual = false) {
    if (!c && manual) {
      let id: string = uid();
      try {
        const key = "growmory:manual-content:" + (rid || "");
        const previous = sessionStorage.getItem(key);
        if (previous && !data?.contents.some(item => item.id === previous)) id = previous;
        sessionStorage.setItem(key, id);
      } catch { /* Editing remains available without session storage. */ }
      setEditingContent({
        id,
        productId: "",
        productIds: [],
        releaseId: rid || "",
        title: "",
        body: "",
        channel: "",
        status: "draft",
        date: "",
        url: "",
        createdAt: now(),
        isAi: false
      });
      return;
    }
    if (!c) {
      setMarketingBrief({ productId: pid || undefined, releaseId: rid });
      return;
    }
    setEditingContent(c);
  }
  async function saveMarketing(content: Content, previous?: Content) {
    const contentToSave = {
      ...content,
      tags: inferMarketingTags(content),
      createdAt: content.createdAt || now(),
    };
    const ok = await save(d => {
      if (contentToSave.productId && !d.products.some(p => p.id === contentToSave.productId)) throw Error("所属产品已移除，请重新选择。");
      if (contentToSave.releaseId && !d.releases.some(r => r.id === contentToSave.releaseId && (r.productId === contentToSave.productId || contentToSave.productIds?.includes(r.productId)))) throw Error("关联版本已改变，请重新选择。");
      const index = d.contents.findIndex(c => c.id === contentToSave.id);
      if (previous && JSON.stringify(d.contents[index]) !== JSON.stringify(previous)) {
        throw Error(t("文章已在其他入口更新，请关闭后重新打开查看。", "This article was updated elsewhere. Close and reopen it to see the latest version."));
      }
      if (index >= 0) d.contents[index] = contentToSave;
      else d.contents.push(contentToSave);
    });
    return ok ? stateRef.current?.data.contents.find(c => c.id === content.id) : undefined;
  }
  function editTask(t?: Task, rid?: string, pid = chooseId()) {
    if (t) {
      setDetailTask(t);
      return;
    }
    if (!pid) {
      editProduct();
      return;
    }
    const resolvedPid = pid;
    openForm({
      title: "留下一件待办",
      draftKey: "task:" + resolvedPid + ":new:" + (rid || ""),
      fields: [
        productField,
        {
          key: "title",
          label: "待办标题",
          required: true,
          placeholder: "例如：清理泛词、聚焦高意图关键词",
        },
        {
          key: "note",
          label: "备注与行动计划",
          type: "textarea",
          placeholder: "输入待办备注、跟进人或执行计划说明...",
        },
        { key: "date", label: "计划完成日期", type: "date" },
      ],
      values: { productId: resolvedPid, title: "", note: "", date: "" },
      save: async (v) =>
        save((d) => {
          d.tasks.push({
            id: uid(),
            productId: v.productId || resolvedPid,
            title: (v.title || "").trim(),
            note: (v.note || "").trim(),
            date: v.date || "",
            done: false,
            releaseId: rid,
          } as Task);
        }),
    });
  }
  const remove = (
    collection: "docs" | "contents" | "tasks",
    id: string,
  ) =>
    setConfirm({
      title: "确认删除？",
      body: "这条记录将从工作区删除。",
      action: () => {
        void save((d) => {
          (d[collection] as { id: string }[]).splice(
            d[collection].findIndex((x) => x.id === id),
            1,
          );
        });
        setConfirm(null);
      },
    });
  function removeSelectedDocs(ids: string[], onDeleted: () => void) {
    setConfirm({
      title: t(`删除选中的 ${ids.length} 篇资料？`, `Delete ${ids.length} selected documents?`),
      body: t("选中的资料将被删除，此操作不可撤销。", "Selected documents will be permanently deleted."),
      action: async () => {
        setConfirm(null);
        const selected = new Set(ids);
        if (await save(d => { d.docs = d.docs.filter(doc => !selected.has(doc.id)); })) {
          onDeleted();
          notify(t(`已删除 ${ids.length} 篇资料`, `Deleted ${ids.length} documents`));
        }
      },
    });
  }
  async function generate(r: Release, docIds: string[]) {
    if (generating) return;
    const selectedDocs = stateRef.current!.data.docs.filter(d => docIds.includes(d.id) && d.productId === r.productId && d.status === "confirmed");
    if (!docIds.length || selectedDocs.length !== docIds.length) { notify("请先选择有效的已确认产品资料。"); return; }
    setGenerating(r.id);
    try {
      const result = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: r.id, docIds }),
      });
      const payload = await result.json();
      if (!result.ok) throw Error(payload.error);
      const latest = stateRef.current!.data.releases.find((x) => x.id === r.id);
      if (
        !latest ||
        JSON.stringify([
          latest.version,
          latest.changes,
          latest.languages,
          latest.channels,
        ]) !== JSON.stringify([r.version, r.changes, r.languages, r.channels])
      )
        throw Error("生成期间版本内容已改变，请按最新内容重新生成。");
      if (
        await save((d) => {
          const x = d.releases.find((x) => x.id === r.id)!;
          if (selectedDocs.some(before => {
            const current = d.docs.find(doc => doc.id === before.id);
            return !current || current.status !== "confirmed" || current.productId !== r.productId || current.title !== before.title || current.body !== before.body;
          })) throw Error("生成期间所选产品资料已改变，请重新选择后生成。");
          if (payload.documents.some((p: { docId: string }) => !docIds.includes(p.docId))) throw Error("AI 返回了未选择的资料，请重试。");
          x.proposals = [...x.proposals.filter(p => !docIds.includes(p.docId)), ...payload.documents.map(
            (p: {
              docId: string;
              body: string;
              reason: string;
              before: string;
            }) => ({ ...p, before: p.before, applied: false }),
          )];

        })
      ) {
        notify(payload.documents.length ? "文档建议已生成，点击前往文档批阅" : "所选产品资料无需修改");
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setGenerating(null);
    }
  }
  async function reviewDocument(r: Release, index: number, openInNewTab = false) {
    const proposal = r.proposals[index];
    const doc = stateRef.current!.data.docs.find(d => d.id === proposal.docId);
    if (!doc) { notify("原文档已删除"); return; }
    if (proposal.applied) {
      if (openInNewTab) {
        window.open(getDocUrl(doc), "_blank");
      } else {
        openDocument(doc);
        if (doc.status === "pending") editDoc(doc);
      }
      return;
    }
    if (doc.status !== "confirmed" || doc.body !== proposal.before) {
      notify("文档已改变或有待审修订，请先处理文档后重新生成建议。"); return;
    }
    const ok = await save(d => {
      const current = d.docs.find(x => x.id === doc.id)!;
      if (current.status !== "confirmed" || current.body !== proposal.before) throw Error("文档已改变，请重新生成建议。");
      current.reviewBase = { title: current.title, body: current.body };
      current.reviewChanges = undefined;
      current.history.unshift({ title: current.title, body: current.body, at: current.updatedAt, source: current.source, releaseId: r.id });
      current.body = proposal.body;
      current.status = "pending";
      current.source = `版本 ${r.version} AI 修订`;
      current.updatedAt = now();
      d.releases.find(x => x.id === r.id)!.proposals[index].applied = true;
    });
    if (ok) {
      const updated = stateRef.current!.data.docs.find(d => d.id === doc.id)!;
      if (openInNewTab) {
        window.open(getDocUrl(updated), "_blank");
      } else {
        openDocument(updated);
        editDoc(updated);
      }
    }
  }
  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      notify("已复制");
    } catch {
      notify("复制失败，请手动选择文字复制");
    }
  };
  if (!data)
    return (
      <div className="loading">
        <Leaf size={36} />
        <p>{error || "正在打开你的工作台…"}</p>
        {error && <button onClick={() => location.reload()}>重新加载</button>}
      </div>
    );
  const currentProduct = data.products.find((p) => p.id === productId);
  const currentRelease = data.releases.find((r) => r.id === releaseId);
  const visibleProducts = data.products.filter(
    (p) => scope === "all" || p.id === scope,
  );
  const isReleaseActive = (r?: Release) => !!r && r.status !== "published" && r.status !== "archived";
  const contents = data.contents.filter(c => scope === "all" || c.productId === scope || c.productIds?.includes(scope));
  const releases = scoped(data.releases);
  const dataStatus = (id: string) => {
    const signal = signals[id];
    if (!product(id)?.appStore) return t("尚未关联商店", "Not connected to store");
    if (signal === undefined) return t("读取数据状态…", "Reading data status…");
    if (!signal) return t("数据状态不可用", "Data status unavailable");
    return signal.trends.status === "ready"
      ? t("趋势数据可用", "Trend data ready")
      : signal.trends.status === "partial"
        ? t("部分数据可用", "Partial data ready")
        : signal.trends.status === "forbidden"
          ? t("趋势权限不足", "Insufficient permissions")
          : signal.trends.status === "error"
            ? t("趋势同步失败", "Trend sync failed")
            : t("等待趋势报告", "Waiting for trend report");
  };
  const allReminders: ReminderItem[] = [
    ...recurring.flatMap(({ kind, targetId, days, lastAt }) => {
      const platform = kind === "operations" ? findPlatform(targetId) : undefined;
      const product = kind === "operations" ? undefined : data.products.find(p => p.id === targetId);
      if (!platform && !product) return [];
      const title = kind === "operations" ? t("更新运营数据", "Update operations data")
        : kind === "report" ? t("生成 App 数据分析报告", "Generate App analytics report")
          : t("复查 ASO", "Review ASO");
      const date = lastAt ? new Date(lastAt).toLocaleDateString(lang === "en" ? "en-US" : "zh-CN") : "";
      return [{
        id: `recurring:${kind}:${targetId}`,
        productId: product?.id,
        kind: kind === "aso" ? "ASO优化" : title,
        label: platform?.name,
        title,
        reason: date
          ? (lang === "en" ? `Last completed ${date} · Every ${days} days` : `上次完成 ${date} · 每 ${days} 天`)
          : t("暂无完成记录，待首次处理", "No completion recorded yet"),
        time: lastAt || "",
        action: () => {
          if (platform) { go("operations"); setTab(platform.id); }
          else if (kind === "report") { go("analytics"); setScope(targetId); setTab("reports"); }
          else { viewProduct(targetId); setTab("aso"); }
        },
      }];
    }),
    ...data.products.filter(p => ["forbidden", "error"].includes(signals[p.id]?.trends.status || "")).map(p => ({
      id: "sync:" + p.id,
      productId: p.id,
      kind: "同步异常",
      title: dataStatus(p.id),
      reason: signals[p.id]?.trends.message || (lang === 'en' ? "Go to App Analytics to check sync details" : "进入 App 数据分析检查同步详情"),
      time: signals[p.id]?.trends.syncedAt || p.appStore?.syncedAt || "",
      action: () => { go("analytics"); setScope(p.id); }
    })),
    ...data.docs.filter(d => d.status === "pending").map(d => ({
      id: "doc:" + d.id,
      productId: d.productId,
      kind: d.productId ? "产品资料" : "通用资料",
      title: lang === 'en' ? `Review "${d.title}"` : `确认「${d.title}」`,
      reason: lang === 'en' ? "Pending facts cannot be officially cited by AI" : "待确认的事实尚不能供 AI 正式引用",
      time: d.updatedAt || "",
      action: () => openDocument(d)
    })),
    ...(data.contentGroups || []).filter(g => !data.contents.some(c => c.groupId === g.id)).map(g => ({
      id: "group:" + g.id,
      productId: g.productIds?.[0] || "",
      kind: "营销规划",
      title: lang === 'en' ? `Content group "${g.title || g.direction.slice(0, 30)}" needs articles` : `内容组「${g.title || g.direction.slice(0, 30)}」待生成文章`,
      reason: lang === 'en' ? `${g.channels?.length || 0} channels planned, no articles created yet` : `已规划 ${g.channels?.length || 0} 个推广渠道，尚未创建文章`,
      time: g.updatedAt || g.createdAt || "",
      action: () => go("contents"),
    })),
    ...data.contents.filter(c => {
      const s = marketingStatus(c.status);
      return s !== "published" && s !== "archived";
    }).map(c => {
      const isReady = marketingStatus(c.status) === "ready";
      return {
        id: "content:" + c.id,
        productId: c.productId,
        kind: "营销内容",
        title: c.title ? (lang === 'en' ? `"${c.title}"` : `「${c.title}」`) : (lang === 'en' ? "Untitled marketing article" : "未命名营销文章"),
        reason: isReady
          ? (lang === 'en' ? `${c.channel || "Multi-platform"} · Copy ready to publish` : `${c.channel || "多平台"} · 文案待发布`)
          : (lang === 'en' ? `${c.channel || "Multi-platform"} · Draft in progress` : `${c.channel || "多平台"} · 文案草稿待完善`),
        time: c.publishedAt || c.date || "",
        action: () => editContent(c),
      };
    }),
    ...data.products.filter(p => {
      const hasLocalDraft = typeof window !== "undefined" && !!sessionStorage.getItem("growmory:draft:aso:" + p.id);
      const hasServerDraft = (asoDrafts[p.id]?.count || 0) > 0;
      return hasLocalDraft || hasServerDraft;
    }).map(p => {
      const draftInfo = asoDrafts[p.id];
      const plans = draftInfo?.plans || [];
      const locales = [...new Set(plans.map((pl: any) => pl.target?.locale).filter(Boolean))];
      const hasLocalDraft = typeof window !== "undefined" && !!sessionStorage.getItem("growmory:draft:aso:" + p.id);

      let reasonText = "";
      if (locales.length > 0) {
        reasonText = lang === 'en'
          ? `${locales.length} locales (${locales.join(", ")}) ASO drafts pending review and submission`
          : `${locales.join("、")} 等 ${locales.length} 门语言 ASO 优化草稿待核对提交`;
      } else if (hasLocalDraft) {
        reasonText = lang === 'en' ? "Local sheet copy is being edited, not submitted to App Store yet" : "本地表格文案正在编辑中，尚未提交至 App Store";
      } else {
        reasonText = lang === 'en' ? "Multilingual ASO copy changes pending review and submission to App Store" : "多语言 ASO 文案修改待核对并提交至 App Store";
      }

      return {
        id: "aso:" + p.id,
        productId: p.id,
        kind: "ASO优化",
        title: lang === 'en' ? `${shortName(p)} · ASO copy ready to submit` : `${shortName(p)} · ASO 文案待提交`,
        reason: reasonText,
        time: plans[0]?.updatedAt || plans[0]?.createdAt || (hasLocalDraft ? new Date().toISOString() : ""),
        action: () => {
          viewProduct(p.id);
          setTab("aso");
        },
      };
    }),
    ...data.releases.filter(isReleaseActive).map(r => {
      const missing = r.languages.filter(l => !r.notes.some(n => n.language === l && n.approved && n.body.trim()));
      return {
        id: "release:" + r.id,
        productId: r.productId,
        kind: "版本发布",
        title: lang === 'en' ? `${r.version} · ${missing.length ? "Confirm release notes" : "Check store status"}` : `${r.version} · ${missing.length ? "确认更新说明" : "核对商店状态"}`,
        reason: missing.length ? (lang === 'en' ? `Needs confirmation: ${missing.join(", ")}` : `尚需确认：${missing.join("、")}`) : (lang === 'en' ? "Local ready state does not mean published on Apple" : "本机准备状态不代表 Apple 已上架"),
        time: r.createdAt || "",
        action: () => { viewRelease(r.id); setReleaseStage(missing.length ? "notes" : "store"); }
      };
    }),
    ...(data.tasks || []).filter(t => !t.done && (t.reportId || t.quote || !t.releaseId)).map(t => ({
      id: "task:" + t.id,
      productId: t.productId,
      kind: t.reportId ? "报告待办" : "待办事项",
      title: t.title,
      reason: t.quote
        ? (lang === 'en' ? `Quote: "${t.quote.slice(0, 36)}${t.quote.length > 36 ? '...' : ''}"` : `引用：「${t.quote.slice(0, 36)}${t.quote.length > 36 ? '...' : ''}」`)
        : (t.note || (t.date ? `${lang === 'en' ? 'Due: ' : '计划：'}${t.date}` : "")),
      time: t.date || "",
      action: () => {
        editTask(t);
      }
    })),
  ];
  const reminders = allReminders.filter(item => scope === "all" || item.productId === scope);
  const renderReminders = (limit?: number) =>
    (limit ? reminders.slice(0, limit) : reminders).map(item => (
      <button className="attention-row" key={item.id} onClick={item.action}>
        <span className={`reminder-tag tag ${getReminderTagStyle(item.kind)}`}>{t(item.kind)}</span>
        <div className="reminder-content">
          <div className="reminder-title-line" title={`${item.label || (item.productId ? shortName(product(item.productId)) : (lang === 'en' ? "General Docs" : "通用资料"))} · ${item.title}`}>
            <b>{item.label || (item.productId ? shortName(product(item.productId)) : (lang === 'en' ? "General Docs" : "通用资料"))} · {item.title}</b>
          </div>
          {!["产品资料", "通用资料"].includes(item.kind) && <small className="reminder-reason" title={item.reason}>{item.reason}</small>}
          {item.time && (
            <div className="reminder-time-line">
              <span className="reminder-time-badge" title={new Date(item.time).toLocaleString()}>
                <Clock size={11} />
                {formatReminderTime(item.time, lang)}
              </span>
            </div>
          )}
        </div>
        <div className="reminder-action-btn">
          <span>{t("处理", "Action")}</span>
          <ChevronRight size={14} />
        </div>
      </button>
    ));
  const heading: Record<Page, string> = {
    operations: t("运营"),
    home: t("工作台"),
    products: t("产品"),
    releases: t("版本发布"),
    contents: t("营销内容"),
    setup: t("产品初始化"),
    knowledge: t("资料库"),
    assets: t("素材库"),
    aso: t("ASO 优化"),
    analytics: t("App 数据分析"),
    tasks: t("待办事项", "To-do List"),
    settings: t("工作区设置"),
  };
  const journalTab = tab === "journal" && !linkedContentId;
  const linkedContent = page === "contents" && linkedContentId ? data.contents.find(c => c.id === linkedContentId) : undefined;
  const editingContent = localEditingContent || linkedContent;
  const closeMarketingContent = () => {
    setEditingContent(null);
    setLinkedContentId(null);
  };
  const contextProduct = currentProduct || product(currentRelease?.productId || "");
  const library = (owner: string, global = false) => <Library key={global ? "global-library" : owner} data={data} owner={owner} setOwner={global ? setLibraryScope : undefined} activeDoc={activeDoc} setActiveDoc={setActiveDoc} folderId={folderId} setFolderId={setFolderId} edit={editDoc} editFolder={editFolder} deleteFolder={deleteFolder} remove={id => remove("docs", id)} removeSelected={removeSelectedDocs} confirm={ids => void save(d => { d.docs.filter(doc => ids.includes(doc.id)).forEach(doc => { doc.status = "confirmed"; }); })} history={setHistory} copy={copy} />;
  return (
    <div className={`app-shell ${contextProduct ? "has-product-context" : ""}`}>
      {marketingBrief && <MarketingBrief data={data} initialProductId={marketingBrief.productId} initialReleaseId={marketingBrief.releaseId} close={() => setMarketingBrief(null)} />}
      {creatingContentGroup && (
        <ContentGroupModal
          data={data}
          defaultValues={creatingContentGroup}
          save={save}
          copy={copy}
          close={() => setCreatingContentGroup(null)}
        />
      )}
      {editingContent && <MarketingEditor key={editingContent.id} initial={editingContent} data={data} save={saveMarketing} appendAssets={appendAssets} close={closeMarketingContent} copy={copy} remove={() => { if (!window.confirm(t("删除这篇营销内容？删除后不可恢复。", "Delete this marketing content? This cannot be undone."))) return; const id = editingContent.id; void save(d => { d.contents = d.contents.filter(c => c.id !== id); }).then(ok => { if (ok) closeMarketingContent(); }); }} />}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={handleLogoClick}
          style={{ userSelect: "none" }}
        >
          growmory<span>.</span>
        </a>
        <div className="workspace-name">
          <span className="avatar">G</span>
          <div>Growmory<small>{t("独立开发工作空间")}</small></div>
          <Leaf size={15} />
        </div>

        <nav aria-label={t("网站导航")}>
          {nav.map((n) => <React.Fragment key={n.id}>
            {n.id === "products" ? <div className="product-nav-heading"><button className={page === "products" || !!currentRelease ? "active" : ""} onClick={() => go("products")}><Layers3 size={19} /><span>{t(n.label)}</span></button><button aria-label={productsExpanded ? t("收起产品列表") : t("展开产品列表")} aria-expanded={productsExpanded} onClick={() => setProductsExpanded(value => !value)}><ChevronDown size={15} className={productsExpanded ? "" : "collapsed"} /></button></div> : <button aria-current={page === n.id ? "page" : undefined} className={page === n.id ? "active" : ""} onClick={() => go(n.id)}><n.icon size={19} /><span>{t(n.label)}</span></button>}
            {n.id === "products" && productsExpanded && <div className="sidebar-products">{data.products.map(p => <button key={p.id} className={contextProduct?.id === p.id ? "selected" : ""} onClick={() => viewProduct(p.id)}><Icon product={p} size={23} /><span>{shortName(p)}</span></button>)}{!data.products.length && <button onClick={() => go("setup")}>{t("连接并导入产品")}</button>}</div>}
          </React.Fragment>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-local"><span />{t("本地工作区")}</div>
          <button
            className="settings-nav language-switch-btn"
            type="button"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
            aria-label={lang === 'zh' ? 'Switch to English' : '切换为中文'}
          >
            <Globe size={18} />
            <span className="lang-label">{lang === 'zh' ? 'English' : '简体中文'}</span>
            <span className="lang-badge">{lang === 'zh' ? 'EN' : '中'}</span>
          </button>
          <button
            className={
              page === "settings" ? "active settings-nav" : "settings-nav"
            }
            onClick={() => go("settings")}
          >
            <Settings size={18} />
            {t("工作区设置")}
          </button>
        </div>
      </aside>
      {mobile && (
        <div className="mobile-scrim" onClick={() => setMobile(false)} />
      )}
      {contextProduct && <aside className="product-navigation" aria-label={t("产品功能导航")}>
        <div className="product-navigation-identity">
          <Icon product={contextProduct} size={40} />
          <h2>{shortName(contextProduct)}</h2>
        </div>
        <div className="product-platform">{platformText(contextProduct.platform) || t("平台待补充")}</div>
        <div className="product-navigation-links">{productTabs.map(([id, title]) => <button key={id} aria-current={(currentRelease ? id === "history" : tab === id) ? "page" : undefined} className={(currentRelease ? id === "history" : tab === id) ? "active" : ""} onClick={() => { viewProduct(contextProduct.id); setTab(id); }}>{id === "overview" ? <LayoutDashboard size={16} /> : id === "docs" ? <BookOpen size={16} /> : id === "assets" ? <ImageIcon size={16} /> : id === "history" ? <Rocket size={16} /> : id === "contents" ? <FileText size={16} /> : id === "aso" ? <Search size={16} /> : id === "custom-pages" ? <Layers size={16} /> : id === "page-optimization" ? <Split size={16} /> : <Globe size={16} />}<span>{t(title)}</span></button>)}</div>
      </aside>}
      <div className="main-shell">
        <button
          className="icon-button mobile-menu-toggle"
          aria-label="打开导航"
          onClick={() => setMobile(true)}
        >
          <Menu size={20} />
        </button>
        <main>
          {editingDoc ? (
            <DocEditor
              doc={editingDoc.doc}
              initialProductId={editingDoc.productId}
              initialFolderId={editingDoc.folderId}
              data={data}
              onSave={handleSaveDoc}
              onCancel={() => setEditingDoc(null)}
              onConfirm={async (id) => {
                await save((d) => {
                  const x = d.docs.find((doc) => doc.id === id);
                  if (x) x.status = "confirmed";
                });
                notify("资料已确认");
                setEditingDoc(null);
                setActiveDoc(id);
              }}
            />
          ) : query ? (
            <>
              <div className="page-heading">
                <div>
                  <h1>搜索「{query}」</h1>
                  <p>搜索当前工作区中的产品、文档、版本、内容和任务。</p>
                </div>
              </div>
              <div className="panel search-results">
                {(() => {
                  const q = query.toLowerCase();
                  const results = [
                    ...data.products
                      .filter((p) =>
                        (p.name + p.summary).toLowerCase().includes(q),
                      )
                      .map((p) => ({
                        id: p.id,
                        title: p.name,
                        type: "产品",
                        action: () => viewProduct(p.id),
                      })),
                    ...scoped(data.docs)
                      .filter((d) =>
                        (d.title + d.body).toLowerCase().includes(q),
                      )
                      .map((d) => ({
                        id: d.id,
                        title: d.title,
                        type: "文档",
                        action: () => {
                          openDocument(d);
                        },
                      })),
                    ...releases
                      .filter((r) =>
                        (r.version + r.changes).toLowerCase().includes(q),
                      )
                      .map((r) => ({
                        id: r.id,
                        title: `${product(r.productId)?.name} ${r.version}`,
                        type: "版本",
                        action: () => viewRelease(r.id),
                      })),
                    ...contents
                      .filter((c) =>
                        (c.title + c.body).toLowerCase().includes(q),
                      )
                      .map((c) => ({
                        id: c.id,
                        title: c.title,
                        type: "内容",
                        action: () => {
                          setQuery("");
                          go("contents");
                          editContent(c);
                        },
                      })),
                    ...scoped(data.tasks)
                      .filter((t) => t.title.toLowerCase().includes(q))
                      .map((t) => ({
                        id: t.id,
                        title: t.title,
                        type: "任务",
                        action: () => {
                          setQuery("");
                          go("tasks");
                          editTask(t);
                        },
                      })),
                  ];
                  return results.length ? (
                    results.map((r) => (
                      <button
                        key={r.id}
                        className="search-result"
                        onClick={r.action}
                      >
                        <span className="tag">{r.type}</span>
                        {r.title}
                        <ArrowUpRight size={17} />
                      </button>
                    ))
                  ) : (
                    <Empty
                      title="还没有找到"
                      description="试试产品名称、版本号，或正文中的一个词。"
                    />
                  );
                })()}
              </div>
            </>
          ) : (
            <>
              {page !== "operations" && <div className="page-heading">
                <div>
                  <h1>
                    {currentProduct
                      ? tab === "overview" ? shortName(currentProduct) : t(productTabs.find(([id]) => id === tab)?.[1] || "概览")
                      : currentRelease
                        ? `${lang === 'en' ? 'Version' : '版本'} ${currentRelease.version}`
                        : heading[page]}
                  </h1>
                  <p className="page-description">{t(currentProduct ? tab === "overview" ? currentProduct.summary || platformText(currentProduct.platform) : tab === "docs" ? "整理事实，确认之后重复使用。" : tab === "assets" ? "保存与管理图片素材、宣传物料与版本截图。" : tab === "history" ? "从更新说明到商店提交。" : tab === "aso" ? "针对应用商店搜索流量，制定并提交关键词与文案优化方案。" : tab === "custom-pages" ? "针对特定营销渠道、搜索广告或受众配置定制截屏与深层链接。" : tab === "page-optimization" ? "开展原生 A/B 测试，对比测试不同图标与截屏的下载转化表现。" : "" : currentRelease ? shortName(product(currentRelease.productId)) + " · " + currentRelease.languages.join(" / ") : page === "home" ? "版本、资料与内容，集中处理。" : page === "knowledge" ? "所有产品资料与通用资料。" : page === "assets" ? "统一管理图片素材与设计物料，支持文件夹分类与跨版本关联。" : page === "products" ? "管理产品资料、版本与内容。" : page === "contents" ? (journalTab ? t("记录每天的开发片段，把真实经历写成日记和经验分享。", "Capture daily development moments and turn real experiences into stories.") : "先确认推广需求，再将提示词交给 AI Agent 创作，统一管理文章与发布记录。") : page === "analytics" ? (tab === "reports" ? "配置 Agent 分析提示词，通过 MCP 自动生成与管理 App 数据分析报告。" : "对比产品表现，追踪增长变化与数据覆盖。") : page === "tasks" ? "集中管理各产品的待确认资料、营销发布、ASO提交与版本更新。" : page === "settings" ? "连接服务，管理你的工作空间。" : "")}</p>
                </div>
                <div className="heading-actions">
                  {!["home", "tasks", "settings", "setup", "contents", "analytics"].includes(page) && !currentRelease && !currentProduct && !["knowledge", "assets"].includes(page) && (
                    <label className="scope-select">
                      <Layers3 size={15} />
                      <select
                        aria-label={t("产品范围", "Product Scope")}
                        value={scope}
                        onChange={(e) => {
                          setScope(e.target.value);
                        }}
                      >
                        <option value="all">{t("全部产品")}</option>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {shortName(p)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={13} />
                    </label>
                  )}
                  {currentProduct && tab === "overview" && <button className="button secondary" onClick={() => editProduct(currentProduct)}><Pencil size={14} />{t("编辑产品资料")}</button>}
                  {page === "releases" && !currentRelease ? (
                    <button
                      className="button primary"
                      onClick={() => editRelease()}
                    >
                      <Plus size={16} />
                      {t("新建发布")}
                    </button>
                  ) : page === "products" && !currentProduct ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="button primary"
                        onClick={() => setShowAppStoreModal(true)}
                      >
                        <Download size={15} />
                        {t("从 App Store 导入")}
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => editProduct()}
                      >
                        <Plus size={15} />
                        {t("新建产品")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>}
              {((productId && !currentProduct) || (releaseId && !currentRelease)) && <Empty title={t("该记录已不存在", "Record not found")} description={t("可能已在其他窗口删除，请返回列表选择。", "May have been deleted elsewhere, please return to list.")} action={<button className="button secondary" onClick={() => go("products")}>{t("返回产品", "Back to Products")}</button>} />}
              {page === "setup" && <Setup notify={notify} copy={copy} onImported={state => { stateRef.current = state; setData(state.data); }} />}
              {page === "knowledge" && library(libraryScope, true)}
              {page === "assets" && (
                <AssetLibrary
                  data={data}
                  owner={assetScope}
                  setOwner={setAssetScope}
                  folderId={assetFolderId}
                  setFolderId={setAssetFolderId}
                  onSave={save}
                  onAppend={appendAssets}
                  notify={notify}
                  setConfirm={setConfirm}
                />
              )}
              {page === "aso" && <section className="panel">{visibleProducts.map(p => <button key={p.id} className="release-row" onClick={() => { viewProduct(p.id); setTab("aso"); }}><Icon product={p} size={32} /><b>{shortName(p)}</b><ArrowRight size={16} /></button>)}</section>}
              {page === "analytics" && (
                <Analytics
                  products={data.products}
                  scope={scope}
                  setScope={setScope}
                  values={signals}
                  onUpdate={(id: string, value: Insights | null) => setSignals(previous => ({ ...previous, [id]: value }))}
                  connect={() => go("settings")}
                  releases={data.releases}
                  contents={data.contents}
                  reports={data.analyticsReports || []}
                  onSaveReport={async (report) => {
                    await save(d => {
                      d.analyticsReports = d.analyticsReports || [];
                      const idx = d.analyticsReports.findIndex(r => r.id === report.id);
                      if (idx >= 0) d.analyticsReports[idx] = report;
                      else d.analyticsReports.unshift(report);
                    });
                    notify("数据分析报告已保存");
                  }}
                  onDeleteReport={async (id) => {
                    await save(d => {
                      d.analyticsReports = (d.analyticsReports || []).filter(r => r.id !== id);
                    });
                    notify("分析报告已删除");
                  }}
                  analyticsTab={tab === "reports" ? "reports" : "stats"}
                  onAnalyticsTabChange={(nextTab) => setTab(nextTab)}
                  tasks={data.tasks || []}
                  onSaveTask={async (task) => {
                    await save(d => {
                      d.tasks = d.tasks || [];
                      const idx = d.tasks.findIndex(t => t.id === task.id);
                      if (idx >= 0) d.tasks[idx] = task;
                      else d.tasks.unshift(task);
                    });
                    notify(t("待办事项已保存", "Task saved"));
                  }}
                  onDeleteTask={async (id) => {
                    await save(d => {
                      d.tasks = (d.tasks || []).filter(t => t.id !== id);
                    });
                    notify(t("待办事项已删除", "Task deleted"));
                  }}
                  onNavigateTasks={() => go("tasks")}
                  targetReportId={targetReportNav?.reportId}
                  targetQuote={targetReportNav?.quote}
                  onClearTargetReport={() => setTargetReportNav(null)}
                />
              )}
              {page === "home" && (
                <WorkbenchHome
                  data={data}
                  signals={signals}
                  allReminders={allReminders}
                  onSave={save}
                  onGo={go}
                  onViewProduct={viewProduct}
                  shortName={shortName}
                  platformText={platformText}
                  renderIcon={(prod, size) => <Icon product={prod} size={size} />}
                />
              )}
              {page === "products" && !currentProduct && <div className="product-directory">{visibleProducts.map(p => <button className="product-directory-item" key={p.id} onClick={() => viewProduct(p.id)}><Icon product={p} size={56} /><div><h2>{shortName(p)}</h2><p>{p.summary || p.platform || t("产品资料待完善")}</p><span>{data.docs.filter(doc => doc.productId === p.id).length} {lang === 'en' ? 'docs' : '篇资料'}<span className="directory-dot" />{data.releases.filter(r => r.productId === p.id).length} {lang === 'en' ? 'releases' : '个版本'}</span></div><ArrowUpRight size={20} /></button>)}{!visibleProducts.length && <Empty title={t("还没有产品")} description={t("连接商店账号，选择需要管理的产品。")} action={<button className="button primary" onClick={() => editProduct()}>{t("同步商店产品")}</button>} />}</div>}
              {page === "products" && currentProduct && (
                <>
                  {tab === "overview" && <div className="product-overview-layout">
                    <div className="product-shortcuts"><button onClick={() => setTab("docs")}><BookOpen size={20} /><div><b>{t("产品资料")}</b><span>{data.docs.filter(d => d.productId === currentProduct.id && d.status === "confirmed").length} {lang === 'en' ? 'confirmed' : '篇已确认'}</span></div><ChevronRight size={15} /></button><button onClick={() => setTab("assets")}><ImageIcon size={20} /><div><b>{t("素材库")}</b><span>{(data.assets || []).filter(a => a.productId === currentProduct.id).length} {lang === 'en' ? 'assets' : '个素材'}</span></div><ChevronRight size={15} /></button><button onClick={() => setTab("history")}><Rocket size={20} /><div><b>{t("版本发布")}</b><span>{data.releases.filter(r => r.productId === currentProduct.id).length} {lang === 'en' ? 'releases' : '个版本'}</span></div><ChevronRight size={15} /></button></div>
                    <section className="panel product-next"><div className="panel-heading"><h2>{t("接下来处理", "Next Actions")}</h2><button className="text-button" onClick={() => editRelease(undefined, currentProduct.id)}><Plus size={14} />{t("准备新版本")}</button></div>{allReminders.filter(item => item.productId === currentProduct.id).slice(0, 3).map(item => <button className="attention-row" key={item.id} onClick={item.action}><span className="tag">{t(item.kind)}</span><div><b>{item.title}</b>{!["产品资料", "通用资料"].includes(item.kind) && <small>{item.reason}</small>}</div><ChevronRight size={15} /></button>)}{!allReminders.some(item => item.productId === currentProduct.id) && <Empty title={t("可以开始下一次更新了", "Ready for next update")} description={t("产品资料已就绪。", "Product documentation is ready.")} />}</section>
                    <section className="product-information"><div className="section-heading"><h2>{t("基本信息")}</h2><button className="text-button" onClick={() => editProduct(currentProduct)}>{t("编辑")} <Pencil size={13} /></button></div><dl className="profile-fields"><div><dt>{t("英文名称", "English Name")}</dt><dd>{currentProduct.englishName || t("未填写", "Not provided")}</dd></div><div><dt>App Store ID</dt><dd>{currentProduct.appId || t("未填写", "Not provided")}</dd></div><div><dt>{t("支持平台", "Platforms")}</dt><dd>{platformText(currentProduct.platform) || t("未填写", "Not provided")}</dd></div><div><dt>{t("价格说明", "Pricing")}</dt><dd>{replaceCurrencySymbol(currentProduct.price) || t("未填写", "Not provided")}</dd></div><div><dt>{t("产品官网", "Official Website")}</dt><dd>{currentProduct.website ? <a href={currentProduct.website} target="_blank" rel="noreferrer">{t("访问官网", "Visit Website")} <ExternalLink size={12} /></a> : t("未填写", "Not provided")}</dd></div></dl></section>
                  </div>}
                  {tab === "docs" && library(currentProduct.id)}
                  {tab === "assets" && (
                    <AssetLibrary
                      data={data}
                      owner={currentProduct.id}
                      folderId={assetFolderId}
                      setFolderId={setAssetFolderId}
                      onSave={save}
                      onAppend={appendAssets}
                      notify={notify}
                      setConfirm={setConfirm}
                    />
                  )}

                  {tab === "aso" && (
                    <Aso
                      key={currentProduct.id + currentProduct.appStore?.appId}
                      product={currentProduct}
                      products={data.products}
                      notify={notify}
                      tasks={data.tasks || []}
                      onSaveTask={async (task) => {
                        await save(d => {
                          d.tasks = d.tasks || [];
                          const idx = d.tasks.findIndex(t => t.id === task.id);
                          if (idx >= 0) d.tasks[idx] = task;
                          else d.tasks.unshift(task);
                        });
                        notify(t("待办事项已保存", "Task saved"));
                      }}
                      onDeleteTask={async (id) => {
                        await save(d => {
                          d.tasks = (d.tasks || []).filter(t => t.id !== id);
                        });
                        notify(t("待办事项已删除", "Task deleted"));
                      }}
                      onNavigateTasks={() => go("tasks")}
                    />
                  )}

                  {tab === "custom-pages" && (
                    <ProductCustomPages
                      key={`cpp-${currentProduct.id}`}
                      product={currentProduct}
                      notify={notify}
                    />
                  )}

                  {tab === "page-optimization" && (
                    <ProductPageOptimization
                      key={`ppo-${currentProduct.id}`}
                      product={currentProduct}
                      notify={notify}
                    />
                  )}

                  {tab === "history" && (
                    <section className="panel"><div className="panel-heading"><h2>{t("版本记录", "Release History")}</h2><button className="button primary" onClick={() => editRelease(undefined, currentProduct.id)}>{t("准备新版本")}</button></div>
                      {data.releases
                        .filter((r) => r.productId === productId)
                        .reverse()
                        .map((r) => {
                          const platText = getReleasePlatformText(r, currentProduct);
                          return (
                            <button
                              className="release-row"
                              key={r.id}
                              onClick={() => viewRelease(r.id)}
                            >
                              <Rocket size={18} />
                              <div>
                                <b>{r.version}{platText ? ` · ${platText}` : ""}</b>
                                <small>
                                  {dateText(r.createdAt)} ·{" "}
                                  {r.changes.slice(0, 80)}
                                </small>
                              </div>
                              <Badge value={r.status} />
                              <ChevronRight size={16} />
                            </button>
                          );
                        })}
                      {!data.releases.some(
                        (r) => r.productId === productId,
                      ) && (
                          <Empty
                            title="版本故事，从这里开始"
                            description="记录每次新增、优化、修复与废弃，留下清晰的产品演进。"
                          />
                        )}
                    </section>
                  )}
                </>
              )}
              {page === "releases" && !currentRelease && (
                <section className="panel">
                  {releases
                    .slice()
                    .reverse()
                    .map((r) => {
                      const prod = product(r.productId);
                      const platText = getReleasePlatformText(r, prod);
                      return (
                        <button
                          key={r.id}
                          className="release-row large"
                          onClick={() => viewRelease(r.id)}
                        >
                          <Icon product={prod} size={48} />
                          <div>
                            <b>
                              {prod?.name}{" "}
                              <span>{r.version}{platText ? ` · ${platText}` : ""}</span>
                            </b>
                            <small>{r.changes.slice(0, 90)}</small>
                          </div>
                          <Badge value={r.status} />
                          <ChevronRight size={18} />
                        </button>
                      );
                    })}
                  {!releases.length && (
                    <Empty
                      title="暂无版本"
                      description=""
                      action={
                        <button
                          className="button primary"
                          onClick={() => editRelease()}
                        >
                          <Plus size={16} />
                          准备第一个版本
                        </button>
                      }
                    />
                  )}
                </section>
              )}
              {page === "releases" && currentRelease && (
                <ReleaseDetailView
                  release={currentRelease}
                  product={product(currentRelease.productId)}
                  data={data}
                  save={save}
                  onAppend={appendAssets}
                  setConfirm={setConfirm}
                  notify={notify}
                  viewProduct={viewProduct}
                  setReleaseId={setReleaseId}
                  tab={tab}
                  setTab={setTab}
                  releaseStage={releaseStage}
                  setReleaseStage={setReleaseStage}
                  editRelease={editRelease}
                  editContent={editContent}
                  createContentGroup={setCreatingContentGroup}
                  editTask={editTask}
                  reviewDocument={reviewDocument}
                  generate={generate}
                  generating={generating}
                  ai={ai}
                  go={go}
                />
              )}
              {page === "operations" && <Operations key={tab} products={data.products} initialPlatform={findPlatform(tab)?.id} />}
              {page === "contents" && linkedContentId && !linkedContent && <p role="alert">{t("这篇营销内容已不存在。", "This marketing content no longer exists.")}</p>}
              {page === "contents" && <>
                <div className="segmented journal-tabs" role="group" aria-label={t("营销内容分类", "Marketing content sections")}>
                  <button className={!journalTab ? "active" : ""} aria-pressed={!journalTab} onClick={() => setTab("articles")}>{t("营销文章", "Marketing articles")}</button>
                  <button className={journalTab ? "active" : ""} aria-pressed={journalTab} onClick={() => { setLinkedContentId(null); setTab("journal"); }}>{t("开发日记", "Development journal")}</button>
                </div>
                {journalTab
                  ? <DevelopmentJournal entries={data.developmentJournal ?? []} save={save} copy={copy} />
                  : <MarketingList contents={contents} data={data} filter={filter} setFilter={setFilter} edit={editContent} copy={copy} save={save} />}
              </>}
              {page === "tasks" && (
                <section className="panel system-reminders">
                  <div className="panel-heading">
                    <h2>
                      {t("待办事项", "To-do List")}{" "}
                      <span className="count">{reminders.length}</span>
                    </h2>
                    <span className="subtle">
                      {t("处理原记录后自动更新", "Auto-updates when resolved")}
                    </span>
                  </div>
                  {renderReminders()}
                  {!reminders.length && (
                    <p className="padded body-copy">{t("暂无待办事项。", "No pending to-do items.")}</p>
                  )}
                </section>
              )}
              {page === "settings" && (
                <div className="settings-layout">
                  <div className="tabs">{[["connections", t("连接与同步", "Connections & Sync")], ["ai", t("AI 与 Agent", "AI & Agent")], ["backup", t("备份与恢复", "Backup & Restore")]].map(([id, label]) => <button key={id} className={settingsTab === id ? "active" : ""} onClick={() => setSettingsTab(id)}>{label}</button>)}</div>
                  <div hidden={settingsTab !== "connections"}><section className="panel padded"><h2>{t("初始化", "Setup")}</h2><p className="body-copy">{t("工作区初始化向导，包含外部 Agent 连接、App Store Connect 绑定与产品导入。", "Workspace setup wizard, including external Agent connection, App Store Connect binding, and product import.")}</p><button className="button secondary" onClick={() => go("setup")}>{t("打开初始化向导", "Open Setup Wizard")}</button></section>
                    <AppStoreConnect notify={notify} onImported={state => { stateRef.current = state; setData(state.data); }} />
                  </div><div hidden={settingsTab !== "ai"}>
                    <div className="tabs sub-tabs" role="tablist" aria-label={t("AI 与 Agent 切换", "AI & Agent Switch")}>
                      {[["internal", t("站内 AI", "Built-in AI")], ["external", t("外部 Agent", "External Agent")]].map(([id, label]) => (
                        <button
                          key={id}
                          role="tab"
                          aria-selected={aiSubTab === id}
                          className={aiSubTab === id ? "active" : ""}
                          onClick={() => setAiSubTab(id as "internal" | "external")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {aiSubTab === "internal" && <AiSettings notify={notify} onAiChange={setAi} />}
                    {aiSubTab === "external" && <McpSettings notify={notify} copy={copy} />}
                  </div><section hidden={settingsTab !== "backup"} className="panel padded">
                    <span className="setting-icon">
                      <Download size={24} />
                    </span>
                    <h2>{t("资料备份", "Data Backup")}</h2>

                    <button
                      className="button secondary"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(data, null, 2)], {
                          type: "application/json",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `growmory-${today()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        notify(t("工作区已导出", "Workspace exported"));
                      }}
                    >
                      <Download size={16} />
                      {t("导出全部资料", "Export All Data")}
                    </button>
                    <div className="setting-divider" />
                    <h3>{t("恢复备份", "Restore Backup")}</h3>
                    <p className="fine-print">
                      {t("导入会替换当前工作区。建议先导出当前资料。", "Importing will replace the current workspace. It is recommended to export your current data first.")}
                    </p>
                    <label className="button secondary import-button">
                      {t("选择 JSON 备份", "Select JSON Backup")}
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          try {
                            const imported = JSON.parse(await file.text());
                            if (
                              ![
                                "products",
                                "docs",
                                "releases",
                                "contents",
                                "tasks",
                              ].every((k) => Array.isArray(imported[k]))
                            )
                              throw Error(t("备份格式不正确", "Invalid backup format"));
                            setConfirm({
                              title: t("恢复这份备份？", "Restore this backup?"),
                              body: t("将替换当前资料，导入 {products} 个产品、{docs} 篇文档。", "Will replace current data, importing {products} products and {docs} documents.", { products: imported.products.length, docs: imported.docs.length }),
                              action: () => {
                                void save((d) =>
                                  Object.assign(d, imported, {
                                    docFolders: imported.docFolders || [],
                                    assets: imported.assets || [],
                                    assetFolders: imported.assetFolders || [],
                                  }), true,
                                ).then((ok) => {
                                  if (ok) {
                                    setScope("all");
                                    notify(t("备份已恢复", "Backup restored"));
                                  }
                                });
                                setConfirm(null);
                              },
                            });
                          } catch {
                            notify(
                              t("无法读取备份，请选择有效的 Growmory JSON 文件", "Unable to read backup. Please select a valid Growmory JSON file.")
                            );
                          }
                        }}
                      />
                    </label>
                  </section>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {form && (
        <div className="overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
            className="drawer"
          >
            <div className="drawer-heading">
              <div>
                <h2 id="form-title">{t(form.title)}</h2>
                {form.description && <p className="fine-print">{t(form.description)}</p>}
              </div>
              <button
                className="icon-button"
                aria-label={t("关闭表单", "Close form")}
                onClick={() => {
                  if (!formBusy) setForm(null);
                }}
              >
                <X size={21} />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setFormBusy(true);
                setFormError("");
                try {
                  const ok = await form.save(form.values);
                  if (ok !== false) {
                    if (form.draftKey) { try { sessionStorage.removeItem("growmory:draft:" + form.draftKey); } catch { /* Saved data already lives on the server. */ } }
                    setForm(null);
                    notify(t("已保存", "Saved"));
                  }
                } catch (e) {
                  setFormError((e as Error).message);
                } finally {
                  setFormBusy(false);
                }
              }}
            >
              {form.draftKey && <p className="draft-hint">{t("未保存内容暂存在本浏览器会话，重新打开编辑可恢复。", "Unsaved changes are cached in this session and will restore when reopened.")}<button type="button" className="text-button" disabled={formBusy} onClick={() => { try { sessionStorage.removeItem("growmory:draft:" + form.draftKey); } catch { /* Close even if storage is unavailable. */ } setForm(null); }}>{t("丢弃草稿", "Discard Draft")}</button></p>}
              <div className="form-fields">
                {form.fields.map((f) => (
                  <label
                    className={`field field-${f.type || "text"}`}
                    key={f.key}
                  >
                    <span>
                      {t(f.label)}
                      {f.required && <i>*</i>}
                    </span>
                    {f.type === "logo" ? (
                      <div className="logo-field">
                        {form.values.icon ? (
                          <img src={form.values.icon} alt={t("产品 Logo 预览", "Logo Preview")} />
                        ) : (
                          <span className="logo-placeholder">
                            <Layers3 size={28} />
                          </span>
                        )}
                        <div>
                          <span className="button secondary logo-upload">
                            {t("选择图片", "Choose Image")}
                            <input
                              aria-label={t("上传产品 Logo", "Upload Product Logo")}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (!file) return;
                                try {
                                  const icon = await readLogo(file);
                                  setForm((current) =>
                                    current
                                      ? {
                                        ...current,
                                        values: { ...current.values, icon },
                                      }
                                      : null,
                                  );
                                  setFormError("");
                                } catch (error) {
                                  setFormError((error as Error).message);
                                }
                              }}
                            />
                          </span>
                          <small>{t("PNG / JPG / WebP，最大 5 MB", "PNG / JPG / WebP, max 5 MB")}</small>
                          {form.draftKey?.startsWith("product:") && (
                            <button
                              type="button"
                              className="button secondary small"
                              style={{ marginTop: 6 }}
                              onClick={() => setShowAppStoreModal(true)}
                            >
                              <Download size={13} /> {t("从 App Store 检索补全资料", "Search & Fill from App Store")}
                            </button>
                          )}
                        </div>
                        {form.values.icon && (
                          <button
                            type="button"
                            className="icon-button danger"
                            aria-label={t("移除产品 Logo", "Remove Product Logo")}
                            onClick={(e) => {
                              e.preventDefault();
                              setForm({
                                ...form,
                                values: { ...form.values, icon: "" },
                              });
                            }}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    ) : f.type === "textarea" ? (
                      <textarea
                        required={f.required}
                        placeholder={f.placeholder ? t(f.placeholder) : undefined}
                        value={form.values[f.key] || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            values: { ...form.values, [f.key]: e.target.value },
                          })
                        }
                      />
                    ) : f.type === "select" || f.type === "product" ? (
                      <select
                        required={f.required}
                        value={form.values[f.key] || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            values: { ...form.values, [f.key]: e.target.value },
                          })
                        }
                      >
                        {f.type === "product"
                          ? data.products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))
                          : f.options?.map((o) => (
                            <option key={o} value={o}>
                              {f.optionLabels?.[o] ? t(f.optionLabels[o]) : t(statusLabel[o] || o)}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <input
                        required={f.required}
                        type={
                          f.type === "date"
                            ? "date"
                            : f.type === "url"
                              ? "url"
                              : "text"
                        }
                        pattern={f.type === "appid" ? "[0-9]*" : undefined}
                        placeholder={f.placeholder ? t(f.placeholder) : undefined}
                        value={form.values[f.key] || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            values: { ...form.values, [f.key]: e.target.value },
                          })
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
              {formError && (
                <p role="alert" className="form-error">
                  {formError}
                </p>
              )}
              <div className="form-footer">
                {form.onDelete ? (
                  <button
                    type="button"
                    className="button danger-subtle form-delete-btn"
                    disabled={formBusy}
                    onClick={form.onDelete}
                  >
                    <Trash2 size={15} />
                    {form.deleteLabel ? t(form.deleteLabel) : t("删除", "Delete")}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  className="button primary"
                  disabled={formBusy}
                >
                  {formBusy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Check size={16} />
                  )}
                  {t("保存", "Save")}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showAppStoreModal && (
        <AppStoreFastImportModal
          onClose={() => setShowAppStoreModal(false)}
          onSelectApp={(app) => {
            setForm((current) => {
              if (!current) return null;
              const priceText = app.free ? t("免费", "Free") : formatDisplayPrice(app.price, app.free, app.currency);
              const platformTextVal = app.supportedDevices?.some(d => d.toLowerCase().includes("ipad"))
                ? "iPhone、iPad"
                : "iPhone";
              return {
                ...current,
                values: {
                  ...current.values,
                  name: app.title || current.values.name,
                  englishName: app.appId || current.values.englishName,
                  summary: (app.description || current.values.summary || "").slice(0, 300),
                  price: priceText || current.values.price,
                  platform: platformTextVal || current.values.platform,
                  website: app.developerWebsite || app.developerUrl || app.url || current.values.website,
                  appId: String(app.id) || current.values.appId,
                  icon: app.iconBase64 || current.values.icon,
                },
              };
            });
            notify(t("已填入「{name}」的商店资料", "Filled store metadata for \"{name}\"", { name: app.title }));
          }}
          onImport={async (newProduct) => {
            const ok = await save((d) => {
              d.products.push(newProduct);
            });
            if (ok) {
              viewProduct(newProduct.id);
            }
            return ok;
          }}
          notify={notify}
        />
      )}
      {history &&
        (() => {
          const doc = data.docs.find((d) => d.id === history);
          return doc ? (
            <div className="overlay">
              <section
                role="dialog"
                aria-modal="true"
                aria-label={t("文档历史", "Document History")}
                className="drawer"
              >
                <div className="drawer-heading">
                  <h2>{t("「{title}」的历史", "Revision History of \"{title}\"", { title: doc.title })}</h2>
                  <button
                    className="icon-button"
                    aria-label={t("关闭历史", "Close history")}
                    onClick={() => setHistory(null)}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="history-list">
                  {doc.history.map((h, i) => (
                    <article key={i}>
                      <div>
                        <span>{new Date(h.at).toLocaleString(lang === "en" ? "en-US" : "zh-CN")}</span>
                        {h.source && (
                          <span className="history-source-badge" title={h.source}>
                            <Cpu size={11} />
                            {h.source}
                          </span>
                        )}
                        <button
                          className="text-button"
                          onClick={() => {
                            void save((d) => {
                              const x = d.docs.find((xItem) => xItem.id === doc.id)!;
                              x.reviewBase = { title: x.title, body: x.body };
                              x.reviewChanges = undefined;
                              x.history.unshift({
                                title: x.title,
                                body: x.body,
                                at: x.updatedAt,
                                source: x.source || t("初始版本", "Initial version"),
                              });
                              x.body = h.body;
                              x.title = h.title ?? x.title;
                              x.source = t("手动恢复历史版本", "Manually restored revision");
                              x.updatedAt = now();
                              x.status = "pending";
                            }).then((ok) => {
                              if (ok) setHistory(null);
                            });
                          }}
                        >
                          {t("恢复版本", "Restore Revision")}
                        </button>
                      </div>
                      <pre>{h.body}</pre>
                    </article>
                  ))}
                  {!doc.history.length && (
                    <Empty
                      title={t("还没有历史修改", "No revisions yet")}
                      description={t("每次保存文档修改，都会在这里留下记录。", "Every time you save doc edits, revisions will be recorded here.")}
                    />
                  )}
                </div>
              </section>
            </div>
          ) : null;
        })()}
      {confirm && (
        <div className="confirm-overlay">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="confirm-dialog"
          >
            <span className="confirm-icon">
              <AlertCircle size={25} />
            </span>
            <h2 id="confirm-title">{confirm.title}</h2>
            <p>{confirm.body}</p>
            <div>
              <button
                className="button secondary"
                onClick={() => setConfirm(null)}
              >
                {t("取消", "Cancel")}
              </button>
              <button className="button primary" onClick={confirm.action}>
                {t("确认", "Confirm")}
              </button>
            </div>
          </section>
        </div>
      )}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          products={data.products}
          onClose={() => setDetailTask(null)}
          onSaveTask={async (updatedTask) => {
            await save((d) => {
              d.tasks = d.tasks || [];
              const idx = d.tasks.findIndex((x) => x.id === updatedTask.id);
              if (idx >= 0) d.tasks[idx] = updatedTask;
              else d.tasks.unshift(updatedTask);
            });
            setDetailTask(updatedTask);
            notify(t("待办事项已保存", "Task saved"));
          }}
          onDeleteTask={async (id) => {
            await save((d) => {
              d.tasks = (d.tasks || []).filter((x) => x.id !== id);
            });
            setDetailTask(null);
            notify(t("待办事项已删除", "Task deleted"));
          }}
          onNavigateTasks={
            page !== "tasks"
              ? () => {
                setDetailTask(null);
                go("tasks");
              }
              : undefined
          }
          onNavigateReport={(repId, q) => {
            setDetailTask(null);
            go("analytics");
            setTab("reports");
            setTargetReportNav({ reportId: repId, quote: q });
          }}
        />
      )}
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
function getReleaseTagIcon(iconName: string) {
  switch (iconName) {
    case "Search":
      return <Search size={13} />;
    case "Smartphone":
      return <Smartphone size={13} />;
    case "Sparkles":
      return <Sparkles size={13} />;
    case "Video":
      return <Video size={13} />;
    case "Key":
      return <Key size={13} />;
    case "Type":
      return <Type size={13} />;
    case "BadgeDollarSign":
      return <BadgeDollarSign size={13} />;
    case "CreditCard":
      return <CreditCard size={13} />;
    case "Rocket":
      return <Rocket size={13} />;
    case "Bug":
      return <Bug size={13} />;
    case "Layers":
      return <Layers size={13} />;
    default:
      return <Sparkles size={13} />;
  }
}

function ReleaseDetailView({
  release: r,
  product: currentProduct,
  data,
  save,
  onAppend,
  setConfirm,
  notify,
  viewProduct,
  setReleaseId,
  tab,
  setTab,
  releaseStage,
  setReleaseStage,
  editRelease,
  editContent,
  createContentGroup,
  editTask: _editTask,
  reviewDocument,
  generate,
  generating,
  ai,
  go,
}: {
  release: Release;
  product?: Product;
  data: Data;
  save: (mutator: (d: Data) => void) => Promise<boolean>;
  onAppend?: (assets: Asset[], folders: AssetFolder[], isFinal?: boolean) => Promise<boolean | void>;
  setConfirm?: (conf: { title: string; body: string; action: () => void | Promise<void> } | null) => void;
  notify: (msg: string) => void;
  viewProduct: (id: string) => void;
  setReleaseId: (id: string | null) => void;
  tab: string;
  setTab: (tab: string) => void;
  releaseStage: string;
  setReleaseStage: (stage: string) => void;
  editRelease: (r?: Release) => void;
  editContent: (c?: Content, pid?: string, rid?: string, manual?: boolean) => void;
  createContentGroup?: (defaults: { productIds?: string[]; title?: string; direction?: string; channels?: string[] }) => void;
  editTask: (task?: Task, releaseId?: string, productId?: string) => void;
  reviewDocument: (release: Release, index: number, openInNewTab?: boolean) => Promise<void>;
  generate: (r: Release, docIds: string[]) => Promise<void>;
  generating: string | null;
  ai: { configured: boolean; model: string };
  go: (page: Page) => void;
}) {
  const { lang, t } = useI18n();
  const productPlatforms = getProductPlatforms(currentProduct);
  const [extraPlatforms, setExtraPlatforms] = useState<PlatformOption[]>(() => {
    const extras: PlatformOption[] = [];
    if (r.platforms) {
      for (const pId of r.platforms) {
        if (!productPlatforms.some(p => p.id === pId)) {
          const appleMatch = ALL_APPLE_PLATFORMS.find(a => a.id === pId);
          extras.push(appleMatch || { id: pId, label: pId });
        }
      }
    }
    return extras;
  });

  const allPlatformOptions: PlatformOption[] = [...productPlatforms, ...extraPlatforms];

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(() => {
    if (r.platforms && r.platforms.length > 0) return r.platforms;
    if (r.storeSource?.platform) return [r.storeSource.platform];
    return productPlatforms.map(p => p.id);
  });

  const [platformDetails, setPlatformDetails] = useState<Record<string, { version: string; changes: string }>>(() => {
    const initial: Record<string, { version: string; changes: string }> = {};
    const saved = r.platformDetails || {};
    const plats = (r.platforms && r.platforms.length > 0) ? r.platforms : productPlatforms.map(p => p.id);
    for (const pId of plats) {
      initial[pId] = {
        version: saved[pId]?.version ?? r.version ?? "",
        changes: saved[pId]?.changes ?? r.changes ?? "",
      };
    }
    return initial;
  });

  const [activeStorePlatform, setActiveStorePlatform] = useState<string>(() => {
    const plats = (r.platforms && r.platforms.length > 0) ? r.platforms : productPlatforms.map(p => p.id);
    return plats[0] || "IOS";
  });

  const [version, setVersion] = useState(r.version);
  const [changes, setChanges] = useState(r.changes);
  const [tags, setTags] = useState<string[]>(r.tags || []);
  const [saving, setSaving] = useState(false);
  const [creatingPlatforms, setCreatingPlatforms] = useState<Record<string, boolean>>({});
  const [createdPlatforms, setCreatedPlatforms] = useState<Set<string>>(new Set());

  const isPlatformCreated = (platId: string, platVer: string) => {
    if (!platVer?.trim()) return false;
    const cleanVer = platVer.trim();
    if (createdPlatforms.has(platId)) return true;
    const source = r.storeSources?.[platId] || (r.storeSource?.platform === platId ? r.storeSource : undefined);
    if (source && (!source.version || source.version === cleanVer)) return true;
    const normPlat = (allPlatformOptions.find(p => p.id === platId)?.ascPlatform || platId).toUpperCase();
    const storeVersions = currentProduct?.appStore?.versions || [];
    return storeVersions.some(v => v.version === cleanVer && (v.platform.toUpperCase() === normPlat || v.platform.toUpperCase() === platId.toUpperCase()));
  };

  const handleCreateStoreVersion = async (platId: string, platVer: string) => {
    if (!platVer?.trim()) {
      notify(t("请先填写版本号", "Please fill in version number first"));
      return;
    }
    const cleanVer = platVer.trim();
    const platOption = allPlatformOptions.find(p => p.id === platId) || { id: platId, label: platId };
    const ascPlatform = platOption.ascPlatform || (["IOS", "MAC_OS", "TV_OS", "VISION_OS"].includes(platId.toUpperCase()) ? platId.toUpperCase() : "IOS");

    setCreatingPlatforms(prev => ({ ...prev, [platId]: true }));
    try {
      const res = await fetch(`/api/app-store-connect/releases/${encodeURIComponent(r.id)}/create-version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: ascPlatform, version: cleanVer }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.message || t("创建商店版本失败", "Failed to create version on store"));
      }

      setCreatedPlatforms(prev => new Set(prev).add(platId));

      await save(d => {
        const rel = d.releases.find(x => x.id === r.id);
        if (rel) {
          rel.storeSources = rel.storeSources || {};
          rel.storeSources[platId] = {
            appId: currentProduct?.appStore?.appId || "",
            versionId: payload.versionId,
            platform: ascPlatform,
            version: cleanVer,
          };
          rel.storeSources[ascPlatform] = rel.storeSources[platId];
          if (!rel.storeSource || rel.storeSource.platform === ascPlatform) {
            rel.storeSource = rel.storeSources[platId];
          }
        }
        const prod = d.products.find(p => p.id === r.productId);
        if (prod && prod.appStore) {
          prod.appStore.versions = prod.appStore.versions || [];
          if (!prod.appStore.versions.some(v => v.id === payload.versionId || (v.version === cleanVer && v.platform === ascPlatform))) {
            prod.appStore.versions.push({
              id: payload.versionId,
              version: cleanVer,
              platform: ascPlatform,
              state: "PREPARE_FOR_SUBMISSION",
              notes: [],
            });
          }
        }
      });

      notify(payload.message || (payload.alreadyExists ? t("该版本在 App Store Connect 上已存在，已标记关联", "Version already exists on App Store Connect, linked") : t("已在 App Store Connect 成功创建版本", "Created version on App Store Connect")));
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setCreatingPlatforms(prev => ({ ...prev, [platId]: false }));
    }
  };
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const eligibleDocs = data.docs.filter(d => d.productId === r.productId && d.status === "confirmed");
  const targetDocIds = selectedDocIds.filter(id => eligibleDocs.some(d => d.id === id));
  useEffect(() => { setSelectedDocIds([]); }, [r.id]);

  useEffect(() => {
    const plats = (r.platforms && r.platforms.length > 0)
      ? r.platforms
      : r.storeSource?.platform
        ? [r.storeSource.platform]
        : productPlatforms.map(p => p.id);
    setSelectedPlatforms(plats);

    const initial: Record<string, { version: string; changes: string }> = {};
    const saved = r.platformDetails || {};
    for (const pId of plats) {
      initial[pId] = {
        version: saved[pId]?.version ?? r.version ?? "",
        changes: saved[pId]?.changes ?? r.changes ?? "",
      };
    }
    setPlatformDetails(initial);
    if (!plats.includes(activeStorePlatform)) {
      setActiveStorePlatform(plats[0] || "IOS");
    }
    setVersion(r.version);
    setChanges(r.changes);
    setTags(r.tags || []);
  }, [r.id, r.version, r.changes, r.tags, r.platforms, r.platformDetails]);

  const stage = ["update", "store", "knowledge", "marketing"].includes(releaseStage)
    ? releaseStage
    : releaseStage === "notes"
      ? "store"
      : releaseStage === "promotion"
        ? "knowledge"
        : "update";

  const related = data.contents.filter((c) => c.releaseId === r.id);

  // 更新素材库模块状态与方法
  const [promptLanguages, setPromptLanguages] = useState<string[]>(["zh-Hans", "en-US"]);
  const [releaseUploadModalOpen, setReleaseUploadModalOpen] = useState(false);
  const [releaseEditingAsset, setReleaseEditingAsset] = useState<Asset | null>(null);
  const [releasePreviewAsset, setReleasePreviewAsset] = useState<Asset | null>(null);
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  const releaseAssets = (data.assets || []).filter(
    (a) => a.productId === r.productId && a.releaseId === r.id
  );

  const getPlatformLabel = (id: string) =>
    allPlatformOptions.find((p) => p.id === id)?.label || id;

  const generateXCTestPrompt = () => {
    const plats = selectedPlatforms.map(getPlatformLabel).join("、") || "全部平台";
    const langs = promptLanguages
      .map((code) => `${getAssetLanguageLabel(code)} (${code})`)
      .join("、") || "简体中文 (zh-Hans)";

    const platformNotesText = selectedPlatforms
      .map((platId) => {
        const platLabel = getPlatformLabel(platId);
        const detail = platformDetails[platId] || { version: r.version, changes: r.changes };
        return `### 【${platLabel}】版本 v${detail.version || r.version}\n${detail.changes || r.changes || "（暂无具体更新说明）"}`;
      })
      .join("\n\n");

    return `# 自动化截图与素材库更新任务 (XCTest UI Test)

你是一名资深客户端工程与自动化测试专家。请先核对本版本已有截图，仅对缺失项运行 XCTest / XCUITest，并将补拍的高清截图上传至产品素材库。

---

## 1. 目标产品与版本信息
- **产品名称**: ${currentProduct?.name || "未知产品"} (Product ID: \`${currentProduct?.id || r.productId}\`)
- **发布版本**: v${r.version} (Release ID: \`${r.id}\`)
- **发布平台**: ${plats}
- **目标本地化语言**: ${langs}

---

## 2. 本次版本更新内容
${platformNotesText || r.changes || "（暂无更新内容）"}

---

## 3. 执行规范与核心要求

### 第一步：检查本版本已有素材
- 在准备演示数据、构建或启动设备前，先调用 Growmory MCP 工具 \`list_records\`，传入 \`collection: "assets"\`、上方的 Product ID（\`productId\`）及 \`limit: 100\`，按 \`offset\` 分页读完，再筛选 \`releaseId\` 与上方 Release ID 一致的素材。
- 根据版本更新内容列出所需的「平台 × 界面 × 语言」组合，用素材名称、文件名和语言核对覆盖情况。只复用能确认匹配的截图，其他版本的素材和宣传图不计入。
- 全部已覆盖时，报告复用结果并结束，不准备演示数据、不启动测试、不截图、不上传。部分已覆盖时，仅处理缺项。若读取失败，重试后仍无法核对，报告原因并暂停截图。

### 第二步：为缺失截图完善演示数据 (Mock / Demo Data)
- **拒绝空白状态 (Empty State)**：在运行 XCTest 截图前，通过 Launch Arguments / Environment Variables（如 \`-AppleLanguages\`、\`-AppleLocale\`、\`-UITestMode 1\`、\`-SeedDemoData 1\`）或 UI Test 夹具，注入丰富生动、真实且具有代表性的演示数据。
- 确保展示完整真实的任务清单、日程排期、统计图表或详情信息，完美烘托本次版本更新的功能亮点。

### 第三步：仅补拍缺失截图
- 针对第一步列出的缺项：
  1. 启动对应目标模拟器或设备运行测试用例。
  2. 自动导航至本次更新涉及的核心模块界面（参考上方更新内容）。
  3. 等待网络请求完成、视图加载完成与动画稳定（\`XCTWaiter.wait\`）。
  4. 截取全屏高清画面（\`XCUIScreen.main.screenshot()\`），保存为高质量 PNG 格式。

### 第四步：上传补拍截图
仅将补拍的新截图通过 Growmory MCP 工具 \`upload_asset\` 保存至产品素材库，保留已有素材：
- \`name\`: 遵循命名规范，如 \`"{平台}-{模块名称}-{语言}"\`（例如："iOS-主界面时间视图-zh-Hans"、"macOS-暗黑模式日历-en-US"）
- \`productId\`: "${currentProduct?.id || r.productId}"
- \`releaseId\`: "${r.id}"
- \`languages\`: [对应截屏所使用的语言代码，如 "${promptLanguages[0] || "zh-Hans"}"]
- \`data\`: 图片的 Base64 字符串或 Data URL
- \`fileName\`: 规范文件名（如 "ios-timeline-zh-Hans.png"）
- \`expectedRevision\`: 当前工作区 revision（连续上传时使用上一笔成功返回的 revision）

完成后，分别报告复用的已有截图、补拍并成功上传的截图，以及仍缺失的组合。`;
  };

  const handleCopyAgentPrompt = async () => {
    try {
      const text = generateXCTestPrompt();
      await navigator.clipboard.writeText(text);
      notify(t("已复制自动化截图与素材库更新提示词", "Copied XCTest asset update prompt to clipboard"));
    } catch {
      notify(t("复制失败，请手动选中复制", "Copy failed, please copy manually"));
    }
  };

  const handleDeleteReleaseAsset = (asset: Asset) => {
    if (setConfirm) {
      setConfirm({
        title: lang === 'en' ? `Delete asset "${asset.name}"?` : `删除素材「${asset.name}」？`,
        body: t("素材将从素材库中彻底移除，不可恢复。", "Asset will be permanently removed from library."),
        action: async () => {
          await save((d) => {
            d.assets = (d.assets || []).filter((a) => a.id !== asset.id);
          });
          if (releasePreviewAsset?.id === asset.id) setReleasePreviewAsset(null);
          setConfirm(null);
          notify(t("素材已删除", "Asset deleted"));
        },
      });
    } else {
      void save((d) => {
        d.assets = (d.assets || []).filter((a) => a.id !== asset.id);
      }).then(() => {
        if (releasePreviewAsset?.id === asset.id) setReleasePreviewAsset(null);
        notify(t("素材已删除", "Asset deleted"));
      });
    }
  };
  const isDirty =
    JSON.stringify(selectedPlatforms.slice().sort()) !== JSON.stringify((r.platforms || []).slice().sort()) ||
    JSON.stringify(platformDetails) !== JSON.stringify(r.platformDetails || {}) ||
    JSON.stringify(tags.slice().sort()) !== JSON.stringify((r.tags || []).slice().sort());

  async function handleSaveContent() {
    if (!selectedPlatforms.length) {
      notify(t("请选择至少一个发布平台", "Please select at least one release platform"));
      return;
    }
    for (const platId of selectedPlatforms) {
      const platLabel = allPlatformOptions.find(p => p.id === platId)?.label || platId;
      const detail = platformDetails[platId];
      if (!detail?.version?.trim()) {
        notify(t("请填写 {name} 的版本号", "Please enter version for {name}", { name: platLabel }));
        return;
      }
      if (!detail?.changes?.trim()) {
        notify(t("请填写 {name} 的版本更新内容", "Please enter release notes for {name}", { name: platLabel }));
        return;
      }
    }
    setSaving(true);
    try {
      const primaryPlat = selectedPlatforms[0];
      const primaryVersion = (platformDetails[primaryPlat]?.version || version).trim();
      const primaryChanges = platformDetails[primaryPlat]?.changes || changes;
      const ok = await save((d) => {
        const item = d.releases.find((x) => x.id === r.id);
        if (item) {
          Object.assign(
            item,
            reviseRelease(item, {
              version: primaryVersion,
              changes: primaryChanges,
              tags,
              platforms: selectedPlatforms,
              platformDetails,
            })
          );
        }
      });
      if (ok) notify(t("版本更新内容与平台配置已保存", "Release notes and platform configuration saved"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndNext() {
    if (isDirty) {
      await handleSaveContent();
    }
    setReleaseStage("store");
  }

  return (
    <>
      <button
        className="back-link"
        onClick={() => {
          if (tab === "history") {
            viewProduct(r.productId);
            setTab("history");
          } else setReleaseId(null);
        }}
      >
        {tab === "history" ? t("← 产品版本", "← Product Releases") : t("← 所有发布", "← All Releases")}
      </button>

      {/* 顶部版本横幅 */}
      <div className="release-banner">
        <Icon product={currentProduct} size={50} />
        <div className="release-banner-info">
          <b>{t("发布目标", "Target Platform")} · {platformText((selectedPlatforms.length ? selectedPlatforms : [r.storeSource?.platform || currentProduct?.platform || t("待选择平台", "To be selected")]).join(" / "))}</b>
          <p>
            {t("版本", "Version")} {platformDetails[selectedPlatforms[0]]?.version || version} · {t("创建于", "Created at")} {dateText(r.createdAt)}
            {r.storeSource ? ` · App Store ID ${r.storeSource.appId}` : ""}
          </p>
          {r.tags && r.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {r.tags.map((tId) => {
                const opt = RELEASE_TAG_OPTIONS.find((o) => o.id === tId) || (HISTORICAL_RELEASE_TAGS[tId] ? { id: tId, label: HISTORICAL_RELEASE_TAGS[tId] } : null);
                return opt ? (
                  <span key={tId} className="badge" style={{ fontSize: 11, background: "#f1f5f9", color: "#334155", border: "1px solid #e2e8f0" }}>
                    {t(opt.label)}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>
        <div className="release-banner-actions">
          <div className="release-status-picker">
            <label className="release-status-label" htmlFor={`release-status-${r.id}`}>
              {t("版本状态", "Release Status")}
            </label>
            <select
              id={`release-status-${r.id}`}
              aria-label={t("变更版本状态", "Change release status")}
              className={`release-status-select badge ${r.status}`}
              value={r.status}
              onChange={async (e) => {
                const nextStatus = e.target.value;
                const ok = await save((d) => {
                  const item = d.releases.find((x) => x.id === r.id);
                  if (item) {
                    item.status = nextStatus;
                    if (nextStatus === "published" && !item.publishedAt) {
                      item.publishedAt = now().slice(0, 10);
                    }
                  }
                });
                if (ok) {
                  notify(t("版本状态已变更为「{status}」", "Release status changed to \"{status}\"", { status: t(statusLabel[nextStatus] || nextStatus) }));
                }
              }}
            >
              <option value="preparing">{t("准备中", "Preparing")}</option>
              <option value="ready">{t("待发布", "Ready to Publish")}</option>
              <option value="published">{t("已发布", "Published")}</option>
            </select>
          </div>
          {r.status === "published" && (
            <div
              className="release-published-date-picker"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 12,
                color: "#475569",
              }}
              title={t("正式上线日期，用于数据分析曲线打点", "Official release date on App Store, used for analytics timeline milestones")}
            >
              <Clock size={13} style={{ color: "#7c3aed" }} />
              <span>{t("上线:", "Released:")}</span>
              <input
                type="date"
                aria-label={t("修改上线日期", "Edit release date")}
                value={(r.publishedAt || r.createdAt || "").slice(0, 10)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#0f172a",
                  cursor: "pointer",
                  padding: 0,
                }}
                onChange={async (e) => {
                  const newDate = e.target.value;
                  if (!newDate) return;
                  await save((d) => {
                    const item = d.releases.find((x) => x.id === r.id);
                    if (item) item.publishedAt = newDate;
                  });
                }}
              />
            </div>
          )}
          <button className="button secondary small" onClick={() => editRelease(r)}>
            <Pencil size={14} />
            {t("编辑", "Edit")}
          </button>
        </div>
      </div>

      <div className="release-columns">
        {/* 左侧主详情区 */}
        <div className="release-primary">
          {/* 流程1: 版本更新内容 */}
          <section hidden={stage !== "update"} className="panel padded">
            <div className="panel-heading plain">
              <h2>{t("版本更新内容", "Release Notes")}</h2>
            </div>
            <div className="release-editor-box">
              {/* 1. 第一步：选择发布平台（读取产品已有平台，可以多选） */}
              <div className="field release-platform-select-container">
                <div className="release-platform-select-header">
                  <span className="field-title">
                    {t("选择发布平台", "Select Release Platforms")}
                    <span className="required-star">*</span>
                  </span>
                  <span className="platform-count-badge">
                    {lang === 'en' ? `${selectedPlatforms.length} selected` : `已选 ${selectedPlatforms.length} 个平台`}
                  </span>
                </div>
                <p className="fine-print" style={{ margin: "2px 0 10px 0", color: "#64748b" }}>
                  {t("读取产品已有支持平台，可多选发布目标。每个平台支持独立填写版本号与更新内容。", "Reading product platforms; multi-select targets to configure per-platform version and notes.")}
                </p>
                <div className="platform-chips-row">
                  {allPlatformOptions.map(plat => {
                    const isSelected = selectedPlatforms.includes(plat.id);
                    return (
                      <button
                        key={plat.id}
                        type="button"
                        className={`platform-toggle-chip ${isSelected ? "active" : ""}`}
                        onClick={() => {
                          setSelectedPlatforms(prev => {
                            if (prev.includes(plat.id)) {
                              if (prev.length === 1) {
                                notify(t("至少需要保留一个发布平台", "At least one platform must be selected"));
                                return prev;
                              }
                              const next = prev.filter(p => p !== plat.id);
                              if (activeStorePlatform === plat.id) {
                                setActiveStorePlatform(next[0] || "IOS");
                              }
                              return next;
                            } else {
                              const next = [...prev, plat.id];
                              setPlatformDetails(old => {
                                if (!old[plat.id] || !old[plat.id].version) {
                                  const base = old[prev[0]] || { version, changes };
                                  return { ...old, [plat.id]: { version: base.version || "", changes: base.changes || "" } };
                                }
                                return old;
                              });
                              return next;
                            }
                          });
                        }}
                      >
                        <PlatformIcon platform={plat.id} size={15} />
                        <span className="platform-toggle-label">{plat.label}</span>
                        {isSelected && <Check size={14} className="platform-check-icon" />}
                      </button>
                    );
                  })}
                  {ALL_APPLE_PLATFORMS.filter(a => !allPlatformOptions.some(p => p.id === a.id)).map(extra => (
                    <button
                      key={extra.id}
                      type="button"
                      className="platform-toggle-chip add-extra"
                      onClick={() => {
                        setExtraPlatforms(prev => [...prev, extra]);
                        setSelectedPlatforms(prev => [...prev, extra.id]);
                        setPlatformDetails(old => ({
                          ...old,
                          [extra.id]: { version: old[selectedPlatforms[0]]?.version || version, changes: old[selectedPlatforms[0]]?.changes || changes }
                        }));
                      }}
                    >
                      <Plus size={14} />
                      <span>{t("添加 {name}", "Add {name}", { name: extra.label })}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. 每个平台填写版本号与版本更新内容 */}
              <div className="platform-details-list">
                {selectedPlatforms.map((platId, idx) => {
                  const platOption = allPlatformOptions.find(p => p.id === platId) || { id: platId, label: platId };
                  const detail = platformDetails[platId] || { version: "", changes: "" };
                  return (
                    <div key={platId} className="platform-detail-card">
                      <div className="platform-detail-header">
                        <div className="platform-detail-title">
                          <PlatformIcon platform={platId} size={17} />
                          <strong>{platOption.label}</strong>
                          <span className="platform-tag-pill">{platId}</span>
                        </div>
                        {selectedPlatforms.length > 1 && idx > 0 && (
                          <button
                            type="button"
                            className="button secondary small sync-from-primary-btn"
                            title={t("从首个平台同步版本号与更新内容", "Sync version and notes from first platform")}
                            onClick={() => {
                              const src = platformDetails[selectedPlatforms[0]];
                              if (src) {
                                setPlatformDetails(prev => ({
                                  ...prev,
                                  [platId]: { version: src.version, changes: src.changes }
                                }));
                                notify(t("已同步来自 {name} 的版本号与更新说明", "Synced version and notes from {name}", { name: allPlatformOptions.find(p => p.id === selectedPlatforms[0])?.label || selectedPlatforms[0] }));
                              }
                            }}
                          >
                            <Copy size={12} />
                            <span>{t("同步首选平台内容", "Sync from 1st Platform")}</span>
                          </button>
                        )}
                      </div>

                      <div className="platform-detail-body">
                        <label className="field">
                          <span>{t("版本号", "Version")} ({platOption.label})</span>
                          <div className="platform-version-input-row" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                            <input
                              value={detail.version}
                              placeholder={t("例如 2.1.0", "e.g. 2.1.0")}
                              style={{ flex: 1, margin: 0 }}
                              onChange={e => {
                                const val = e.target.value;
                                setPlatformDetails(prev => ({
                                  ...prev,
                                  [platId]: { ...prev[platId], version: val }
                                }));
                                if (idx === 0) setVersion(val);
                              }}
                            />
                            {(() => {
                              const isCreated = isPlatformCreated(platId, detail.version);
                              const isCreating = !!creatingPlatforms[platId];
                              const isApple = !!(platOption.ascPlatform || ["IOS", "MAC_OS", "TV_OS", "VISION_OS"].includes(platId.toUpperCase()) || platId.toLowerCase() === "ios" || platId.toLowerCase() === "macos");
                              const hasStoreApp = !!currentProduct?.appStore?.appId;

                              return (
                                <button
                                  type="button"
                                  className={`button small ${isCreated ? "secondary" : "primary"}`}
                                  disabled={isCreated || isCreating || !detail.version?.trim() || !hasStoreApp || !isApple}
                                  title={
                                    !hasStoreApp
                                      ? t("请先在产品详情中关联 App Store Connect", "Please link App Store Connect in product settings first")
                                      : !isApple
                                        ? t("仅支持在 App Store Connect 创建版本的平台", "Only supported for App Store Connect platforms")
                                        : !detail.version?.trim()
                                          ? t("请先填写版本号", "Please enter version number first")
                                          : isCreated
                                            ? t("该版本已在 App Store Connect 创建", "This version is already created on App Store Connect")
                                            : t("在 App Store Connect 上创建此新版本", "Create this new version on App Store Connect")
                                  }
                                  onClick={() => void handleCreateStoreVersion(platId, detail.version)}
                                  style={{
                                    flexShrink: 0,
                                    whiteSpace: "nowrap",
                                    height: 34,
                                    padding: "0 12px",
                                    ...(isCreated ? {
                                      background: "#f0fdf4",
                                      borderColor: "#bbf7d0",
                                      color: "#15803d",
                                      opacity: 0.85,
                                      cursor: "not-allowed",
                                    } : {}),
                                  }}
                                >
                                  {isCreating ? (
                                    <>
                                      <span className="spinning" style={{ display: "inline-block", marginRight: 4 }}>⏳</span>
                                      {t("正在创建…", "Creating...")}
                                    </>
                                  ) : isCreated ? (
                                    <>
                                      <Check size={13} style={{ marginRight: 3, verticalAlign: "-2px" }} />
                                      {t("已创建", "Created")}
                                    </>
                                  ) : (
                                    t("创建商店版本", "Create Version on Store")
                                  )}
                                </button>
                              );
                            })()}
                          </div>
                        </label>

                        <label className="field">
                          <span>{t("版本更新内容", "Release Notes")} ({platOption.label})</span>
                          <textarea
                            className="release-changes-textarea"
                            value={detail.changes}
                            rows={8}
                            placeholder={t("新增：\n- 支持新特性\n\n优化：\n- 性能提升\n\n修复：\n- 修复已知问题", "New:\n- Feature support\n\nImproved:\n- Performance optimizations\n\nFixed:\n- Bug fixes")}
                            onChange={e => {
                              const val = e.target.value;
                              setPlatformDetails(prev => ({
                                ...prev,
                                [platId]: { ...prev[platId], changes: val }
                              }));
                              if (idx === 0) setChanges(val);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 本次改动标记选项（第一步：分类规整 + 专属图标） */}
              <div className="field release-tags-section" style={{ marginTop: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{t("本次发布包含改动（用于数据分析标记与 Agent 归因）", "Changes in this release (for analytics attribution)")}</span>
                    <p className="fine-print" style={{ margin: "2px 0 0 0", color: "#64748b" }}>
                      {t("按维度标记本次在商店和产品上的动作，将作为关键节点显示在数据曲线上", "Tag store & product actions to display as key milestones on metric curves")}
                    </p>
                  </div>
                  <span
                    className="badge"
                    style={{
                      fontSize: 11,
                      background: tags.length ? "#eff6ff" : "#f1f5f9",
                      color: tags.length ? "#2563eb" : "#64748b",
                      border: tags.length ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
                    }}
                  >
                    {lang === 'en' ? `${tags.length} selected` : `已选 ${tags.length} 项`}
                  </span>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '7px 10px', fontSize: 11.5, color: '#166534', marginBottom: 10 }}>
                  💡 <b>{t('ASO 优化自动关联', 'ASO Update Auto-Linked')}</b>：{t('在 ASO 模块提交的「ASO 文案优化」与「ASO 图片优化」将由系统自动识别并关联对应版本打点，无需在此手动勾选素材变动。', 'ASO copy and media updates submitted in the ASO module are automatically detected and linked to corresponding releases for analytics.')}
                </div>

                <div className="release-tag-categories" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {RELEASE_TAG_CATEGORIES.map((cat) => {
                    const catOptions = RELEASE_TAG_OPTIONS.filter((o) => o.category === cat.id);
                    if (!catOptions.length) return null;
                    return (
                      <div
                        key={cat.id}
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                          padding: "8px 12px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{t(cat.name)}</span>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>{t(cat.description)}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {catOptions.map((opt) => {
                            const active = tags.includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                className={`tag-pill ${active ? "active" : ""}`}
                                title={t(opt.hint)}
                                onClick={() => {
                                  setTags((prev) => (active ? prev.filter((tVal) => tVal !== opt.id) : [...prev, opt.id]));
                                }}
                                style={{
                                  padding: "5px 11px",
                                  borderRadius: 14,
                                  fontSize: 12,
                                  border: active ? "1.5px solid #2563eb" : "1px solid #cbd5e1",
                                  background: active ? "#eff6ff" : "#fff",
                                  color: active ? "#1d4ed8" : "#475569",
                                  fontWeight: active ? 600 : 400,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <span style={{ display: "inline-flex", color: active ? "#2563eb" : "#64748b" }}>
                                  {getReleaseTagIcon(opt.iconName)}
                                </span>
                                <span>{t(opt.label)}</span>
                                {active && <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 1 }}>✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="release-editor-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={saving || !isDirty}
                  onClick={() => void handleSaveContent()}
                >
                  {saving ? t("正在保存...", "Saving...") : isDirty ? t("保存更新内容", "Save Changes") : t("已是最新", "Up to Date")}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void handleSaveAndNext()}
                >
                  {t("进入下一步：平台发布 →", "Next: Platform Publication →")}
                </button>
              </div>
            </div>
          </section>

          {/* 流程2: 平台发布 (第二步根据第一步选择的平台，显示平台tab) */}
          <div hidden={stage !== "store"}>
            <div className="release-store-tabs-wrapper">
              <div className="release-store-tabs-nav" role="tablist">
                {selectedPlatforms.map(platId => {
                  const platOption = allPlatformOptions.find(p => p.id === platId) || { id: platId, label: platId };
                  const isActive = activeStorePlatform === platId;
                  const detail = platformDetails[platId] || { version: r.version, changes: r.changes };
                  return (
                    <button
                      key={platId}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`release-store-tab-btn ${isActive ? "active" : ""}`}
                      onClick={() => setActiveStorePlatform(platId)}
                    >
                      <PlatformIcon platform={platId} size={15} />
                      <span className="tab-btn-title">{platOption.label}</span>
                      {detail.version && (
                        <span className="tab-btn-version">v{detail.version}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {["IOS", "MAC_OS", "TV_OS", "VISION_OS"].includes(activeStorePlatform) ? (
              <ReleasePublication
                key={`${r.id}-${activeStorePlatform}`}
                release={{
                  ...r,
                  version: platformDetails[activeStorePlatform]?.version || r.version,
                  changes: platformDetails[activeStorePlatform]?.changes || r.changes,
                  storeSource: r.storeSources?.[activeStorePlatform] || (r.storeSource?.platform === activeStorePlatform ? r.storeSource : undefined),
                  storeSources: r.storeSources,
                }}
                platform={activeStorePlatform}
                onPlatformChange={setActiveStorePlatform}
                product={currentProduct}
                notify={notify}
                save={save}
                onConnect={() => {
                  viewProduct(r.productId);
                  setTab("store");
                }}
                onNext={() => setReleaseStage("knowledge")}
              />
            ) : (
              <section className="panel padded publication-panel">
                <div className="panel-heading plain">
                  <h2>{allPlatformOptions.find(p => p.id === activeStorePlatform)?.label || activeStorePlatform} {t("版本发布", "Release Publication")}</h2>
                </div>
                <div className="non-apple-publication-card">
                  <div className="platform-meta-banner">
                    <PlatformIcon platform={activeStorePlatform} size={28} />
                    <div>
                      <h3>{allPlatformOptions.find(p => p.id === activeStorePlatform)?.label || activeStorePlatform} · v{platformDetails[activeStorePlatform]?.version || r.version}</h3>
                      <p className="fine-print">
                        {t("独立发布平台。在此查看本平台的版本更新说明与发布状态。", "Independent platform. Manage version and release notes here.")}
                      </p>
                    </div>
                  </div>
                  <div className="platform-notes-preview">
                    <h4>{t("版本更新说明", "Release Notes")}</h4>
                    <pre className="notes-box">{platformDetails[activeStorePlatform]?.changes || r.changes || t("暂无更新内容", "No release notes")}</pre>
                    <div className="asc-actions" style={{ marginTop: 14 }}>
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => {
                          const text = platformDetails[activeStorePlatform]?.changes || r.changes || "";
                          navigator.clipboard.writeText(text);
                          notify(t("已复制 {name} 更新内容到剪贴板", "Copied release notes for {name}", { name: allPlatformOptions.find(p => p.id === activeStorePlatform)?.label || activeStorePlatform }));
                        }}
                      >
                        <Copy size={13} />
                        {t("复制更新说明", "Copy Notes")}
                      </button>
                      <button
                        type="button"
                        className="button primary small"
                        onClick={() => setReleaseStage("knowledge")}
                      >
                        {t("进入下一步：更新知识库 →", "Next: Update Knowledge Base →")}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* 流程3: 更新知识库 */}
          <div hidden={stage !== "knowledge"} className="release-promotion-wrapper">
            {/* AI 文档修订建议驾驶舱 */}
            <section className="panel padded ai-promotion-banner">
              <div className="ai-banner-header">
                <div className="ai-banner-title">
                  <div className="ai-orb">
                    <Sparkles size={22} />
                  </div>
                  <div>
                    <h3>{t("按需更新产品资料", "Update Product Docs as Needed")}</h3>
                    <p className="fine-print">
                      {t("先选择要检查的产品资料。AI 只会把本次版本 {version} 中影响长期产品描述或使用说明的变化写入相关资料，允许部分或全部资料无需修改。", "Select product docs to check. AI will only propose edits for changes affecting long-term documentation.", { version: r.version })}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!!generating || !targetDocIds.length || isDirty}
                  className="button primary ai-banner-btn"
                  onClick={() => void generate(r, targetDocIds)}
                >
                  {generating === r.id ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  <span>{generating === r.id ? t("正在生成文档修订…", "Generating doc revisions...") : t("生成文档修订建议", "Generate Doc Proposals")}</span>
                </button>
              </div>

              <fieldset className="release-doc-selection" disabled={!!generating}>
                <legend>{t("选择需要检查更新的产品资料", "Select Product Docs to Inspect")}</legend>
                <p className="fine-print">{t("仅发送勾选资料的当前正文。勾选表示允许 AI 判断是否需要修改，不代表一定要更新。", "Only sends current text of selected docs to assess if changes are needed.")}</p>
                {eligibleDocs.map(doc => <label key={doc.id}><input type="checkbox" checked={targetDocIds.includes(doc.id)} onChange={e => setSelectedDocIds(ids => e.target.checked ? [...ids, doc.id] : ids.filter(id => id !== doc.id))} /><span><b>{doc.title}</b><small>{doc.body.replace(/[#*`\n]/g, " ").slice(0, 90)}</small></span></label>)}
                {!eligibleDocs.length && <p className="fine-print">{t("暂无已确认的产品资料，请先在产品资料中确认文档；本步骤也可跳过。", "No confirmed product docs yet. You can confirm docs or skip this step.")}</p>}
                {!!eligibleDocs.length && !targetDocIds.length && <p className="fine-print">{t("请勾选至少一篇资料后生成建议，也可直接进入下一步。", "Select at least one doc to generate suggestions, or proceed to next step.")}</p>}
                {isDirty && <p className="fine-print">{t("版本更新内容有未保存修改，请先返回第一步保存。", "Release notes have unsaved changes. Please save step 1 first.")}</p>}
              </fieldset>
              <div className="ai-banner-footer">
                <div className="ai-context-chips">
                  <span className="chip">
                    <Check size={12} /> {lang === 'en' ? `Selected ${targetDocIds.length} / ${eligibleDocs.length} docs` : `已选择 ${targetDocIds.length} / ${eligibleDocs.length} 篇产品资料`}
                  </span>
                  <span className="chip">
                    <BookOpen size={12} /> {lang === 'en' ? `${r.proposals.filter((p) => !p.applied).length} docs to review` : `${r.proposals.filter((p) => !p.applied).length} 项文档待确认`}
                  </span>
                </div>
                {!ai.configured && (
                  <button type="button" className="ai-config-link" onClick={() => go("settings")}>
                    {lang === 'en' ? "AI Not Configured · View Connection Setup" : "尚未配置 AI · 查看连接方式"} <ArrowUpRight size={12} />
                  </button>
                )}
              </div>
            </section>

            {/* 知识库更新建议卡片 */}
            <section className="panel padded step3-section-card full-width">
              <div className="panel-heading plain">
                <div className="step3-section-title">
                  <BookOpen size={17} className="title-icon" />
                  <h2>
                    {t("知识库更新建议", "Knowledge Base Proposals")}
                    <span className="count-badge">{lang === 'en' ? `${r.proposals.filter((p) => !p.applied).length} pending` : `${r.proposals.filter((p) => !p.applied).length} 待确认`}</span>
                  </h2>
                </div>
              </div>

              <div className="step3-card-list">
                {r.proposals.map((p, i) => {
                  const doc = data.docs.find((d) => d.id === p.docId);
                  return (
                    <div
                      className={`step3-proposal-item ${p.applied ? "is-applied" : ""}`}
                      key={i}
                      onClick={() => void reviewDocument(r, i, true)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void reviewDocument(r, i, true); } }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="proposal-item-main">
                        <div className="proposal-item-header">
                          <span className="doc-icon-badge">
                            <FileText size={14} />
                          </span>
                          <span className="doc-item-title">{doc?.title || t("原文档已删除", "Original doc deleted")}</span>
                          <span className="chip">{p.applied ? t("已转入文档", "Applied to doc") : t("待批阅", "Pending review")}</span>
                        </div>
                        {p.reason && (
                          <div className="proposal-reason-box" title={p.reason}>
                            <span className="reason-label">{t("改动依据：", "Reason: ")}</span>
                            <span className="reason-text">{p.reason}</span>
                          </div>
                        )}
                      </div>
                      <div className="proposal-item-action">
                        <span className="action-hint">{p.applied ? t("新页面查看", "View in new tab") : t("新页面打开批阅", "Open & review in new tab")}</span>
                        <ExternalLink size={14} />
                      </div>
                    </div>
                  );
                })}

                {!r.proposals.length && (
                  <div className="step3-empty-state">
                    <div className="empty-icon-circle">
                      <BookOpen size={20} />
                    </div>
                    <p className="empty-title">{t("暂无知识库修改建议", "No knowledge base proposals")}</p>
                    <p className="empty-description">
                      {t("点击上方「生成文档修订建议」，生成后点击文档将在新页面打开批阅，可逐条接受或拒绝修改。", "Click 'Generate Doc Proposals' above. Once generated, click a doc to review diffs and accept or reject changes.")}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* 更新知识库新增模块：更新素材库 */}
            <section className="panel padded step3-section-card full-width release-asset-update-section">
              <div className="panel-heading plain">
                <div className="step3-section-title">
                  <ImageIcon size={17} className="title-icon" />
                  <h2>
                    {t("更新素材库", "Update Asset Library")}
                    <span className="count-badge">
                      {lang === "en" ? `${releaseAssets.length} assets in v${r.version}` : `本版本共 ${releaseAssets.length} 项素材`}
                    </span>
                  </h2>
                </div>
              </div>

              {/* 1. 自动化截图提示词（Agent XCTest） */}
              <div className="release-prompt-builder-card">
                <div className="release-prompt-card-header">
                  <div className="release-prompt-title-group">
                    <div className="release-prompt-icon-badge">
                      <Cpu size={16} />
                    </div>
                    <div>
                      <h3>{t("Agent XCTest 自动化截图与素材上传提示词", "Agent XCTest Automated Screenshot & Upload Prompt")}</h3>
                      <p>{t("指导 AI Agent 先检查本版本素材，复用已有截图，仅用 XCTest 补拍并上传缺失项。", "Instruct an AI Agent to check this release’s assets first, reuse existing screenshots, and capture and upload only missing screenshots with XCTest.")}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setShowPromptPreview(!showPromptPreview)}
                    >
                      {showPromptPreview ? t("收起提示词", "Collapse Prompt") : t("查看完整提示词", "View Full Prompt")}
                    </button>
                    <button
                      type="button"
                      className="button primary small"
                      onClick={handleCopyAgentPrompt}
                    >
                      <Copy size={13} />
                      {t("复制提示词", "Copy Prompt")}
                    </button>
                  </div>
                </div>

                <div className="release-prompt-controls">
                  {/* 发布平台展示 (根据该版本选择的平台) */}
                  <div className="release-prompt-control-row">
                    <span className="release-prompt-control-label">{t("发布平台：", "Platforms:")}</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {selectedPlatforms.map((platId) => (
                        <span key={platId} className="badge app" style={{ fontSize: 12, padding: "3px 8px" }}>
                          {getPlatformLabel(platId)}
                        </span>
                      ))}
                      {!selectedPlatforms.length && (
                        <span className="muted-text" style={{ fontSize: 12 }}>{t("未选择平台", "No platforms selected")}</span>
                      )}
                    </div>
                  </div>

                  {/* 目标语言选择 (用户多选) */}
                  <div className="release-prompt-control-row">
                    <span className="release-prompt-control-label">{t("目标语言：", "Languages:")}</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {COMMON_ASSET_LANGUAGES.map((langItem) => {
                        const isChecked = promptLanguages.includes(langItem.code);
                        return (
                          <button
                            key={langItem.code}
                            type="button"
                            className={`tag-pill ${isChecked ? "active" : ""}`}
                            onClick={() => {
                              if (isChecked) {
                                if (promptLanguages.length > 1) {
                                  setPromptLanguages(promptLanguages.filter((c) => c !== langItem.code));
                                } else {
                                  notify(t("请至少保留一门目标语言", "Please keep at least one target language"));
                                }
                              } else {
                                setPromptLanguages([...promptLanguages, langItem.code]);
                              }
                            }}
                            style={{
                              padding: "3px 8px",
                              borderRadius: 12,
                              fontSize: 11.5,
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
                            {isChecked && <span style={{ fontWeight: 700, fontSize: 10 }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {showPromptPreview && (
                  <pre className="release-prompt-code-box">
                    {generateXCTestPrompt()}
                  </pre>
                )}
              </div>

              {/* 2. 显示该版本的素材库 */}
              <div className="release-assets-view-wrap">
                <div className="release-assets-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1e293b" }}>
                      {t("该版本关联素材", "Release Assets")}
                    </h3>
                    <span className="badge neutral" style={{ fontSize: 11 }}>
                      {releaseAssets.length}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setReleaseUploadModalOpen(true)}
                    >
                      <Plus size={13} />
                      {t("上传素材", "Upload Asset")}
                    </button>
                    <button
                      type="button"
                      className="text-button small"
                      onClick={() => {
                        viewProduct(r.productId);
                        setTab("assets");
                      }}
                    >
                      <ExternalLink size={13} />
                      {t("进入产品素材库", "View in Asset Library")}
                    </button>
                  </div>
                </div>

                {releaseAssets.length > 0 ? (
                  <div className="release-assets-grid">
                    {releaseAssets.map((asset) => (
                      <div key={asset.id} className="asset-card">
                        <div
                          className="asset-thumb-wrap"
                          onClick={() => setReleasePreviewAsset(asset)}
                          style={{ cursor: "pointer" }}
                        >
                          <img src={asset.url} alt={asset.name} />
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
                                onClick={() => setReleaseEditingAsset(asset)}
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                className="icon-button danger"
                                title={t("删除素材", "Delete Asset")}
                                onClick={() => handleDeleteReleaseAsset(asset)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          <div className="asset-tags-row">
                            <span className="asset-tag size-tag">
                              {formatBytes(asset.fileSize)}
                            </span>
                            {asset.languages && asset.languages.length > 0 && (
                              <span
                                className="asset-tag lang-tag"
                                title={lang === "en" ? `Languages: ${asset.languages.map(getAssetLanguageLabel).join(", ")}` : `适用语言：${asset.languages.map(getAssetLanguageLabel).join("、")}`}
                              >
                                <Globe size={10} />
                                {asset.languages.map(getAssetLanguageLabel).join("/")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="step3-empty-state" style={{ padding: "32px 20px" }}>
                    <div className="empty-icon-circle">
                      <ImageIcon size={22} />
                    </div>
                    <p className="empty-title">{t("该版本暂无关联素材", "No assets associated with this release")}</p>
                    <p className="empty-description">
                      {t("复制上方提示词指导 Agent 自动运行 XCTest 截图并上传，或点击右上角「上传素材」手动添加。", "Copy the prompt above to let an Agent capture and upload screenshots with XCTest, or click 'Upload Asset' above.")}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <div className="release-step-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setReleaseStage("store")}
              >
                {t("← 上一步：平台发布", "← Previous: Platform Publication")}
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => setReleaseStage("marketing")}
              >
                {t("进入下一步：营销内容 →", "Next: Marketing Content →")}
              </button>
            </div>
          </div>

          {/* 流程4: 营销内容 */}
          <div hidden={stage !== "marketing"} className="release-promotion-wrapper">
            {(() => {
              const channels = r.channels.length > 0 ? r.channels.join("、") : "X、小红书、微信公众号";
              const publishedCount = related.filter((c) => c.status === "published").length;
              const readyCount = related.filter((c) => c.status === "ready" || c.status === "review").length;
              const draftCount = related.filter((c) => c.status === "draft").length;
              const statusSummary = [
                publishedCount ? (lang === "en" ? `${publishedCount} published` : `已发布 ${publishedCount}`) : "",
                readyCount ? (lang === "en" ? `${readyCount} ready` : `待发布 ${readyCount}`) : "",
                draftCount ? (lang === "en" ? `${draftCount} draft` : `草稿 ${draftCount}`) : "",
              ].filter(Boolean).join(" · ");

              return (
                <>
                  {/* 营销内容生成驾驶舱 */}
                  <section className="panel padded ai-promotion-banner">
                    <div className="ai-banner-header">
                      <div className="ai-banner-title">
                        <div className="ai-orb marketing-orb">
                          <Rocket size={22} />
                        </div>
                        <div className="ai-banner-copy">
                          <h3>{t("营销内容策划与生成", "Marketing Content Planning & Generation")}</h3>
                          <p className="fine-print">
                            {t("先在平台确认推广需求，复制提示词给 AI Agent；通过 MCP 参考本产品资料、本次更新与历史文章，选择选题后返回完整文章。", "Confirm promotion briefs, copy prompts to AI Agent via MCP to generate and backfill articles.")}
                          </p>
                        </div>
                      </div>
                      <div className="ai-banner-actions">
                        <button type="button" className="button secondary ai-banner-btn" onClick={() => editContent(undefined, r.productId, r.id, true)}><Plus size={14} />{t("手动创建", "Create Manually")}</button>
                        <button
                          type="button"
                          className="button primary ai-banner-btn"
                          onClick={() => {
                            const prod = data.products.find(p => p.id === r.productId);
                            const title = `${prod?.name ? prod.name + " " : ""}v${r.version} ${lang === 'en' ? "Release Promotion" : "版本更新推广"}`;
                            const direction = r.changes ? (lang === 'en' ? `Version ${r.version} updates:\n${r.changes}` : `v${r.version} 版本更新重点：\n${r.changes}`) : "";
                            if (createContentGroup) {
                              createContentGroup({
                                productIds: r.productId ? [r.productId] : [],
                                title,
                                direction,
                                channels: r.channels && r.channels.length > 0 ? r.channels : undefined,
                              });
                            } else {
                              editContent(undefined, r.productId, r.id);
                            }
                          }}
                        >
                          <Sparkles size={14} />
                          {t("准备营销创作", "Prepare Marketing Brief")}
                        </button>
                      </div>
                    </div>

                    <div className="ai-banner-footer">
                      <div className="ai-context-chips">
                        <span className="chip">
                          <FileText size={12} /> {lang === 'en' ? `${related.length} related articles` : `${related.length} 篇关联营销文案`}
                        </span>
                        <span className="chip">
                          <Rocket size={12} /> {t("目标渠道：", "Target channels: ")}{channels}
                        </span>
                        <span className="chip">
                          <Sparkles size={12} /> {t("MCP 自动关联知识库、更新说明与历史文章", "MCP automatically associates knowledge base, release notes, and past articles")}
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* 关联营销内容卡片 */}
                  <section className="panel padded step3-section-card release-marketing-card full-width">
                    <div className="panel-heading plain release-marketing-heading">
                      <div className="step3-section-title">
                        <Rocket size={17} className="title-icon" />
                        <h2>
                          {t("关联营销内容", "Associated Marketing Content")}
                          <span className="count-badge">{lang === 'en' ? `${related.length} articles` : `${related.length} 篇`}</span>
                        </h2>
                      </div>
                      <div className="release-marketing-heading-actions">
                        {statusSummary && (
                          <span className="release-marketing-summary">{statusSummary}</span>
                        )}
                        <button
                          type="button"
                          className="text-button small"
                          onClick={() => go("contents")}
                        >
                          <ExternalLink size={13} />
                          {t("前往营销内容页", "Open Marketing Content")}
                        </button>
                      </div>
                    </div>

                    <div className="step3-card-list">
                      {related.map((c) => {
                        const snippet = c.body ? c.body.replace(/[#*`\n]+/g, " ").trim() : "";
                        const dateValue = (c.publishedAt || c.date || "").slice(0, 10);
                        return (
                          <div
                            className="step3-content-item"
                            key={c.id}
                            onClick={() => editContent(c)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                editContent(c);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="content-channel-badge">
                              <PlatformLogo platform={c.channel} size={20} />
                            </div>
                            <div className="content-item-body">
                              <div className="content-item-header">
                                <strong
                                  className="content-item-title"
                                  title={c.title || t("未命名文案", "Untitled Copy")}
                                >
                                  {c.title || t("未命名文案", "Untitled Copy")}
                                </strong>
                              </div>
                              {snippet && (
                                <p className="content-item-snippet">
                                  {snippet.slice(0, 120)}
                                </p>
                              )}
                              <div className="content-item-meta">
                                <span className="content-channel-tag">{platformName(c.channel) || c.channel}</span>
                                {isAiContent(c) && (
                                  <span className="marketing-ai-badge" title={t("AI 生成文案", "AI Generated Copy")}>
                                    <Sparkles size={11} />
                                    <span>AI</span>
                                  </span>
                                )}
                                {dateValue && (
                                  <span className="content-item-date">{dateValue}</span>
                                )}
                              </div>
                            </div>
                            <div className="content-item-aside">
                              <Badge value={c.status} />
                              <span className="content-item-action" aria-hidden="true">
                                <Pencil size={13} />
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {!related.length && (
                        <div className="step3-empty-state">
                          <div className="empty-icon-circle">
                            <Rocket size={20} />
                          </div>
                          <p className="empty-title">{t("尚未生成营销文案", "No marketing copy generated yet")}</p>
                          <p className="empty-description">
                            {t("点击「准备营销创作」确认需求，再复制提示词给 AI Agent；在对话中选择提议和选题并获取完整文章，需要保留时让 Agent 保存为草稿。", "Click 'Prepare Marketing Brief', copy prompt to AI Agent, choose topics in chat, and let Agent save back as drafts.")}
                          </p>
                        </div>
                      )}
                    </div>
                  </section>

                  <div className="release-step-footer">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setReleaseStage("knowledge")}
                    >
                      {t("← 上一步：更新知识库", "← Previous: Update Knowledge Base")}
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => {
                        if (tab === "history") {
                          viewProduct(r.productId);
                          setTab("history");
                        } else setReleaseId(null);
                      }}
                    >
                      {t("完成发布准备", "Complete Release Preparation")}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* 右侧详情栏 */}
        <aside className="release-aside">
          {/* 1. 流程轴移动到右侧详情栏的上部分 */}
          <section className="panel padded release-stages-panel" aria-label={t("发布流程", "Release Stages")}>
            <div className="release-stages-header">
              <h3>{t("发布流程", "Release Stages")}</h3>
              <span className="fine-print">
                {lang === 'en' ? `Step ${stage === "update" ? "1" : stage === "store" ? "2" : stage === "knowledge" ? "3" : "4"}/4` : `步骤 4/${stage === "update" ? "1" : stage === "store" ? "2" : stage === "knowledge" ? "3" : "4"}`}
              </span>
            </div>
            <div className="vertical-workflow">
              {[
                {
                  id: "update",
                  title: t("1. 版本更新内容", "1. Release Notes"),
                  desc: r.changes ? t("已填写更新内容", "Notes recorded") : t("待记录更新内容", "To record notes"),
                  done: !!r.changes.trim(),
                },
                {
                  id: "store",
                  title: t("2. 平台发布", "2. Platform Publication"),
                  desc: selectedPlatforms.length > 1
                    ? (lang === 'en' ? `${selectedPlatforms.length} platforms` : `${selectedPlatforms.length} 个平台发布`)
                    : r.storeSource ? t("已同步至商店版本", "Synced to store") : t("本地化、构建与提交审核", "Locales, build & submission"),
                  done: !!r.storeSource,
                },
                {
                  id: "knowledge",
                  title: t("3. 更新知识库", "3. Update Docs"),
                  desc: lang === 'en' ? `${r.proposals.filter((p) => !p.applied).length} pending docs` : `${r.proposals.filter((p) => !p.applied).length} 项文档待确认`,
                  done: r.proposals.length > 0 && r.proposals.every((p) => p.applied),
                },
                {
                  id: "marketing",
                  title: t("4. 营销内容", "4. Marketing Content"),
                  desc: lang === 'en' ? `${related.length} articles` : `${related.length} 篇营销文案`,
                  done: related.length > 0,
                },
              ].map((item, index) => (
                <button
                  key={item.id}
                  className={`workflow-step ${stage === item.id ? "active" : ""} ${item.done ? "done" : ""}`}
                  aria-current={stage === item.id ? "step" : undefined}
                  onClick={() => setReleaseStage(item.id)}
                >
                  <span className="step-number">{item.done ? <Check size={12} /> : String(index + 1)}</span>
                  <div className="step-content">
                    <span className="step-title">{item.title}</span>
                    <span className="step-desc">{item.desc}</span>
                  </div>
                  <ChevronRight size={14} className="step-arrow" />
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* Release Asset Modals */}
      {releaseUploadModalOpen && (
        <UploadAssetModal
          data={data}
          initialOwner={r.productId}
          initialFolderId=""
          initialReleaseId={r.id}
          onClose={() => setReleaseUploadModalOpen(false)}
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
                ok = await onAppend(batch, i === 0 ? newFolders : [], isFinal);
              } else {
                ok = await save((d) => {
                  if (i === 0 && newFolders.length > 0) {
                    d.assetFolders = [...(d.assetFolders || []), ...newFolders];
                  }
                  d.assets = [...(d.assets || []), ...batch];
                });
              }
              if (ok === false) return false;
            }
            notify(t("已成功上传 {n} 个素材并关联当前版本", "Uploaded {n} assets and linked to this release", { n: newAssets.length }));
            setReleaseUploadModalOpen(false);
            return true;
          }}
        />
      )}

      {releaseEditingAsset && (
        <EditAssetModal
          asset={releaseEditingAsset}
          data={data}
          onClose={() => setReleaseEditingAsset(null)}
          onSave={async (updated) => {
            await save((d) => {
              const idx = (d.assets || []).findIndex((a) => a.id === updated.id);
              if (idx !== -1) {
                d.assets[idx] = updated;
              }
            });
            notify(t("素材资料已更新", "Asset information updated"));
            setReleaseEditingAsset(null);
          }}
        />
      )}

      {releasePreviewAsset && (
        <PreviewAssetModal
          asset={releasePreviewAsset}
          data={data}
          onClose={() => setReleasePreviewAsset(null)}
          onEdit={() => {
            const a = releasePreviewAsset;
            setReleasePreviewAsset(null);
            setReleaseEditingAsset(a);
          }}
          onDelete={() => {
            const a = releasePreviewAsset;
            handleDeleteReleaseAsset(a);
          }}
          notify={notify}
        />
      )}
    </>
  );
}

const root: Root = import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
