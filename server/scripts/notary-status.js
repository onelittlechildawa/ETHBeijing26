import "../src/services/env.js";
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { REPORT_NOTARY_ABI } from "../src/services/reportNotary.js";
import {
  getReportNotaryChainId,
  getReportNotaryChainName,
  getReportNotaryExplorerBaseUrl,
  getReportNotaryRpcUrl
} from "../src/services/reportCredential.js";

const chainId = getReportNotaryChainId();
const chainName = getReportNotaryChainName();
const rpcUrl = getReportNotaryRpcUrl();
const explorerBaseUrl = getReportNotaryExplorerBaseUrl();
const privateKey = normalizePrivateKey(process.env.REPORT_NOTARY_PRIVATE_KEY);
const contractAddress = normalizeAddress(process.env.REPORT_NOTARY_CONTRACT_ADDRESS);

const chain = {
  id: chainId,
  name: chainName,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "Explorer", url: explorerBaseUrl } }
};
const client = createPublicClient({ chain, transport: http(rpcUrl) });

console.log(`Network: ${chainName} (${chainId})`);
console.log(`RPC: ${rpcUrl}`);

const blockNumber = await client.getBlockNumber();
console.log(`Latest block: ${blockNumber}`);

if (!privateKey) {
  console.log("Issuer key: missing REPORT_NOTARY_PRIVATE_KEY");
} else {
  const account = privateKeyToAccount(privateKey);
  const balance = await client.getBalance({ address: account.address });
  console.log(`Issuer: ${account.address}`);
  console.log(`Issuer balance: ${formatEther(balance)} ETH`);
}

if (!contractAddress) {
  console.log("Contract: missing REPORT_NOTARY_CONTRACT_ADDRESS");
} else {
  console.log(`Contract: ${contractAddress}`);
  const issuer = await client.readContract({
    address: contractAddress,
    abi: REPORT_NOTARY_ABI,
    functionName: "issuer"
  });
  console.log(`Contract issuer: ${issuer}`);
}

function normalizePrivateKey(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  const prefixed = key.startsWith("0x") ? key : `0x${key}`;
  return /^0x[a-fA-F0-9]{64}$/.test(prefixed) ? prefixed : null;
}

function normalizeAddress(value) {
  const address = String(value || "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address : null;
}
