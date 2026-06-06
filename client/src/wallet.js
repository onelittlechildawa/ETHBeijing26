const ERC20_BALANCE_OF = "0x70a08231";
const ERC20_ALLOWANCE = "0xdd62ed3e";
const ERC20_DECIMALS = "0x313ce567";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const MAX_UINT_256 = (1n << 256n) - 1n;
const DEFAULT_LOG_WINDOW = 20000n;

export function hasWalletProvider() {
  return Boolean(getProvider());
}

export async function connectWallet() {
  const provider = getProvider();
  if (!provider) {
    throw new Error("No EIP-1193 wallet provider found.");
  }

  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const chainIdHex = await provider.request({ method: "eth_chainId" });
  const connectedAccounts = Array.isArray(accounts) ? accounts.filter(isAddress) : [];
  return {
    provider,
    wallet: connectedAccounts[0] || null,
    accounts: connectedAccounts,
    chainId: String(Number(chainIdHex))
  };
}

export async function analyzeWalletExposure({ provider, wallet, chainId, report }) {
  const contracts = (report?.project?.contracts || []).filter((contract) => isAddress(contract.address));
  const tokenContracts = contracts.filter((contract) => contract.classification?.assetType !== "non_token_or_unknown");
  const skippedContracts = contracts.filter((contract) => contract.classification?.assetType === "non_token_or_unknown");
  const projectContracts = contracts.map((contract) => contract.address.toLowerCase());
  const projectChainId = String(report?.project?.primaryChain?.id || "");

  if (!wallet || !provider) {
    return emptyExposure({ wallet, chainId, projectContracts, status: "not_connected" });
  }

  if (projectChainId && String(chainId) !== projectChainId) {
    return {
      ...emptyExposure({ wallet, chainId, projectContracts, status: "chain_mismatch" }),
      findings: [
        walletFinding({
          title: "Wallet is connected to a different chain",
          severity: "medium",
          confidence: 0.9,
          evidence: `Wallet chain ${chainId}; project chain ${projectChainId}`,
          context: "Wallet exposure should be checked on the same chain as the project contracts."
        })
      ]
    };
  }

  if (!contracts.length) {
    return {
      ...emptyExposure({ wallet, chainId, projectContracts, status: "no_project_contracts" }),
      findings: [
        walletFinding({
          title: "No project contracts available for wallet exposure",
          severity: "low",
          confidence: 0.8,
          evidence: "Project report did not include token contracts",
          context: "Wallet exposure analysis needs at least one project token or contract address."
        })
      ]
    };
  }

  if (!tokenContracts.length) {
    return {
      ...emptyExposure({ wallet, chainId, projectContracts, skippedContracts, status: "contract_specific_unavailable" }),
      findings: [
        walletFinding({
          title: "Contract-specific wallet exposure is not implemented",
          severity: "info",
          confidence: 0.82,
          evidence: skippedContracts.map((contract) => `${contract.contractName || contract.name || "Contract"}: ${contract.classification?.label || "non-token contract"}`).join("; "),
          context: "This project address is not classified as an ERC-20 token, so ChainLens skipped balance and allowance checks. Marketplace, oracle, vault, and router contracts need role-specific wallet exposure logic."
        })
      ]
    };
  }

  const latestBlock = await safeRequest(provider, { method: "eth_blockNumber" });
  const fromBlock = latestBlock.ok ? toBlockHex(hexToBigInt(latestBlock.value) - DEFAULT_LOG_WINDOW) : null;
  const holdings = [];
  const allowances = [];
  const events = [];
  const findings = [];
  const walletTopic = addressTopic(wallet);
  let logFailures = 0;

  for (const contract of tokenContracts) {
    const token = contract.address.toLowerCase();
    const decimals = await readDecimals(provider, token);
    const balanceResult = await ethCall(provider, token, `${ERC20_BALANCE_OF}${padAddress(wallet)}`);
    const balanceRaw = balanceResult.ok ? hexToBigInt(balanceResult.value) : 0n;

    if (balanceRaw > 0n) {
      holdings.push({
        token,
        symbol: contract.symbol || "TOKEN",
        balanceRaw: balanceRaw.toString(),
        balance: formatUnits(balanceRaw, decimals),
        decimals
      });
    }

    let tokenEvents = [];
    if (fromBlock) {
      const eventResult = await readTokenEvents({ provider, token, walletTopic, fromBlock, decimals });
      logFailures += eventResult.failures;
      tokenEvents = eventResult.events;
      events.push(...tokenEvents);
    }

    const eventSpenders = tokenEvents
      .filter((event) => event.type === "Approval")
      .map((event) => event.spender);
    const spenders = spenderCandidates(contract, tokenContracts, eventSpenders);
    for (const spender of spenders) {
      const allowanceResult = await ethCall(provider, token, `${ERC20_ALLOWANCE}${padAddress(wallet)}${padAddress(spender)}`);
      if (!allowanceResult.ok) continue;

      const allowanceRaw = hexToBigInt(allowanceResult.value);
      if (allowanceRaw === 0n) continue;

      const risk = allowanceRaw > MAX_UINT_256 / 2n ? "high" : "medium";
      allowances.push({
        token,
        symbol: contract.symbol || "TOKEN",
        spender: spender.toLowerCase(),
        allowanceRaw: allowanceRaw.toString(),
        allowance: risk === "high" ? "unlimited" : formatUnits(allowanceRaw, decimals),
        risk
      });
    }
  }

  if (holdings.length) {
    findings.push(walletFinding({
      title: "Wallet currently holds project assets",
      severity: "medium",
      confidence: 0.9,
      evidence: holdings.map((holding) => `${holding.balance} ${holding.symbol}`).join("; "),
      context: "Project-level risk can directly affect this wallet because it still holds project tokens."
    }));
  }

  const unlimited = allowances.filter((allowance) => allowance.risk === "high");
  if (unlimited.length) {
    findings.push(walletFinding({
      title: "Wallet has unlimited project-token approvals",
      severity: "high",
      confidence: 0.92,
      evidence: unlimited.map((allowance) => `${allowance.symbol} approval to ${shortAddress(allowance.spender)}`).join("; "),
      context: "Unlimited approvals can let an approved spender move all matching tokens until the approval is revoked."
    }));
  }

  if (!holdings.length && !allowances.length && !events.length) {
    findings.push(walletFinding({
      title: "No direct wallet exposure found",
      severity: "info",
      confidence: 0.75,
      evidence: "No balances, nonzero allowances, or recent project-token events were found",
      context: "This does not prove the wallet is unrelated to the project; it means the checked token exposure was clean."
    }));
  }

  if (!latestBlock.ok) {
    findings.push(walletFinding({
      title: "Recent wallet activity unavailable",
      severity: "low",
      confidence: 0.6,
      evidence: latestBlock.error,
      context: "Balance and allowance checks can still run, but recent Transfer/Approval history could not be queried."
    }));
  } else if (logFailures > 0) {
    findings.push(walletFinding({
      title: "Some recent wallet activity queries failed",
      severity: "low",
      confidence: 0.65,
      evidence: `${logFailures} eth_getLogs request${logFailures === 1 ? "" : "s"} failed`,
      context: "Balance and allowance checks completed, but event history may be incomplete."
    }));
  }

  return {
    status: "ok",
    wallet,
    chainId,
    projectContracts,
    skippedContracts: skippedContracts.map((contract) => ({
      address: contract.address,
      name: contract.contractName || contract.name || null,
      classification: contract.classification || null
    })),
    holdings,
    allowances,
    events,
    findings
  };
}

function getProvider() {
  return globalThis.ethereum || null;
}

function emptyExposure({ wallet = null, chainId = null, projectContracts = [], skippedContracts = [], status }) {
  return {
    status,
    wallet,
    chainId,
    projectContracts,
    skippedContracts,
    holdings: [],
    allowances: [],
    events: [],
    findings: []
  };
}

async function readDecimals(provider, token) {
  const result = await ethCall(provider, token, ERC20_DECIMALS);
  if (!result.ok) return 18;
  const value = Number(hexToBigInt(result.value));
  return Number.isFinite(value) && value >= 0 && value <= 36 ? value : 18;
}

async function readTokenEvents({ provider, token, walletTopic, fromBlock, decimals }) {
  const eventQueries = [
    { type: "Transfer out", topics: [TRANSFER_TOPIC, walletTopic], token },
    { type: "Transfer in", topics: [TRANSFER_TOPIC, null, walletTopic], token },
    { type: "Approval", topics: [APPROVAL_TOPIC, walletTopic], token }
  ];
  const events = [];
  let failures = 0;

  for (const query of eventQueries) {
    const result = await safeRequest(provider, {
      method: "eth_getLogs",
      params: [{
        address: token,
        fromBlock,
        toBlock: "latest",
        topics: query.topics
      }]
    });

    if (!result.ok || !Array.isArray(result.value)) {
      failures += 1;
      continue;
    }
    events.push(...result.value.slice(-5).map((event) => parseTokenEvent(event, query, decimals)));
  }

  const sorted = events
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
    .slice(0, 12);
  return { events: sorted, failures };
}

function parseTokenEvent(event, query, decimals) {
  const valueRaw = hexToBigInt(event.data);
  const parsed = {
    type: query.type,
    token: query.token,
    txHash: event.transactionHash,
    blockNumber: Number(hexToBigInt(event.blockNumber)),
    logIndex: Number(hexToBigInt(event.logIndex)),
    valueRaw: valueRaw.toString(),
    value: formatUnits(valueRaw, decimals)
  };

  if (query.type === "Approval") {
    parsed.spender = topicToAddress(event.topics?.[2]);
  } else if (query.type === "Transfer out") {
    parsed.counterparty = topicToAddress(event.topics?.[2]);
  } else if (query.type === "Transfer in") {
    parsed.counterparty = topicToAddress(event.topics?.[1]);
  }

  return parsed;
}

async function ethCall(provider, to, data) {
  return safeRequest(provider, {
    method: "eth_call",
    params: [{ to, data }, "latest"]
  });
}

async function safeRequest(provider, payload) {
  try {
    const value = await provider.request(payload);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error?.message || "Wallet RPC request failed" };
  }
}

function spenderCandidates(contract, contracts, eventSpenders = []) {
  return [
    contract.pairAddress,
    ...eventSpenders,
    ...contracts.map((candidate) => candidate.address)
  ]
    .filter(isAddress)
    .map((address) => address.toLowerCase())
    .filter((address) => address !== contract.address.toLowerCase())
    .filter((address, index, all) => all.indexOf(address) === index)
    .slice(0, 8);
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

function padAddress(address) {
  return String(address).toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function addressTopic(address) {
  return `0x${padAddress(address)}`;
}

function topicToAddress(topic) {
  const value = String(topic || "");
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) return null;
  return `0x${value.slice(-40)}`.toLowerCase();
}

function hexToBigInt(value) {
  if (!value || value === "0x") return 0n;
  return BigInt(value);
}

function toBlockHex(value) {
  const block = value > 0n ? value : 0n;
  return `0x${block.toString(16)}`;
}

function formatUnits(value, decimals) {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  if (fraction === 0n) return whole.toString();
  const padded = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  const trimmed = padded.slice(0, 6);
  return `${whole}.${trimmed}`;
}

function walletFinding(input) {
  return {
    id: `wallet-${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    dimension: "wallet",
    ...input
  };
}

function shortAddress(address) {
  if (!address) return "unknown";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
