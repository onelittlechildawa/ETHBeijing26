const args = parseArgs(process.argv.slice(2));

if (args.noAi) {
  process.env.OPENAI_API_KEY = "";
  process.env.OPENAI_WEB_SEARCH_ENABLED = "0";
}

await import("../src/services/env.js");
const { refreshHotProjects } = await import("../src/services/hotProjects.js");

const digest = await refreshHotProjects({
  chainId: args.chainId || "1",
  dex: args.dex || "uniswap",
  limit: args.limit || 8
});

console.log(JSON.stringify({
  generatedAt: digest.generatedAt,
  sourceStatus: digest.sourceStatus,
  candidateCount: digest.candidateCount,
  itemCount: digest.items.length,
  storage: digest.storage,
  items: digest.items.map((item) => ({
    rank: item.rank,
    name: item.name,
    symbol: item.symbol,
    address: item.address,
    heatScore: item.heat?.score,
    verdict: item.skepticReview?.verdict,
    headline: item.skepticReview?.headline
  }))
}, null, 2));

function parseArgs(values) {
  const parsed = {};

  for (const value of values) {
    if (value === "--no-ai") {
      parsed.noAi = true;
      continue;
    }

    const match = value.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    parsed[toCamelCase(match[1])] = match[2];
  }

  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}
