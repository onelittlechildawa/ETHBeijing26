# ChainLens 🔍

**Don't trust. Verify — but make it actually possible for normal people.**

ChainLens is a tool that helps you check whether a Web3 project is what it claims to be. You don't need to know Solidity. You don't need to read smart contracts. You just give it a project name, a website, a whitepaper link, a GitHub URL, or a contract address — whatever you have — and it goes digging through public data to tell you what checks out and what doesn't.

It won't tell you "this is a scam" or "this is legit." That's your call. What it does is slow things down, pull apart the marketing pitch from the actual evidence, and lay it all out so you can decide for yourself.

## Why This Exists

A friend asked me to do this hackathon. I said I don't know anything about Web3. He said, good, me neither.

So we thought: instead of building another tool *for* the crypto world, let's build one for everyone standing *outside* it, squinting in. A small tool that lets you take a project's big promises and ask the boring, obvious questions that should have answers.

## What It Actually Does

You give ChainLens some clues about a project (any combination of these works):

- 🏷️ Project name (e.g. "Aave")
- 🌐 Website URL
- 📄 Whitepaper PDF link
- 💻 GitHub repo or org link
- 📝 Contract address

Then it goes and checks:

| Category | What it looks for |
|---|---|
| **Identity** | Does this project have a real website, active GitHub repos, social accounts? |
| **Contract Safety** | Are the contracts verified? Any red flags like hidden minting, transfer locks, honeypot patterns? |
| **Token Distribution** | Is ownership concentrated in a few wallets? |
| **Liquidity** | Is there real trading liquidity, or just numbers on a screen? |
| **Claims vs. Evidence** | Does the project say "audited" but have no audit report? Say "decentralized" but have an owner key? |
| **Your Wallet** | If you connect your wallet: do you have tokens from this project? Have you given it unlimited approvals? |

The result is a structured report with findings, risk flags, and links to the actual evidence.

### Bonus Features

- **Hot Projects List** — A daily-refreshed list of trending Ethereum/Uniswap tokens, each pre-checked by ChainLens
- **Report Notarization** — Optionally stamp your report's hash on Sepolia testnet so you can prove "I checked this project on this date and got these results"
- **Chinese / English** — Full bilingual UI; reports auto-translate when you switch languages

## Quick Start

```bash
npm install
npm run dev
```

That's it. The frontend opens at `http://localhost:5173`, the API at `http://localhost:8787`.

## Setting Up

### Required: AI Synthesis

ChainLens collects all the evidence itself — it scrapes sites, reads repos, pulls chain data. But to combine all those findings into a coherent report, it sends the collected evidence to an OpenAI-compatible LLM. Create a `.env` file in the project root:

```bash
OPENAI_BASE_URL=https://your-llm-provider.com/v1
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=your_model_name
```

### Required: Translation (for Chinese UI)

```bash
DEEPLX_API_URL=https://api.deeplx.org/your_key/translate
```

### Optional: Extra Data Sources

```bash
# Higher GitHub API rate limits
GITHUB_TOKEN=your_github_token

# Web search for broader evidence gathering
XAPI_API_KEY=your_xapi_key
XAPI_SEARCH_ACTION=web.search
XAPI_TWITTER_SEARCH_COUNT=20
```

### Optional: Hot Projects List

```bash
# For the daily-refresh cron job
CRON_SECRET=some_long_random_string
BLOB_READ_WRITE_TOKEN=vercel_blob_token
```

### Optional: Report Notarization (Sepolia)

If you want reports to be notarizable on-chain:

```bash
REPORT_NOTARY_CHAIN_ID=11155111
REPORT_NOTARY_CHAIN_NAME=Sepolia
REPORT_NOTARY_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
REPORT_NOTARY_PRIVATE_KEY=0x...   # testnet wallet only!
REPORT_NOTARY_CONTRACT_ADDRESS=0x...
REPORT_NOTARY_EXPLORER_BASE_URL=https://sepolia.etherscan.io
```

Then deploy the notary contract:

```bash
npm run notary:status --workspace server   # check if everything's ready
npm run deploy:notary --workspace server   # deploy the contract
npm run notary:smoke --workspace server    # run a test attestation
```

Only the report's hash goes on-chain. The actual report text stays with you.

Without xAPI, ChainLens still fetches user-provided websites, GitHub links, and PDF whitepapers. Set `XAPI_KEY` or `XAPI_API_KEY` to enable xAPI web search through `action.xapi.to` using `XAPI_SEARCH_ACTION` (defaults to `web.search`). The Community Resource Agent also uses xAPI Twitter/X search (`twitter.search_timeline`) and reads up to `XAPI_TWITTER_SEARCH_COUNT` posts. `XAPI_SEARCH_URL` is still supported for legacy xapi.to-compatible endpoints.

> ⚠️ **Never put real API keys in client-side code, docs, or committed files.** All secrets live in `.env` and are read server-side only.

## How It Works Under the Hood

```
┌──────────────┐     ┌──────────────────────────────────────────┐
│   Browser     │     │  Server                                  │
│              │     │                                          │
│  You type    │────▶│  1. Parse your input (name? URL? address?)│
│  a query     │     │  2. Fan out evidence collectors:          │
│              │     │     • Scrape project website              │
│              │     │     • Read GitHub repos                   │
│              │     │     • Fetch whitepaper PDF                │
│              │     │     • GoPlus contract security scan       │
│              │     │     • DEXScreener liquidity data          │
│              │     │     • CoinGecko project lookup            │
│              │     │     • Sourcify contract verification      │
│              │     │     • xAPI web search (if configured)     │
│              │     │  3. Classify contract type (token? bridge?│
│              │     │     exchange? multisig? governance?)      │
│              │     │  4. Send collected evidence to LLM for    │
│              │     │     synthesis into a structured report    │
│  Get report  │◀────│  5. Return report with findings + scores  │
│              │     │                                          │
│  (Optional)  │     │                                          │
│  Connect     │────▶│  6. Read-only wallet check:              │
│  wallet      │     │     balances, approvals, recent events   │
└──────────────┘     └──────────────────────────────────────────┘
```

## Project Structure

```
chainlens/
├── client/          # Vite + vanilla JS frontend
│   └── src/
│       ├── main.js      # UI logic, report rendering
│       ├── styles.css   # All styling
│       ├── wallet.js    # Read-only wallet exposure module
│       └── api.js       # API client
├── server/          # Express API backend
│   └── src/
│       ├── app.js               # Express routes
│       └── services/
│           ├── projectAnalyzer.js   # Core analysis orchestrator
│           ├── projectEvidence.js   # Evidence collection (sites, repos, PDFs)
│           ├── agentOrchestrator.js # Multi-agent evidence pipeline
│           ├── scoring.js           # Risk scoring engine
│           ├── openai.js            # LLM synthesis
│           ├── goplus.js            # GoPlus security API
│           ├── dexscreener.js       # DEXScreener liquidity
│           ├── contractSearch.js    # CoinGecko + Sourcify lookups
│           ├── hotProjects.js       # Trending projects logic
│           ├── reportNotary.js      # Sepolia notarization
│           ├── translate.js         # DeepLX translation
│           └── ...
├── contracts/       # Solidity: report notary contract
├── api/             # Vercel serverless function entry
└── vercel.json      # Deployment config
```

## API Reference

| Endpoint | Method | What it does |
|---|---|---|
| `/api/analyze` | GET/POST | Analyze a single contract address |
| `/api/project/analyze` | POST | Full project analysis (the main one) |
| `/api/project/attest` | POST | Notarize a report hash on Sepolia |
| `/api/project/verify` | POST | Check if a report hash is already notarized |
| `/api/hot-projects` | GET | Get the latest trending project list |
| `/api/cron/hot-projects` | GET | Refresh trending list (needs `CRON_SECRET`) |
| `/api/openai/project` | POST | Run just the LLM synthesis step |

### Example: Analyze a Project

```bash
curl -X POST "http://localhost:8787/api/project/analyze" \
  -H "content-type: application/json" \
  -d '{"chainId":"1","query":"Aave aave.com 0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9"}'
```

## Deploying to Vercel

1. Import your Git repo in Vercel
2. It auto-detects the build settings from `vercel.json`:
   - Build Command: `npm run build`
   - Output Directory: `client/dist`
3. Add your environment variables in Vercel Project Settings (same as the `.env` above)
4. Push to deploy

```bash
# To test the Vercel build locally:
npx vercel pull --yes --environment=preview
npx vercel build --yes
```

## Wallet Exposure

The browser wallet module is read-only. It requests accounts, reads the active chain, and checks current project contracts for:

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

Try these to see it in action:

| Token | Address |
|---|---|
| USDC | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` |
| UNI | `0x1f9840a85d5af5bf1d1762f925bdaddc4201f984` |
| AAVE | `0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9` |
| PEPE | `0x6982508145454ce325ddbe47a25d4ec3d2311933` |
| Risk Test | `0xfeed00000000000000000000000000000000feed` |

The first four use live data when APIs are up, and fall back to saved fixtures when they're not. The risk test address always uses fixtures so the "high risk" UI path stays stable for demos.

## Verification

```bash
npm run check
```

Runs syntax checks on the server code and a production build of the client.

---

# ChainLens（说人话版）🔍

**别信，自己查 —— 而且让普通人也能查得动。**

ChainLens 是一个帮你检查 Web3 项目靠不靠谱的工具。你不需要懂 Solidity，不需要看合约代码。你只要把项目名、官网、白皮书链接、GitHub 地址或合约地址丢进去——有什么给什么——它就会去翻公开数据，告诉你哪些东西查得到、哪些查不到。

它不会替你判"真"或"假"。它只是把节奏慢下来，把营销话术和实际证据分开摆，让你自己拿主意。

## 为什么做这个

朋友来叫我打黑客松。我说我完全不懂 Web3。他说，好，我也不懂。

然后我想了想：与其给币圈再造一个工具，不如给站在门外往里看的人做一个。一个小工具，让你拿着项目的大承诺，问出那些本来就该有答案的笨问题。

## 它到底干了啥

你给 ChainLens 一些项目线索（以下任意组合都行）：

- 🏷️ 项目名（比如"Aave"）
- 🌐 官网地址
- 📄 白皮书 PDF 链接
- 💻 GitHub 仓库或组织链接
- 📝 合约地址

然后它会去查：

| 类别 | 查什么 |
|---|---|
| **身份** | 有没有真实的官网、活跃的 GitHub、社交账号？ |
| **合约安全** | 合约验证了吗？有没有隐藏铸造、转账锁定、貔貅盘之类的红旗？ |
| **代币分布** | 筹码是不是集中在少数几个钱包手里？ |
| **流动性** | 有没有真实的交易流动性，还是只是看着有数字？ |
| **说到 vs. 做到** | 项目说"已审计"但找不到审计报告？说"去中心化"但合约里有 owner 密钥？ |
| **你的钱包** | 如果连了钱包：你有没有这个项目的代币？有没有给过它无限授权？ |

最终出一份结构化的报告，有发现、有风险标记、有证据链接。

### 附加功能

- **热门项目列表** — 每天自动刷新的以太坊/Uniswap 热门代币，每个都预先跑过 ChainLens 检查
- **报告公证** — 可以把报告的哈希戳到 Sepolia 测试网上，证明"我在这个时间查了这个项目，得到了这些结果"
- **中英双语** — 完整的双语界面，切换语言时报告自动翻译

## 怎么跑起来

```bash
npm install
npm run dev
```

搞定。前端在 `http://localhost:5173`，后端在 `http://localhost:8787`。

## 配置说明

### 必填：AI 综合分析

ChainLens 自己负责收集所有证据——爬网站、读仓库、拉链上数据。但要把这些证据合成一份像样的报告，它需要一个 OpenAI 兼容的大模型。在项目根目录建一个 `.env` 文件：

```bash
OPENAI_BASE_URL=https://你的大模型服务/v1
OPENAI_API_KEY=你的密钥
OPENAI_MODEL=模型名
```

### 必填：翻译（中文界面用）

```bash
DEEPLX_API_URL=https://api.deeplx.org/你的key/translate
```

### 选填：更多数据源

```bash
# 提高 GitHub API 调用频率上限
GITHUB_TOKEN=你的github_token

# 网络搜索，收集更多证据
XAPI_API_KEY=你的xapi_key
XAPI_SEARCH_ACTION=web.search
XAPI_TWITTER_SEARCH_COUNT=20
```

### 选填：热门项目列表

```bash
CRON_SECRET=一个长随机字符串
BLOB_READ_WRITE_TOKEN=vercel_blob_token
```

### 选填：报告公证（Sepolia 测试网）

```bash
REPORT_NOTARY_CHAIN_ID=11155111
REPORT_NOTARY_CHAIN_NAME=Sepolia
REPORT_NOTARY_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
REPORT_NOTARY_PRIVATE_KEY=0x...   # 只用测试网钱包！
REPORT_NOTARY_CONTRACT_ADDRESS=0x...
REPORT_NOTARY_EXPLORER_BASE_URL=https://sepolia.etherscan.io
```

部署公证合约：

```bash
npm run notary:status --workspace server   # 检查准备情况
npm run deploy:notary --workspace server   # 部署合约
npm run notary:smoke --workspace server    # 跑个测试
```

只有报告的哈希值上链，报告正文不上链。

即使没有 xAPI，ChainLens 仍会抓取用户提供的网站、GitHub 链接和 PDF 白皮书。设置 `XAPI_KEY` 或 `XAPI_API_KEY` 后，后端会通过 `action.xapi.to` 使用 `XAPI_SEARCH_ACTION`（默认 `web.search`）做外部网页搜索；社区资源 Agent 还会通过 xAPI 的 `twitter.search_timeline` 在 X 上读取最多 `XAPI_TWITTER_SEARCH_COUNT` 条相关讨论。`XAPI_SEARCH_URL` 仍兼容旧版 xapi.to 端点。

> ⚠️ **绝对不要把真实密钥放到客户端代码、文档或提交的文件里。** 所有密钥只写在 `.env` 里，只在服务端读取。

## 部署到 Vercel

1. 在 Vercel 里导入你的 Git 仓库
2. `vercel.json` 已经配好了构建设置
3. 在项目设置里添加环境变量（和上面的 `.env` 一样）
4. Push 就自动部署了

## 钱包敞口

浏览器钱包模块只读运行。它请求账户、读取当前链，并检查当前项目合约的以下内容：

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

## 试玩地址

| 代币 | 地址 |
|---|---|
| USDC | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` |
| UNI | `0x1f9840a85d5af5bf1d1762f925bdaddc4201f984` |
| AAVE | `0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9` |
| PEPE | `0x6982508145454ce325ddbe47a25d4ec3d2311933` |
| 风险测试 | `0xfeed00000000000000000000000000000000feed` |

前四个在 API 正常时用实时数据，API 挂了用本地备份数据。风险测试地址永远用备份数据，这样演示"高风险"的界面效果时不会抽风。

## 检查代码

```bash
npm run check
```

跑服务端的语法检查和客户端的生产构建。
