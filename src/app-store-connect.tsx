import { useEffect, useState } from "react";
import type { Data } from "./types";
import { Link2 } from "lucide-react";
import { useI18n } from "./i18n.ts";
type Connection = { configured: boolean; issuerId: string; keyId: string; lastCheckedAt: string | null };
type AppleApp = { id: string; name: string; bundleId: string; sku: string };
export function AppStoreConnect({ notify, onImported, connectionStep = 1, wizardStep, onConnected, onBack }: { wizardStep?: number; onConnected?: () => void; onBack?: () => void; connectionStep?: number; notify: (message: string) => void; onImported: (state: { data: Data; revision: number }) => void }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<Connection | null>(null);
  const [issuerId, setIssuerId] = useState("");
  const [keyId, setKeyId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [fileName, setFileName] = useState("");
  const [apps, setApps] = useState<AppleApp[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [imported, setImported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileVersion, setFileVersion] = useState(0);
  async function request(path: string, method = "GET", data?: object) {
    const response = await fetch(`/api/app-store-connect/${path}`, { method, headers: { "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || t("连接操作失败", "Connection operation failed"));
    return result;
  }
  async function load() {
    try {
      const result = await request("settings");
      setConfig(result); setIssuerId(result.issuerId); setKeyId(result.keyId); setError("");
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  async function importSelected() {
    setBusy(true); setError("");
    try {
      const result = await request("import", "POST", { appIds: selected });
      onImported(result); setImported(true);
      const missingIcons = result.sync?.filter((item: { icon?: string }) => item.icon === "unavailable").length || 0;
      notify(t(`已同步 ${result.total} 个产品${missingIcons ? `，其中 ${missingIcons} 个图标暂未获取，可再次同步补齐` : ""}`, `Synced ${result.total} products${missingIcons ? ` (${missingIcons} icons pending, can re-sync later)` : ""}`));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function act(action: "save" | "test" | "disconnect") {
    setBusy(true); setError(""); setApps(null);
    try {
      if (action === "disconnect") {
        const result = await request("settings", "DELETE");
        setConfig(result); setIssuerId(""); setKeyId(""); setPrivateKey(""); setFileName(""); setFileVersion(v => v + 1);
        notify(t("App Store Connect 凭据已移除", "App Store Connect credentials removed"));
      } else {
        if (action === "save") {
          const result = await request("settings", "PUT", { issuerId, keyId, privateKey });
          setConfig(result); setIssuerId(result.issuerId); setKeyId(result.keyId); setPrivateKey(""); setFileName(""); setFileVersion(v => v + 1);
        }
        const result = await request("apps", "POST");
        setConfig(result); setApps(result.apps);
        setSelected([]); setImported(false);
        notify(t("连接成功，请选择要导入的产品", "Connected successfully; select products to import"));
        onConnected?.();
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const [managing, setManaging] = useState(false);
  const dirty = issuerId !== config?.issuerId || keyId !== config?.keyId || !!privateKey;
  return <><section style={wizardStep !== undefined && wizardStep !== 1 ? { display: "none" } : undefined} className="panel padded asc-settings">
    <div className="mcp-heading"><h2><Link2 size={22} />{wizardStep !== undefined ? `${connectionStep}. ` : ""}{t("App Store Connect 连接", "App Store Connect Connection")}</h2></div>
    <p className="body-copy">{t("连接 Apple 开发者账号，验证 API 权限并读取 App 列表。", "Connect your Apple Developer account to verify API access and fetch your app list.")}</p>
    <div className="setting-status"><span className={config?.lastCheckedAt ? "online" : "offline"} />{config?.lastCheckedAt ? `${t("最近验证：", "Last verified: ")}${new Date(config.lastCheckedAt).toLocaleString()}` : config?.configured ? t("凭据已保存，尚未验证", "Credentials saved, not yet verified") : t("尚未连接", "Not connected")}</div>
    {wizardStep === undefined && config?.configured && <button className="button secondary" onClick={() => setManaging(v => !v)}>{managing ? t("收起连接管理", "Collapse Connection Management") : t("管理连接与导入", "Manage Connection & Import")}</button>}
    <div hidden={wizardStep === undefined && !!config?.configured && !managing}>
    <p className="fine-print">{t("在 ", "Create a Team API Key in ")}<a href="https://appstoreconnect.apple.com/access/integrations/api" target="_blank" rel="noreferrer">{t("Apple 用户与访问 → 集成", "Users and Access → Integrations")}</a>{t(" 创建团队 API Key，使用具备读取 App 权限的角色。此处暂不支持个人 API Key。", " with App Manager or Admin role. Individual API keys are not supported.")}</p>
    {config && <form onSubmit={e => { e.preventDefault(); void act("save"); }}>
      <fieldset disabled={busy} className="asc-fields">
        <label className="field"><span>Issuer ID</span><input required value={issuerId} onChange={e => setIssuerId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" /></label>
        <label className="field"><span>Key ID</span><input required value={keyId} onChange={e => setKeyId(e.target.value)} placeholder={t("10 位 Key ID", "10-character Key ID")} autoComplete="off" /></label>
        <label className="field"><span>{t(".p8 私钥文件", ".p8 Private Key File")}</span><input key={fileVersion} type="file" aria-label={t(".p8 私钥文件", ".p8 Private Key File")} accept=".p8" onChange={async e => {
          const file = e.target.files?.[0]; setPrivateKey(""); setFileName("");
          if (!file) return;
          if (!file.name.endsWith(".p8") || file.size > 20000) { setError(t("请选择不超过 20 KB 的 .p8 私钥文件", "Please select a .p8 private key file under 20 KB")); e.target.value = ""; return; }
          try { setPrivateKey(await file.text()); setFileName(file.name); setError(""); }
          catch { setError(t("无法读取私钥文件，请重新选择。", "Failed to read private key file, please choose again.")); }
        }} /><small>{fileName || (config.configured ? t("已安全保存；不更换凭据时可留空", "Saved securely; leave empty if not changing") : t("上传从 Apple 下载的 AuthKey_XXXXXXXXXX.p8", "Upload AuthKey_XXXXXXXXXX.p8 downloaded from Apple"))}</small></label>
        <div className="asc-actions"><button className="button primary" type="submit">{busy ? t("正在连接…", "Connecting...") : t("连接并读取 App 列表", "Connect & Fetch App List")}</button><button className="button" type="button" disabled={!config.configured || dirty} onClick={() => void act("test")}>{t("重新读取 App 列表", "Re-fetch App List")}</button><button className="text-button" type="button" disabled={!config.configured} onClick={() => void act("disconnect")}>{t("移除连接", "Remove Connection")}</button></div>
      </fieldset>
    </form>}
    {error && <p role="alert">{error}{!config && <button className="text-button" onClick={() => void load()}>{t("重试", "Retry")}</button>}</p>}
    <p className="fine-print">{t("私钥仅保存在本机，不包含在工作区导出中。连接后选择需要导入的 App，再读取 App 图标、商店版本、多语言 ASO 文案及可用的趋势报告。再次同步保留你完善的资料，不执行商店发布或提交审核。", "Private keys are kept locally and excluded from workspace exports. Re-syncing preserves your edited materials and never executes store submissions automatically.")}</p>
    </div>
    {wizardStep === 1 && <div className="asc-actions">{onBack && <button className="button secondary" disabled={busy} onClick={onBack}>{t("上一步", "Back")}</button>}<button className="button primary" disabled={busy || !apps || dirty} onClick={onConnected}>{t("下一步", "Next")}</button></div>}
  </section>
  <section style={(wizardStep !== undefined && wizardStep !== 2) || (wizardStep === undefined && !!config?.configured && !managing) ? { display: "none" } : undefined} className="panel padded"><h2>{wizardStep !== undefined ? `${connectionStep + 1}. ` : ""}{t("选择导入产品", "Select Apps to Import")}</h2>
    {!apps && <p className="body-copy">{t("请先连接 App Store Connect 并读取 App 列表。", "Please connect App Store Connect and fetch your app list first.")}</p>}
    {apps && <div className="asc-apps"><h3>{t("账号下的 App · ", "Apps Under Account · ")}{apps.length}</h3>{apps.length === 0 ? <p className="body-copy">{t("连接成功，此密钥下暂无可访问的 App。", "Connected successfully, but no accessible apps found for this key.")}</p> : apps.map(app => <div className="asc-app" key={app.id}><label><input type="checkbox" disabled={busy} checked={selected.includes(app.id)} onChange={e => { setImported(false); setSelected(ids => e.target.checked ? [...ids, app.id] : ids.filter(id => id !== app.id)); }} /> {app.name}</label><span>App Store ID：{app.id}</span><span>{app.bundleId}</span></div>)}</div>}
    {apps && apps.length > 0 && <div className="asc-actions"><button className="button primary" disabled={busy || !selected.length} onClick={() => void importSelected()}>{busy ? t("正在导入…", "Importing...") : `${t("导入选中产品", "Import Selected")} (${selected.length})`}</button>{imported && <span role="status">{t("导入完成，可以开始使用工作区。", "Import complete! You can start using your workspace.")}</span>}</div>}
    {wizardStep === 2 && error && <p role="alert">{error}</p>}
    {wizardStep === 2 && onBack && <button className="button secondary" disabled={busy} onClick={onBack}>{t("上一步", "Back")}</button>}
  </section></>;
}
