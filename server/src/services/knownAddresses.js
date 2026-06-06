const BURN_ADDRESS_PATTERNS = [
  /^0x0{40}$/i,
  /^0x0{36}dead$/i,
  /^0x0{39}1$/i
];

const KNOWN_LABELS = new Map([
  ["0x000000000000000000000000000000000000dead", "Burn address"],
  ["0x0000000000000000000000000000000000000000", "Zero address"],
  ["0x0000000000000000000000000000000000000001", "Burn-like address"],
  ["0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f", "Uniswap V2 Factory"],
  ["0x000000000022d473030f116ddee9f6b43ac78ba3", "Uniswap Permit2"],
  ["0x1111111254eeb25477b68fb85ed929f73a960582", "1inch Router"],
  ["0xdef1c0ded9bec7f1a1670819833240f027b25eff", "0x Exchange Proxy"]
]);

export function labelAddress(address) {
  const normalized = String(address || "").toLowerCase();
  if (!normalized) return null;
  if (KNOWN_LABELS.has(normalized)) return KNOWN_LABELS.get(normalized);
  if (BURN_ADDRESS_PATTERNS.some((pattern) => pattern.test(normalized))) return "Burn address";
  return null;
}

export function isBurnAddress(address) {
  const normalized = String(address || "").toLowerCase();
  return BURN_ADDRESS_PATTERNS.some((pattern) => pattern.test(normalized));
}

