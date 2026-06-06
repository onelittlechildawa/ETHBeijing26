import "../src/services/env.js";
import { readFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import solc from "solc";
import { getReportNotaryChainId, getReportNotaryChainName, getReportNotaryExplorerBaseUrl } from "../src/services/reportCredential.js";

const privateKey = normalizePrivateKey(process.env.REPORT_NOTARY_PRIVATE_KEY);
const rpcUrl = String(process.env.REPORT_NOTARY_RPC_URL || "").trim();

if (!privateKey || !rpcUrl) {
  console.error("Set REPORT_NOTARY_PRIVATE_KEY and REPORT_NOTARY_RPC_URL before deploying.");
  process.exit(1);
}

const source = await readFile(new URL("../../contracts/ChainLensReportNotary.sol", import.meta.url), "utf8");
const input = {
  language: "Solidity",
  sources: {
    "ChainLensReportNotary.sol": { content: source }
  },
  settings: {
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"]
      }
    }
  }
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((error) => error.severity === "error");
if (errors.length) {
  errors.forEach((error) => console.error(error.formattedMessage || error.message));
  process.exit(1);
}

const contract = output.contracts["ChainLensReportNotary.sol"].ChainLensReportNotary;
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
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
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

function normalizePrivateKey(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  const prefixed = key.startsWith("0x") ? key : `0x${key}`;
  return /^0x[a-fA-F0-9]{64}$/.test(prefixed) ? prefixed : null;
}
