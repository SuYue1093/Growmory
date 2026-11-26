import { useEffect, useState } from "react";
import type { Data, Product, Release } from "./types";
import { storeState } from "./product-app-store";
import { Sparkles, LoaderCircle, Globe, CheckCircle2, AlertCircle } from "lucide-react";
import { useI18n, t as globalT } from "./i18n.ts";

type Action = "sync" | "submit" | "release";
type Event = { at: string; action: Action; platform: string; version: string; outcome: string; stage: string; message?: string };
type Status = {
  appId: string;
  appName: string;
  platform: string;
  version: string;
  remoteId: string;
  state: string;
  releaseType: string;
  buildId: string;
  buildNumber: string;
  builds: { id: string; number: string; uploadedAt: string }[];
  localizations?: { locale: string; whatsNew?: string }[];
  checkedAt: string;
  events: Event[];
};

const actionName = (action: Action, t = globalT) => ({
  sync: t("写入商店资料", "Save Store Metadata"),
  submit: t("提交审核", "Submit for Review"),
  release: t("正式上架", "Release to Store"),
}[action]);

const defaultLocale = (language: string) => ({
  "中文": "zh-Hans", "简体中文": "zh-Hans", "繁体中文": "zh-Hant",
  "英文": "en-US", "英语": "en-US", "日文": "ja", "日语": "ja",
  "韩文": "ko", "韩语": "ko", "法文": "fr-FR", "德文": "de-DE",
}[language] || (/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(language) ? language : ""));

export const APP_STORE_LOCALES: Record<string, string> = {
  "zh-Hans": "简体中文 (中国大陆)",
  "zh-Hant": "繁体中文 (台湾/香港)",
  "en-US": "英语 (美国)",
  "en-GB": "英语 (英国)",
  "en-CA": "英语 (加拿大)",
  "en-AU": "英语 (澳大利亚)",
  "ja": "日语",
  "ko": "韩语",
  "fr-FR": "法语 (法国)",
  "fr-CA": "法语 (加拿大)",
  "de-DE": "德语",
  "es-ES": "西班牙语 (西班牙)",
  "es-MX": "西班牙语 (墨西哥)",
  "it": "意大利语",
  "pt-BR": "葡萄牙语 (巴西)",
  "pt-PT": "葡萄牙语 (葡萄牙)",
  "ru": "俄语",
  "ar-SA": "阿拉伯语",
  "th": "泰语",
  "vi": "越南语",
  "id": "印尼语",
  "tr": "土耳其语",
  "nl-NL": "荷兰语",
  "sv": "瑞典语",
  "da": "丹麦语",
  "fi": "芬兰语",
  "nb": "挪威语",
  "pl": "波兰语",
  "el": "希腊语",
  "he": "希伯来语",
  "hi": "印地语",
  "ms": "马来语",
};

export function getLocaleDisplayName(locale: string, t = globalT): string {
  if (APP_STORE_LOCALES[locale]) return t(APP_STORE_LOCALES[locale]);
  const base = locale.split("-")[0];
  if (APP_STORE_LOCALES[base]) return `${t(APP_STORE_LOCALES[base])} (${locale})`;
  return locale;
}

const editable = ["PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"];

export function ReleasePublication({
  release,
  product,
  platform: controlledPlatform,
  onPlatformChange,
  onConnect,
  onNext,
  notify,
  save,
}: {
  release: Release;
  product?: Product;
  platform?: string;
  onPlatformChange?: (platform: string) => void;
  onConnect: () => void;
  onNext?: () => void;
  notify: (message: string) => void;
  save?: (mutator: (d: Data) => void) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [internalPlatform, setInternalPlatform] = useState(release.storeSource?.platform || "IOS");
  const platform = controlledPlatform || internalPlatform;
  const setPlatform = (val: string) => {
    if (onPlatformChange) onPlatformChange(val);
    else setInternalPlatform(val);
  };

  // Cached localizations for this specific platform from product.appStore.versions
  const normPlatform = (["IOS", "MAC_OS", "TV_OS", "VISION_OS"].includes((platform || "").toUpperCase())
    ? (platform || "").toUpperCase()
    : platform === "MACOS" || platform === "macOS" ? "MAC_OS" : platform);

  const platformStoreVersions = (product?.appStore?.versions || []).filter(v => v.platform === normPlatform || v.platform === platform);
  const platformStoreLocales = Array.from(new Set(
    platformStoreVersions.flatMap(v => v.notes?.map(n => n.locale) || [])
  )).filter(Boolean);

  const [localeMap, setLocaleMap] = useState<Record<string, string>>(() => Object.fromEntries(release.languages.map(l => [l, defaultLocale(l)])));
  const [localeNotes, setLocaleNotes] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    const savedPlatNotes = release.platformDetails?.[platform]?.notes || release.platformDetails?.[normPlatform]?.notes;
    if (savedPlatNotes && savedPlatNotes.length > 0) {
      for (const note of savedPlatNotes) {
        if (note.language) initial[note.language] = note.body || "";
      }
      return initial;
    }
    const currentVersionStore = platformStoreVersions.find(v => v.version === release.version) || platformStoreVersions[0];
    if (currentVersionStore && currentVersionStore.notes?.length) {
      for (const note of currentVersionStore.notes) {
        if (note.locale) initial[note.locale] = note.body || "";
      }
      return initial;
    }
    if (release.changes) {
      initial["zh-Hans"] = release.changes;
    }
    return initial;
  });
  const [buildId, setBuildId] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [actionBusy, setActionBusy] = useState<Action | null>(null);
  const [actionStatus, setActionStatus] = useState<{
    type: "loading" | "success" | "error";
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiFilling, setAiFilling] = useState(false);
  const [error, setError] = useState("");

  const languages = JSON.stringify(release.languages);
  useEffect(() => {
    setLocaleMap(old => Object.fromEntries(release.languages.map(l => [l, old[l] || defaultLocale(l)])));
  }, [languages]);

  useEffect(() => {
    setStatus(null);
    setBuildId("");
    setActionStatus(null);
    setError("");
    if (product?.appStore?.appId) {
      void refresh(platform, true);
    }
  }, [platform]);

  // Read status from backend
  async function request(path: string, body: object) {
    const response = await fetch(`/api/app-store-connect/releases/${encodeURIComponent(release.id)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok) throw Error(value.error || t("发布操作失败", "Publication operation failed"));
    return value;
  }

  async function refresh(plat = platform, silent = false) {
    setBusy(true);
    if (!silent) setError("");
    try {
      const value = await request("status", { platform: plat });
      setStatus(value);
      setBuildId(value.buildId || "");
      if (value.localizations?.length) {
        setLocaleNotes(() => {
          const next: Record<string, string> = {};
          for (const loc of value.localizations) {
            next[loc.locale] = loc.whatsNew || "";
          }
          const hasAny = Object.values(next).some(v => v.trim().length > 0);
          if (!hasAny && release.changes) {
            if (next["zh-Hans"] !== undefined) {
              next["zh-Hans"] = release.changes;
            } else if (Object.keys(next).length > 0) {
              next[Object.keys(next)[0]] = release.changes;
            }
          }
          return next;
        });
      }
    } catch (e) {
      if (!silent) {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Active list of locales to display: strictly for the current platform
  const activeLocales: string[] = status?.localizations?.length
    ? status.localizations.map(l => l.locale)
    : platformStoreLocales.length
      ? platformStoreLocales
      : Array.from(new Set([
          ...Object.keys(localeNotes).filter(k => (localeNotes[k] || "").trim().length > 0),
          ...(release.platformDetails?.[platform]?.notes || release.platformDetails?.[normPlatform]?.notes || []).map(n => defaultLocale(n.language) || n.language),
          "zh-Hans",
          "en-US",
        ])).filter(Boolean);

  // AI Generate & Fill
  async function handleAIFill() {
    if (aiFilling) return;
    const targetLocales = activeLocales.length ? activeLocales : ["zh-Hans", "en-US"];
    setAiFilling(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releaseId: release.id,
          locales: targetLocales,
          onlyNotes: true,
          platform,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || t("AI 生成失败", "AI generation failed"));
      if (Array.isArray(data.notes)) {
        const updated: Record<string, string> = { ...localeNotes };
        for (const n of data.notes) {
          const loc = n.locale || defaultLocale(n.language) || n.language;
          if (loc) updated[loc] = n.body;
        }
        setLocaleNotes(updated);
        if (save) {
          await save(d => {
            const r = d.releases.find(x => x.id === release.id);
            if (r) {
              r.languages = Object.keys(updated);
              r.notes = Object.entries(updated).map(([loc, body]) => ({
                language: loc,
                body,
                approved: true,
              }));
            }
          });
        }
        notify(t("已通过 AI 完成本地化更新说明生成并填充", "Localized release notes generated and filled via AI"));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiFilling(false);
    }
  }

  async function directExecute(action: Action) {
    if (actionBusy || busy) return;
    setActionBusy(action);
    const loadingMessage =
      action === "sync"
        ? t("正在写入商店资料（同步多语言更新说明与构建），请稍候…", "Saving store metadata (syncing notes & builds), please wait...")
        : action === "submit"
          ? t("正在向 App Store Connect 提交版本审核，请稍候…", "Submitting version to App Store Connect for review, please wait...")
          : t("正在向 Apple 请求正式上架，请稍候…", "Requesting release to App Store, please wait...");

    setActionStatus({
      type: "loading",
      message: loadingMessage,
    });
    setError("");

    try {
      // 1. 获取预检与临时授权 token
      const previewResult = await request("preview", {
        action,
        platform,
        localeMap,
        localizedNotes: localeNotes,
        buildId,
      });

      // 2. 直接执行发布指令（不需要中间用户确认预览）
      const execResult = await request("execute", { token: previewResult.token });

      // 如果有外部 save 回调，且是写入或上架操作，同步更新本地 release 数据
      if (save) {
        if (action === "sync") {
          await save(d => {
            const r = d.releases.find(x => x.id === release.id);
            if (r) {
              const notesList = Object.entries(localeNotes)
                .filter(([, body]) => (body || "").trim())
                .map(([loc, body]) => ({
                  language: loc,
                  body,
                  approved: true,
                }));
              r.languages = Object.keys(localeNotes).filter(k => (localeNotes[k] || "").trim());
              r.notes = notesList;
              r.platformDetails = r.platformDetails || {};
              r.platformDetails[platform] = {
                version: release.version,
                changes: release.changes,
                notes: notesList,
              };
              if (normPlatform !== platform) {
                r.platformDetails[normPlatform] = r.platformDetails[platform];
              }
            }
          });
        } else if (action === "release") {
          await save(d => {
            const r = d.releases.find(x => x.id === release.id);
            if (r) {
              r.status = "published";
            }
          });
        }
      }

      const successMsg = execResult.message || `${actionName(action, t)}${t("成功！", " succeeded!")}`;
      setActionStatus({
        type: "success",
        message: successMsg,
      });
      notify(successMsg);

      // 重新读取商店最新状态更新界面
      try {
        await refresh();
      } catch (err) {
        console.warn("刷新状态失败", err);
      }
    } catch (e) {
      const errorMsg = (e as Error).message || t("操作失败，请重试", "Operation failed, please try again");
      setActionStatus({
        type: "error",
        message: errorMsg,
      });
    } finally {
      setActionBusy(null);
    }
  }

  const canEdit = status && (!status.remoteId || editable.includes(status.state));
  const hasAtLeastOneNote = activeLocales.some(loc => (localeNotes[loc] || "").trim());

  return (
    <section className="panel padded publication-panel">
      <div className="panel-heading plain">
        <h2>{t("AppStoreconnect 发布", "App Store Connect Publication")}</h2>
      </div>
      {!product?.appStore ? (
        <>
          <p className="body-copy">{t("先关联对应的 Apple App，再写入版本资料和提交审核。", "Connect your Apple App before updating metadata and submitting for review.")}</p>
          <button className="button secondary" onClick={onConnect}>
            {t("前往关联 Apple App", "Connect Apple App")}
          </button>
        </>
      ) : (
        <>
          <p className="body-copy">
            {product.appStore.name} · App Store ID {product.appStore.appId} · {t("本机版本", "Local Version")} {release.version} · {t("目标平台：", "Platform: ")}{({ IOS: "iOS / iPadOS", MAC_OS: "macOS", TV_OS: "tvOS", VISION_OS: "visionOS" })[platform] || platform}
          </p>
          <fieldset className="asc-fields" disabled={busy || aiFilling}>
            {/* 1. 选择发布平台与读取 */}
            <div className="publication-target">
              {!controlledPlatform && (
                <label className="field">
                  <span>{t("发布平台", "Platform")}</span>
                  <select
                    value={platform}
                    disabled={!!release.storeSource}
                    onChange={e => {
                      setPlatform(e.target.value);
                      setStatus(null);
                      setBuildId("");
                      setActionStatus(null);
                    }}
                  >
                    <option value="IOS">iOS / iPadOS</option>
                    <option value="MAC_OS">macOS</option>
                    <option value="TV_OS">tvOS</option>
                    <option value="VISION_OS">visionOS</option>
                  </select>
                </label>
              )}
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void run(refresh)}
              >
                {busy ? <LoaderCircle className="spin" size={14} /> : null}
                {t("读取商店状态与构建", "Fetch Store Status & Builds")}
              </button>
            </div>

            {/* 读取商店状态时，加载提示显示移动到读取按钮下一行 */}
            {busy && (
              <div className="publication-inline-loading" role="status">
                <LoaderCircle className="spin" size={15} />
                <span>{t("正在从 App Store Connect 读取状态与本地化列表，请稍候…", "Reading status and localizations from App Store Connect, please wait...")}</span>
              </div>
            )}
            {error && (
              <div className="publication-inline-loading error" role="alert">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {status && (
              <div className="publication-status">
                <strong>{status.remoteId ? storeState(status.state, t) : t("尚未创建商店版本", "No store version created yet")}</strong>
                <p className="fine-print">
                  {t("读取于", "Fetched at")} {new Date(status.checkedAt).toLocaleString()} ·{" "}
                  {status.releaseType === "MANUAL"
                    ? t("手动发布", "Manual Release")
                    : status.releaseType
                      ? `${t("发布方式：", "Release Type: ")}${status.releaseType}`
                      : t("新版本将设为手动发布", "New version will be set to manual release")}
                  {status.buildNumber ? ` · ${t("当前构建", "Current build")} ${status.buildNumber}` : ` · ${t("尚未选择构建", "No build selected")}`}
                </p>
              </div>
            )}

            {/* 2. 罗列本地化列表，每个本地化语言一个输入框，右侧添加 AI 翻译填充 */}
            <div className="asc-localizations-section">
              <div className="asc-localizations-header">
                <div>
                  <h3 className="section-title">{t("本地化更新说明", "Localized Release Notes")}</h3>
                  <p className="fine-print">{t("当前 App 在 App Store Connect 配置的本地化语言列表，每个语言对应一份发布说明。", "List of localized languages configured in App Store Connect, each with its own release notes.")}</p>
                </div>
                <button
                  type="button"
                  className="button primary small ai-fill-button"
                  onClick={() => void handleAIFill()}
                  disabled={aiFilling || busy}
                >
                  {aiFilling ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}
                  <span>{aiFilling ? t("正在生成...", "Generating...") : t("AI 翻译填充", "AI Translate & Fill")}</span>
                </button>
              </div>

              {activeLocales.length > 0 ? (
                <div className="asc-localizations-list">
                  {activeLocales.map(loc => {
                    const val = localeNotes[loc] || "";
                    const count = val.length;
                    return (
                      <div className="asc-locale-card" key={loc}>
                        <div className="asc-locale-meta">
                          <div className="asc-locale-label">
                            <Globe size={15} />
                            <strong>{getLocaleDisplayName(loc, t)}</strong>
                            <span className="code-tag">{loc}</span>
                          </div>
                          <span className={`char-counter ${count > 4000 ? "overflow" : ""}`}>
                            {count} / 4000
                          </span>
                        </div>
                        <textarea
                          className="asc-locale-textarea"
                          rows={6}
                          value={val}
                          placeholder={t(`填写 ${getLocaleDisplayName(loc, t)} 的版本更新说明（例如新增功能、性能优化与问题修复）...`, `Enter release notes for ${getLocaleDisplayName(loc, t)} (e.g. new features, bug fixes, improvements)...`)}
                          maxLength={4000}
                          onChange={e => {
                            const text = e.target.value;
                            setLocaleNotes(old => ({ ...old, [loc]: text }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : !status ? (
                <div className="asc-not-read-box">
                  <p className="placeholder-copy">
                    {t("请选择发布平台并点击「读取商店状态与构建」，系统将真实读取该产品在 App Store Connect 中添加的本地化语言列表与可用构建；也可直接点击右上角「AI 翻译填充」。", "Select a platform and click \"Fetch Store Status & Builds\" to load active localizations and builds; or click \"AI Translate & Fill\" directly.")}
                  </p>
                </div>
              ) : (
                <p className="placeholder-copy">{t("未读取到本地化语言，请点击上方按钮重新读取或在 Apple 后台核对配置。", "No localized languages found. Click above to refresh or check your App Store Connect settings.")}</p>
              )}
            </div>

            {/* 3. 选择构建 */}
            {status && (
              <label className="field">
                <span>{t("选择已上传的构建", "Select Uploaded Build")}</span>
                <select value={buildId} onChange={e => setBuildId(e.target.value)}>
                  <option value="">{t("保留现有构建 / 暂不选择", "Keep current build / None")}</option>
                  {status.buildId && !status.builds.some(b => b.id === status.buildId) && (
                    <option value={status.buildId}>{t("当前构建", "Current build")} {status.buildNumber}</option>
                  )}
                  {status.builds.map(b => (
                    <option key={b.id} value={b.id}>
                      {t("构建", "Build")} {b.number} · {b.uploadedAt ? new Date(b.uploadedAt).toLocaleString() : b.id}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {status && canEdit && status.builds.length === 0 && (
              <p className="fine-print">
                {t("暂无匹配且可用的构建。请先通过 Xcode 或 Transporter 上传对应版本与平台的构建，等待 Apple 处理后重新读取。", "No matching and available builds found. Please upload builds via Xcode or Transporter and refresh once processed by Apple.")}
              </p>
            )}

            {/* 4. 操作状态提示（写入中、提交审核中、成功或失败），显示在操作按钮上方 */}
            {actionStatus && (
              <div
                className={`publication-action-status is-${actionStatus.type}`}
                role={actionStatus.type === "error" ? "alert" : "status"}
              >
                {actionStatus.type === "loading" && <LoaderCircle className="spin" size={16} />}
                {actionStatus.type === "success" && <CheckCircle2 size={16} />}
                {actionStatus.type === "error" && <AlertCircle size={16} />}
                <span>{actionStatus.message}</span>
              </div>
            )}

            {/* 操作按钮：写入商店资料、提交审核与下一步 */}
            <div className="asc-actions publication-actions-bar">
              <div className="asc-actions-group">
                <button
                  type="button"
                  className="button primary"
                  disabled={busy || actionBusy !== null || !canEdit || !hasAtLeastOneNote}
                  onClick={() => void directExecute("sync")}
                >
                  {actionBusy === "sync" && <LoaderCircle className="spin" size={14} />}
                  {t("写入商店资料", "Save Store Metadata")}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || actionBusy !== null || !canEdit || !status?.remoteId || !status.buildId}
                  onClick={() => void directExecute("submit")}
                >
                  {actionBusy === "submit" && <LoaderCircle className="spin" size={14} />}
                  {t("提交审核", "Submit for Review")}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || actionBusy !== null || status?.state !== "PENDING_DEVELOPER_RELEASE"}
                  onClick={() => void directExecute("release")}
                >
                  {actionBusy === "release" && <LoaderCircle className="spin" size={14} />}
                  {t("正式上架", "Release to Store")}
                </button>
              </div>
              {onNext && (
                <button
                  type="button"
                  className="button secondary asc-next-btn"
                  onClick={onNext}
                >
                  {t("进入下一步：更新知识库 →", "Next: Update Knowledge Base →")}
                </button>
              )}
            </div>
          </fieldset>

          <p className="fine-print">
            {t("版本资料写入会将发布方式设为手动发布。截图、隐私、年龄分级、审核联系人与出口合规等仍需在 ", "Saving metadata sets the release to Manual Release. Screenshots, privacy, age rating, and export compliance still need to be completed in ")}
            <a href={`https://appstoreconnect.apple.com/apps/${product.appStore.appId}/distribution`} target="_blank" rel="noreferrer">
              App Store Connect
            </a>{" "}
            {t("完成；Apple 会在提交时校验。此处使用已上传构建，不负责二进制上传。", "where Apple validates upon submission. Growmory attaches uploaded builds and does not upload binary IPAs.")}
          </p>

          {status?.events.length ? (
            <details className="asc-history-details">
              <summary>{t("最近发布操作 · ", "Recent Publications · ")}{status.events.length}</summary>
              {status.events.map((event, i) => (
                <div className="store-version" key={i}>
                  <strong>{event.platform} · {event.version} · {event.stage}</strong>
                  <p className="fine-print">
                    {new Date(event.at).toLocaleString()} ·{" "}
                    {event.outcome === "success" ? t("请求成功", "Success") : event.outcome === "failed" ? t("失败，需核对", "Failed, check details") : t("已发起请求", "Requested")}
                  </p>
                  {event.message && <p>{event.message}</p>}
                </div>
              ))}
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
