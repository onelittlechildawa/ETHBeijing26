import { createPublicClient, createWalletClient, getAddress, http, isAddress, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  attachAttestationToCredential,
  buildExplorerUrl,
  getReportNotaryChainId,
  getReportNotaryChainName,
  getReportNotaryExplorerBaseUrl,
  hashReport,
  validateReportCredential
} from "./reportCredential.js";

export const REPORT_NOTARY_ABI = parseAbi([
  "function issuer() view returns (address)",
  "function attest(bytes32 reportHash) external returns (bool created)",
  "function attestations(bytes32 reportHash) view returns (address issuer, uint64 attestedAt)",
  "function isAttested(bytes32 reportHash) view returns (bool)"
]);

export async function attestProjectReport(report) {
  const config = getNotaryConfig({ requireWallet: true });
  if (!config.configured) {
    return {
      status: "not_configured",
      missing: config.missing,
      reportHash: report ? hashReport(report) : null,
      credential: report?.credential || null
    };
  }

  const validation = await validateReportCredential(report, {
    expectedIssuer: config.account.address,
    requireSignature: true
  });

  if (!validation.ok) {
    return {
      status: "invalid_report",
      reportHash: validation.reportHash,
      message: validation.reason,
      credential: report?.credential || null
    };
  }

  const existing = await readAttestation(validation.reportHash, config);
  if (existing.attested) {
    return {
      status: "already_attested",
      reportHash: validation.reportHash,
      credential: attachAttestationToCredential(report.credential, existing)
    };
  }

  const hash = await config.walletClient.writeContract({
    address: config.contractAddress,
    abi: REPORT_NOTARY_ABI,
    functionName: "attest",
    args: [validation.reportHash],
    account: config.account
  });

  const receipt = await config.publicClient.waitForTransactionReceipt({ hash });
  const attestation = await readAttestation(validation.reportHash, config);
  const enriched = {
    ...attestation,
    txHash: hash,
    blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : null
  };

  return {
    status: "attested",
    reportHash: validation.reportHash,
    credential: attachAttestationToCredential(report.credential, enriched)
  };
}

export async function verifyProjectReport({ report = null, reportHash = null }) {
  const localHash = report ? hashReport(report) : null;
  const targetHash = String(reportHash || localHash || "").trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(targetHash)) {
    return {
      status: "invalid_report",
      reportHash: localHash,
      message: "Provide a report or valid bytes32 reportHash."
    };
  }

  const config = getNotaryConfig({ requireWallet: false });
  if (!config.configured) {
    return {
      status: "not_configured",
      missing: config.missing,
      reportHash: targetHash,
      localHashMatches: report ? String(report.credential?.reportHash || "").toLowerCase() === localHash.toLowerCase() : null,
      credential: report?.credential || null
    };
  }

  const attestation = await readAttestation(targetHash, config);
  return {
    status: attestation.attested ? "attested" : "not_attested",
    reportHash: targetHash,
    localHashMatches: report ? String(report.credential?.reportHash || "").toLowerCase() === localHash.toLowerCase() : null,
    credential: report?.credential ? attachAttestationToCredential(report.credential, attestation) : null,
    attestation
  };
}

export function getNotaryConfig({ requireWallet = false } = {}) {
  const chainId = getReportNotaryChainId();
  const chainName = getReportNotaryChainName();
  const explorerBaseUrl = getReportNotaryExplorerBaseUrl();
  const rpcUrl = String(process.env.REPORT_NOTARY_RPC_URL || "").trim();
  const contractAddress = normalizeAddress(process.env.REPORT_NOTARY_CONTRACT_ADDRESS);
  const privateKey = normalizePrivateKey(process.env.REPORT_NOTARY_PRIVATE_KEY);
  const missing = [];

  if (!rpcUrl) missing.push("REPORT_NOTARY_RPC_URL");
  if (!contractAddress) missing.push("REPORT_NOTARY_CONTRACT_ADDRESS");
  if (requireWallet && !privateKey) missing.push("REPORT_NOTARY_PRIVATE_KEY");

  if (missing.length) {
    return {
      configured: false,
      missing,
      chainId,
      chainName,
      explorerBaseUrl,
      contractAddress
    };
  }

  const chain = {
    id: chainId,
    name: chainName,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Explorer", url: explorerBaseUrl } }
  };
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const account = privateKey ? privateKeyToAccount(privateKey) : null;
  const walletClient = account ? createWalletClient({ account, chain, transport }) : null;

  return {
    configured: true,
    chain,
    chainId,
    chainName,
    explorerBaseUrl,
    contractAddress,
    publicClient,
    walletClient,
    account
  };
}

async function readAttestation(reportHash, config = getNotaryConfig({ requireWallet: false })) {
  if (!config.configured) {
    return {
      attested: false,
      status: "not_configured",
      missing: config.missing,
      reportHash
    };
  }

  const result = await config.publicClient.readContract({
    address: config.contractAddress,
    abi: REPORT_NOTARY_ABI,
    functionName: "attestations",
    args: [reportHash]
  });
  const issuer = normalizeAddress(result?.[0]);
  const timestamp = Number(result?.[1] || 0);

  return {
    attested: timestamp > 0,
    reportHash,
    issuer,
    attestedAt: timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null,
    chainId: config.chainId,
    chainName: config.chainName,
    contractAddress: config.contractAddress,
    contractUrl: buildExplorerUrl(config.explorerBaseUrl, "address", config.contractAddress),
    explorerBaseUrl: config.explorerBaseUrl
  };
}

function normalizeAddress(value) {
  const address = String(value || "").trim();
  if (!isAddress(address)) return null;
  return getAddress(address);
}

function normalizePrivateKey(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  const prefixed = key.startsWith("0x") ? key : `0x${key}`;
  return /^0x[a-fA-F0-9]{64}$/.test(prefixed) ? prefixed : null;
}
