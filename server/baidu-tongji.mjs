// Baidu Tongji OpenAPI Client
// Reference: https://tongji.baidu.com/api/manual/Chapter2/openapi.html

const DEFAULT_API_KEY = "2g2Oi1id8EBz4fVa7TlOXqOK5Dgmo89w";
const DEFAULT_SECRET_KEY = "rRoHt1EkIcozRAFeHFOf6YFAJgKemB3p";
const OAUTH_AUTHORIZE_URL = "http://openapi.baidu.com/oauth/2.0/authorize";
const OAUTH_TOKEN_URL = "http://openapi.baidu.com/oauth/2.0/token";
const REST_BASE_URL = "https://openapi.baidu.com/rest/2.0/tongji";

export function getAuthorizeUrl(apiKey = DEFAULT_API_KEY) {
  const clientId = (apiKey || DEFAULT_API_KEY).trim();
  return `${OAUTH_AUTHORIZE_URL}?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=oob&scope=basic&display=popup`;
}

export async function exchangeCodeForToken({ code, apiKey = DEFAULT_API_KEY, secretKey = DEFAULT_SECRET_KEY }) {
  if (!code || typeof code !== "string" || !code.trim()) {
    throw new Error("请提供有效的授权码 (Code)");
  }
  const cleanCode = code.trim();
  const clientId = (apiKey || DEFAULT_API_KEY).trim();
  const clientSecret = (secretKey || DEFAULT_SECRET_KEY).trim();

  const url = `${OAUTH_TOKEN_URL}?grant_type=authorization_code&code=${encodeURIComponent(cleanCode)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&redirect_uri=oob`;
  
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(10000)
  });

  const data = await response.json().catch(() => null);
  if (!data) {
    throw new Error(`请求百度 Token 失败: HTTP ${response.status}`);
  }

  if (data.error) {
    const desc = data.error_description || data.error;
    if (data.error === "invalid_grant") {
      throw new Error(`授权码无效或已过期 (${desc})，请重新打开授权链接获取最新的 Code`);
    }
    if (data.error === "invalid_client") {
      throw new Error(`API Key 或 Secret Key 错误 (${desc})`);
    }
    throw new Error(`百度授权失败: ${desc}`);
  }

  if (!data.access_token) {
    throw new Error("百度未返回 access_token，授权失败");
  }

  const expiresIn = Number(data.expires_in) || 2592000; // 默认 30 天
  const expiresAt = Date.now() + expiresIn * 1000;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresIn,
    expiresAt,
    sessionSecret: data.session_secret || "",
    sessionKey: data.session_key || "",
    scope: data.scope || "basic"
  };
}

export async function refreshAccessToken({ refreshToken, apiKey = DEFAULT_API_KEY, secretKey = DEFAULT_SECRET_KEY }) {
  if (!refreshToken || typeof refreshToken !== "string" || !refreshToken.trim()) {
    throw new Error("未提供 refresh_token，无法自动刷新");
  }
  const cleanRefresh = refreshToken.trim();
  const clientId = (apiKey || DEFAULT_API_KEY).trim();
  const clientSecret = (secretKey || DEFAULT_SECRET_KEY).trim();

  const url = `${OAUTH_TOKEN_URL}?grant_type=refresh_token&refresh_token=${encodeURIComponent(cleanRefresh)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;

  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(10000)
  });

  const data = await response.json().catch(() => null);
  if (!data || data.error || !data.access_token) {
    const desc = data?.error_description || data?.error || `HTTP ${response.status}`;
    throw new Error(`刷新 Token 失败: ${desc}`);
  }

  const expiresIn = Number(data.expires_in) || 2592000;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || cleanRefresh,
    expiresIn,
    expiresAt: Date.now() + expiresIn * 1000,
    sessionSecret: data.session_secret || "",
    sessionKey: data.session_key || ""
  };
}

export async function getSiteList(accessToken) {
  if (!accessToken) throw new Error("缺少 access_token");
  const url = `${REST_BASE_URL}/config/getSiteList?access_token=${encodeURIComponent(accessToken.trim())}`;
  
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(10000)
  });

  const data = await response.json().catch(() => null);
  if (!data) throw new Error(`获取站点列表失败: HTTP ${response.status}`);
  if (data.error_code || data.error_message) {
    throw new Error(`百度 API 报错 [${data.error_code}]: ${data.error_message || data.error_msg}`);
  }

  // data.list is array of { site_id, domain, status, create_time, sub_dir_list }
  return Array.isArray(data.list) ? data.list : [];
}

export async function getReportData({
  accessToken,
  siteId,
  method = "overview/getTimeTrendRpt",
  startDate,
  endDate,
  metrics,
  maxResults = 20
}) {
  if (!accessToken) throw new Error("缺少 access_token");
  if (!siteId) throw new Error("缺少 site_id");
  if (!startDate || !endDate) throw new Error("缺少查询起止日期");

  const params = new URLSearchParams({
    access_token: accessToken.trim(),
    site_id: String(siteId).trim(),
    method,
    start_date: startDate.replace(/-/g, ""),
    end_date: endDate.replace(/-/g, ""),
    metrics: metrics || "pv_count,visitor_count,ip_count,bounce_ratio,avg_visit_time"
  });

  if (maxResults !== undefined) {
    params.set("max_results", String(maxResults));
  }

  const url = `${REST_BASE_URL}/report/getData?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(12000)
  });

  const data = await response.json().catch(() => null);
  if (!data) throw new Error(`获取报表失败: HTTP ${response.status}`);
  if (data.error_code || data.error_message) {
    throw new Error(`百度报表接口报错 [${data.error_code}]: ${data.error_message || data.error_msg}`);
  }

  // Expected result in data.result or data.body.data[0].result
  const result = data.result || data.body?.data?.[0]?.result || null;
  return result;
}

function formatDurationSeconds(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function parseOverviewReport(reportResult) {
  if (!reportResult) return null;
  const fields = reportResult.fields || [];
  const metricFieldNames = fields.filter(f => f !== "simple_date_title" && f !== "timeSpan" && f !== "time" && f !== "visit_page_title");

  // 1. If sum is provided
  if (reportResult.sum && Array.isArray(reportResult.sum[0]) && reportResult.sum[0].length > 0) {
    const sumRow = reportResult.sum[0];
    const getVal = (name) => {
      let idx = sumRow.length === fields.length ? fields.indexOf(name) : metricFieldNames.indexOf(name);
      if (idx === -1) return null;
      const v = sumRow[idx];
      return v === undefined || v === null || v === "--" ? null : v;
    };
    const pv = Number(getVal("pv_count")) || 0;
    const uv = Number(getVal("visitor_count")) || 0;
    const ip = Number(getVal("ip_count")) || 0;
    const bounceVal = getVal("bounce_ratio");
    const bounceRate = bounceVal !== null ? `${Number(bounceVal).toFixed(2)}%` : "0.00%";
    const avgTimeVal = getVal("avg_visit_time");
    const avgDuration = avgTimeVal !== null ? formatDurationSeconds(avgTimeVal) : "00:00:00";
    return { pv, uv, ip, bounceRate, avgDuration };
  }

  // 2. Otherwise aggregate from items[1]
  const rows = reportResult.items?.[1] || [];
  if (rows.length === 0) {
    return { pv: 0, uv: 0, ip: 0, bounceRate: "0.00%", avgDuration: "00:00:00" };
  }

  const sampleRow = rows.find(r => Array.isArray(r) && r.length > 0) || [];
  const getColIdx = (name) => {
    if (sampleRow.length === fields.length) return fields.indexOf(name);
    return metricFieldNames.indexOf(name);
  };

  const pvIdx = getColIdx("pv_count");
  const uvIdx = getColIdx("visitor_count");
  const ipIdx = getColIdx("ip_count");
  const bounceIdx = getColIdx("bounce_ratio");
  const timeIdx = getColIdx("avg_visit_time");

  let totalPv = 0;
  let totalUv = 0;
  let totalIp = 0;
  let weightedBounce = 0;
  let weightedTime = 0;
  let bounceWeight = 0;
  let timeWeight = 0;

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const rowPv = pvIdx !== -1 && row[pvIdx] !== "--" ? Number(row[pvIdx]) || 0 : 0;
    const rowUv = uvIdx !== -1 && row[uvIdx] !== "--" ? Number(row[uvIdx]) || 0 : 0;
    const rowIp = ipIdx !== -1 && row[ipIdx] !== "--" ? Number(row[ipIdx]) || 0 : 0;
    const rowBounce = bounceIdx !== -1 && row[bounceIdx] !== "--" ? Number(row[bounceIdx]) : null;
    const rowTime = timeIdx !== -1 && row[timeIdx] !== "--" ? Number(row[timeIdx]) : null;

    totalPv += rowPv;
    totalUv += rowUv;
    totalIp += rowIp;

    if (rowBounce !== null && !isNaN(rowBounce)) {
      const w = rowPv || 1;
      weightedBounce += rowBounce * w;
      bounceWeight += w;
    }

    if (rowTime !== null && !isNaN(rowTime)) {
      const w = rowPv || 1;
      weightedTime += rowTime * w;
      timeWeight += w;
    }
  }

  return {
    pv: totalPv,
    uv: totalUv,
    ip: totalIp,
    bounceRate: bounceWeight > 0 ? (weightedBounce / bounceWeight).toFixed(2) + "%" : "0.00%",
    avgDuration: timeWeight > 0 ? formatDurationSeconds(weightedTime / timeWeight) : "00:00:00"
  };
}

export function parseTopPagesReport(reportResult) {
  if (!reportResult) return {};
  const fields = reportResult.fields || [];
  const items = reportResult.items || [];
  const pagesList = items[0] || [];
  const metricsList = items[1] || [];
  const metricFieldNames = fields.filter(f => f !== "visit_page_title" && f !== "timeSpan" && f !== "time");

  const pageMetrics = {};

  for (let i = 0; i < pagesList.length; i++) {
    const pageItem = pagesList[i];
    const metricsRow = metricsList[i] || [];
    let urlStr = "";
    if (typeof pageItem === "string") {
      urlStr = pageItem;
    } else if (Array.isArray(pageItem) && pageItem[0]) {
      urlStr = typeof pageItem[0] === "string" ? pageItem[0] : (pageItem[0].name || pageItem[0].url || "");
    } else if (pageItem && typeof pageItem === "object") {
      urlStr = pageItem.name || pageItem.url || "";
    }
    if (!urlStr) continue;

    // Extract slug from URL pattern: /journal/<slug>/ or /journal/<slug>
    const match = urlStr.match(/\/journal\/([a-zA-Z0-9_-]+)/);
    if (match) {
      const slug = match[1];
      let pv = 0;
      let uv = 0;

      if (metricsRow.length === fields.length) {
        const pvIdx = fields.indexOf("pv_count");
        const uvIdx = fields.indexOf("visitor_count");
        pv = pvIdx !== -1 && metricsRow[pvIdx] !== "--" ? Number(metricsRow[pvIdx]) || 0 : 0;
        uv = uvIdx !== -1 && metricsRow[uvIdx] !== "--" ? Number(metricsRow[uvIdx]) || 0 : 0;
      } else {
        const pvIdx = metricFieldNames.indexOf("pv_count");
        const uvIdx = metricFieldNames.indexOf("visitor_count");
        pv = pvIdx !== -1 && metricsRow[pvIdx] !== "--" ? Number(metricsRow[pvIdx]) || 0 : 0;
        uv = uvIdx !== -1 && metricsRow[uvIdx] !== "--" ? Number(metricsRow[uvIdx]) || 0 : 0;
      }

      pageMetrics[slug] = { pv, uv };
    }
  }

  return pageMetrics;
}
