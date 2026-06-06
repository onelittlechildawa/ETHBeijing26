import "../src/services/env.js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { attestProjectReport, verifyProjectReport } from "../src/services/reportNotary.js";
import { createReportCredential } from "../src/services/reportCredential.js";

const report = {
  generatedAt: new Date().toISOString(),
  project: {
    name: "ChainLens Credential Smoke Test",
    query: "ChainLens credential smoke test",
    primaryChain: { id: "1", label: "Ethereum", shortLabel: "ETH" },
    contracts: []
  },
  summary: {
    projectScore: 100,
    level: "low",
    label: "Credential Smoke Test",
    description: "Sample report used to verify Sepolia report-hash attestation.",
    counts: { critical: 0, high: 0, medium: 0, low: 0 },
    actions: []
  },
  dimensions: [],
  skepticReview: null,
  agents: [],
  recommendations: [],
  findings: [],
  suppressedFindings: [],
  tokenReports: [],
  openai: { status: "disabled", summary: null, message: null, findings: [], findingReviews: [] },
  projectEvidence: { status: "empty", artifactCount: 0, addresses: [], surfaces: {}, artifacts: [], sources: [] },
  contractProfiles: [],
  sources: []
};
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const workspaceEnvPath = fileURLToPath(new URL("../../.env", import.meta.url));

report.credential = await createReportCredential(report);
const result = await attestProjectReport(report);
if (result.status === "not_configured") {
  console.error(`Notary is not configured: ${(result.missing || []).join(", ")}`);
  process.exit(1);
}
if (result.status === "invalid_report") {
  console.error(result.message || "Report credential is invalid.");
  process.exit(1);
}

report.credential = result.credential;
const verification = await verifyProjectReport({ report });

const output = {
  status: result.status,
  verificationStatus: verification.status,
  reportHash: report.credential.reportHash,
  chainId: report.credential.chainId,
  contractAddress: report.credential.contractAddress,
  txHash: report.credential.attestation?.txHash || null,
  transactionUrl: report.credential.transactionUrl || null,
  attestedAt: report.credential.attestedAt || null
};

writeFileSync(`${workspaceRoot}/chainlens-notary-smoke-report.json`, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(`${workspaceRoot}/chainlens-notary-smoke-result.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));

try {
  const env = readFileSync(workspaceEnvPath, "utf8");
  if (!/REPORT_NOTARY_CONTRACT_ADDRESS=0x[a-fA-F0-9]{40}/.test(env) && output.contractAddress) {
    writeFileSync(workspaceEnvPath, env.replace(/REPORT_NOTARY_CONTRACT_ADDRESS=.*/, `REPORT_NOTARY_CONTRACT_ADDRESS=${output.contractAddress}`));
  }
} catch {
  // Persisting the optional smoke-test contract address is best effort.
}
