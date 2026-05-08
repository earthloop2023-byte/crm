const baseUrl = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:5001").replace(/\/+$/, "");
const loginId = process.env.SMOKE_LOGIN_ID || "admin";
const password = process.env.SMOKE_LOGIN_PASSWORD || "aa12345";

const cookieJar = new Map();

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function storeCookies(response) {
  const setCookieValues = getSetCookieHeaders(response.headers);
  for (const value of setCookieValues) {
    const cookiePart = String(value).split(";")[0];
    const separatorIndex = cookiePart.indexOf("=");
    if (separatorIndex <= 0) continue;
    const name = cookiePart.slice(0, separatorIndex).trim();
    const cookieValue = cookiePart.slice(separatorIndex + 1).trim();
    if (!name) continue;
    cookieJar.set(name, cookieValue);
  }
}

function buildCookieHeader() {
  if (cookieJar.size === 0) return "";
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function requestJson(method, path, body) {
  const headers = {
    Accept: "application/json",
  };
  const cookieHeader = buildCookieHeader();
  if (cookieHeader) headers.Cookie = cookieHeader;

  let requestBody;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: requestBody,
  });

  storeCookies(response);

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  return {
    path,
    method,
    status: response.status,
    ok: response.ok,
    body: json,
  };
}

function isSuccess(status) {
  return status >= 200 && status < 300;
}

const failures = [];
const endpointStatuses = [];

const health = await requestJson("GET", "/api/healthz");
if (!isSuccess(health.status)) failures.push(`healthz failed (${health.status})`);

const ready = await requestJson("GET", "/api/readyz");
if (!isSuccess(ready.status)) failures.push(`readyz failed (${ready.status})`);

const login = await requestJson("POST", "/api/auth/login", { loginId, password });
if (!isSuccess(login.status)) failures.push(`login failed (${login.status})`);

const me = await requestJson("GET", "/api/auth/me");
if (!isSuccess(me.status)) failures.push(`auth/me failed (${me.status})`);

const coreEndpoints = [
  "/api/users",
  "/api/customers",
  "/api/contacts",
  "/api/deals",
  "/api/activities",
  "/api/payments",
  "/api/products",
  "/api/contracts",
  "/api/refunds",
  "/api/keeps",
  "/api/deposits",
  "/api/notices",
  "/api/system-settings",
  "/api/stats",
  "/api/sales/analytics",
];

for (const endpoint of coreEndpoints) {
  const result = await requestJson("GET", endpoint);
  endpointStatuses.push({ endpoint, status: result.status });
  if (!isSuccess(result.status)) {
    failures.push(`endpoint failed: ${endpoint} (${result.status})`);
  }
}

const backupStatus = await requestJson("GET", "/api/backups/status");
if (backupStatus.status !== 200 && backupStatus.status !== 403) {
  failures.push(`/api/backups/status unexpected status (${backupStatus.status})`);
}

const summary = {
  timestamp: new Date().toISOString(),
  baseUrl,
  loginId,
  health: { status: health.status, ok: health.body?.ok ?? null },
  ready: { status: ready.status, ok: ready.body?.ok ?? null },
  loginStatus: login.status,
  authMeStatus: me.status,
  endpointStatuses,
  backupStatus: backupStatus.status,
  failures,
};

console.log(JSON.stringify(summary, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
