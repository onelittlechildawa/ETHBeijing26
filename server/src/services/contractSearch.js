import { cached } from "./cache.js";
import { getChain } from "./chains.js";
import { fetchJson } from "./http.js";

const TTL_MS = 30 * 60 * 1000;

export async function fetchContractProfiles(targets) {
  return Promise.all(targets.map(fetchCombinedContractProfile));
}

async function fetchCombinedContractProfile(target) {
  const [coinGeckoResult, sourcifyResult] = await Promise.allSettled([
    fetchCoinGeckoContractProfile(target),
    fetchSourcifyContractProfile(target)
  ]);

  const coinGecko = unwrapResult(coinGeckoResult, target, "CoinGecko Contract Search");
  const sourcify = unwrapResult(sourcifyResult, target, "Sourcify Contract Metadata");
  const profile = mergeProfiles(coinGecko.profile, sourcify.profile);

  return {
    address: target.address,
    chainId: target.chainId,
    profile,
    source: [coinGecko, sourcify].find((result) => result.profile)?.source || coinGecko.source,
    sources: [coinGecko.source, sourcify.source]
  };
}

async function fetchCoinGeckoContractProfile({ chainId, address }) {
  const chain = getChain(chainId);
  const normalized = String(address || "").toLowerCase();
  const platformId = chain?.coingeckoPlatformId;

  if (!platformId) {
    return emptyResult({ chainId, address: normalized, status: "empty", message: "No CoinGecko platform mapping for this chain" });
  }

  const key = `coingecko-contract:${platformId}:${normalized}`;
  const { value, cache } = await cached(key, TTL_MS, async () => {
    const url = `https://api.coingecko.com/api/v3/coins/${platformId}/contract/${normalized}`;
    return fetchJson(url, { retries: 1, timeoutMs: 15000 });
  });

  const profile = normalizeCoinGeckoProfile(value, { chainId, address: normalized });
  return {
    address: normalized,
    chainId,
    profile,
    source: {
      name: "CoinGecko Contract Search",
      status: profile ? "ok" : "empty",
      cache
    }
  };
}

async function fetchSourcifyContractProfile({ chainId, address }) {
  const normalized = String(address || "").toLowerCase();
  const key = `sourcify-contract:${chainId}:${normalized}`;
  const { value, cache } = await cached(key, TTL_MS, async () => {
    const fields = "compilation,deployment,proxyResolution,abi";
    const url = `https://sourcify.dev/server/v2/contract/${chainId}/${normalized}?fields=${fields}`;
    return fetchJson(url, { retries: 1, timeoutMs: 15000 });
  });

  const profile = normalizeSourcifyProfile(value, { chainId, address: normalized });
  return {
    address: normalized,
    chainId,
    profile,
    source: {
      name: "Sourcify Contract Metadata",
      status: profile ? "ok" : "empty",
      cache
    }
  };
}

function emptyResult({ chainId, address, status, message }) {
  return {
    address,
    chainId,
    profile: null,
    source: {
      name: "CoinGecko Contract Search",
      status,
      message
    }
  };
}

function normalizeCoinGeckoProfile(raw, target) {
  if (!raw || typeof raw !== "object") return null;
  const homepage = firstNonEmpty(raw.links?.homepage);
  const github = compact(raw.links?.repos_url?.github);
  const blockchainSites = compact(raw.links?.blockchain_site).slice(0, 4);
  const socials = [
    raw.links?.twitter_screen_name ? { type: "x", url: `https://x.com/${raw.links.twitter_screen_name}` } : null,
    raw.links?.telegram_channel_identifier ? { type: "telegram", url: `https://t.me/${raw.links.telegram_channel_identifier}` } : null,
    raw.links?.subreddit_url ? { type: "reddit", url: raw.links.subreddit_url } : null,
    ...compact(raw.links?.chat_url).map((url) => ({ type: "chat", url }))
  ].filter(Boolean);

  return {
    address: target.address,
    chainId: target.chainId,
    name: raw.name || null,
    symbol: raw.symbol || null,
    assetPlatformId: raw.asset_platform_id || null,
    homepage,
    websites: homepage ? [{ label: "Homepage", url: homepage }] : [],
    repos: github.map((url) => ({ label: "GitHub", url })),
    socials,
    blockchainSites: blockchainSites.map((url) => ({ label: "Explorer", url })),
    marketCapRank: raw.market_cap_rank ?? null,
    coingeckoId: raw.id || null
  };
}

function normalizeSourcifyProfile(raw, target) {
  if (!raw || typeof raw !== "object" || !raw.match) return null;
  const compilation = raw.compilation || {};
  const abiSummary = summarizeAbi(raw.abi);

  return {
    address: target.address,
    chainId: target.chainId,
    name: compilation.name || null,
    contractName: compilation.name || null,
    fullyQualifiedName: compilation.fullyQualifiedName || null,
    verifiedContract: {
      match: raw.match,
      runtimeMatch: raw.runtimeMatch || null,
      creationMatch: raw.creationMatch || null,
      verifiedAt: raw.verifiedAt || null,
      language: compilation.language || null,
      compiler: compilation.compiler || null,
      compilerVersion: compilation.compilerVersion || null,
      fullyQualifiedName: compilation.fullyQualifiedName || null,
      deployment: raw.deployment || null,
      proxyResolution: raw.proxyResolution || null,
      abiSummary
    }
  };
}

function mergeProfiles(...profiles) {
  const available = profiles.filter(Boolean);
  if (!available.length) return null;
  return available.reduce((merged, profile) => ({
    ...merged,
    ...profile,
    websites: mergeSurfaceLists(merged.websites, profile.websites),
    repos: mergeSurfaceLists(merged.repos, profile.repos),
    socials: mergeSurfaceLists(merged.socials, profile.socials),
    blockchainSites: mergeSurfaceLists(merged.blockchainSites, profile.blockchainSites),
    verifiedContract: profile.verifiedContract || merged.verifiedContract
  }), {});
}

function mergeSurfaceLists(left = [], right = []) {
  const seen = new Set();
  return [...left, ...right].filter((surface) => {
    const url = String(surface?.url || "").trim();
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function unwrapResult(result, target, name) {
  if (result.status === "fulfilled") return result.value;
  const message = result.reason?.message || "Contract lookup failed";
  return {
    address: target.address,
    chainId: target.chainId,
    profile: null,
    source: {
      name,
      status: message.includes("HTTP 404") ? "empty" : "error",
      message
    }
  };
}

function summarizeAbi(abi) {
  if (!Array.isArray(abi)) return null;
  const functions = abi.filter((item) => item.type === "function").map((item) => item.name).filter(Boolean);
  const events = abi.filter((item) => item.type === "event").map((item) => item.name).filter(Boolean);
  const names = new Set([...functions, ...events].map((name) => name.toLowerCase()));
  return {
    functionCount: functions.length,
    eventCount: events.length,
    functions: functions.slice(0, 18),
    events: events.slice(0, 18),
    erc20Like: ["balanceof", "transfer", "approve", "allowance"].every((name) => names.has(name)),
    role: inferContractRole(functions, events)
  };
}

function inferContractRole(functions, events) {
  const names = new Set([...functions, ...events].map((name) => name.toLowerCase()));
  if (names.has("fulfillorder") || names.has("fulfilladvancedorder") || names.has("orderfulfilled")) return "marketplace";
  if (names.has("swap") || names.has("exactinput") || names.has("exactoutput")) return "router";
  if (names.has("deposit") && names.has("withdraw")) return "vault";
  if (names.has("propose") || names.has("execute") || names.has("queue")) return "governance";
  if (names.has("latestanswer") || names.has("latestrounddata")) return "oracle";
  return "contract";
}

function compact(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function firstNonEmpty(values) {
  return compact(values)[0] || null;
}
