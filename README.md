# ChainLens

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fonelittlechildawa%2FETHBeijing26)

> 朋友来找我打这个比赛的时候，我说我根本不知道什么是 Web3，他说好，我也不知道。
> 
> When a friend asked me to join this hackathon, I said I had no idea what Web3 even was. He said, good, me neither.
> 
>然后我想了想，年轻的我一直自由散漫，选一些落后于潮流的方向，一直 not believe in somETHing，那我能做什么呢？
>
>Then I thought about it. The younger me has always been loose and wandering, choosing directions that felt a little behind the trend, always not believe in somETHing. So what can I do?
>
>这样吧，圈外人来做些圈外人的东西。
>
>Well, let's build something for people outside the circle.


## 项目简介 / Introduction

ChainLens 是一个面向普通人的 Web3 项目风险分析工具。

ChainLens is a Web3 project risk analysis tool for people outside the crypto circle.

你可以输入项目名、官网、白皮书、GitHub、合约地址，ChainLens 会把链上数据、公开资料、xAPI 搜索结果、AI 复核、多 agent 审阅和钱包暴露检查组织成一份可读报告。

Give it a project name, website, whitepaper, GitHub link, or contract address. ChainLens organizes on-chain data, public evidence, xAPI search results, AI review, multi-agent review, and wallet exposure checks into one readable report.

我们想把 Web3 里那些散落在不同地方的证据重新排好：

We want to reorder the evidence scattered across Web3 into a clearer shape:

- 项目方说了什么 / what the project claims
- 哪些说法能找到证据 / which claims can be supported by evidence
- 哪些地址真的适合按 token 模型分析 / which addresses should actually be analyzed as tokens
- 哪些权限、持仓、流动性、社区信号需要注意 / which permissions, holder, liquidity, and community signals need attention
- 哪些资料还缺失 / which materials are still missing
- 用户下一步应该人工复核什么 / what the user should manually review next

---

## 为什么做 / Why ChainLens

Web3 项目经常把信任拆散在很多地方：网站、白皮书、合约、DEX pair、GitHub、社区讨论、钱包授权、审计链接、治理页面、浏览器页面，有时甚至什么都没有。

Web3 projects often scatter trust across many surfaces: websites, whitepapers, contracts, DEX pairs, GitHub repositories, community discussions, wallet approvals, audit links, governance pages, explorer pages, and sometimes nothing at all.

对圈内人来说，这些信息只是麻烦；对圈外人来说，它们几乎不可读。ChainLens 把项目尽调当成一个证据组织问题，而不是一个神秘的链上黑话问题。

For insiders, these signals are annoying but familiar. For people outside the circle, they are almost unreadable. ChainLens treats due diligence as an evidence organization problem, not as a pile of insider jargon.

---

## 多 Agent / Multi-Agent

ChainLens 的核心是一组分工明确的 agent。它不是只给一个黑盒分数，而是把每个 agent 看到的证据、风险和缺口展示出来。

ChainLens is built around a crew of focused agents. Instead of returning only one opaque score, it shows the evidence, risks, and gaps each agent finds.

### Research Agent

Research Agent 负责找资料和判断项目身份是否清楚：

The Research Agent collects public evidence and checks whether the project identity is clear:

- 官网、文档、白皮书和 PDF / websites, docs, whitepapers, and PDFs
- GitHub 仓库和候选仓库 / GitHub repositories and candidates
- 审计、治理页面和社交入口 / audit, governance, and social surfaces
- 公开搜索和 xAPI 搜索结果 / public search and xAPI search results
- 从资料里发现的合约地址 / contract addresses discovered from evidence

### Community Resource Agent

Community Resource Agent 通过 xAPI 等外部动作查看公开讨论：

The Community Resource Agent uses xAPI and other external actions to review public discussion:

- rug、scam、exploit、phishing、drainer 等风险语言 / rug, scam, exploit, phishing, drainer, and similar risk language
- 提现问题、被盗、黑名单等异常讨论 / withdrawal issues, theft, blacklist, and other abnormal discussions
- 空投、预售、百倍、稳赚等强营销信号 / aggressive promotion such as airdrops, presales, 100x, or guaranteed returns
- 主网、审计、治理、合作、版本发布等交付信号 / delivery signals such as mainnet, audits, governance, partnerships, and releases

### Open Source Review Agent

Open Source Review Agent 关注开源、Sourcify、ABI、代理和权限函数：

The Open Source Review Agent reviews transparency around source code, Sourcify metadata, ABI, proxy setup, and permission-oriented functions:

- 合约源码是否可验证 / whether source code is verifiable
- 是否有代理和实现合约信息 / whether proxy and implementation metadata exists
- 是否出现 owner、admin、upgrade、pause、blacklist、whitelist、mint 等敏感函数 / whether sensitive functions such as owner, admin, upgrade, pause, blacklist, whitelist, or mint appear
- GitHub 仓库是否仍然活跃 / whether GitHub repositories are still active
- 是否发现审计入口 / whether audit surfaces are found

### On-Chain Risk Agent

On-Chain Risk Agent 关注 GoPlus、DEXScreener、持仓、LP 和合约风险：

The On-Chain Risk Agent reviews deterministic on-chain and market signals from GoPlus, DEXScreener, holder data, LP data, and contract metadata:

- honeypot、mint、blacklist、whitelist、owner、proxy、selfdestruct、tax 等合约信号 / honeypot, mint, blacklist, whitelist, owner, proxy, selfdestruct, tax, and related contract signals
- holder 数量和 Top holder 集中度 / holder count and top-holder concentration
- LP 持有人集中度和锁定 / 销毁线索 / LP holder concentration and lock or burn evidence
- 流动性、交易量、FDV、价格和 pair 信息 / liquidity, volume, FDV, price, and pair metadata
- 地址是否真的适合按 ERC-20 token 模型评分 / whether an address should actually be scored as an ERC-20 token

### Synthesis Agent

Synthesis Agent 把证据和风险整理成普通人能读懂的报告。

The Synthesis Agent turns evidence and risk signals into a report that non-experts can read.

### Recommendation Agent

Recommendation Agent 给出下一步行动建议：

The Recommendation Agent suggests next actions:

- 交互前必须先看的风险 / risks to review before interacting
- 需要项目方补充的证据 / evidence the project should provide
- 需要降低的钱包暴露 / wallet exposure to reduce
- 需要人工复核的合约和项目 claim / contracts and project claims that need manual review

---

## xAPI / xAPI

xAPI 在 ChainLens 里承担的是 agent 的外部行动层。

xAPI acts as the external action layer for ChainLens agents.

当配置了 `XAPI_KEY` 或 `XAPI_API_KEY` 后，ChainLens 可以通过 xAPI action 获取外部搜索和社区资料：

When `XAPI_KEY` or `XAPI_API_KEY` is configured, ChainLens can use xAPI actions to collect external search and community evidence:

- `web.search` 用来发现官网、文档、审计、治理、仓库等公开 surface / `web.search` discovers websites, docs, audits, governance pages, repositories, and other public surfaces
- `twitter.search_timeline` 用来辅助社区风险和交付信号判断 / `twitter.search_timeline` helps review community risk and delivery signals

这让 agent 不只是坐在本地数据上推理，而是能把当前外部世界的证据拉回来，再把来源、状态和缺口一起写进报告。

This means agents do not only reason over local data. They can pull current external evidence back into the report, together with source status and evidence gaps.

如果 xAPI 没有配置，系统也会继续运行，并把 xAPI source 标记为 disabled。

If xAPI is not configured, the system still runs and marks the xAPI source as disabled.

---

## 检查内容 / What ChainLens Checks

### 项目证据 / Project Evidence

ChainLens 接受比较松散的输入，并尝试绑定到真实项目 surface：

ChainLens accepts loose input and tries to bind it to real project surfaces:

- 项目名称 / project name
- 官网 / website
- 白皮书或 PDF / whitepaper or PDF
- GitHub 链接 / GitHub link
- docs / docs
- 社交链接 / social links
- 合约地址 / contract address
- DEX pair metadata / DEX pair metadata
- CoinGecko 和搜索得到的 metadata / CoinGecko and search-derived metadata

### 合约和 Token 风险 / Contract and Token Risk

ChainLens 会检查 ERC-20 风格 token 的关键风险：

For ERC-20 style token analysis, ChainLens checks:

- 合约是否开源 / whether the contract is open source
- 是否疑似 honeypot / whether it appears to be a honeypot
- mint、pause、blacklist、whitelist 等权限 / mint, pause, blacklist, whitelist permissions
- owner 控制和 hidden owner 信号 / owner control and hidden owner signals
- proxy 合约风险 / proxy contract risk
- selfdestruct、owner 修改余额等危险能力 / selfdestruct and owner balance modification flags
- 买卖税 / buy and sell tax
- holder 数量 / holder count
- Top holder 集中度 / top-holder concentration
- LP 持有人集中度和锁定 / 销毁证据 / LP holder concentration and lock or burn evidence
- 流动性和市场数据 / liquidity and market data

### 范围识别 / Scope Classification

不是每个地址都是 token。ChainLens 会识别一些基础设施类地址，避免把它们错误地按 ERC-20 token 打分。

Not every address is a token. ChainLens classifies infrastructure-style addresses so they are not wrongly scored as ERC-20 tokens.

包括：

Examples include:

- router / routers
- exchange / exchanges
- bridge / bridges
- custody wallet / custody wallets
- governance treasury / governance treasuries
- multisig / multisigs
- timelock / timelocks
- oracle contract / oracle contracts
- marketplace 等非 token 基础设施 / marketplaces and other non-token infrastructure

很多风险工具会因为 API 返回了部分 token-like 字段而误判。ChainLens 会在不适用时返回 `Token Model Not Applied`。

Many risk tools misread partial token-like API responses. ChainLens returns `Token Model Not Applied` when token scoring should not be used.

### 钱包暴露 / Wallet Exposure

在浏览器里，ChainLens 可以通过 EIP-1193 钱包 provider 检查用户自己的直接暴露：

In the browser, ChainLens can use an EIP-1193 wallet provider to check direct user exposure:

- 当前 token 持仓 / current token balance
- token 授权 / token approvals
- 无限授权风险 / unlimited allowance risk
- 最近 transfer / approval logs / recent transfer and approval logs
- 钱包网络不匹配 / wrong-chain state
- 没有钱包插件或没有项目合约时的状态 / no-provider or no-project-contract state

项目风险和钱包风险会分开展示。

Project risk and wallet-specific exposure are shown separately.

### 报告凭证和可选 Notary / Report Credential and Optional Notary

每份项目报告都会生成一个可验证凭证：

Each project report receives a verifiable credential:

- stable JSON canonicalization / stable JSON canonicalization
- `keccak256` report hash / `keccak256` report hash
- 可选 issuer signature / optional issuer signature
- 可选链上 attestation / optional on-chain attestation
- report 或 report hash verification endpoint / verification endpoint for report or report hash

---

## 产品流程 / Product Flow

1. 用户输入项目名、官网、GitHub、白皮书或合约地址。/ The user enters a project name, website, GitHub, whitepaper, or contract address.
2. ChainLens 归一化输入并提取候选 surface。/ ChainLens normalizes the input and extracts candidate surfaces.
3. ChainLens 从用户输入、公开网页、GitHub、PDF、xAPI search 和 metadata API 收集项目证据。/ ChainLens collects project evidence from user input, public pages, GitHub, PDFs, xAPI search, and metadata APIs.
4. 合约目标通过 GoPlus、DEXScreener、CoinGecko、Sourcify 和本地规则分析。/ Contract targets are analyzed with GoPlus, DEXScreener, CoinGecko, Sourcify, and local rules.
5. 先生成确定性 finding。/ Deterministic findings are created first.
6. OpenAI-compatible review 可以补充上下文、复核 finding、压制高置信 false positive。/ OpenAI-compatible review can add context, review findings, and suppress high-confidence false positives.
7. 多 agent 继续审阅 research、community、open-source、on-chain、synthesis 和 recommendation。/ The multi-agent orchestrator reviews research, community, open-source, on-chain, synthesis, and recommendation layers.
8. 最终返回报告、风险维度、建议、来源、suppressed findings、凭证和可选钱包暴露。/ ChainLens returns a report with dimensions, recommendations, sources, suppressed findings, credentials, and optional wallet exposure.

---

## 技术栈 / Tech Stack

- Frontend: Vite, Vanilla JavaScript, Lucide Icons
- Backend: Node.js, Express
- Web3: Viem, GoPlus, DEXScreener, CoinGecko, Sourcify
- Agent / AI: OpenAI-compatible Chat Completions API
- External Actions: xAPI action execution
- Documents: PDF parsing for whitepaper ingestion
- Deploy: Vercel, Vercel Blob

---

## API 路由 / Main API Routes

```text
GET  /health
GET  /api/chains
GET  /api/analyze
POST /api/analyze
POST /api/project/analyze
POST /api/project/analyze/stream
POST /api/project/attest
POST /api/project/verify
GET  /api/hot-projects
GET  /api/cron/hot-projects
POST /api/openai/project
```

---

## 本地开发 / Local Development

安装依赖 / Install dependencies:

```bash
npm install
```

同时启动 client 和 server / Run client and server together:

```bash
npm run dev
```

默认本地地址 / Default local URLs:

```text
Client: http://localhost:5173
Server: http://localhost:8787
```

运行检查 / Run checks:

```bash
npm run check
```

生成 hot projects / Generate hot projects:

```bash
npm run generate:hot-projects --workspace server
```

运行 notary smoke test / Run notary smoke test:

```bash
npm run notary:smoke --workspace server
```

---

## Demo 输入 / Demo Inputs

```text
USDC: 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
UNI:  0x1f9840a85d5af5bf1d1762f925bdaddc4201f984
AAVE: 0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9
PEPE: 0x6982508145454ce325ddbe47a25d4ec3d2311933
Risk lab fixture: 0xfeed00000000000000000000000000000000feed
```

示例请求 / Example API call:

```bash
curl -X POST "http://localhost:8787/api/project/analyze" \
  -H "content-type: application/json" \
  -d '{"chainId":"1","query":"Aave aave.com 0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9"}'
```

---

## 验证 / Verification

当前本地验证记录在 [`VERIFY.md`](./VERIFY.md)。

Current local verification notes are in [`VERIFY.md`](./VERIFY.md).

已验证内容包括：

Verified coverage includes:

- server syntax checks / server syntax checks
- client production build / client production build
- health endpoint / health endpoint
- project analysis endpoint / project analysis endpoint
- OpenAI-compatible mock and configured response paths / OpenAI-compatible mock and configured response paths
- PDF whitepaper ingestion / PDF whitepaper ingestion
- GitHub fallback behavior / GitHub fallback behavior
- router、treasury、bridge、non-token infrastructure、oracle contract 的 scope classification / scope classification for routers, treasuries, bridges, non-token infrastructure, and oracle contracts
- AI false-positive suppression / AI false-positive suppression
- wallet exposure checks / wallet exposure checks
- desktop and mobile browser rendering / desktop and mobile browser rendering
- 前端不暴露 `sk-...` 或 `OPENAI_API_KEY` / no frontend exposure of secret-like `sk-...` strings or `OPENAI_API_KEY`

---
