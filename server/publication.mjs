import { randomUUID, createHash } from "node:crypto";
import { AppleConnectionError } from "./app-store-connect.mjs";
const fail = (message, status = 400) => { throw new AppleConnectionError(message, status); };
const editable = new Set(["PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"]);
const distributed = new Set(["READY_FOR_SALE", "READY_FOR_DISTRIBUTION"]);
const stateOf = v => v?.attributes?.appVersionState || v?.attributes?.appStoreState || "";
const relationship = (type, id) => ({ data: { type, id } });
const resource = (type, attributes, relationships, id) => ({ data: { type, ...(id ? { id } : {}), ...(attributes ? { attributes } : {}), ...(relationships ? { relationships } : {}) } });
const digest = value => createHash("sha256").update(value).digest("hex");
const fingerprint = context => JSON.stringify({ productId: context.release.productId, appId: context.appId, version: context.release.version, notes: context.release.notes, languages: context.release.languages, source: context.release.storeSource });
export function openPublication(store, apple) {
  const plans = new Map(), locks = new Set();
  function context(releaseId, platform) {
    const data = store.read().data;
    const release = data.releases.find(r => r.id === releaseId);
    if (!release) fail("本机版本不存在。", 404);
    const product = data.products.find(p => p.id === release.productId);
    const appId = product?.appStore?.appId;
    if (!appId || !/^[0-9]+$/.test(appId)) fail("请先在产品详情中关联 Apple App。");
    const rawPlat = (platform || "").toUpperCase();
    const normPlatform = rawPlat === "MACOS" ? "MAC_OS" : rawPlat;
    if (!["IOS", "MAC_OS", "TV_OS", "VISION_OS"].includes(normPlatform)) fail("请选择发布平台。");
    const platVersion = release.platformDetails?.[platform]?.version || release.platformDetails?.[normPlatform]?.version || release.version;
    if (!/^\d+(?:\.\d+){0,2}$/.test(platVersion)) fail("Apple 版本号须为一至三段数字，例如 2.1.0。");
    if (release.storeSource && release.storeSource.appId !== appId) fail("商店来源与当前关联不一致，请为目标 App 新建本机版本。");
    const platChanges = release.platformDetails?.[platform]?.changes || release.platformDetails?.[normPlatform]?.changes || release.changes;
    const platformStoreSource = release.storeSources?.[normPlatform] || release.storeSources?.[platform] || (release.storeSource?.platform === normPlatform ? release.storeSource : undefined);
    return { release: { ...release, version: platVersion, changes: platChanges, storeSource: platformStoreSource }, appId, platform: normPlatform, appName: product.appStore.name, product };
  }
  async function remote(client, ctx) {
    const all = (await client.paginate(`/v1/apps/${ctx.appId}/appStoreVersions?filter[platform]=${ctx.platform}`)).data;
    const matches = all.filter(v => v.attributes?.versionString === ctx.release.version && (!v.attributes?.platform || v.attributes.platform === ctx.platform));
    if (matches.length > 1) fail("Apple 返回多个相同版本，请在商店核对。", 409);
    const version = matches[0];
    if (!version) return { version: null, state: "", notes: [], build: null, allVersions: all };
    const notes = (await client.paginate(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data;
    const build = (await client.request(`/v1/appStoreVersions/${version.id}/build`))?.data || null;
    return { version, state: stateOf(version), notes, build, allVersions: all };
  }
  async function builds(client, ctx) {
    const query = new URLSearchParams({ "filter[app]": ctx.appId, "filter[preReleaseVersion.version]": ctx.release.version, "filter[preReleaseVersion.platform]": ctx.platform, "filter[processingState]": "VALID", "filter[expired]": "false", include: "preReleaseVersion" });
    const result = await client.paginate(`/v1/builds?${query}`);
    return result.data.filter(b => {
      const pre = result.included.find(p => p.type === "preReleaseVersions" && p.id === b.relationships?.preReleaseVersion?.data?.id);
      return b.attributes?.processingState === "VALID" && b.attributes?.expired === false && pre?.attributes?.platform === ctx.platform && pre.attributes.version === ctx.release.version;
    }).map(b => ({ id: b.id, number: b.attributes.version, uploadedAt: b.attributes.uploadedDate || "" }));
  }
  function notes(ctx, map) {
    if (!map || typeof map !== "object" || Array.isArray(map)) fail("请设置说明语言与 Apple 语言的对应关系。");
    const required = [...new Set(ctx.release.languages)];
    if (!required.length || !required.every(l => ctx.release.notes.filter(n => n.language === l).length === 1)) fail("请为每种所需语言准备一份更新说明。");
    const values = required.map(language => {
      const note = ctx.release.notes.find(n => n.language === language);
      const locale = map[language];
      if (!note.approved) fail(`请先审核 ${language} 更新说明。`);
      if (!note.body.trim() || [...note.body].length > 4000) fail(`${language} 更新说明不能为空，且不能超过 4000 字符。`);
      if (typeof locale !== "string" || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(locale)) fail(`请填写 ${language} 对应的 Apple 语言代码。`);
      return { language, locale, body: note.body };
    });
    if (new Set(values.map(n => n.locale)).size !== values.length) fail("多份更新说明不能映射到同一个 Apple 语言。");
    return values;
  }
  async function submission(client, ctx, versionId) {
    const candidates = (await client.paginate(`/v1/apps/${ctx.appId}/reviewSubmissions`)).data;
    let empty = null;
    for (const candidate of candidates.filter(s => s.attributes?.state === "READY_FOR_REVIEW" && (!s.attributes.platform || s.attributes.platform === ctx.platform))) {
      const items = (await client.paginate(`/v1/reviewSubmissions/${candidate.id}/items?include=appStoreVersion`)).data;
      const matching = items.filter(i => i.relationships?.appStoreVersion?.data?.id === versionId);
      if (matching.length) {
        if (items.length !== 1) fail("此审核批次含其他项目，请在 App Store Connect 核对后提交，避免一并提交其他内容。", 409);
        return { id: candidate.id, itemExists: true };
      }
      if (items.length === 0) empty = { id: candidate.id, itemExists: false };
    }
    return empty;
  }
  function remoteFingerprint(value) { return JSON.stringify({ version: value.version, notes: value.notes, build: value.build }); }
  function observe(ctx, value) {
    if (!distributed.has(value.state)) return;
    const latest = store.read();
    const release = latest.data.releases.find(r => r.id === ctx.release.id);
    if (release && fingerprint(context(release.id, ctx.platform)) === fingerprint(ctx) && release.status !== "published") {
      release.status = "published";
      store.write(latest.data, latest.revision);
    }
  }
  return {
    async status(releaseId, platform) {
      const ctx = context(releaseId, platform), client = apple.session();
      const value = await remote(client, ctx);
      const availableBuilds = editable.has(value.state) || !value.version ? await builds(client, ctx) : [];
      observe(ctx, value);
      const localizations = [];
      if (value.notes?.length) {
        for (const n of value.notes) {
          const loc = n.attributes?.locale;
          if (loc && !localizations.some(l => l.locale === loc)) {
            localizations.push({ locale: loc, whatsNew: n.attributes?.whatsNew || "" });
          }
        }
      }
      if (!localizations.length && value.allVersions?.length) {
        const otherVersions = value.allVersions.filter(v => (!v.attributes?.platform || v.attributes.platform === ctx.platform) && v.id !== value.version?.id);
        for (const otherVersion of otherVersions) {
          try {
            const prevNotes = (await client.paginate(`/v1/appStoreVersions/${otherVersion.id}/appStoreVersionLocalizations`)).data;
            if (prevNotes?.length) {
              for (const n of prevNotes) {
                const loc = n.attributes?.locale;
                if (loc && !localizations.some(l => l.locale === loc)) {
                  localizations.push({ locale: loc, whatsNew: "" });
                }
              }
              if (localizations.length) break;
            }
          } catch { }
        }
      }
      if (!localizations.length && ctx.product?.appStore?.versions?.length) {
        const platformStoreVersions = ctx.product.appStore.versions.filter(v => v.platform === ctx.platform);
        for (const sv of platformStoreVersions) {
          if (sv.notes?.length) {
            for (const n of sv.notes) {
              if (n.locale && !localizations.some(l => l.locale === n.locale)) {
                localizations.push({ locale: n.locale, whatsNew: "" });
              }
            }
            if (localizations.length) break;
          }
        }
      }
      if (!localizations.length) {
        try {
          const infos = (await client.paginate(`/v1/apps/${ctx.appId}/appInfos`)).data;
          for (const info of infos) {
            const infoLocs = (await client.paginate(`/v1/appInfos/${info.id}/appInfoLocalizations`)).data;
            if (infoLocs?.length) {
              for (const il of infoLocs) {
                const loc = il.attributes?.locale;
                if (loc && !localizations.some(l => l.locale === loc)) {
                  localizations.push({ locale: loc, whatsNew: "" });
                }
              }
              if (localizations.length) break;
            }
          }
        } catch { }
      }
      if (!localizations.length) {
        const platNotes = ctx.release.platformDetails?.[ctx.platform]?.notes || ctx.release.platformDetails?.[platform]?.notes;
        if (platNotes?.length) {
          for (const n of platNotes) {
            const loc = (/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(n.language) ? n.language : { "中文": "zh-Hans", "简体中文": "zh-Hans", "繁体中文": "zh-Hant", "英文": "en-US", "英语": "en-US", "日文": "ja", "日语": "ja", "韩文": "ko", "韩语": "ko" }[n.language]) || "zh-Hans";
            if (!localizations.some(l => l.locale === loc)) {
              localizations.push({ locale: loc, whatsNew: n.body || "" });
            }
          }
        } else if (ctx.release.changes) {
          localizations.push({ locale: "zh-Hans", whatsNew: ctx.release.changes });
        } else if (ctx.release.languages?.length) {
          for (const l of ctx.release.languages) {
            const loc = (/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(l) ? l : { "中文": "zh-Hans", "简体中文": "zh-Hans", "繁体中文": "zh-Hant", "英文": "en-US", "英语": "en-US", "日文": "ja", "日语": "ja", "韩文": "ko", "韩语": "ko" }[l]) || "zh-Hans";
            if (!localizations.some(l => l.locale === loc)) {
              localizations.push({ locale: loc, whatsNew: "" });
            }
          }
        } else {
          localizations.push({ locale: "zh-Hans", whatsNew: "" }, { locale: "en-US", whatsNew: "" });
        }
      }
      return { appId: ctx.appId, appName: ctx.appName, platform, version: ctx.release.version, remoteId: value.version?.id || "", state: value.state, releaseType: value.version?.attributes?.releaseType || "", buildId: value.build?.id || "", buildNumber: value.build?.attributes?.version || "", builds: availableBuilds, localizations, checkedAt: new Date().toISOString(), events: store.publicationEvents(releaseId) };
    },
    async preview(releaseId, input) {
      const { platform, action, localeMap, localizedNotes, buildId = "" } = input;
      if (!["sync", "submit", "release"].includes(action)) fail("发布操作无效。");
      const ctx = context(releaseId, platform), client = apple.session();
      const value = await remote(client, ctx);
      if (action !== "sync" && store.publicationEvents(releaseId).some(event => event.outcome === "success" && event.action === action && event.appId === ctx.appId && event.platform === ctx.platform && event.version === ctx.release.version && event.remoteHash === digest(remoteFingerprint(value)))) fail("相同商店状态下的请求已被 Apple 接受，请等待状态变化，不要重复提交。", 409);
      let desired = [];
      if (action !== "release") {
        if (localizedNotes && typeof localizedNotes === "object") {
          const rawEntries = Array.isArray(localizedNotes)
            ? localizedNotes.map(n => ({ locale: n.locale, body: String(n.body || "") }))
            : Object.entries(localizedNotes).map(([locale, body]) => ({ locale, body: String(body || "") }));
          const entries = rawEntries.map(e => ({ locale: e.locale, body: e.body.trim() })).filter(e => e.body.length > 0);
          if (!entries.length) fail("请至少为一个本地化语言填写更新说明。");
          for (const item of entries) {
            if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(item.locale)) fail(`语言代码 ${item.locale} 格式无效。`);
            if (item.body.length > 4000) fail(`${item.locale} 更新说明不能超过 4000 字符。`);
          }
          const latest = store.read();
          const r = latest.data.releases.find(x => x.id === releaseId);
          if (r) {
            r.languages = entries.map(e => e.locale);
            r.notes = entries.map(e => ({ language: e.locale, body: e.body, approved: true }));
            r.platformDetails = r.platformDetails || {};
            r.platformDetails[ctx.platform] = {
              version: ctx.release.version,
              changes: ctx.release.changes,
              notes: r.notes,
            };
            store.write(latest.data, latest.revision);
            ctx.release.languages = r.languages;
            ctx.release.notes = r.notes;
          }
          desired = entries.map(e => ({ language: e.locale, locale: e.locale, body: e.body }));
        } else {
          desired = notes(ctx, localeMap);
        }
      }
      if (action === "release") {
        if (value.state !== "PENDING_DEVELOPER_RELEASE") fail("只有 Apple 状态为等待开发者发布时才能上架。");
      } else {
        if (value.version && !editable.has(value.state)) fail(`当前 Apple 状态 ${value.state} 不支持修改或提交。请先刷新状态。`);
        if (action === "submit") {
          if (!value.version || !value.build) fail("请先写入商店资料并选择构建。");
          if (buildId && buildId !== value.build.id) fail("所选构建尚未写入商店，请先写入商店资料。");
          if (value.version.attributes.releaseType !== "MANUAL") fail("请先写入商店资料，将发布方式设为手动发布。");
          if (!desired.every(n => value.notes.some(old => old.attributes?.locale === n.locale && old.attributes?.whatsNew === n.body))) fail("商店更新说明与已审核草稿不一致，请先写入商店资料。");
          const valid = await builds(client, ctx);
          if (!valid.some(b => b.id === value.build.id)) fail("当前构建已过期、处理中或与平台/版本不匹配，请重新选择构建。");
        }
        if (action === "sync" && buildId) {
          if (typeof buildId !== "string" || !(await builds(client, ctx)).some(b => b.id === buildId)) fail("所选构建与 App、版本或平台不匹配，或已不可用。");
        }
      }
      const review = action === "submit" ? await submission(client, ctx, value.version.id) : null;
      const token = randomUUID();
      for (const [key, plan] of plans) if (plan.expiresAt < Date.now()) plans.delete(key);
      if (plans.size >= 100) fail("待确认预览过多，请稍后重试。", 429);
      plans.set(token, { ctx, input, desired, remote: remoteFingerprint(value), review, local: fingerprint(ctx), expiresAt: Date.now() + 5 * 60000, client });
      return { token, action, appName: ctx.appName, appId: ctx.appId, platform, version: ctx.release.version, remoteId: value.version?.id || "", state: value.state, createsVersion: !value.version, releaseType: value.version?.attributes?.releaseType || "", buildId: buildId || value.build?.id || "", notes: desired.map(n => ({ ...n, before: value.notes.find(old => old.attributes?.locale === n.locale)?.attributes?.whatsNew || "" })), expiresAt: new Date(Date.now() + 5 * 60000).toISOString() };
    },
    async execute(releaseId, token) {
      const plan = plans.get(token);
      if (!plan || plan.ctx.release.id !== releaseId || plan.expiresAt < Date.now()) fail("预览已失效，请重新预览后确认。", 409);
      const key = `${plan.ctx.appId}:${plan.ctx.platform}`;
      if (locks.has(key)) fail("该 App 平台有发布操作正在执行，请稍候。", 409);
      locks.add(key); plans.delete(token);
      const { ctx, client, desired, input } = plan;
      let stage = "复核发布信息";
      const guard = () => {
        client.check();
        if (fingerprint(context(releaseId, ctx.platform)) !== plan.local) fail("本机版本或产品关联已改变，请重新预览。", 409);
      };
      const write = async (path, method, body) => { guard(); store.publicationEvent(releaseId, { action: input.action, appId: ctx.appId, platform: ctx.platform, version: ctx.release.version, outcome: "started", stage }); return client.request(path, method, body); };
      try {
        guard();
        const live = await remote(client, ctx);
        if (remoteFingerprint(live) !== plan.remote) fail("Apple 商店资料已改变，请重新预览。", 409);
        let version = live.version;
        if (input.action === "sync") {
          if (input.buildId && !(await builds(client, ctx)).some(b => b.id === input.buildId)) fail("构建状态已改变，请重新预览。", 409);
          if (!version) {
            stage = "创建商店版本";
            version = (await write("/v1/appStoreVersions", "POST", resource("appStoreVersions", { platform: ctx.platform, versionString: ctx.release.version, releaseType: "MANUAL" }, { app: relationship("apps", ctx.appId) }))).data;
            live.notes = (await client.paginate(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data;
          } else if (version.attributes.releaseType !== "MANUAL") {
            stage = "设置手动发布";
            await write(`/v1/appStoreVersions/${version.id}`, "PATCH", resource("appStoreVersions", { releaseType: "MANUAL" }, null, version.id));
          }
          for (const note of desired) {
            const old = live.notes.find(n => n.attributes?.locale === note.locale);
            if (old?.attributes?.whatsNew === note.body) continue;
            stage = `写入 ${note.locale} 更新说明`;
            const latestNotes = (await client.paginate(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data;
            const latestNote = latestNotes.find(n => n.attributes?.locale === note.locale);
            if (latestNote?.id !== old?.id || latestNote?.attributes?.whatsNew !== old?.attributes?.whatsNew) fail(`${note.locale} 商店说明已被其他入口修改，请重新预览。`, 409);
            if (old) await write(`/v1/appStoreVersionLocalizations/${old.id}`, "PATCH", resource("appStoreVersionLocalizations", { whatsNew: note.body }, null, old.id));
            else await write("/v1/appStoreVersionLocalizations", "POST", resource("appStoreVersionLocalizations", { locale: note.locale, whatsNew: note.body }, { appStoreVersion: relationship("appStoreVersions", version.id) }));
          }
          if (input.buildId && input.buildId !== live.build?.id) {
            stage = "选择构建";
            const latestBuild = (await client.request(`/v1/appStoreVersions/${version.id}/build`))?.data;
            if ((latestBuild?.id || "") !== (live.build?.id || "")) fail("商店构建已被其他入口修改，请重新预览。", 409);
            await write(`/v1/appStoreVersions/${version.id}/relationships/build`, "PATCH", { data: { type: "builds", id: input.buildId } });
          }
        } else if (input.action === "submit") {
          if (!(await builds(client, ctx)).some(b => b.id === live.build?.id)) fail("当前构建已不可用，请重新读取。", 409);
          let review = await submission(client, ctx, version.id);
          if (JSON.stringify(review) !== JSON.stringify(plan.review)) fail("审核批次已改变，请重新预览。", 409);
          if (!review) {
            stage = "创建审核批次";
            const created = (await write("/v1/reviewSubmissions", "POST", resource("reviewSubmissions", { platform: ctx.platform }, { app: relationship("apps", ctx.appId) }))).data;
            review = { id: created.id, itemExists: false };
          }
          if (!review.itemExists) {
            stage = "加入审核版本";
            await write("/v1/reviewSubmissionItems", "POST", resource("reviewSubmissionItems", null, { reviewSubmission: relationship("reviewSubmissions", review.id), appStoreVersion: relationship("appStoreVersions", version.id) }));
          }
          // Recheck the batch immediately before submitting; never submit unrelated items.
          const items = (await client.paginate(`/v1/reviewSubmissions/${review.id}/items?include=appStoreVersion`)).data;
          if (items.length !== 1 || items[0].relationships?.appStoreVersion?.data?.id !== version.id) fail("审核批次内容已改变，请到 Apple 核对。", 409);
          const finalVersion = await remote(client, ctx);
          if (!editable.has(finalVersion.state) || finalVersion.build?.id !== live.build?.id || finalVersion.version?.attributes.releaseType !== "MANUAL" || !desired.every(n => finalVersion.notes.some(old => old.attributes?.locale === n.locale && old.attributes?.whatsNew === n.body))) fail("提交前商店版本、说明或构建已改变，请重新预览。", 409);
          stage = "提交 Apple 审核";
          await write(`/v1/reviewSubmissions/${review.id}`, "PATCH", resource("reviewSubmissions", { submitted: true }, null, review.id));
        } else {
          stage = "请求正式上架";
          await write("/v1/appStoreVersionReleaseRequests", "POST", resource("appStoreVersionReleaseRequests", null, { appStoreVersion: relationship("appStoreVersions", version.id) }));
        }
        if (input.action === "sync") {
          guard();
          const latest = store.read();
          const release = latest.data.releases.find(r => r.id === releaseId);
          release.storeSources = release.storeSources || {};
          release.storeSources[ctx.platform] = { appId: ctx.appId, versionId: version.id, platform: ctx.platform };
          if (!release.storeSource || release.storeSource.platform === ctx.platform) {
            release.storeSource = { appId: ctx.appId, versionId: version.id, platform: ctx.platform };
          }
          if (!store.write(latest.data, latest.revision)) fail("商店资料已写入，但本机来源保存冲突，请重新读取核对。", 409);
        }
        store.publicationEvent(releaseId, { action: input.action, appId: ctx.appId, platform: ctx.platform, version: ctx.release.version, outcome: "success", stage, remoteHash: digest(plan.remote) });
        return { message: { sync: "商店资料已写入，请刷新核对。", submit: "Apple 已接受提交审核请求，请刷新查看审核状态。", release: "Apple 已接受上架请求，实际可下载状态以 Apple 后续处理为准。" }[input.action] };
      } catch (e) {
        store.publicationEvent(releaseId, { action: input.action, appId: ctx.appId, platform: ctx.platform, version: ctx.release.version, outcome: "failed", stage, message: e.message });
        if (e instanceof AppleConnectionError) throw new AppleConnectionError(`${stage}：${e.message} 已完成的商店修改不会自动撤销，请重新读取和预览后继续。`, e.status);
        throw e;
      } finally { locks.delete(key); }
    },
    async createVersion(releaseId, input) {
      const { platform, version: customVersion } = input || {};
      const ctx = context(releaseId, platform);
      const client = apple.session();
      const targetVersion = (customVersion || ctx.release.version || "").trim();
      if (!/^\d+(?:\.\d+){0,2}$/.test(targetVersion)) fail("Apple 版本号须为一至三段数字，例如 2.1.0。");

      let stage = "查询现有商店版本";
      try {
        const all = (await client.paginate(`/v1/apps/${ctx.appId}/appStoreVersions?filter[platform]=${ctx.platform}`)).data;
        const existing = all.find(v => v.attributes?.versionString === targetVersion && (!v.attributes?.platform || v.attributes.platform === ctx.platform));

        let versionObj = existing;
        let alreadyExists = false;

        if (existing) {
          alreadyExists = true;
        } else {
          stage = "创建商店版本";
          const res = await client.request(
            "/v1/appStoreVersions",
            "POST",
            resource(
              "appStoreVersions",
              { platform: ctx.platform, versionString: targetVersion, releaseType: "MANUAL" },
              { app: relationship("apps", ctx.appId) }
            )
          );
          versionObj = res.data;
        }

        // 更新 store 中的版本记录
        const latest = store.read();
        const release = latest.data.releases.find(r => r.id === releaseId);
        if (release) {
          release.storeSources = release.storeSources || {};
          release.storeSources[ctx.platform] = {
            appId: ctx.appId,
            versionId: versionObj.id,
            platform: ctx.platform,
            version: targetVersion,
          };
          if (!release.storeSource || release.storeSource.platform === ctx.platform) {
            release.storeSource = release.storeSources[ctx.platform];
          }
        }

        const product = latest.data.products.find(p => p.id === (release?.productId || ctx.product?.id));
        if (product && product.appStore) {
          product.appStore.versions = product.appStore.versions || [];
          const existingStoreVer = product.appStore.versions.find(
            v => v.id === versionObj.id || (v.version === targetVersion && v.platform === ctx.platform)
          );
          if (existingStoreVer) {
            existingStoreVer.id = versionObj.id;
            existingStoreVer.version = targetVersion;
            existingStoreVer.platform = ctx.platform;
          } else {
            product.appStore.versions.push({
              id: versionObj.id,
              version: targetVersion,
              platform: ctx.platform,
              state: versionObj.attributes?.appVersionState || versionObj.attributes?.appStoreState || "PREPARE_FOR_SUBMISSION",
              notes: [],
            });
          }
        }

        store.write(latest.data, latest.revision);

        store.publicationEvent(releaseId, {
          action: "create_version",
          appId: ctx.appId,
          platform: ctx.platform,
          version: targetVersion,
          outcome: "success",
          stage,
          message: alreadyExists ? "版本在 App Store Connect 上已存在，已直接关联" : "已在 App Store Connect 成功创建版本",
        });

        return {
          success: true,
          created: !alreadyExists,
          alreadyExists,
          versionId: versionObj.id,
          version: targetVersion,
          platform: ctx.platform,
          message: alreadyExists ? "该版本在 App Store Connect 上已存在" : "已在 App Store Connect 成功创建版本",
        };
      } catch (e) {
        store.publicationEvent(releaseId, {
          action: "create_version",
          appId: ctx.appId,
          platform: ctx.platform,
          version: targetVersion,
          outcome: "failed",
          stage,
          message: e.message,
        });
        if (e instanceof AppleConnectionError) {
          throw new AppleConnectionError(`${stage}：${e.message}`, e.status);
        }
        throw e;
      }
    },
  };
}
