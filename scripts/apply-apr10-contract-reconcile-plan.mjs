import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    planDir: "",
    baseUrl: "https://induk-crm.cloud",
    loginJson: path.resolve("login.json"),
    outputDir: path.resolve("deliverables", "apr10_contract_apply"),
    apply: false,
  };

  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--plan-dir=")) args.planDir = path.resolve(arg.slice("--plan-dir=".length));
    else if (arg.startsWith("--base-url=")) args.baseUrl = arg.slice("--base-url=".length).replace(/\/+$/, "");
    else if (arg.startsWith("--login-json=")) args.loginJson = path.resolve(arg.slice("--login-json=".length));
    else if (arg.startsWith("--output-dir=")) args.outputDir = path.resolve(arg.slice("--output-dir=".length));
  }

  if (!args.planDir) throw new Error("--plan-dir is required");
  return args;
}

function nowStamp() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function createSession(baseUrl) {
  const cookieJar = new Map();

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

  async function requestJson(method, requestPath, body) {
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

    const response = await fetch(`${baseUrl}${requestPath}`, {
      method,
      headers,
      body: requestBody,
    });

    storeCookies(response);

    const text = await response.text();
    let parsedBody = null;
    if (text) {
      try {
        parsedBody = JSON.parse(text);
      } catch {
        parsedBody = { raw: text };
      }
    }

    return {
      method,
      path: requestPath,
      status: response.status,
      ok: response.ok,
      body: parsedBody,
    };
  }

  return { requestJson };
}

function assertSuccess(result, label) {
  if (result.status >= 200 && result.status < 300) return;
  throw new Error(`${label} failed (${result.status}) ${JSON.stringify(result.body ?? null)}`);
}

function pickContractsByIds(contracts, ids) {
  const targetIds = new Set(ids);
  return contracts.filter((contract) => targetIds.has(String(contract.id)));
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stamp = nowStamp();
  const runDir = path.join(args.outputDir, stamp);
  await fs.mkdir(runDir, { recursive: true });

  const [updates, inserts, deletes, summary, login] = await Promise.all([
    readJson(path.join(args.planDir, "updates.json")),
    readJson(path.join(args.planDir, "inserts.json")),
    readJson(path.join(args.planDir, "deletes.json")),
    readJson(path.join(args.planDir, "summary.json")),
    readJson(args.loginJson),
  ]);

  const { requestJson } = createSession(args.baseUrl);
  const health = await requestJson("GET", "/api/healthz");
  assertSuccess(health, "healthz");
  const ready = await requestJson("GET", "/api/readyz");
  assertSuccess(ready, "readyz");
  const loginResult = await requestJson("POST", "/api/auth/login", {
    loginId: login.loginId,
    password: login.password,
  });
  assertSuccess(loginResult, "login");
  const me = await requestJson("GET", "/api/auth/me");
  assertSuccess(me, "auth/me");

  const beforeContractsResult = await requestJson("GET", "/api/contracts");
  assertSuccess(beforeContractsResult, "fetch contracts before apply");
  const beforeContracts = Array.isArray(beforeContractsResult.body) ? beforeContractsResult.body : [];

  const affectedIds = [
    ...updates.map((row) => row.contractId),
    ...deletes.map((row) => row.contractId),
  ];

  await Promise.all([
    fs.writeFile(path.join(runDir, "plan-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(runDir, "backup-before.json"), `${JSON.stringify({
      fetchedAt: new Date().toISOString(),
      affectedIds,
      affectedContracts: pickContractsByIds(beforeContracts, affectedIds),
      beforeContractCount: beforeContracts.length,
    }, null, 2)}\n`, "utf8"),
  ]);

  const operationResults = [];

  if (args.apply) {
    for (const plan of updates) {
      const result = await requestJson("PUT", `/api/contracts/${plan.contractId}`, plan.payload);
      assertSuccess(result, `update ${plan.contractNumber}`);
      operationResults.push({
        type: "update",
        contractId: plan.contractId,
        contractNumber: plan.contractNumber,
        status: result.status,
      });
    }

    for (const plan of inserts) {
      const result = await requestJson("POST", "/api/contracts", plan.payload);
      assertSuccess(result, `insert ${plan.contractNumber}`);
      operationResults.push({
        type: "insert",
        contractId: result.body?.id ?? null,
        contractNumber: plan.contractNumber,
        status: result.status,
      });
    }

    for (const plan of deletes) {
      const result = await requestJson("DELETE", `/api/contracts/${plan.contractId}`);
      assertSuccess(result, `delete ${plan.contractNumber}`);
      operationResults.push({
        type: "delete",
        contractId: plan.contractId,
        contractNumber: plan.contractNumber,
        status: result.status,
      });
    }
  }

  const afterContractsResult = await requestJson("GET", "/api/contracts");
  assertSuccess(afterContractsResult, "fetch contracts after apply");
  const afterContracts = Array.isArray(afterContractsResult.body) ? afterContractsResult.body : [];

  const expectedAfterCount = args.apply
    ? beforeContracts.length + inserts.length - deletes.length
    : beforeContracts.length;
  const report = {
    apply: args.apply,
    baseUrl: args.baseUrl,
    fetchedAt: new Date().toISOString(),
    beforeContractCount: beforeContracts.length,
    afterContractCount: afterContracts.length,
    expectedAfterCount,
    countDeltaOk: afterContracts.length === expectedAfterCount,
    updates: updates.length,
    inserts: inserts.length,
    deletes: deletes.length,
    operationResults,
    authUser: me.body?.name ?? null,
  };

  await Promise.all([
    fs.writeFile(path.join(runDir, "apply-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(runDir, "contracts-after.json"), `${JSON.stringify(afterContracts, null, 2)}\n`, "utf8"),
  ]);

  console.log(JSON.stringify({ ...report, runDir }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
