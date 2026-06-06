# ChainLens

ChainLens is a Web3 project risk investigation app. It accepts a project name, website, or contract evidence, builds a project-level profile, attaches token-level evidence, and separates project risk from a connected wallet's direct exposure.

## Quick Start

```bash
npm install
npm run dev
```

The client runs on `http://localhost:5173` and the API runs on `http://localhost:8787`.

## Environment

Create a local `.env` for server-only secrets:

```bash
OPENAI_BASE_URL=https://opencode.ai/zen/go/v1
OPENAI_API_KEY=replace_with_a_rotated_key
OPENAI_MODEL=glm-5.1
```

`OPENAI_API_KEY` is read only by the API server. Do not put it in client env vars, docs, demos, or committed files.

OpenAI-compatible credentials are used for synthesis only. ChainLens collects project evidence itself before the analyst step.

Optional search and repository credentials:

```bash
GITHUB_TOKEN=optional_public_repo_rate_limit_token
XAPI_API_KEY=optional_xapi_key
XAPI_SEARCH_URL=optional_full_xapi_search_endpoint
```

Without xAPI, ChainLens still fetches user-provided websites, GitHub links, and PDF whitepapers. `XAPI_*` is only used as an external web-search connector when both `XAPI_API_KEY` and `XAPI_SEARCH_URL` are configured.

## Vercel Deployment

This repo is configured for a single Vercel project: the Vite client builds to `client/dist`, and the Express API is exported through Vercel Functions under `/api/*`.

Import the Git repository in Vercel with the repository root as the project root. The checked-in `vercel.json` sets:

```text
Build Command: npm run build
Output Directory: client/dist
```

Add these server-side environment variables in Vercel Project Settings:

```bash
OPENAI_BASE_URL=https://opencode.ai/zen/go/v1
OPENAI_API_KEY=replace_with_a_rotated_key
OPENAI_MODEL=glm-5.1
OPENAI_TIMEOUT_MS=90000
```

Optional:

```bash
GITHUB_TOKEN=optional_public_repo_rate_limit_token
XAPI_API_KEY=optional_xapi_key
XAPI_SEARCH_URL=optional_full_xapi_search_endpoint
```

Do not create `VITE_*` copies of server credentials. In production, the client calls the API on the same origin, so `VITE_API_BASE` is usually unnecessary. If a real API key was ever shared outside your machine, rotate it before adding it to Vercel.

After importing the project, Git integration can create Preview Deployments for branches and Production Deployments for the production branch. To verify the Vercel build locally after the project is linked:

```bash
npx vercel pull --yes --environment=preview
npx vercel build --yes
```

## API

`GET /api/analyze` and `POST /api/analyze` run asset-level analysis:

```bash
curl "http://localhost:8787/api/analyze?chainId=1&address=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
```

`POST /api/project/analyze` runs project-level analysis:

```bash
curl -X POST "http://localhost:8787/api/project/analyze" \
  -H "content-type: application/json" \
  -d '{"chainId":"1","query":"Aave aave.com 0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9"}'
```

`POST /api/openai/project` runs the OpenAI-compatible project synthesis step:

```bash
curl -X POST "http://localhost:8787/api/openai/project" \
  -H "content-type: application/json" \
  -d '{"project":{"name":"Aave"},"tokenReports":[],"localFindings":[],"walletExposure":null}'
```

When `OPENAI_API_KEY` is not configured, the endpoint returns `openai.status = "not_configured"` and an empty findings list.

## Scope

The current workbench includes:

- Project-level identity, asset, governance, community, and data-quality findings
- Contract security and holder concentration signals from GoPlus
- Liquidity signals from GoPlus and DEXScreener, marked as third-party auxiliary evidence
- Contract-address project lookup from CoinGecko, used to infer homepage, repos, socials, and explorer links when the user only provides an address
- Verified contract metadata from Sourcify for non-token contracts, including contract name, compiler, deployment, proxy status, ABI summary, and basic role hints
- Scope classification for exchanges, custody addresses, bridges, routers, governance treasuries, multisigs, timelocks, and protocol infrastructure so ERC-20 holder/tax/liquidity scoring is skipped for the wrong contract type
- Project evidence ingestion for supplied websites, GitHub repositories or profiles, and PDF whitepapers; discovered EVM addresses from direct project evidence are fed back into chain analysis
- Optional xAPI search hook for broader public-surface discovery when configured
- OpenAI-compatible project synthesis through `OPENAI_*` server env vars
- Read-only EIP-1193 wallet exposure analysis for connected MetaMask/Rabby wallets
- Local wallet/RPC evidence from `eth_call` and `eth_getLogs` for ERC-20 `balanceOf`, `allowance`, `Transfer`, and `Approval`

## Wallet Exposure

The browser wallet module is read-only. It requests accounts, reads the active chain, and checks the current project contracts for:

- token balances
- current allowances
- unlimited approvals
- recent `Transfer` and `Approval` events
- chain mismatch between the wallet and the project report

The wallet exposure shape is:

```json
{
  "wallet": "0x...",
  "chainId": "1",
  "projectContracts": ["0x..."],
  "holdings": [],
  "allowances": [],
  "events": [],
  "findings": []
}
```

## Demo Addresses

- USDC: `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`
- UNI: `0x1f9840a85d5af5bf1d1762f925bdaddc4201f984`
- AAVE: `0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9`
- PEPE: `0x6982508145454ce325ddbe47a25d4ec3d2311933`
- Risk lab fixture: `0xfeed00000000000000000000000000000000feed`

The first four addresses use live data when APIs are available and fallback fixtures when an upstream source fails. The risk lab address is fixture-only so the high-risk path is stable during demos.

## Verification

```bash
npm run check
```

This runs syntax checks across the server source and a production Vite build for the client.
