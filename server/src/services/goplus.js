import { cached } from "./cache.js";
import { enqueueRequest, fetchJson } from "./http.js";

const TTL_MS = 10 * 60 * 1000;

export async function fetchGoPlusTokenSecurity({ chainId, address }) {
  const normalized = address.toLowerCase();
  const key = `goplus:${chainId}:${normalized}`;

  const { value, cache } = await cached(key, TTL_MS, async () => {
    const url = new URL(`https://api.gopluslabs.io/api/v1/token_security/${chainId}`);
    url.searchParams.set("contract_addresses", normalized);
    return enqueueRequest(() => fetchJson(url, { retries: 2 }));
  });

  const token = value?.result?.[normalized] || null;
  return {
    token,
    raw: value,
    source: {
      name: "GoPlus Token Security",
      cache,
      status: token ? "ok" : "empty"
    }
  };
}

