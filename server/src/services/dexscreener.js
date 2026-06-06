import { cached } from "./cache.js";
import { fetchJson } from "./http.js";
import { getChain } from "./chains.js";

const TTL_MS = 10 * 60 * 1000;

export async function fetchDexPairs({ chainId, address }) {
  const chain = getChain(chainId);
  const normalized = address.toLowerCase();
  const key = `dexscreener:${chain.dexscreenerId}:${normalized}`;

  const { value, cache } = await cached(key, TTL_MS, async () => {
    const url = `https://api.dexscreener.com/token-pairs/v1/${chain.dexscreenerId}/${normalized}`;
    return fetchJson(url, { retries: 2 });
  });

  const pairs = Array.isArray(value) ? value : [];
  const chainPairs = pairs
    .filter((pair) => pair.chainId === chain.dexscreenerId)
    .filter((pair) => pair.baseToken?.address?.toLowerCase() === normalized)
    .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0));

  return {
    pairs: chainPairs,
    primaryPair: chainPairs[0] || null,
    raw: value,
    source: {
      name: "DEXScreener",
      cache,
      status: chainPairs.length ? "ok" : "empty"
    }
  };
}

