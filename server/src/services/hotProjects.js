import { getChain } from "./chains.js";
import { fetchDexPairs } from "./dexscreener.js";
import { fetchJson } from "./http.js";
import { analyzeProject } from "./projectAnalyzer.js";
import { hotProjectsStorageStatus, readHotProjectsDigest, writeHotProjectsDigest } from "./hotProjectsStore.js";

const DEFAULT_CHAIN_ID = "1";
const DEFAULT_DEX = "uniswap";
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 8;
const HOT_SOURCE_LIMIT = 24;
const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2";
const DEXSCREENER_DISCOVERY_URLS = [
  ["DEXScreener latest token profiles", "https://api.dexscreener.com/token-profiles/latest/v1"],
  ["DEXScreener latest token boosts", "https://api.dexscreener.com/token-boosts/latest/v1"],
  ["DEXScreener top token boosts", "https://api.dexscreener.com/token-boosts/top/v1"]
];
const CORE_TOKEN_ADDRESSES = new Set([
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
  "0x6b175474e89094c44da98b954eedeac495271d0f",
  "0x853d955acef822db058eb8505911ed77f175b99e",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
]);
const FALLBACK_HOT_CANDIDATES = [
  {
    tokenAddress: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
    tokenName: "Aave Token",
    tokenSymbol: "AAVE",
    poolName: "AAVE / WETH",
    dexId: "uniswap",
    dexName: "uniswap",
    h24Volume: 1150225,
    h24Txns: 291,
    liquidityUsd: 9556196,
    fdv: 1010755746
  },
  {
    tokenAddress: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    tokenName: "Uniswap",
    tokenSymbol: "UNI",
    poolName: "UNI / WETH",
    dexId: "uniswap",
    dexName: "uniswap",
    h24Volume: 550289,
    h24Txns: 328,
    liquidityUsd: 10372054,
    fdv: 2204691538
  },
  {
    tokenAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
    tokenName: "Pepe",
    tokenSymbol: "PEPE",
    poolName: "PEPE / WETH",
    dexId: "uniswap",
    dexName: "uniswap",
    h24Volume: 1339688,
    h24Txns: 569,
    liquidityUsd: 19150987,
    fdv: 1141393505
  }
];

export async function getHotProjects(input = {}) {
  const filters = normalizeHotProjectFilters(input);
  const digest = await readHotProjectsDigest();

  if (!digest) {
    return emptyDigest(filters, "empty", "No hot project digest has been generated yet.");
  }

  return filterDigest(digest, filters);
}

export async function refreshHotProjects(input = {}) {
  const filters = normalizeHotProjectFilters(input);
  const discovered = await discoverHotProjectCandidates(filters);
  const items = [];

  for (const candidate of discovered.candidates.slice(0, filters.limit)) {
    items.push(await analyzeHotCandidate(candidate));
  }

  if (!items.length) {
    const previous = await readHotProjectsDigest().catch(() => null);
    if (previous?.items?.length) {
      return {
        ...previous,
        filters,
        storage: hotProjectsStorageStatus(),
        sourceStatus: "stale",
        refreshAttemptedAt: new Date().toISOString(),
        refreshSources: discovered.sources
      };
    }
  }

  const usedFallback = discovered.sources.some((source) => source.status === "fallback");
  const digest = {
    generatedAt: new Date().toISOString(),
    sourceStatus: items.length ? (usedFallback ? "fallback" : "ok") : "empty",
    filters,
    storage: hotProjectsStorageStatus(),
    sources: discovered.sources,
    candidateCount: discovered.candidates.length,
    items: items.map((item, index) => ({ ...item, rank: index + 1 }))
  };
  digest.storage = await writeHotProjectsDigest(digest);
  return digest;
}

export function normalizeHotProjectFilters(input = {}) {
  const chain = getChain(input.chainId || DEFAULT_CHAIN_ID) || getChain(DEFAULT_CHAIN_ID);
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(input.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT));
  return {
    chainId: chain.id,
    chainSlug: chain.dexscreenerId,
    dex: String(input.dex || DEFAULT_DEX).trim().toLowerCase() || DEFAULT_DEX,
    limit
  };
}

async function discoverHotProjectCandidates(filters) {
  const [gecko, dexscreener] = await Promise.allSettled([
    fetchGeckoTerminalCandidates(filters),
    fetchDexScreenerCandidates(filters)
  ]);
  const candidates = [
    ...(gecko.status === "fulfilled" ? gecko.value.candidates : []),
    ...(dexscreener.status === "fulfilled" ? dexscreener.value.candidates : [])
  ];
  const sources = [
    ...(gecko.status === "fulfilled" ? gecko.value.sources : [{ name: "GeckoTerminal", status: "error", message: gecko.reason?.message }]),
    ...(dexscreener.status === "fulfilled" ? dexscreener.value.sources : [{ name: "DEXScreener Discovery", status: "error", message: dexscreener.reason?.message }])
  ];
  const deduped = dedupeCandidates(candidates);
  const strictDexCandidates = deduped.filter((candidate) => dexMatches(candidate.dexId, filters.dex) || dexMatches(candidate.dexName, filters.dex));
  const pool = strictDexCandidates.length >= Math.min(5, filters.limit) ? strictDexCandidates : deduped;
  const ranked = rankCandidates(pool)
    .filter((candidate) => candidate.chainId === filters.chainId)
    .filter((candidate) => !isCoreToken(candidate.tokenAddress))
    .slice(0, HOT_SOURCE_LIMIT);
  if (!ranked.length) {
    const fallback = fallbackCandidates(filters);
    return {
      candidates: fallback,
      sources: [
        ...sources,
        {
          name: "Fallback watchlist",
          status: fallback.length ? "fallback" : "empty",
          count: fallback.length,
          message: "Used only when live hot-project APIs returned no usable candidates."
        }
      ]
    };
  }
  const enriched = await enrichCandidatesWithDexScreener(ranked, filters);
  return {
    candidates: rankCandidates(enriched).slice(0, HOT_SOURCE_LIMIT),
    sources
  };
}

async function fetchGeckoTerminalCandidates(filters) {
  const chain = getChain(filters.chainId);
  const network = chain?.slug === "ethereum" ? "eth" : chain?.dexscreenerId;
  const urls = [
    ["GeckoTerminal trending pools", `${GECKO_BASE_URL}/networks/${network}/trending_pools?include=base_token,quote_token,dex`],
    ["GeckoTerminal Uniswap V2 pools", `${GECKO_BASE_URL}/networks/${network}/dexes/uniswap_v2/pools?include=base_token,quote_token,dex&page=1`],
    ["GeckoTerminal Uniswap V3 pools", `${GECKO_BASE_URL}/networks/${network}/dexes/uniswap_v3/pools?include=base_token,quote_token,dex&page=1`],
    ["GeckoTerminal new pools", `${GECKO_BASE_URL}/networks/${network}/new_pools?include=base_token,quote_token,dex&page=1`]
  ];
  const settled = await Promise.allSettled(urls.map(async ([name, url]) => ({
    name,
    url,
    payload: await fetchJson(url, { retries: 1, timeoutMs: 15000 })
  })));
  const candidates = [];
  const sources = [];

  for (const result of settled) {
    if (result.status === "rejected") {
      sources.push({ name: "GeckoTerminal", status: "error", message: result.reason?.message });
      continue;
    }
    const { name, url, payload } = result.value;
    const normalized = normalizeGeckoPools(payload, filters, name);
    candidates.push(...normalized);
    sources.push({
      name,
      status: normalized.length ? "ok" : "empty",
      url,
      count: normalized.length
    });
  }

  return { candidates, sources };
}

async function fetchDexScreenerCandidates(filters) {
  const settled = await Promise.allSettled(DEXSCREENER_DISCOVERY_URLS.map(async ([name, url]) => ({
    name,
    url,
    payload: await fetchJson(url, { retries: 1, timeoutMs: 12000 })
  })));
  const candidates = [];
  const sources = [];

  for (const result of settled) {
    if (result.status === "rejected") {
      sources.push({ name: "DEXScreener Discovery", status: "error", message: result.reason?.message });
      continue;
    }
    const { name, url, payload } = result.value;
    const normalized = normalizeDexScreenerDiscovery(payload, filters, name);
    candidates.push(...normalized);
    sources.push({
      name,
      status: normalized.length ? "ok" : "empty",
      url,
      count: normalized.length
    });
  }

  return { candidates, sources };
}

function normalizeGeckoPools(payload, filters, sourceName) {
  const tokenById = new Map((payload?.included || [])
    .filter((item) => item.type === "token")
    .map((item) => [item.id, item.attributes || {}]));
  const dexById = new Map((payload?.included || [])
    .filter((item) => item.type === "dex")
    .map((item) => [item.id, item.attributes || {}]));
  const pools = Array.isArray(payload?.data) ? payload.data : [];

  return pools
    .map((pool) => geckoPoolCandidate(pool, tokenById, dexById, filters, sourceName))
    .filter(Boolean);
}

function geckoPoolCandidate(pool, tokenById, dexById, filters, sourceName) {
  const dexId = pool.relationships?.dex?.data?.id || "";
  const dexName = dexById.get(dexId)?.name || dexId;
  if (!dexMatches(dexId, filters.dex) && !dexMatches(dexName, filters.dex) && sourceName.includes("Uniswap")) return null;

  const base = tokenById.get(pool.relationships?.base_token?.data?.id) || {};
  const quote = tokenById.get(pool.relationships?.quote_token?.data?.id) || {};
  const token = chooseProjectToken(base, quote);
  if (!isEvmAddress(token.address)) return null;

  const attrs = pool.attributes || {};
  const h24Txns = numberAt(attrs, "transactions.h24.buys") + numberAt(attrs, "transactions.h24.sells");
  const h24Volume = numberAt(attrs, "volume_usd.h24");
  const liquidityUsd = numberAt(attrs, "reserve_in_usd");

  return {
    id: `${filters.chainId}:${token.address.toLowerCase()}`,
    chainId: filters.chainId,
    chainSlug: filters.chainSlug,
    tokenAddress: token.address.toLowerCase(),
    tokenName: token.name || attrs.name || "Unknown token",
    tokenSymbol: token.symbol || null,
    poolAddress: attrs.address || null,
    poolName: attrs.name || null,
    pairUrl: attrs.address ? `https://www.geckoterminal.com/eth/pools/${attrs.address}` : null,
    dexId,
    dexName,
    h24Volume,
    h24Txns,
    liquidityUsd,
    priceChangeH24: numberAt(attrs, "price_change_percentage.h24"),
    poolCreatedAt: attrs.pool_created_at || null,
    heatSources: [sourceName],
    boostScore: 0
  };
}

function normalizeDexScreenerDiscovery(payload, filters, sourceName) {
  const items = Array.isArray(payload) ? payload : [];
  return items
    .filter((item) => item.chainId === filters.chainSlug)
    .filter((item) => isEvmAddress(item.tokenAddress))
    .map((item) => ({
      id: `${filters.chainId}:${item.tokenAddress.toLowerCase()}`,
      chainId: filters.chainId,
      chainSlug: filters.chainSlug,
      tokenAddress: item.tokenAddress.toLowerCase(),
      tokenName: item.description || item.tokenAddress,
      tokenSymbol: null,
      pairUrl: item.url || null,
      dexId: null,
      dexName: null,
      h24Volume: 0,
      h24Txns: 0,
      liquidityUsd: 0,
      priceChangeH24: null,
      poolCreatedAt: null,
      heatSources: [sourceName],
      boostScore: Number(item.totalAmount || item.amount || 0)
    }));
}

function fallbackCandidates(filters) {
  if (!["uniswap", "all"].includes(filters.dex)) return [];
  return FALLBACK_HOT_CANDIDATES.map((candidate, index) => ({
    ...candidate,
    id: `${filters.chainId}:${candidate.tokenAddress.toLowerCase()}`,
    chainId: filters.chainId,
    chainSlug: filters.chainSlug,
    tokenAddress: candidate.tokenAddress.toLowerCase(),
    pairAddress: null,
    pairUrl: null,
    priceChangeH24: null,
    poolCreatedAt: null,
    heatSources: ["Fallback watchlist"],
    heatScore: 120 - index * 10,
    boostScore: 0
  }));
}

async function enrichCandidatesWithDexScreener(candidates, filters) {
  const enriched = [];
  for (const candidate of candidates.slice(0, HOT_SOURCE_LIMIT)) {
    try {
      const dex = await fetchDexPairs({ chainId: filters.chainId, address: candidate.tokenAddress });
      const uniswapPair = dex.pairs.find((pair) => dexMatches(pair.dexId, filters.dex));
      const pair = uniswapPair || dex.primaryPair;
      enriched.push(mergeDexPair(candidate, pair));
    } catch (error) {
      enriched.push({
        ...candidate,
        sourceError: error.message
      });
    }
  }
  return enriched;
}

function mergeDexPair(candidate, pair) {
  if (!pair) return candidate;
  const h24Txns = numberAt(pair, "txns.h24.buys") + numberAt(pair, "txns.h24.sells");
  return {
    ...candidate,
    tokenName: pair.baseToken?.name || candidate.tokenName,
    tokenSymbol: pair.baseToken?.symbol || candidate.tokenSymbol,
    pairUrl: pair.url || candidate.pairUrl,
    poolAddress: pair.pairAddress || candidate.poolAddress,
    poolName: `${pair.baseToken?.symbol || candidate.tokenSymbol || "Token"} / ${pair.quoteToken?.symbol || "Quote"}`,
    dexId: pair.dexId || candidate.dexId,
    dexName: pair.dexId || candidate.dexName,
    h24Volume: Number(pair.volume?.h24 || candidate.h24Volume || 0),
    h24Txns: h24Txns || candidate.h24Txns,
    liquidityUsd: Number(pair.liquidity?.usd || candidate.liquidityUsd || 0),
    priceChangeH24: Number(pair.priceChange?.h24 ?? candidate.priceChangeH24 ?? 0),
    fdv: Number(pair.fdv || 0) || null
  };
}

async function analyzeHotCandidate(candidate) {
  try {
    const report = await analyzeProject({
      chainId: candidate.chainId,
      name: candidate.tokenName || candidate.tokenSymbol || "Unknown project",
      query: `${candidate.tokenName || candidate.tokenSymbol || "Project"} ${candidate.tokenAddress}`,
      address: candidate.tokenAddress,
      addresses: [candidate.tokenAddress]
    });
    return buildHotProjectItem(candidate, report);
  } catch (error) {
    return buildFailedHotProjectItem(candidate, error);
  }
}

function buildHotProjectItem(candidate, report) {
  const skepticReview = report.skepticReview || {};
  const materialFindings = (report.findings || [])
    .filter((finding) => ["critical", "high", "medium"].includes(finding.severity))
    .slice(0, 3);

  return {
    id: candidate.id,
    name: report.project?.name || candidate.tokenName || candidate.tokenSymbol || "Unknown project",
    symbol: candidate.tokenSymbol,
    address: candidate.tokenAddress,
    chain: report.project?.primaryChain || getChain(candidate.chainId),
    dex: {
      id: candidate.dexId,
      name: candidate.dexName
    },
    pair: {
      address: candidate.poolAddress,
      name: candidate.poolName,
      url: candidate.pairUrl
    },
    heat: {
      score: Math.round(candidate.heatScore || scoreCandidate(candidate)),
      sources: candidate.heatSources || [],
      boostScore: candidate.boostScore || 0
    },
    metrics: {
      volumeH24: candidate.h24Volume || 0,
      liquidityUsd: candidate.liquidityUsd || 0,
      txnsH24: candidate.h24Txns || 0,
      priceChangeH24: candidate.priceChangeH24,
      fdv: candidate.fdv || null
    },
    summary: report.summary,
    skepticReview: {
      verdict: skepticReview.verdict,
      headline: skepticReview.headline,
      hypePressure: skepticReview.hypePressure,
      evidenceCoverage: skepticReview.evidenceCoverage,
      nextQuestions: (skepticReview.nextQuestions || []).slice(0, 3),
      agentReview: skepticReview.agentReview
    },
    agentSummaries: (skepticReview.agentReview?.summaries || []).slice(0, 4),
    recommendations: (report.recommendations || []).slice(0, 2),
    primaryFindings: materialFindings,
    localized: report.localized,
    analyzedAt: report.generatedAt
  };
}

function buildFailedHotProjectItem(candidate, error) {
  return {
    id: candidate.id,
    name: candidate.tokenName || candidate.tokenSymbol || "Unknown project",
    symbol: candidate.tokenSymbol,
    address: candidate.tokenAddress,
    chain: getChain(candidate.chainId),
    dex: {
      id: candidate.dexId,
      name: candidate.dexName
    },
    pair: {
      address: candidate.poolAddress,
      name: candidate.poolName,
      url: candidate.pairUrl
    },
    heat: {
      score: Math.round(candidate.heatScore || scoreCandidate(candidate)),
      sources: candidate.heatSources || [],
      boostScore: candidate.boostScore || 0
    },
    metrics: {
      volumeH24: candidate.h24Volume || 0,
      liquidityUsd: candidate.liquidityUsd || 0,
      txnsH24: candidate.h24Txns || 0,
      priceChangeH24: candidate.priceChangeH24,
      fdv: candidate.fdv || null
    },
    summary: {
      level: "incomplete",
      label: "Analysis Failed",
      projectScore: null,
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    },
    skepticReview: {
      verdict: "evidence_incomplete",
      headline: "ChainLens could not complete agent analysis for this hot project.",
      hypePressure: { score: 0, level: "low", signalCount: 0, signals: [], categories: [] },
      evidenceCoverage: { score: 0, level: "thin", strengths: [], gaps: ["agent analysis failed"] },
      nextQuestions: ["Can this project be re-analyzed from an official website or contract address?"],
      agentReview: { status: "error", summaries: [], recommendationCount: 0 }
    },
    agentSummaries: [],
    recommendations: [],
    primaryFindings: [],
    error: error.message,
    analyzedAt: new Date().toISOString()
  };
}

function filterDigest(digest, filters) {
  const items = (digest.items || [])
    .filter((item) => !filters.chainId || String(item.chain?.id || item.chainId || filters.chainId) === filters.chainId)
    .filter((item) => filters.dex === "all" || dexMatches(item.dex?.id, filters.dex) || dexMatches(item.dex?.name, filters.dex))
    .slice(0, filters.limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  return {
    ...digest,
    filters,
    itemCount: items.length,
    items
  };
}

function emptyDigest(filters, sourceStatus, message) {
  return {
    generatedAt: null,
    sourceStatus,
    message,
    filters,
    storage: hotProjectsStorageStatus(),
    sources: [],
    candidateCount: 0,
    itemCount: 0,
    items: []
  };
}

function dedupeCandidates(candidates) {
  const byAddress = new Map();
  for (const candidate of candidates) {
    if (!candidate?.tokenAddress) continue;
    const key = `${candidate.chainId}:${candidate.tokenAddress.toLowerCase()}`;
    const previous = byAddress.get(key);
    if (!previous) {
      byAddress.set(key, candidate);
      continue;
    }
    byAddress.set(key, {
      ...previous,
      ...candidate,
      h24Volume: Math.max(previous.h24Volume || 0, candidate.h24Volume || 0),
      h24Txns: Math.max(previous.h24Txns || 0, candidate.h24Txns || 0),
      liquidityUsd: Math.max(previous.liquidityUsd || 0, candidate.liquidityUsd || 0),
      heatSources: uniqueText([...(previous.heatSources || []), ...(candidate.heatSources || [])]),
      boostScore: Math.max(previous.boostScore || 0, candidate.boostScore || 0)
    });
  }
  return [...byAddress.values()];
}

function rankCandidates(candidates) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      heatScore: scoreCandidate(candidate)
    }))
    .sort((a, b) => b.heatScore - a.heatScore);
}

function scoreCandidate(candidate) {
  return (
    Math.log10((candidate.h24Volume || 0) + 1) * 16 +
    Math.log10((candidate.liquidityUsd || 0) + 1) * 7 +
    Math.log10((candidate.h24Txns || 0) + 1) * 12 +
    Math.min(18, Number(candidate.boostScore || 0) / 25) +
    recencyScore(candidate.poolCreatedAt)
  );
}

function recencyScore(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const ageDays = Math.max(0, (Date.now() - date.getTime()) / 86400000);
  if (ageDays <= 2) return 18;
  if (ageDays <= 7) return 12;
  if (ageDays <= 30) return 6;
  return 0;
}

function chooseProjectToken(base, quote) {
  if (isCoreToken(base.address) && !isCoreToken(quote.address)) return quote;
  return base;
}

function dexMatches(value, wanted) {
  if (!wanted || wanted === "all") return true;
  return String(value || "").toLowerCase().includes(String(wanted).toLowerCase());
}

function isCoreToken(address) {
  return CORE_TOKEN_ADDRESSES.has(String(address || "").toLowerCase());
}

function isEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

function numberAt(object, path) {
  const value = path.split(".").reduce((cursor, key) => cursor?.[key], object);
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function uniqueText(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
