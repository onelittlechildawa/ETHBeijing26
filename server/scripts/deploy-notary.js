import "../src/services/env.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getReportNotaryChainId, getReportNotaryChainName, getReportNotaryExplorerBaseUrl, getReportNotaryRpcUrl } from "../src/services/reportCredential.js";
import artifact from "../../contracts/artifacts/ChainLensReportNotary.json" with { type: "json" };

const privateKey = normalizePrivateKey(process.env.REPORT_NOTARY_PRIVATE_KEY);
const rpcUrl = getReportNotaryRpcUrl();
const workspaceEnvPath = fileURLToPath(new URL("../../.env", import.meta.url));

if (!privateKey) {
  console.error("Set REPORT_NOTARY_PRIVATE_KEY before deploying.");
  process.exit(1);
}

const account = privateKeyToAccount(privateKey);
const chainId = getReportNotaryChainId();
const chainName = getReportNotaryChainName();
const explorerBaseUrl = getReportNotaryExplorerBaseUrl();
const chain = {
  id: chainId,
  name: chainName,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "Explorer", url: explorerBaseUrl } }
};
const transport = http(rpcUrl);
const walletClient = createWalletClient({ account, chain, transport });
const publicClient = createPublicClient({ chain, transport });

console.log(`Deploying ChainLensReportNotary to ${chainName} (${chainId})`);
console.log(`Issuer: ${account.address}`);

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [account.address],
  account
});
console.log(`Deployment tx: ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`Contract: ${receipt.contractAddress}`);
console.log(`Explorer: ${explorerBaseUrl}/address/${receipt.contractAddress}`);
console.log("");
console.log("Add this to .env:");
console.log(`REPORT_NOTARY_CONTRACT_ADDRESS=${receipt.contractAddress}`);

try {
  const envPath = workspaceEnvPath;
  const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const next = /REPORT_NOTARY_CONTRACT_ADDRESS=/.test(env)
    ? env.replace(/REPORT_NOTARY_CONTRACT_ADDRESS=.*/, `REPORT_NOTARY_CONTRACT_ADDRESS=${receipt.contractAddress}`)
    : `${env.replace(/\s*$/, "")}\nREPORT_NOTARY_CONTRACT_ADDRESS=${receipt.contractAddress}\n`;
  writeFileSync(envPath, next.endsWith("\n") ? next : `${next}\n`);
  console.log("Updated .env with REPORT_NOTARY_CONTRACT_ADDRESS.");
} catch (error) {
  console.log(`Could not update .env automatically: ${error.message}`);
}

function normalizePrivateKey(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  const prefixed = key.startsWith("0x") ? key : `0x${key}`;
  return /^0x[a-fA-F0-9]{64}$/.test(prefixed) ? prefixed : null;
}
