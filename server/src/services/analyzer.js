import { getChain } from "./chains.js";
import { fetchGoPlusTokenSecurity } from "./goplus.js";
import { fetchDexPairs } from "./dexscreener.js";
import { buildRiskReport } from "./scoring.js";
import { getTokenFixture } from "../fixtures/tokens.js";

export async function analyzeToken({ chainId, address }) {
  const chain = getChain(chainId);
  const normalizedAddress = address.toLowerCase();
  const fixture = getTokenFixture({ chainId, address: normalizedAddress });

  if (fixture?.mode === "fixture-only") {
    return buildRiskReport({
      chain,
      address: normalizedAddress,
      goPlusToken: fixture.token,
      dexPair: fixture.pair,
      sourceMeta: [
        { name: "GoPlus Token Security", status: "fixture", cache: "local" },
        { name: "DEXScreener", status: "fixture", cache: "local" }
      ]
    });
  }

  const [goPlusResult, dexResult] = await Promise.allSettled([
    fetchGoPlusTokenSecurity({ chainId, address: normalizedAddress }),
    fetchDexPairs({ chainId, address: normalizedAddress })
  ]);

  const goPlus = unwrap(goPlusResult, "GoPlus Token Security");
  const dex = unwrap(dexResult, "DEXScreener");
  const goPlusToken = goPlus.value?.token || fixture?.token || null;
  const dexPair = dex.value?.primaryPair || fixture?.pair || null;

  return buildRiskReport({
    chain,
    address: normalizedAddress,
    goPlusToken,
    dexPair,
    sourceMeta: [
      normalizeSource(goPlus.value?.source || goPlus.source, fixture?.token),
      normalizeSource(dex.value?.source || dex.source, fixture?.pair)
    ]
  });
}

function unwrap(result, name) {
  if (result.status === "fulfilled") {
    return { value: result.value };
  }
  return {
    value: null,
    source: {
      name,
      status: "error",
      message: result.reason?.message || "Request failed"
    }
  };
}

function normalizeSource(source, usedFixture) {
  if (!usedFixture) return source;
  if (source?.status === "ok") return source;
  return {
    ...source,
    status: "fixture",
    cache: "local",
    message: source?.message
  };
}
