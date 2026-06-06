import { isBurnAddress, labelAddress } from "./knownAddresses.js";

const SEVERITY_WEIGHT = {
  critical: 30,
  high: 18,
  medium: 9,
  low: 3,
  info: 0
};

const DIMENSION_KEYS = ["contract", "holders", "liquidity"];

export function buildRiskReport({ chain, address, goPlusToken, dexPair, sourceMeta }) {
  const classification = classifyAsset(goPlusToken, dexPair);
  const signals = classification.assetType === "erc20_token"
    ? [
        ...contractSignals(goPlusToken),
        ...holderSignals(goPlusToken),
        ...liquiditySignals(goPlusToken, dexPair)
      ]
    : [
        makeSignal({
          dimension: "contract",
          signal: "Token-specific model was not applied",
          severity: "info",
          confidence: classification.confidence,
          evidence: classification.reason,
          context: "This address may be a marketplace, router, proxy, controller, or other infrastructure contract. Missing ERC-20 holder, liquidity, and tax fields should not be scored as token risk."
        })
      ];

  const summary = classification.assetType === "erc20_token"
    ? summarizeSignals(signals)
    : summarizeUnscoredContract();
  const dimensions = buildDimensions(signals);
  const trustScore = classification.assetType === "erc20_token" ? calculateTrustScore(signals) : null;

  return {
    address,
    chain,
    generatedAt: new Date().toISOString(),
    classification,
    token: {
      name: firstValue(goPlusToken?.token_name, dexPair?.baseToken?.name, "Unknown Token"),
      symbol: firstValue(goPlusToken?.token_symbol, dexPair?.baseToken?.symbol, "TOKEN"),
      totalSupply: goPlusToken?.total_supply || null,
      holderCount: toNumber(goPlusToken?.holder_count),
      priceUsd: dexPair?.priceUsd || null,
      fdv: toNumber(dexPair?.fdv),
      pairAddress: dexPair?.pairAddress || null,
      dexId: dexPair?.dexId || null,
      pairUrl: dexPair?.url || null,
      websites: normalizeWebsites(dexPair?.info?.websites),
      socials: normalizeSocials(dexPair?.info?.socials),
      imageUrl: dexPair?.info?.imageUrl || null
    },
    summary: {
      trustScore,
      level: summary.level,
      label: summary.label,
      description: summary.description,
      counts: summary.counts
    },
    dimensions,
    metrics: buildMetrics(goPlusToken, dexPair),
    signals,
    sources: sourceMeta
  };
}

function contractSignals(token) {
  const checks = [
    boolSignal(token, "is_open_source", "0", {
      dimension: "contract",
      signal: "Contract source is not verified",
      severity: "high",
      confidence: 0.9,
      evidence: "GoPlus is_open_source = 0",
      context: "Unverified source makes owner permissions and token logic harder to inspect."
    }),
    boolSignal(token, "is_honeypot", "1", {
      dimension: "contract",
      signal: "Honeypot behavior detected",
      severity: "critical",
      confidence: 0.96,
      evidence: "GoPlus is_honeypot = 1",
      context: "A honeypot signal means users may be unable to sell after buying."
    }),
    boolSignal(token, "is_mintable", "1", {
      dimension: "contract",
      signal: "Mint permission is present",
      severity: "medium",
      confidence: 0.86,
      evidence: "GoPlus is_mintable = 1",
      context: "Mint permissions can be legitimate, but they also allow supply expansion."
    }),
    boolSignal(token, "hidden_owner", "1", {
      dimension: "contract",
      signal: "Hidden owner detected",
      severity: "high",
      confidence: 0.92,
      evidence: "GoPlus hidden_owner = 1",
      context: "Hidden owner control makes governance and permission risk harder to audit."
    }),
    boolSignal(token, "owner_change_balance", "1", {
      dimension: "contract",
      signal: "Owner can modify balances",
      severity: "critical",
      confidence: 0.95,
      evidence: "GoPlus owner_change_balance = 1",
      context: "Balance modification power can directly alter user balances."
    }),
    boolSignal(token, "can_take_back_ownership", "1", {
      dimension: "contract",
      signal: "Owner can take back ownership",
      severity: "high",
      confidence: 0.9,
      evidence: "GoPlus can_take_back_ownership = 1",
      context: "Renounced ownership may not be permanent if ownership can be reclaimed."
    }),
    boolSignal(token, "selfdestruct", "1", {
      dimension: "contract",
      signal: "Contract can self-destruct",
      severity: "high",
      confidence: 0.9,
      evidence: "GoPlus selfdestruct = 1",
      context: "Self-destruct capability can remove contract code or break integrations."
    }),
    boolSignal(token, "is_blacklisted", "1", {
      dimension: "contract",
      signal: "Blacklist function is present",
      severity: "medium",
      confidence: 0.82,
      evidence: "GoPlus is_blacklisted = 1",
      context: "Blacklist controls can be used for compliance, but they also introduce admin risk."
    }),
    boolSignal(token, "is_whitelisted", "1", {
      dimension: "contract",
      signal: "Whitelist function is present",
      severity: "medium",
      confidence: 0.78,
      evidence: "GoPlus is_whitelisted = 1",
      context: "Whitelist controls can restrict who is allowed to trade or transfer the token."
    }),
    boolSignal(token, "transfer_pausable", "1", {
      dimension: "contract",
      signal: "Transfer pause control is present",
      severity: "medium",
      confidence: 0.8,
      evidence: "GoPlus transfer_pausable = 1",
      context: "Pause controls can be useful during incidents, but they also introduce centralized transfer risk."
    }),
    boolSignal(token, "is_proxy", "1", {
      dimension: "contract",
      signal: "Proxy upgrade pattern detected",
      severity: "low",
      confidence: 0.76,
      evidence: "GoPlus is_proxy = 1",
      context: "Proxy contracts are common, but upgradeability adds governance and implementation risk."
    })
  ].filter(Boolean);

  const buyTax = parsePercent(token?.buy_tax);
  const sellTax = parsePercent(token?.sell_tax);
  if (buyTax !== null && buyTax > 10) {
    checks.push(makeSignal({
      dimension: "contract",
      signal: "Buy tax is unusually high",
      severity: "high",
      confidence: 0.87,
      evidence: `GoPlus buy_tax = ${formatPercent(buyTax)}`,
      context: "High buy tax increases slippage and can be used to extract value from entrants."
    }));
  }
  if (sellTax !== null && sellTax > 10) {
    checks.push(makeSignal({
      dimension: "contract",
      signal: "Sell tax is unusually high",
      severity: "high",
      confidence: 0.9,
      evidence: `GoPlus sell_tax = ${formatPercent(sellTax)}`,
      context: "High sell tax can make exits expensive and can resemble soft honeypot behavior."
    }));
  }

  addUnknownSignals(checks, token, "contract", [
    "is_open_source",
    "is_honeypot",
    "is_mintable",
    "is_blacklisted",
    "is_whitelisted",
    "transfer_pausable",
    "is_proxy",
    "hidden_owner",
    "owner_change_balance",
    "can_take_back_ownership",
    "selfdestruct"
  ]);

  return checks;
}

function holderSignals(token) {
  const signals = [];
  const holderCount = toNumber(token?.holder_count);
  const holders = Array.isArray(token?.holders) ? token.holders : [];
  const topTen = holders.slice(0, 10);
  const topTenPercent = topTen.reduce((sum, holder) => sum + holderPercent(holder), 0);

  if (holderCount !== null && holderCount < 100) {
    signals.push(makeSignal({
      dimension: "holders",
      signal: "Very low holder count",
      severity: "high",
      confidence: 0.9,
      evidence: `GoPlus holder_count = ${holderCount}`,
      context: "A small holder base can indicate limited distribution and fragile liquidity."
    }));
  } else if (holderCount !== null && holderCount < 500) {
    signals.push(makeSignal({
      dimension: "holders",
      signal: "Holder count is still limited",
      severity: "medium",
      confidence: 0.82,
      evidence: `GoPlus holder_count = ${holderCount}`,
      context: "Limited holder count is not automatically unsafe, but it lowers distribution confidence."
    }));
  }

  if (topTen.length) {
    if (topTenPercent > 80) {
      signals.push(concentrationSignal("Top 10 holders control most supply", "critical", topTenPercent));
    } else if (topTenPercent > 50) {
      signals.push(concentrationSignal("Top 10 holders are highly concentrated", "high", topTenPercent));
    } else if (topTenPercent > 30) {
      signals.push(concentrationSignal("Top 10 holders are moderately concentrated", "medium", topTenPercent));
    }
  } else {
    signals.push(makeSignal({
      dimension: "holders",
      signal: "Holder distribution data unavailable",
      severity: "low",
      confidence: 0.55,
      evidence: "GoPlus holders field was empty or unavailable",
      context: "Distribution risk cannot be fully evaluated without holder data."
    }));
  }

  return signals;
}

function liquiditySignals(token, pair) {
  const signals = [];
  const liquidityUsd = toNumber(pair?.liquidity?.usd);
  const lpHolders = Array.isArray(token?.lp_holders) ? token.lp_holders : [];
  const lpTotal = toNumber(token?.lp_total_supply);
  const lockedLp = lpHolders
    .filter((holder) => holder.is_locked === 1 || holder.is_locked === "1" || isBurnAddress(holder.address))
    .reduce((sum, holder) => sum + holderPercent(holder), 0);

  if (liquidityUsd !== null) {
    if (liquidityUsd < 1000) {
      signals.push(liquiditySignal("Liquidity is extremely thin", "critical", liquidityUsd));
    } else if (liquidityUsd < 10000) {
      signals.push(liquiditySignal("Liquidity is very low", "high", liquidityUsd));
    } else if (liquidityUsd < 100000) {
      signals.push(liquiditySignal("Liquidity is limited", "medium", liquidityUsd));
    }
  } else {
    signals.push(makeSignal({
      dimension: "liquidity",
      signal: "DEX liquidity data unavailable",
      severity: "low",
      confidence: 0.55,
      evidence: "DEXScreener did not return a primary pair",
      context: "The token may be unlisted, newly deployed, or trading on an unsupported venue."
    }));
  }

  if (lpHolders.length && lockedLp < 50) {
    signals.push(makeSignal({
      dimension: "liquidity",
      signal: "LP appears mostly unlocked",
      severity: "high",
      confidence: 0.82,
      evidence: `Locked or burned LP share estimated at ${formatPercent(lockedLp)}`,
      context: "Unlocked LP can often be withdrawn, which may remove market liquidity."
    }));
  }

  if (lpHolders[0]) {
    const topLp = holderPercent(lpHolders[0]);
    const label = labelAddress(lpHolders[0].address);
    if (topLp > 70 && !isBurnAddress(lpHolders[0].address)) {
      signals.push(makeSignal({
        dimension: "liquidity",
        signal: "LP ownership is concentrated",
        severity: "medium",
        confidence: 0.78,
        evidence: `Top LP holder ${shortAddress(lpHolders[0].address)}${label ? ` (${label})` : ""} controls ${formatPercent(topLp)}`,
        context: "LP concentration gives a small number of addresses outsized control over liquidity."
      }));
    }
  }

  if (!lpHolders.length && lpTotal !== null && lpTotal > 0) {
    signals.push(makeSignal({
      dimension: "liquidity",
      signal: "LP holder data unavailable",
      severity: "low",
      confidence: 0.55,
      evidence: "GoPlus lp_holders field was empty",
      context: "LP lock status cannot be confirmed from available data."
    }));
  }

  return signals;
}

function buildMetrics(token, pair) {
  const holders = Array.isArray(token?.holders) ? token.holders.slice(0, 10) : [];
  const lpHolders = Array.isArray(token?.lp_holders) ? token.lp_holders.slice(0, 10) : [];

  return {
    contract: {
      openSource: triState(token?.is_open_source),
      proxy: triState(token?.is_proxy),
      honeypot: triState(token?.is_honeypot),
      mintable: triState(token?.is_mintable),
      blacklist: triState(token?.is_blacklisted),
      whitelist: triState(token?.is_whitelisted),
      pausable: triState(token?.transfer_pausable),
      hiddenOwner: triState(token?.hidden_owner),
      ownerCanChangeBalance: triState(token?.owner_change_balance),
      ownerCanTakeBackOwnership: triState(token?.can_take_back_ownership),
      selfdestruct: triState(token?.selfdestruct),
      buyTax: parsePercent(token?.buy_tax),
      sellTax: parsePercent(token?.sell_tax)
    },
    holders: {
      holderCount: toNumber(token?.holder_count),
      topTenPercent: holders.reduce((sum, holder) => sum + holderPercent(holder), 0),
      topHolders: holders.map((holder) => ({
        address: holder.address,
        label: labelAddress(holder.address),
        percent: holderPercent(holder),
        isContract: holder.is_contract === 1 || holder.is_contract === "1",
        isLocked: holder.is_locked === 1 || holder.is_locked === "1"
      }))
    },
    liquidity: {
      usd: toNumber(pair?.liquidity?.usd),
      volume24h: toNumber(pair?.volume?.h24),
      txns24h: toNumber(pair?.txns?.h24?.buys) + toNumber(pair?.txns?.h24?.sells),
      priceChange24h: toNumber(pair?.priceChange?.h24),
      lpHolderCount: toNumber(token?.lp_holder_count),
      lpHolders: lpHolders.map((holder) => ({
        address: holder.address,
        label: labelAddress(holder.address),
        percent: holderPercent(holder),
        isLocked: holder.is_locked === 1 || holder.is_locked === "1" || isBurnAddress(holder.address)
      }))
    }
  };
}

function classifyAsset(token, pair) {
  const hasTokenIdentity = Boolean(
    token?.token_name ||
    token?.token_symbol ||
    token?.total_supply ||
    token?.holder_count ||
    pair?.baseToken?.name ||
    pair?.baseToken?.symbol ||
    pair?.liquidity?.usd
  );

  if (hasTokenIdentity) {
    return {
      assetType: "erc20_token",
      label: "ERC-20 token",
      confidence: 0.82,
      reason: "Token or DEX metadata was available"
    };
  }

  return {
    assetType: "non_token_or_unknown",
    label: "Non-token or unrecognized contract",
    confidence: 0.72,
    reason: "GoPlus and DEXScreener did not return token identity, holder, or pair data"
  };
}

function summarizeUnscoredContract() {
  return {
    level: "unscored",
    label: "Token Model Not Applied",
    description: "This address was not recognized as an ERC-20 token, so token holder and liquidity scoring were skipped.",
    counts: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    }
  };
}

function summarizeSignals(signals) {
  const counts = {
    critical: signals.filter((signal) => signal.severity === "critical").length,
    high: signals.filter((signal) => signal.severity === "high").length,
    medium: signals.filter((signal) => signal.severity === "medium").length,
    low: signals.filter((signal) => signal.severity === "low").length
  };

  if (counts.critical >= 2) {
    return {
      level: "high",
      label: "High Risk",
      description: "Multiple critical signals require immediate manual review.",
      counts
    };
  }
  if (counts.critical >= 1 || counts.high >= 3) {
    return {
      level: "elevated",
      label: "Elevated Risk",
      description: "Several material risk signals were found across the project profile.",
      counts
    };
  }
  if (counts.high >= 1 || counts.medium >= 2) {
    return {
      level: "watch",
      label: "Needs Attention",
      description: "Some risk signals deserve follow-up before relying on this token.",
      counts
    };
  }
  return {
    level: "low",
    label: "No Major Signals",
    description: "No major risk signals were found in the available data.",
    counts
  };
}

function buildDimensions(signals) {
  return DIMENSION_KEYS.map((key) => {
    const dimensionSignals = signals.filter((signal) => signal.dimension === key);
    const penalty = dimensionSignals.reduce((sum, signal) => sum + SEVERITY_WEIGHT[signal.severity], 0);
    return {
      key,
      label: {
        contract: "Contract",
        holders: "Distribution",
        liquidity: "Liquidity"
      }[key],
      score: Math.max(0, 100 - penalty),
      signalCount: dimensionSignals.length
    };
  });
}

function calculateTrustScore(signals) {
  const penalty = signals.reduce((sum, signal) => {
    return sum + SEVERITY_WEIGHT[signal.severity] * signal.confidence;
  }, 0);
  return Math.max(0, Math.round(100 - penalty));
}

function boolSignal(token, field, triggerValue, details) {
  if (token?.[field] === undefined || token?.[field] === null || token?.[field] === "") return null;
  return String(token[field]) === triggerValue ? makeSignal(details) : null;
}

function addUnknownSignals(signals, token, dimension, fields) {
  for (const field of fields) {
    if (token?.[field] === undefined || token?.[field] === null || token?.[field] === "") {
      signals.push(makeSignal({
        dimension,
        signal: `Field unavailable: ${field}`,
        severity: "low",
        confidence: 0.45,
        evidence: `GoPlus ${field} is missing`,
        context: "Unknown does not mean unsafe; it means ChainLens could not verify this field."
      }));
    }
  }
}

function makeSignal(signal) {
  return {
    id: `${signal.dimension}-${signal.signal.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    ...signal
  };
}

function concentrationSignal(signal, severity, percent) {
  return makeSignal({
    dimension: "holders",
    signal,
    severity,
    confidence: 0.86,
    evidence: `Top 10 holders control ${formatPercent(percent)}`,
    context: "Concentrated supply can increase market manipulation and coordinated sell pressure risk."
  });
}

function liquiditySignal(signal, severity, usd) {
  return makeSignal({
    dimension: "liquidity",
    signal,
    severity,
    confidence: 0.88,
    evidence: `DEXScreener liquidity.usd = ${formatUsd(usd)}`,
    context: "Low liquidity can cause severe slippage and makes price easier to move."
  });
}

function triState(value) {
  if (value === undefined || value === null || value === "") return "unknown";
  if (String(value) === "1") return "yes";
  if (String(value) === "0") return "no";
  return "unknown";
}

function holderPercent(holder) {
  return parsePercent(holder?.percent ?? holder?.balance_percent ?? holder?.tag);
}

function parsePercent(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(String(value).replace("%", ""));
  if (!Number.isFinite(numeric)) return null;
  return numeric <= 1 ? numeric * 100 : numeric;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatPercent(value) {
  return `${Number(value).toFixed(value >= 10 ? 1 : 2)}%`;
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || null;
}

function normalizeWebsites(websites) {
  if (!Array.isArray(websites)) return [];
  return websites
    .map((site) => ({
      label: site?.label || "Website",
      url: site?.url || null
    }))
    .filter((site) => site.url);
}

function normalizeSocials(socials) {
  if (!Array.isArray(socials)) return [];
  return socials
    .map((social) => ({
      type: social?.type || "social",
      url: social?.url || null
    }))
    .filter((social) => social.url);
}

function shortAddress(address) {
  if (!address) return "unknown";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
