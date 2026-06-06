import { labelAddress } from "./knownAddresses.js";

const SCOPE_LABELS = {
  exchange_or_custody: "Exchange or custody address",
  bridge_or_router: "Bridge or router contract",
  governance_treasury: "Governance treasury",
  governance_contract: "Governance contract",
  protocol_infrastructure: "Protocol infrastructure",
  non_token_contract: "Non-token contract"
};

const SCOPE_KEYWORDS = [
  {
    scope: "exchange_or_custody",
    confidence: 0.82,
    patterns: [
      /\b(exchange|custody|custodian|deposit wallet|hot wallet|cex)\b/i,
      /\b(binance|coinbase|kraken|okx|bybit|kucoin|bitfinex|bitstamp|gate\.io|mexc|upbit|crypto\.com)\b/i
    ]
  },
  {
    scope: "bridge_or_router",
    confidence: 0.86,
    patterns: [
      /\b(bridge|cross-chain|cross chain|messaging endpoint|canonical bridge|token bridge)\b/i,
      /\b(router|swap router|exchange proxy|aggregator|permit2|conduit|settlement)\b/i
    ]
  },
  {
    scope: "governance_treasury",
    confidence: 0.86,
    patterns: [
      /\b(treasury|dao treasury|ecosystem fund|reserve fund|community fund)\b/i,
      /\b(multisig|multi-sig|gnosis safe|safe proxy|safe multisig|timelock|time lock)\b/i
    ]
  },
  {
    scope: "governance_contract",
    confidence: 0.86,
    patterns: [/\b(governance|governor|proposal|voting|timelock controller)\b/i]
  },
  {
    scope: "protocol_infrastructure",
    confidence: 0.76,
    patterns: [/\b(factory|registry|controller|oracle|marketplace|vault|proxy admin|implementation)\b/i]
  }
];

const ABI_ROLE_SCOPE = {
  governance: "governance_contract",
  router: "bridge_or_router",
  vault: "protocol_infrastructure",
  marketplace: "protocol_infrastructure",
  oracle: "protocol_infrastructure"
};

export function classifyContractScope({ seed, report, profile, projectEvidence }) {
  const abiSummary = profile?.verifiedContract?.abiSummary;
  const originalClassification = report?.classification || {};
  const label = labelAddress(report?.address);
  const contractEvidenceText = buildContractEvidenceText({ seed, report, profile, label });
  const projectEvidenceText = buildProjectEvidenceText(projectEvidence);
  const tokenLike = originalClassification.assetType === "erc20_token" || abiSummary?.erc20Like;
  const weakTokenEvidence = hasWeakTokenEvidence(report);

  const roleScope = abiSummary?.role ? ABI_ROLE_SCOPE[abiSummary.role] : null;
  if (roleScope && abiSummary?.erc20Like === false) {
    return scopeOverride({
      scope: roleScope,
      confidence: 0.9,
      reason: `Sourcify ABI role is ${abiSummary.role}, and ERC-20 transfer/approve/balanceOf/allowance methods are not all present`,
      originalClassification
    });
  }

  const contractKeywordMatch = findKeywordScope(contractEvidenceText);
  if (contractKeywordMatch && (!tokenLike || label || weakTokenEvidence)) {
    return scopeOverride({
      scope: contractKeywordMatch.scope,
      confidence: contractKeywordMatch.confidence,
      reason: contractKeywordMatch.reason,
      originalClassification
    });
  }

  const projectKeywordMatch = findKeywordScope(projectEvidenceText);
  if (projectKeywordMatch && (!tokenLike || weakTokenEvidence)) {
    return scopeOverride({
      scope: projectKeywordMatch.scope,
      confidence: projectKeywordMatch.confidence,
      reason: projectKeywordMatch.reason,
      originalClassification
    });
  }

  if (abiSummary && abiSummary.erc20Like === false && originalClassification.assetType !== "erc20_token") {
    return scopeOverride({
      scope: "non_token_contract",
      confidence: 0.82,
      reason: "Sourcify verified ABI is not ERC-20-like",
      originalClassification
    });
  }

  return null;
}

function hasWeakTokenEvidence(report) {
  if (report?.classification?.assetType !== "erc20_token") return false;
  const token = report.token || {};
  const unknownIdentity = !token.name || token.name === "Unknown Token" || !token.symbol || token.symbol === "TOKEN";
  const noMarket = !token.pairUrl && !token.priceUsd && !token.dexId && !token.pairAddress;
  const noSupply = !token.totalSupply;
  const noHolders = !Number(token.holderCount || 0);
  return unknownIdentity && noMarket && noSupply && noHolders;
}

export function isTokenModelExcluded(classification) {
  return classification?.tokenModel === "excluded" || classification?.assetType !== "erc20_token";
}

function scopeOverride({ scope, confidence, reason, originalClassification }) {
  return {
    assetType: scope,
    scope,
    label: SCOPE_LABELS[scope] || "Token model excluded",
    confidence,
    reason,
    tokenModel: "excluded",
    originalClassification
  };
}

function findKeywordScope(text) {
  for (const entry of SCOPE_KEYWORDS) {
    const pattern = entry.patterns.find((item) => item.test(text));
    if (pattern) {
      return {
        scope: entry.scope,
        confidence: entry.confidence,
        reason: `Project or contract evidence matched scope keyword ${pattern.source}`
      };
    }
  }
  return null;
}

function buildContractEvidenceText({ seed, report, profile, label }) {
  const verified = profile?.verifiedContract || {};
  return [
    seed?.query,
    seed?.name,
    report?.token?.name,
    report?.token?.symbol,
    profile?.name,
    profile?.contractName,
    profile?.fullyQualifiedName,
    verified.fullyQualifiedName,
    verified.abiSummary?.role,
    label
  ]
    .filter(Boolean)
    .join(" \n ")
    .slice(0, 4000);
}

function buildProjectEvidenceText(projectEvidence) {
  return (projectEvidence?.artifacts || [])
    .slice(0, 6)
    .flatMap((artifact) => [
      artifact.type,
      artifact.title,
      artifact.summary,
      ...(artifact.excerpts || []).slice(0, 1)
    ])
    .filter(Boolean)
    .join(" \n ")
    .slice(0, 6000);
}
