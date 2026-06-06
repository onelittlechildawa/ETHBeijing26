import { getAddress, isAddress, keccak256, recoverMessageAddress, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const REPORT_CREDENTIAL_VERSION = "chainlens-report-credential-v1";
export const REPORT_CREDENTIAL_DOMAIN = "ChainLensReportCredential:v1";
export const REPORT_CANONICALIZATION = "stable-json-v1 excluding top-level credential";
export const REPORT_HASH_ALGORITHM = "keccak256";

export function canonicalizeReport(report) {
  const withoutCredential = report && typeof report === "object" && !Array.isArray(report)
    ? { ...report, credential: undefined }
    : report;
  return JSON.stringify(normalizeJsonValue(withoutCredential));
}

export function hashReport(report) {
  const canonicalJson = canonicalizeReport(report);
  return keccak256(toBytes(`${REPORT_CREDENTIAL_DOMAIN}\n${canonicalJson}`));
}

export async function createReportCredential(report) {
  const reportHash = hashReport(report);
  const account = getIssuerAccount();
  const issuer = account?.address || normalizeOptionalAddress(process.env.REPORT_NOTARY_ISSUER_ADDRESS);
  const signature = account
    ? await account.signMessage({ message: reportHash })
    : null;

  return {
    version: REPORT_CREDENTIAL_VERSION,
    status: "unattested",
    reportHash,
    hashAlgorithm: REPORT_HASH_ALGORITHM,
    canonicalization: REPORT_CANONICALIZATION,
    domain: REPORT_CREDENTIAL_DOMAIN,
    issuedAt: new Date().toISOString(),
    issuer,
    issuerSignature: signature,
    chainId: getReportNotaryChainId(),
    chainName: getReportNotaryChainName(),
    contractAddress: normalizeOptionalAddress(process.env.REPORT_NOTARY_CONTRACT_ADDRESS),
    explorerBaseUrl: getReportNotaryExplorerBaseUrl()
  };
}

export async function validateReportCredential(report, { expectedIssuer = null, requireSignature = false } = {}) {
  const reportHash = hashReport(report);
  const credential = report?.credential || {};
  const normalizedExpectedIssuer = normalizeOptionalAddress(expectedIssuer);

  if (!credential.reportHash) {
    return { ok: false, reportHash, reason: "Report credential is missing reportHash." };
  }

  if (String(credential.reportHash).toLowerCase() !== reportHash.toLowerCase()) {
    return { ok: false, reportHash, reason: "Report hash does not match the credential." };
  }

  const issuer = normalizeOptionalAddress(credential.issuer);
  if (normalizedExpectedIssuer && issuer !== normalizedExpectedIssuer) {
    return { ok: false, reportHash, issuer, reason: "Credential issuer does not match the configured notary issuer." };
  }

  if (!credential.issuerSignature) {
    return requireSignature
      ? { ok: false, reportHash, issuer, reason: "Report credential is missing issuerSignature." }
      : { ok: true, reportHash, issuer, signatureValid: false };
  }

  try {
    const recovered = getAddress(await recoverMessageAddress({
      message: reportHash,
      signature: credential.issuerSignature
    }));

    if (issuer && recovered !== issuer) {
      return { ok: false, reportHash, issuer, recovered, reason: "Issuer signature does not recover to the credential issuer." };
    }

    if (normalizedExpectedIssuer && recovered !== normalizedExpectedIssuer) {
      return { ok: false, reportHash, issuer, recovered, reason: "Issuer signature does not recover to the configured notary issuer." };
    }

    return { ok: true, reportHash, issuer: issuer || recovered, recovered, signatureValid: true };
  } catch (error) {
    return { ok: false, reportHash, issuer, reason: `Issuer signature could not be verified: ${error.message}` };
  }
}

export function attachAttestationToCredential(credential, attestation) {
  const next = {
    ...(credential || {}),
    status: attestation?.attested ? "attested" : credential?.status || "unattested",
    chainId: attestation?.chainId || credential?.chainId || getReportNotaryChainId(),
    chainName: attestation?.chainName || credential?.chainName || getReportNotaryChainName(),
    contractAddress: attestation?.contractAddress || credential?.contractAddress || normalizeOptionalAddress(process.env.REPORT_NOTARY_CONTRACT_ADDRESS),
    explorerBaseUrl: attestation?.explorerBaseUrl || credential?.explorerBaseUrl || getReportNotaryExplorerBaseUrl()
  };

  if (attestation?.attested) {
    next.attestedAt = attestation.attestedAt;
    next.attestation = {
      issuer: attestation.issuer || next.issuer || null,
      attestedAt: attestation.attestedAt,
      txHash: attestation.txHash || credential?.attestation?.txHash || null,
      blockNumber: attestation.blockNumber ?? credential?.attestation?.blockNumber ?? null
    };
    if (next.attestation.txHash) {
      next.transactionUrl = buildExplorerUrl(next.explorerBaseUrl, "tx", next.attestation.txHash);
    }
    if (next.contractAddress) {
      next.contractUrl = buildExplorerUrl(next.explorerBaseUrl, "address", next.contractAddress);
    }
  }

  return next;
}

export function getIssuerAccount() {
  const privateKey = normalizePrivateKey(process.env.REPORT_NOTARY_PRIVATE_KEY);
  if (!privateKey) return null;
  return privateKeyToAccount(privateKey);
}

export function getReportNotaryChainId() {
  return Number(process.env.REPORT_NOTARY_CHAIN_ID || 11155111);
}

export function getReportNotaryChainName() {
  if (process.env.REPORT_NOTARY_CHAIN_NAME) return process.env.REPORT_NOTARY_CHAIN_NAME;
  return getReportNotaryChainId() === 11155111 ? "Sepolia" : `Chain ${getReportNotaryChainId()}`;
}

export function getReportNotaryExplorerBaseUrl() {
  return String(process.env.REPORT_NOTARY_EXPLORER_BASE_URL || "https://sepolia.etherscan.io").replace(/\/+$/, "");
}

export function buildExplorerUrl(baseUrl, kind, value) {
  if (!baseUrl || !value) return null;
  return `${String(baseUrl).replace(/\/+$/, "")}/${kind}/${value}`;
}

function normalizeJsonValue(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeJsonValue(item);
      return normalized === undefined ? null : normalized;
    });
  }
  if (typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((object, key) => {
        const normalized = normalizeJsonValue(value[key]);
        if (normalized !== undefined) object[key] = normalized;
        return object;
      }, {});
  }
  return null;
}

function normalizePrivateKey(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  const prefixed = key.startsWith("0x") ? key : `0x${key}`;
  return /^0x[a-fA-F0-9]{64}$/.test(prefixed) ? prefixed : null;
}

function normalizeOptionalAddress(value) {
  const address = String(value || "").trim();
  if (!isAddress(address)) return null;
  return getAddress(address);
}
