import { fetchJson } from "./http.js";

const DEFAULT_ACTION_HOST = "action.xapi.to";
const DEFAULT_SEARCH_ACTION_ID = "web.search";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_LIMIT = 5;

export function xapiSearchEnabled() {
  return Boolean(readApiKey());
}

export async function requestXapiSearch({ query, limit = DEFAULT_LIMIT }) {
  const apiKey = readApiKey();
  if (!apiKey) {
    return {
      status: "disabled",
      raw: null,
      message: "Set XAPI_KEY or XAPI_API_KEY to enable xAPI external web search."
    };
  }

  const searchUrl = stringEnv("XAPI_SEARCH_URL");
  if (searchUrl) {
    return requestLegacySearchUrl({ apiKey, query, limit, searchUrl });
  }

  return requestActionSearch({ apiKey, query });
}

function readApiKey() {
  return stringEnv("XAPI_KEY") || stringEnv("XAPI_API_KEY");
}

async function requestActionSearch({ apiKey, query }) {
  const baseUrl = actionBaseUrl();
  const url = `${baseUrl}/v1/actions/execute`;
  assertCredentialTarget(url);

  const actionId = stringEnv("XAPI_SEARCH_ACTION_ID") || stringEnv("XAPI_SEARCH_ACTION") || DEFAULT_SEARCH_ACTION_ID;
  const raw = await fetchJson(url, {
    method: "POST",
    retries: 1,
    timeoutMs: Number(process.env.XAPI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "XAPI-Key": apiKey
    },
    body: JSON.stringify({
      action_id: actionId,
      input: { q: query }
    })
  });

  assertXapiSuccess(raw);
  return {
    status: "ok",
    raw,
    provider: "xapi_action",
    actionId,
    url
  };
}

async function requestLegacySearchUrl({ apiKey, query, limit, searchUrl }) {
  assertCredentialTarget(searchUrl);

  const raw = await fetchJson(searchUrl, {
    method: "POST",
    retries: 1,
    timeoutMs: Number(process.env.XAPI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "XAPI-Key": apiKey,
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query, q: query, limit })
  });

  assertXapiSuccess(raw);
  return {
    status: "ok",
    raw,
    provider: "xapi_legacy_search_url",
    url: searchUrl
  };
}

function actionBaseUrl() {
  const host = stringEnv("XAPI_ACTION_HOST") || DEFAULT_ACTION_HOST;
  if (/^https?:\/\//i.test(host)) return host.replace(/\/+$/, "");
  return `${isLocalHost(host) ? "http" : "https"}://${host.replace(/\/+$/, "")}`;
}

function assertCredentialTarget(value) {
  let hostname;
  try {
    hostname = new URL(value).hostname.toLowerCase();
  } catch {
    throw new Error("Invalid xAPI endpoint URL.");
  }

  if (hostname === "xapi.to" || hostname.endsWith(".xapi.to") || isLocalHost(hostname)) return;
  throw new Error(`Refusing to send xAPI credentials to non-xapi host: ${hostname}`);
}

function assertXapiSuccess(raw) {
  if (!raw || typeof raw !== "object" || raw.success !== false) return;
  const detail = raw.data || raw.error || raw.message || {};
  const message = typeof detail === "string"
    ? detail
    : detail.message || detail.error || raw.message || "xAPI request failed.";
  throw new Error(message);
}

function stringEnv(name) {
  return String(process.env[name] || "").trim();
}

function isLocalHost(hostname) {
  return /^localhost(?::\d+)?$/i.test(hostname) ||
    /^127\./.test(hostname) ||
    /^0\.0\.0\.0(?::\d+)?$/.test(hostname) ||
    hostname === "::1" ||
    hostname === "[::1]";
}
