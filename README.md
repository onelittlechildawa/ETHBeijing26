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
XAPI_SEARCH_ACTION=web.search
```

Without xAPI, ChainLens still fetches user-provided websites, GitHub links, and PDF whitepapers. Set `XAPI_KEY` or `XAPI_API_KEY` to enable xAPI web search through `action.xapi.to` using `XAPI_SEARCH_ACTION` (defaults to `web.search`). `XAPI_SEARCH_URL` is still supported for legacy xapi.to-compatible endpoints.

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
XAPI_SEARCH_ACTION=web.search
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

---

# ChainLens（中文）

ChainLens 是一个 Web3 项目风险调查应用。它接收项目名称、网站或合约证据，构建项目级别的画像，附加代币级别的证据，并将项目风险与连接钱包的直接敞口区分开来。

## 快速开始

```bash
npm install
npm run dev
```

客户端运行在 `http://localhost:5173`，API 运行在 `http://localhost:8787`。

## 环境变量

创建本地 `.env` 文件存放服务端密钥：

```bash
OPENAI_BASE_URL=https://opencode.ai/zen/go/v1
OPENAI_API_KEY=replace_with_a_rotated_key
OPENAI_MODEL=glm-5.1
```

`OPENAI_API_KEY` 仅供 API 服务端读取，不要放入客户端环境变量、文档、演示或已提交的文件中。

OpenAI 兼容凭证仅用于综合评测。ChainLens 在分析步骤之前会自行收集项目证据。

可选搜索和仓库凭证：

```bash
GITHUB_TOKEN=optional_public_repo_rate_limit_token
XAPI_API_KEY=optional_xapi_key
XAPI_SEARCH_ACTION=web.search
```

即使没有 xAPI，ChainLens 仍会抓取用户提供的网站、GitHub 链接和 PDF 白皮书。设置 `XAPI_KEY` 或 `XAPI_API_KEY` 后，后端会默认通过 `action.xapi.to` 的 `web.search` 做外部网页搜索；`XAPI_SEARCH_URL` 仅用于兼容旧版 xapi.to 端点。

## Vercel 部署

本仓库配置为单个 Vercel 项目：Vite 客户端构建输出到 `client/dist`，Express API 通过 `/api/*` 下的 Vercel Functions 导出。

在 Vercel 中导入 Git 仓库，将仓库根目录设为项目根目录。已检入的 `vercel.json` 设置如下：

```text
Build Command: npm run build
Output Directory: client/dist
```

在 Vercel 项目设置中添加以下服务端环境变量：

```bash
OPENAI_BASE_URL=https://opencode.ai/zen/go/v1
OPENAI_API_KEY=replace_with_a_rotated_key
OPENAI_MODEL=glm-5.1
OPENAI_TIMEOUT_MS=90000
```

可选：

```bash
GITHUB_TOKEN=optional_public_repo_rate_limit_token
XAPI_API_KEY=optional_xapi_key
XAPI_SEARCH_ACTION=web.search
```

不要为服务端凭证创建 `VITE_*` 副本。生产环境中，客户端通过同源调用 API，因此通常不需要 `VITE_API_BASE`。如果真实的 API 密钥曾在你的机器之外泄露，请在添加到 Vercel 之前轮换密钥。

导入项目后，Git 集成可以为分支创建预览部署，为生产分支创建生产部署。项目关联后在本地验证 Vercel 构建：

```bash
npx vercel pull --yes --environment=preview
npx vercel build --yes
```

## API

`GET /api/analyze` 和 `POST /api/analyze` 运行资产级别分析：

```bash
curl "http://localhost:8787/api/analyze?chainId=1&address=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
```

`POST /api/project/analyze` 运行项目级别分析：

```bash
curl -X POST "http://localhost:8787/api/project/analyze" \
  -H "content-type: application/json" \
  -d '{"chainId":"1","query":"Aave aave.com 0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9"}'
```

`POST /api/openai/project` 运行 OpenAI 兼容的项目综合评测步骤：

```bash
curl -X POST "http://localhost:8787/api/openai/project" \
  -H "content-type: application/json" \
  -d '{"project":{"name":"Aave"},"tokenReports":[],"localFindings":[],"walletExposure":null}'
```

当 `OPENAI_API_KEY` 未配置时，该端点返回 `openai.status = "not_configured"` 和空的发现列表。

## 功能范围

当前工作台包含：

- 项目级别的身份、资产、治理、社区和数据质量发现
- 来自 GoPlus 的合约安全性和持币集中度信号
- 来自 GoPlus 和 DEXScreener 的流动性信号，标记为第三方辅助证据
- 来自 CoinGecko 的合约地址项目查询，用于在用户仅提供地址时推断主页、仓库、社交链接和浏览器链接
- 来自 Sourcify 的非代币合约已验证合约元数据，包括合约名称、编译器、部署、代理状态、ABI 摘要和基本角色提示
- 对交易所、托管地址、跨链桥、路由器、治理金库、多签、时间锁和协议基础设施的范围分类，以便对错误的合约类型跳过 ERC-20 持币/税务/流动性评分
- 对提供的网站、GitHub 仓库或个人资料以及 PDF 白皮书进行项目证据采集；从直接项目证据中发现的 EVM 地址会被反馈到链上分析中
- 可选的 xAPI 搜索钩子，用于在配置后进行更广泛的公开信息发现
- 通过 `OPENAI_*` 服务端环境变量实现的 OpenAI 兼容项目综合评测
- 对连接的 MetaMask/Rabby 钱包进行只读 EIP-1193 钱包敞口分析
- 通过 `eth_call` 和 `eth_getLogs` 获取 ERC-20 `balanceOf`、`allowance`、`Transfer` 和 `Approval` 的本地钱包/RPC 证据

## 钱包敞口

浏览器钱包模块为只读模式。它请求账户、读取当前链，并检查当前项目合约的以下内容：

- 代币余额
- 当前授权额度
- 无限授权
- 最近的 `Transfer` 和 `Approval` 事件
- 钱包与项目报告之间的链不匹配

钱包敞口的数据结构：

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

## 演示地址

- USDC: `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`
- UNI: `0x1f9840a85d5af5bf1d1762f925bdaddc4201f984`
- AAVE: `0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9`
- PEPE: `0x6982508145454ce325ddbe47a25d4ec3d2311933`
- 风险测试固定地址: `0xfeed00000000000000000000000000000000feed`

前四个地址在 API 可用时使用实时数据，上游数据源失败时使用固定回退数据。风险测试地址仅使用固定数据，以便演示时高风险路径保持稳定。

## 验证

```bash
npm run check
```

此命令对服务端源码进行语法检查，并对客户端执行生产环境 Vite 构建。
