export const SUPPORTED_CHAINS = [
  {
    id: "1",
    slug: "ethereum",
    dexscreenerId: "ethereum",
    coingeckoPlatformId: "ethereum",
    label: "Ethereum",
    shortLabel: "ETH"
  },
  {
    id: "56",
    slug: "bsc",
    dexscreenerId: "bsc",
    coingeckoPlatformId: "binance-smart-chain",
    label: "BNB Chain",
    shortLabel: "BSC"
  },
  {
    id: "8453",
    slug: "base",
    dexscreenerId: "base",
    coingeckoPlatformId: "base",
    label: "Base",
    shortLabel: "Base"
  }
];

export function getChain(chainId) {
  return SUPPORTED_CHAINS.find((chain) => chain.id === String(chainId));
}
