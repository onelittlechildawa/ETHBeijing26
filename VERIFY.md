# ChainLens Verification

Last verified locally on `http://localhost:5173` and `http://localhost:8787`.

## Build

```bash
npm run check
```

Result:

- Server syntax check passed for every JavaScript file under `server/src`.
- Client production Vite build passed.

## API Smoke Tests

Validated:

- `GET /health` returns `{ "ok": true, "service": "chainlens-api" }`.
- `POST /api/openai/project` without `OPENAI_API_KEY` returns `openai.status = "not_configured"` and no findings.
- `POST /api/openai/project` with `OPENAI_MOCK_RESPONSE` normalizes a mocked OpenAI-compatible chat response into structured findings.
- `POST /api/openai/project` with configured `OPENAI_*` returned `openai.status = "ok"` and 5 structured findings in the latest local run.
- Address-only AAVE project input inferred `Aave`, `https://app.aave.com/`, GitHub, social, explorer, and DEX pair surfaces through CoinGecko Contract Search plus DEXScreener metadata.
- AAVE project input with OpenAI disabled no longer includes the old `Configure server-side OpenAI-compatible credentials...` finding text; project evidence is collected separately and OpenAI remains additive.
- User-provided website, GitHub, and PDF URLs are collected into `projectEvidence.artifacts`, summarized in the report, and passed into OpenAI-compatible synthesis.
- PDF whitepaper ingestion was validated against `https://bitcoin.org/bitcoin.pdf`; text and page count were extracted with `pdf-parse`.
- Direct GitHub repository input was validated against `https://github.com/Uniswap/v2-periphery`; when unauthenticated GitHub API returned 403, ChainLens fell back to GitHub HTML/raw README evidence instead of failing the report.
- Name-only input such as `Aave` returns GitHub search candidates as evidence without promoting candidate repository addresses into chain analysis.
- Known exchange/router infrastructure inputs such as `0xdef1c0ded9bec7f1a1670819833240f027b25eff` and `0x7a250d5630b4cf539739df2c5dacb4c659f2488d` are scope-classified with `tokenModel = "excluded"` so ERC-20 holder/tax/liquidity scoring is not applied.
- Governance treasury and bridge/router semantic inputs such as `0x25f2226b597e8f9514b3f68f00f494cf4f286491` and `0x1111111254eeb25477b68fb85ed929f73a960582` are also scope-classified with `tokenModel = "excluded"`, including weak token-like API responses with no supply, market, or holder evidence.
- Non-token infrastructure-style address `0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC` is classified as `non_token_or_unknown`; ERC-20 holder/liquidity/tax scoring is skipped, token summary returns `Token Model Not Applied`, and Sourcify identifies verified `contracts/Seaport.sol:Seaport` metadata with marketplace ABI hints.
- Chainlink oracle address `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419` is classified as an `Oracle contract`; ERC-20 scoring is skipped even when token-oriented APIs return partial metadata.
- OpenAI-compatible `findingReviews` can mark deterministic findings as `false_positive`; high-confidence false positives are moved to `suppressedFindings` and excluded from the deterministic project score.
- `POST /api/project/analyze` still returns deterministic project and token reports when OpenAI is absent or slow; OpenAI findings are additive, not required for the base report.
- Risk lab project analysis still returns the high-risk fixture path for demo stability.

Commands used:

```bash
curl "http://localhost:8787/health"
curl -X POST "http://localhost:8787/api/openai/project" \
  -H "content-type: application/json" \
  -d '{"project":{"name":"Aave"},"tokenReports":[],"localFindings":[],"walletExposure":null}'
curl -X POST "http://localhost:8787/api/project/analyze" \
  -H "content-type: application/json" \
  -d '{"chainId":"1","query":"Aave aave.com 0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9"}'
curl -X POST "http://localhost:8787/api/project/analyze" \
  -H "content-type: application/json" \
  -d '{"chainId":"1","query":"ChainLens Risk Lab 0xfeed00000000000000000000000000000000feed"}'
```

## Wallet Exposure Tests

Mocked EIP-1193 provider coverage:

- Wrong chain returns `chain_mismatch` and a medium wallet finding.
- No balance, allowance, or logs returns `No direct wallet exposure found`.
- Positive `balanceOf` returns a holding and a medium wallet finding.
- Max allowance returns a high-severity unlimited approval finding.
- `eth_getLogs` failure preserves balance/allowance evidence and adds an activity-unavailable finding.

## Browser Checks

Verified with the in-app browser:

- Desktop viewport `1280x720`: Risk lab project report renders, wallet panel is visible, no horizontal page overflow, no console errors.
- Mobile viewport `390x844`: Risk lab project report and wallet panel render, no horizontal page overflow, no console errors.
- Browser without MetaMask/Rabby shows wallet unavailable while project analysis remains usable.
- Frontend DOM does not expose secret-like `sk-...` strings or `OPENAI_API_KEY`.

## Demo Fallback Addresses

- USDC: `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`
- UNI: `0x1f9840a85d5af5bf1d1762f925bdaddc4201f984`
- AAVE: `0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9`
- PEPE: `0x6982508145454ce325ddbe47a25d4ec3d2311933`
- Risk lab fixture: `0xfeed00000000000000000000000000000000feed`
