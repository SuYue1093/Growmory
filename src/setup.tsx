import { useState } from "react";
import type { Data } from "./types";
import { McpSettings } from "./mcp-settings";
import { AppStoreConnect } from "./app-store-connect";
import { useI18n } from "./i18n.ts";

export function Setup({
  notify,
  copy,
  onImported,
}: {
  notify: (message: string) => void;
  copy: (text: string) => Promise<void>;
  onImported: (state: { data: Data; revision: number }) => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const labels = [
    t("外部 Agent MCP 连接", "External Agent MCP Connection"),
    t("App Store Connect 连接", "App Store Connect Connection"),
    t("选择导入产品", "Select & Import Products"),
  ];

  return (
    <div className="setup-layout">
      <section className="panel padded">
        <h2>{t("初始化工作区", "Initialize Workspace")}</h2>
        <p className="body-copy">
          {t("按步骤完成外部 Agent MCP 连接与 App Store Connect 账号绑定，导入产品后即可开始使用。", "Complete external Agent MCP connection and App Store Connect binding step by step, then import your products to get started.")}
        </p>
        <ol className="setup-progress" aria-label={t("初始化步骤", "Setup Steps")}>
          {labels.map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={step === index ? "current" : ""}
            >
              <span>{index + 1}</span>
              <div>{label}</div>
            </li>
          ))}
        </ol>
      </section>

      {step === 0 && (
        <div className="setup-step-block">
          <McpSettings notify={notify} copy={copy} />
          <div className="setup-step-actions">
            <button className="button primary" onClick={() => setStep(1)}>
              {t("下一步：连接 App Store Connect", "Next: Connect App Store Connect")}
            </button>
          </div>
        </div>
      )}

      <AppStoreConnect
        connectionStep={2}
        wizardStep={step}
        onConnected={() => setStep(2)}
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
        notify={notify}
        onImported={onImported}
      />
    </div>
  );
}
