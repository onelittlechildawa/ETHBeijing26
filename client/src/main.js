import Chart from "chart.js/auto";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  Code2,
  createElement,
  Database,
  ExternalLink,
  FileText,
  Gauge,
  Github,
  History,
  Layers,
  Languages,
  Lightbulb,
  Loader2,
  Network,
  Printer,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
  WalletCards
} from "lucide";
import { analyzeProject } from "./api.js";
import { analyzeWalletExposure, connectWallet, hasWalletProvider } from "./wallet.js";
import "./styles.css";

const examples = [
  {
    label: "Uniswap",
    query: "Uniswap 0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    chainId: "1",
    address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"
  },
  {
    label: "Aave",
    query: "Aave aave.com 0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
    chainId: "1",
    address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9"
  },
  {
    label: "PEPE",
    query: "Pepe 0x6982508145454ce325ddbe47a25d4ec3d2311933",
    chainId: "1",
    address: "0x6982508145454ce325ddbe47a25d4ec3d2311933"
  },
  {
    label: "USDC",
    query: "USDC circle.com 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    chainId: "1",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  },
  {
    label: "Risk lab",
    query: "ChainLens Risk Lab 0xfeed00000000000000000000000000000000feed",
    chainId: "1",
    address: "0xfeed00000000000000000000000000000000feed"
  }
];

const chains = [
  { id: "1", label: "Ethereum" },
  { id: "56", label: "BNB Chain" },
  { id: "8453", label: "Base" }
];

const STORAGE_KEYS = {
  locale: "chainlens.locale",
  history: "chainlens.history"
};
const MAX_HISTORY_ITEMS = 10;

const messages = {
  en: {
    appTitle: "Project risk investigation console",
    modelEyebrow: "Investigation model",
    network: "Network",
    queryLabel: "Project, website, or contract evidence",
    queryPlaceholder: "Project name, website, 0x contract...",
    investigating: "Investigating",
    analyzeProject: "Analyze Project",
    languageToggle: "中文",
    languageToggleLabel: "Switch to Chinese",
    readyTitle: "Ready for analysis",
    readyBody: "No project has been analyzed in this session.",
    previewIdentityTitle: "Project identity",
    previewIdentityBody: "Waiting for official surfaces",
    previewAssetTitle: "Asset evidence",
    previewAssetBody: "Waiting for contracts",
    previewGovernanceTitle: "Governance and traction",
    previewGovernanceBody: "Waiting for project evidence",
    historyEyebrow: "Local history",
    historyTitle: "Analysis history",
    historyEmpty: "No reports saved in this browser yet.",
    historySaved: "{count} saved",
    historyClear: "Clear",
    historyLoad: "Load report",
    historyDelete: "Delete report",
    historyScore: "score",
    exportMarkdown: "Markdown",
    exportJson: "JSON",
    exportPdf: "PDF",
    exportReport: "Export report",
    scoreTopline: "Project Risk score",
    riskActionsTitle: "Actionable next steps",
    riskActionsEmpty: "No immediate action required from current evidence.",
    projectRisk: "Project Risk",
    surfacePending: "surface pending",
    contracts: "Contracts",
    scoredTokens: "Scored tokens",
    research: "Research",
    researchItems: "{count} item{plural}",
    findings: "Findings",
    coordinatedDiligence: "Coordinated diligence",
    agentCrew: "AI Agent Crew",
    agentsCount: "{count} agent{plural}",
    dimensionHealth: "Dimension health",
    projectFindings: "Project findings",
    found: "{count} found",
    noMaterialFindings: "No material findings in available data.",
    identity: "Identity",
    website: "Website",
    input: "Input",
    primaryChain: "Primary chain",
    researchStatus: "Research status",
    contract: "Contract",
    primary: "Primary",
    model: "Model",
    score: "Score",
    evidence: "Evidence",
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
    openai: "OpenAI",
    recommendationAgent: "Recommendation Agent",
    nextDiligenceActions: "Next diligence actions",
    actionCount: "{count} action{plural}",
    suppressedFalsePositives: "Suppressed false positives",
    suppressedCount: "{count} suppressed",
    falsePositive: "false positive",
    analystNotes: "Analyst notes",
    projectEvidence: "Project evidence",
    artifactCount: "{count} artifact{plural}",
    open: "Open",
    contractEvidence: "Contract evidence",
    contractCount: "{count} contract{plural}",
    sources: "Sources",
    walletExposure: "Wallet Exposure",
    yourWalletExposure: "Your Wallet Exposure",
    wallet: "Wallet",
    notConnected: "Not connected",
    walletChain: "Wallet chain",
    projectContracts: "Project contracts",
    mode: "Mode",
    readOnly: "Read-only",
    walletUnavailable: "Wallet unavailable",
    walletProviderUnavailable: "Wallet provider unavailable.",
    connectWallet: "Connect Wallet",
    connected: "Connected",
    recheckExposure: "Recheck Exposure",
    checking: "Checking",
    checkingWalletExposure: "Checking wallet exposure.",
    walletNotConnected: "Wallet not connected.",
    noProjectReportSelected: "No project report selected.",
    exposureNotChecked: "Exposure not checked.",
    holdings: "Holdings",
    allowances: "Allowances",
    recentEvents: "Recent events",
    walletFindings: "Wallet findings",
    noWalletFindings: "No wallet findings.",
    recentActivity: "Recent activity",
    unavailable: "Unavailable",
    error: "Error",
    idle: "Not connected",
    mismatch: "Chain mismatch",
    contractSpecific: "Contract-specific",
    checked: "Checked",
    health: "Health",
    confidence: "{value}% confidence",
    evidenceAttached: "Evidence attached",
    generatedAt: "Generated",
    summary: "Summary",
    recommendations: "Recommendations",
    suppressed: "Suppressed",
    tokenReports: "Token reports"
  },
  zh: {
    appTitle: "项目风险调查控制台",
    modelEyebrow: "调查模型",
    network: "网络",
    queryLabel: "项目、官网或合约证据",
    queryPlaceholder: "项目名、官网、0x 合约地址...",
    investigating: "调查中",
    analyzeProject: "分析项目",
    languageToggle: "EN",
    languageToggleLabel: "切换到英文",
    readyTitle: "等待分析",
    readyBody: "本次会话还没有分析任何项目。",
    previewIdentityTitle: "项目身份",
    previewIdentityBody: "等待官方入口",
    previewAssetTitle: "资产证据",
    previewAssetBody: "等待合约地址",
    previewGovernanceTitle: "治理与活跃度",
    previewGovernanceBody: "等待项目证据",
    historyEyebrow: "本地记录",
    historyTitle: "分析历史",
    historyEmpty: "这个浏览器里还没有保存报告。",
    historySaved: "已保存 {count} 条",
    historyClear: "清空",
    historyLoad: "载入报告",
    historyDelete: "删除报告",
    historyScore: "分",
    exportMarkdown: "Markdown",
    exportJson: "JSON",
    exportPdf: "PDF",
    exportReport: "导出报告",
    scoreTopline: "项目风险分",
    riskActionsTitle: "可执行建议",
    riskActionsEmpty: "当前证据下没有必须立即执行的动作。",
    projectRisk: "项目风险",
    surfacePending: "入口待确认",
    contracts: "合约数",
    scoredTokens: "已评分代币",
    research: "研究证据",
    researchItems: "{count} 条",
    findings: "风险发现",
    coordinatedDiligence: "协同尽调",
    agentCrew: "AI Agent 组",
    agentsCount: "{count} 个 agent",
    dimensionHealth: "维度健康度",
    projectFindings: "项目发现",
    found: "发现 {count} 条",
    noMaterialFindings: "当前数据中没有发现重大风险。",
    identity: "身份",
    website: "官网",
    input: "输入",
    primaryChain: "主链",
    researchStatus: "研究状态",
    contract: "合约",
    primary: "主合约",
    model: "模型",
    score: "评分",
    evidence: "证据",
    critical: "严重",
    high: "高",
    medium: "中",
    low: "低",
    info: "信息",
    openai: "OpenAI",
    recommendationAgent: "建议 Agent",
    nextDiligenceActions: "下一步尽调动作",
    actionCount: "{count} 条动作",
    suppressedFalsePositives: "已压制误报",
    suppressedCount: "已压制 {count} 条",
    falsePositive: "误报",
    analystNotes: "分析员备注",
    projectEvidence: "项目证据",
    artifactCount: "{count} 个证据",
    open: "打开",
    contractEvidence: "合约证据",
    contractCount: "{count} 个合约",
    sources: "数据源",
    walletExposure: "钱包暴露",
    yourWalletExposure: "你的钱包暴露",
    wallet: "钱包",
    notConnected: "未连接",
    walletChain: "钱包网络",
    projectContracts: "项目合约",
    mode: "模式",
    readOnly: "只读",
    walletUnavailable: "钱包不可用",
    walletProviderUnavailable: "未检测到钱包插件。",
    connectWallet: "连接钱包",
    connected: "已连接",
    recheckExposure: "重新检查暴露",
    checking: "检查中",
    checkingWalletExposure: "正在检查钱包暴露。",
    walletNotConnected: "钱包未连接。",
    noProjectReportSelected: "尚未选择项目报告。",
    exposureNotChecked: "尚未检查暴露。",
    holdings: "持仓",
    allowances: "授权",
    recentEvents: "近期事件",
    walletFindings: "钱包发现",
    noWalletFindings: "没有钱包风险发现。",
    recentActivity: "近期活动",
    unavailable: "不可用",
    error: "错误",
    idle: "未连接",
    mismatch: "网络不匹配",
    contractSpecific: "合约级数据",
    checked: "已检查",
    health: "健康度",
    confidence: "{value}% 置信度",
    evidenceAttached: "已附证据",
    generatedAt: "生成时间",
    summary: "摘要",
    recommendations: "建议",
    suppressed: "已压制",
    tokenReports: "代币报告"
  }
};

let state = {
  loading: false,
  error: null,
  report: null,
  locale: loadLocale(),
  history: loadHistory(),
  chainId: "1",
  query: examples[0].query,
  address: examples[0].address,
  wallet: {
    provider: null,
    account: null,
    chainId: null,
    loading: false,
    error: null,
    exposure: null
  }
};

let radarChart = null;
let boundWalletProvider = null;

const app = document.querySelector("#app");

function render() {
  document.documentElement.lang = state.locale === "zh" ? "zh-CN" : "en";
  document.title = `ChainLens - ${t("appTitle")}`;
  app.innerHTML = `
    <main class="shell">
      <section class="command-panel">
        <div class="brand-row">
          <div class="brand-cluster">
            <div class="brand-mark">${icon(ShieldAlert)}</div>
            <div>
              <p class="eyebrow">ChainLens</p>
              <h1>${t("appTitle")}</h1>
            </div>
          </div>
          <button id="language-toggle" class="icon-action language-toggle" type="button" title="${t("languageToggleLabel")}" aria-label="${t("languageToggleLabel")}">
            ${icon(Languages)}
            <span>${t("languageToggle")}</span>
          </button>
        </div>
        <form id="analyze-form" class="search-panel">
          <label class="field">
            <span>${t("network")}</span>
            <select id="chain-select">
              ${chains.map((chain) => `<option value="${chain.id}" ${chain.id === state.chainId ? "selected" : ""}>${chain.label}</option>`).join("")}
            </select>
          </label>
          <label class="field address-field">
            <span>${t("queryLabel")}</span>
            <input id="query-input" value="${escapeHtml(state.query)}" placeholder="${t("queryPlaceholder")}" spellcheck="false" />
          </label>
          <button class="primary-action" type="submit" ${state.loading ? "disabled" : ""}>
            ${state.loading ? icon(Loader2, "spin") : icon(Search)}
            <span>${state.loading ? t("investigating") : t("analyzeProject")}</span>
          </button>
        </form>
        <div class="example-row">
          ${examples.map((item) => `<button class="example-chip" data-query="${escapeHtml(item.query)}" data-address="${item.address}" data-chain="${item.chainId}">${item.label}</button>`).join("")}
        </div>
        ${state.error ? `<div class="error-banner">${icon(AlertTriangle)}<span>${escapeHtml(state.error)}</span></div>` : ""}
      </section>
      ${historyTemplate()}
      ${state.report ? reportTemplate(state.report) : emptyTemplate()}
      ${walletPanelTemplate(state.report, state.wallet)}
    </main>
  `;

  bindEvents();
  if (state.report) renderRadar(state.report);
}

function bindEvents() {
  document.querySelector("#language-toggle")?.addEventListener("click", () => {
    const locale = state.locale === "zh" ? "en" : "zh";
    state = { ...state, locale };
    saveLocale(locale);
    render();
  });

  document.querySelector("#analyze-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    runAnalysis({
      chainId: document.querySelector("#chain-select").value,
      query: document.querySelector("#query-input").value.trim()
    });
  });

  document.querySelectorAll(".example-chip").forEach((button) => {
    button.addEventListener("click", () => {
      runAnalysis({
        query: button.dataset.query,
        address: button.dataset.address,
        chainId: button.dataset.chain
      });
    });
  });

  document.querySelectorAll("[data-export-format]").forEach((button) => {
    button.addEventListener("click", () => exportReport(button.dataset.exportFormat));
  });

  document.querySelectorAll("[data-history-load]").forEach((button) => {
    button.addEventListener("click", () => loadHistoryItem(button.dataset.historyLoad));
  });

  document.querySelectorAll("[data-history-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteHistoryItem(button.dataset.historyDelete));
  });

  document.querySelector("#history-clear")?.addEventListener("click", () => {
    state = { ...state, history: [] };
    persistHistory([]);
    render();
  });

  const walletAction = document.querySelector("#wallet-action");
  if (walletAction) {
    walletAction.addEventListener("click", () => {
      if (walletAction.dataset.action === "connect") {
        connectWalletForReport();
      } else if (walletAction.dataset.action === "refresh") {
        runWalletExposure();
      }
    });
  }
}

async function runAnalysis({ chainId, query, address }) {
  state = {
    ...state,
    loading: true,
    error: null,
    report: null,
    chainId,
    query,
    address,
    wallet: {
      ...state.wallet,
      exposure: null,
      error: null
    }
  };
  render();

  try {
    const report = await analyzeProject({ chainId, query, address });
    const history = rememberReport(report, { query, chainId, address });
    state = { ...state, loading: false, report, history };
    render();

    if (state.wallet.provider && state.wallet.account) {
      await runWalletExposure(report);
    }
  } catch (error) {
    state = { ...state, loading: false, error: error.message };
    render();
  }
}

async function connectWalletForReport() {
  state = {
    ...state,
    wallet: {
      ...state.wallet,
      loading: true,
      error: null
    }
  };
  render();

  try {
    const connection = await connectWallet();
    bindWalletProviderEvents(connection.provider);
    state = {
      ...state,
      wallet: {
        provider: connection.provider,
        account: connection.wallet,
        chainId: connection.chainId,
        loading: false,
        error: null,
        exposure: null
      }
    };
    render();

    if (state.report) {
      await runWalletExposure(state.report);
    }
  } catch (error) {
    state = {
      ...state,
      wallet: {
        ...state.wallet,
        loading: false,
        error: error.message,
        exposure: null
      }
    };
    render();
  }
}

async function runWalletExposure(report = state.report) {
  if (!report || !state.wallet.provider || !state.wallet.account) return;

  state = {
    ...state,
    wallet: {
      ...state.wallet,
      loading: true,
      error: null,
      exposure: null
    }
  };
  render();

  try {
    const exposure = await analyzeWalletExposure({
      provider: state.wallet.provider,
      wallet: state.wallet.account,
      chainId: state.wallet.chainId,
      report
    });
    state = {
      ...state,
      wallet: {
        ...state.wallet,
        loading: false,
        error: null,
        exposure
      }
    };
  } catch (error) {
    state = {
      ...state,
      wallet: {
        ...state.wallet,
        loading: false,
        error: error.message,
        exposure: null
      }
    };
  }
  render();
}

function bindWalletProviderEvents(provider) {
  if (!provider || boundWalletProvider === provider || typeof provider.on !== "function") return;
  boundWalletProvider = provider;

  provider.on("accountsChanged", (accounts) => {
    state = {
      ...state,
      wallet: {
        ...state.wallet,
        account: accounts?.[0] || null,
        exposure: null,
        error: null
      }
    };
    render();
    if (state.report && state.wallet.account) runWalletExposure();
  });

  provider.on("chainChanged", (chainIdHex) => {
    state = {
      ...state,
      wallet: {
        ...state.wallet,
        chainId: String(Number(chainIdHex)),
        exposure: null,
        error: null
      }
    };
    render();
    if (state.report && state.wallet.account) runWalletExposure();
  });
}

function emptyTemplate() {
  return `
    <section class="empty-state">
      <div class="empty-copy">
        <p class="eyebrow">${t("modelEyebrow")}</p>
        <h2>${t("readyTitle")}</h2>
        <p>${t("readyBody")}</p>
      </div>
      <div class="signal-preview">
        ${previewItem(Network, t("previewIdentityTitle"), t("previewIdentityBody"))}
        ${previewItem(WalletCards, t("previewAssetTitle"), t("previewAssetBody"))}
        ${previewItem(Users, t("previewGovernanceTitle"), t("previewGovernanceBody"))}
      </div>
    </section>
  `;
}

function historyTemplate() {
  const items = state.history || [];
  return `
    <section class="history-panel" aria-label="${t("historyTitle")}">
      <div class="panel-heading compact">
        <div>
          <p class="eyebrow">${t("historyEyebrow")}</p>
          <h2>${t("historyTitle")}</h2>
        </div>
        <div class="history-meta">
          <span>${t("historySaved", { count: items.length })}</span>
          ${items.length ? `<button id="history-clear" class="icon-action" type="button" title="${t("historyClear")}" aria-label="${t("historyClear")}">${icon(Trash2)}<span>${t("historyClear")}</span></button>` : ""}
        </div>
      </div>
      ${items.length ? `
        <div class="history-list">
          ${items.map(historyItemTemplate).join("")}
        </div>
      ` : `<div class="history-empty">${icon(History)} <span>${t("historyEmpty")}</span></div>`}
    </section>
  `;
}

function historyItemTemplate(item) {
  return `
    <article class="history-row">
      <button class="history-load" type="button" data-history-load="${escapeHtml(item.id)}" title="${t("historyLoad")}" aria-label="${t("historyLoad")}">
        <strong>${escapeHtml(item.name || "ChainLens report")}</strong>
        <span>${escapeHtml(formatDateTime(item.generatedAt))} / ${escapeHtml(localizeSummaryLabel(item.levelLabel || item.level))} / ${formatNumber(item.findingCount || 0)} ${t("findings").toLowerCase()}</span>
      </button>
      <div class="history-score">
        <strong>${formatNumber(item.score)}</strong>
        <span>${t("historyScore")}</span>
      </div>
      <button class="icon-action danger" type="button" data-history-delete="${escapeHtml(item.id)}" title="${t("historyDelete")}" aria-label="${t("historyDelete")}">
        ${icon(Trash2)}
      </button>
    </article>
  `;
}

function reportTemplate(report) {
  const primaryContract = report.project.contracts[0];
  const tokenReportCount = (report.project.contracts || []).filter((contract) => !tokenModelExcluded(contract.classification)).length;
  const researchCount = report.projectEvidence?.artifactCount || 0;
  return `
    <section class="report-grid" aria-label="${t("projectRisk")}">
      <div class="score-panel level-${report.summary.level}">
        <div class="score-topline">
          <span>${icon(Gauge)} ${t("scoreTopline")}</span>
          <strong>${report.summary.projectScore}</strong>
        </div>
        <h2>${escapeHtml(localizeSummaryLabel(report.summary.label))}</h2>
        <p>${escapeHtml(localizeSummaryDescription(report.summary.description, report.summary.level))}</p>
        <div class="severity-row">
          ${severityPill("critical", report.summary.counts.critical)}
          ${severityPill("high", report.summary.counts.high)}
          ${severityPill("medium", report.summary.counts.medium)}
          ${severityPill("low", report.summary.counts.low)}
        </div>
        ${riskActionSummaryTemplate(report)}
      </div>

      <div class="token-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">${t("projectRisk")}</p>
            <h2>${escapeHtml(report.project.name)} <span>${escapeHtml(report.project.website || t("surfacePending"))}</span></h2>
          </div>
          <div class="report-toolbar" aria-label="${t("exportReport")}">
            <span class="network-pill">${escapeHtml(report.project.primaryChain.label)}</span>
            <button class="icon-action export-action" type="button" data-export-format="markdown" title="${t("exportMarkdown")}" aria-label="${t("exportMarkdown")}">${icon(FileText)}<span>${t("exportMarkdown")}</span></button>
            <button class="icon-action export-action" type="button" data-export-format="json" title="${t("exportJson")}" aria-label="${t("exportJson")}">${icon(Database)}<span>${t("exportJson")}</span></button>
            <button class="icon-action export-action" type="button" data-export-format="pdf" title="${t("exportPdf")}" aria-label="${t("exportPdf")}">${icon(Printer)}<span>${t("exportPdf")}</span></button>
          </div>
        </div>
        <div class="metric-grid">
          ${metric(t("contracts"), formatNumber(report.project.contracts.length))}
          ${metric(t("scoredTokens"), formatNumber(tokenReportCount))}
          ${metric(t("research"), t("researchItems", { count: formatNumber(researchCount), plural: researchCount === 1 ? "" : "s" }))}
          ${metric(t("findings"), formatNumber(report.findings.length))}
        </div>
      </div>

      ${agentCrewTemplate(report)}

      <div class="radar-panel">
        <div class="panel-heading compact">
          <h2>${t("dimensionHealth")}</h2>
        </div>
        <canvas id="radar-chart" width="360" height="260"></canvas>
      </div>

      <div class="signals-panel">
        <div class="panel-heading compact">
          <h2>${t("projectFindings")}</h2>
          <span>${t("found", { count: report.findings.length })}</span>
        </div>
        <div class="signals-list">
          ${report.findings.map(findingTemplate).join("") || `<div class="clean-card">${icon(CheckCircle2)} ${t("noMaterialFindings")}</div>`}
        </div>
      </div>

      <div class="details-panel">
        ${detailCard(t("identity"), Network, [
          [t("website"), report.project.website || "N/A"],
          [t("input"), report.project.query || "N/A"],
          [t("primaryChain"), report.project.primaryChain.label],
          [t("researchStatus"), localizeStatus(report.projectEvidence?.status || "empty")]
        ])}
        ${detailCard(t("contract"), Layers, [
          [t("contracts"), formatNumber(report.project.contracts.length)],
          [t("primary"), contractDisplayName(primaryContract)],
          [t("model"), primaryContract?.classification?.label || "N/A"],
          [t("score"), contractScoreText(primaryContract)]
        ])}
        ${detailCard(t("evidence"), Database, [
          [t("critical"), formatNumber(report.summary.counts.critical)],
          [t("high"), formatNumber(report.summary.counts.high)],
          [t("medium"), formatNumber(report.summary.counts.medium)],
          [t("low"), formatNumber(report.summary.counts.low)],
          [t("openai"), localizeStatus(openAIStatus(report))]
        ])}
      </div>

      ${researchEvidenceTemplate(report.projectEvidence)}
      ${contractEvidenceTemplate(report)}
      ${suppressedFindingsTemplate(report.suppressedFindings || [])}
      ${analystNotesTemplate(report.openai)}
      ${recommendationsTemplate(report)}

      <div class="sources-panel">
        <div class="panel-heading compact">
          <h2>${t("sources")}</h2>
        </div>
        ${report.sources.map((source) => `
          <div class="source-row">
            <span>${escapeHtml(source.name)}</span>
            <strong class="source-${escapeHtml(source.status)}">${escapeHtml(localizeStatus(source.status))}${source.cache ? ` / ${source.cache}` : ""}</strong>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function riskActionSummaryTemplate(report) {
  const actions = riskActions(report).slice(0, 3);
  return `
    <div class="risk-action-summary">
      <h3>${t("riskActionsTitle")}</h3>
      ${actions.length ? `
        <ol>
          ${actions.map((action) => `
            <li>
              <strong>${escapeHtml(localizeRecommendationText(action.title || action.priority || ""))}</strong>
              <span>${escapeHtml(localizeRecommendationText(action.action || action.reason || ""))}</span>
            </li>
          `).join("")}
        </ol>
      ` : `<p>${t("riskActionsEmpty")}</p>`}
    </div>
  `;
}

function riskActions(report) {
  const summaryActions = Array.isArray(report.summary?.actions) ? report.summary.actions : [];
  const recommendations = report.recommendations || recommendationAgent(report)?.recommendations || [];
  return summaryActions.length ? summaryActions : recommendations;
}

function walletPanelTemplate(report, wallet) {
  const providerAvailable = hasWalletProvider();
  const status = walletStatus(report, wallet, providerAvailable);
  const contractCount = report?.project?.contracts?.length || 0;

  return `
    <section class="wallet-panel" aria-label="${t("yourWalletExposure")}">
      <div class="panel-heading wallet-heading">
        <div>
          <p class="eyebrow">${t("walletExposure")}</p>
          <h2>${t("yourWalletExposure")}</h2>
        </div>
        <span class="wallet-status wallet-status-${status.key}">${escapeHtml(status.label)}</span>
      </div>

      <div class="wallet-summary-grid">
        ${walletMetric(t("wallet"), wallet.account ? shortAddress(wallet.account) : t("notConnected"))}
        ${walletMetric(t("walletChain"), wallet.chainId || "N/A")}
        ${walletMetric(t("projectContracts"), report ? formatNumber(contractCount) : "N/A")}
        ${walletMetric(t("mode"), t("readOnly"))}
      </div>

      <div class="wallet-actions">
        ${walletActionTemplate(report, wallet, providerAvailable)}
      </div>

      ${walletBodyTemplate(report, wallet, providerAvailable)}
    </section>
  `;
}

function walletBodyTemplate(report, wallet, providerAvailable) {
  if (!providerAvailable) {
    return `<div class="wallet-empty">${icon(AlertTriangle)} <span>${t("walletProviderUnavailable")}</span></div>`;
  }

  if (wallet.error) {
    return `<div class="wallet-alert">${icon(AlertTriangle)} <span>${escapeHtml(wallet.error)}</span></div>`;
  }

  if (!wallet.account) {
    return `<div class="wallet-empty">${icon(WalletCards)} <span>${t("walletNotConnected")}</span></div>`;
  }

  if (!report) {
    return `<div class="wallet-empty">${icon(Search)} <span>${t("noProjectReportSelected")}</span></div>`;
  }

  if (wallet.loading) {
    return `<div class="wallet-empty">${icon(Loader2, "spin")} <span>${t("checkingWalletExposure")}</span></div>`;
  }

  if (!wallet.exposure) {
    return `<div class="wallet-empty">${icon(Activity)} <span>${t("exposureNotChecked")}</span></div>`;
  }

  const exposure = wallet.exposure;
  return `
    <div class="wallet-evidence-grid">
      ${walletMetric(t("holdings"), formatNumber(exposure.holdings.length))}
      ${walletMetric(t("allowances"), formatNumber(exposure.allowances.length))}
      ${walletMetric(t("recentEvents"), formatNumber(exposure.events.length))}
      ${walletMetric(t("walletFindings"), formatNumber(exposure.findings.length))}
    </div>

    <div class="wallet-section">
      <div class="section-title">
        <h3>${t("walletFindings")}</h3>
        <span>${escapeHtml(exposure.status)}</span>
      </div>
      <div class="wallet-list">
        ${exposure.findings.map(walletFindingTemplate).join("") || `<div class="wallet-record clean">${icon(CheckCircle2)} <span>${t("noWalletFindings")}</span></div>`}
      </div>
    </div>

    ${walletRecordsSection(t("holdings"), exposure.holdings, holdingTemplate)}
    ${walletRecordsSection(t("allowances"), exposure.allowances, allowanceTemplate)}
    ${walletRecordsSection(t("recentActivity"), exposure.events, eventTemplate)}
  `;
}

function walletActionTemplate(report, wallet, providerAvailable) {
  if (!providerAvailable) {
    return `<button id="wallet-action" class="secondary-action" type="button" disabled>${t("walletUnavailable")}</button>`;
  }

  if (!wallet.account) {
    return `<button id="wallet-action" class="secondary-action" type="button" data-action="connect">${icon(WalletCards)} <span>${t("connectWallet")}</span></button>`;
  }

  if (!report) {
    return `<button id="wallet-action" class="secondary-action" type="button" disabled>${icon(CheckCircle2)} <span>${t("connected")}</span></button>`;
  }

  return `<button id="wallet-action" class="secondary-action" type="button" data-action="refresh" ${wallet.loading ? "disabled" : ""}>${wallet.loading ? icon(Loader2, "spin") : icon(Activity)} <span>${wallet.loading ? t("checking") : t("recheckExposure")}</span></button>`;
}

function walletStatus(report, wallet, providerAvailable) {
  if (!providerAvailable) return { key: "unavailable", label: t("unavailable") };
  if (wallet.loading) return { key: "checking", label: t("checking") };
  if (wallet.error) return { key: "error", label: t("error") };
  if (!wallet.account) return { key: "idle", label: t("idle") };
  if (!report) return { key: "connected", label: t("connected") };
  if (wallet.exposure?.status === "chain_mismatch") return { key: "mismatch", label: t("mismatch") };
  if (wallet.exposure?.status === "contract_specific_unavailable") return { key: "connected", label: t("contractSpecific") };
  if (wallet.exposure?.status === "ok") return { key: "ok", label: t("checked") };
  return { key: "connected", label: t("connected") };
}

function walletRecordsSection(title, records, template) {
  if (!records.length) return "";
  return `
    <div class="wallet-section">
      <div class="section-title">
        <h3>${escapeHtml(title)}</h3>
        <span>${records.length}</span>
      </div>
      <div class="wallet-list">
        ${records.map(template).join("")}
      </div>
    </div>
  `;
}

function walletFindingTemplate(finding) {
  return `
    <article class="wallet-finding severity-${finding.severity}">
      <div class="signal-title-row">
        <h3>${escapeHtml(finding.title)}</h3>
        <span>${escapeHtml(localizeSeverity(finding.severity))}</span>
      </div>
      <p>${escapeHtml(finding.context)}</p>
      <div class="evidence-row">
        <span>${escapeHtml(finding.evidence)}</span>
        <strong>${t("confidence", { value: Math.round(finding.confidence * 100) })}</strong>
      </div>
    </article>
  `;
}

function holdingTemplate(holding) {
  return `
    <article class="wallet-record">
      <div>
        <strong>${escapeHtml(holding.balance)} ${escapeHtml(holding.symbol)}</strong>
        <span>${escapeHtml(shortAddress(holding.token))}</span>
      </div>
      <small>balanceOf</small>
    </article>
  `;
}

function allowanceTemplate(allowance) {
  return `
    <article class="wallet-record">
      <div>
        <strong>${escapeHtml(allowance.allowance)} ${escapeHtml(allowance.symbol)}</strong>
        <span>${escapeHtml(shortAddress(allowance.spender))}</span>
      </div>
      <small class="risk-${allowance.risk}">${escapeHtml(allowance.risk)}</small>
    </article>
  `;
}

function eventTemplate(event) {
  const counterparty = event.spender || event.counterparty;
  return `
    <article class="wallet-record">
      <div>
        <strong>${escapeHtml(event.type)} ${escapeHtml(event.value || "")}</strong>
        <span>${escapeHtml(counterparty ? shortAddress(counterparty) : shortAddress(event.txHash))} / block ${escapeHtml(event.blockNumber)}</span>
      </div>
      <small>${escapeHtml(shortAddress(event.token))}</small>
    </article>
  `;
}

function renderRadar(report) {
  const canvas = document.querySelector("#radar-chart");
  if (!canvas) return;
  if (radarChart) radarChart.destroy();

  radarChart = new Chart(canvas, {
    type: "radar",
    data: {
      labels: report.dimensions.map((dimension) => localizeDimension(dimension)),
      datasets: [
        {
          label: t("health"),
          data: report.dimensions.map((dimension) => dimension.score),
          fill: true,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.16)",
          pointBackgroundColor: "#0f172a",
          pointBorderColor: "#ffffff",
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { stepSize: 25, color: "#64748b", backdropColor: "transparent" },
          grid: { color: "rgba(100, 116, 139, 0.25)" },
          angleLines: { color: "rgba(100, 116, 139, 0.25)" },
          pointLabels: { color: "#334155", font: { size: 12, weight: 600 } }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function agentCrewTemplate(report) {
  const agents = report.agents || [];
  if (!agents.length) return "";
  return `
    <div class="agent-panel">
      <div class="panel-heading compact">
        <div>
          <p class="eyebrow">${t("agentCrew")}</p>
          <h2>${t("coordinatedDiligence")}</h2>
        </div>
        <span>${t("agentsCount", { count: agents.length, plural: agents.length === 1 ? "" : "s" })}</span>
      </div>
      <div class="agent-grid">
        ${agents.map(agentCardTemplate).join("")}
      </div>
    </div>
  `;
}

function agentCardTemplate(agent) {
  const findings = agent.findings || [];
  return `
    <article class="agent-card agent-status-${escapeHtml(agent.status || "partial")}">
      <div class="agent-card-top">
        <div class="agent-icon">${icon(iconForAgent(agent.id))}</div>
        <div>
          <h3>${escapeHtml(localizeAgentName(agent))}</h3>
          <span>${escapeHtml(localizeStatus(agent.status || "partial"))} / ${formatNumber(agent.evidenceCount || 0)} ${t("evidence").toLowerCase()}</span>
        </div>
      </div>
      <p>${escapeHtml(agent.summary || "Agent result pending.")}</p>
      <div class="agent-meta-row">
        <strong>${formatNumber(findings.length)} ${t("findings").toLowerCase()}</strong>
        <span>${t("confidence", { value: Math.round((agent.confidence || 0.5) * 100) })}</span>
      </div>
    </article>
  `;
}

function findingTemplate(signal) {
  return `
    <article class="signal-card severity-${signal.severity}">
      <div class="signal-icon">${icon(iconForSeverity(signal.severity))}</div>
      <div>
        <div class="signal-title-row">
          <h3>${escapeHtml(signal.title)}</h3>
          <span>${escapeHtml(localizeSeverity(signal.severity))}</span>
        </div>
        <p>${escapeHtml(signal.context)}</p>
        <div class="evidence-row">
          <span>${escapeHtml(signal.evidence)}</span>
          <strong>${t("confidence", { value: Math.round(signal.confidence * 100) })}</strong>
        </div>
      </div>
    </article>
  `;
}

function recommendationsTemplate(report) {
  const recommendations = report.recommendations || recommendationAgent(report)?.recommendations || [];
  if (!recommendations.length) return "";
  return `
    <div class="recommendations-panel">
      <div class="panel-heading compact">
        <div>
          <p class="eyebrow">${t("recommendationAgent")}</p>
          <h2>${t("nextDiligenceActions")}</h2>
        </div>
        <span>${t("actionCount", { count: recommendations.length, plural: recommendations.length === 1 ? "" : "s" })}</span>
      </div>
      <div class="recommendation-list">
        ${recommendations.slice(0, 5).map(recommendationTemplate).join("")}
      </div>
    </div>
  `;
}

function recommendationTemplate(recommendation) {
  return `
    <article class="recommendation-row priority-${escapeHtml(recommendation.priority || "low")}">
      <div class="recommendation-priority">${escapeHtml(localizePriority(recommendation.priority || "low"))}</div>
      <div class="recommendation-body">
        <h3>${escapeHtml(localizeRecommendationText(recommendation.title))}</h3>
        <p>${escapeHtml(localizeRecommendationText(recommendation.action))}</p>
        <div class="evidence-row">
          <span>${escapeHtml(localizeRecommendationText(recommendation.reason))}</span>
          <strong>${escapeHtml(recommendation.evidence || t("evidenceAttached"))}</strong>
        </div>
      </div>
    </article>
  `;
}

function suppressedFindingsTemplate(findings) {
  if (!findings.length) return "";
  return `
    <div class="review-panel">
      <div class="panel-heading compact">
        <h2>${t("suppressedFalsePositives")}</h2>
        <span>${t("suppressedCount", { count: findings.length })}</span>
      </div>
      <div class="signals-list compact-list">
        ${findings.map((finding) => `
          <article class="signal-card suppressed-card severity-info">
            <div class="signal-icon">${icon(CheckCircle2)}</div>
            <div>
              <div class="signal-title-row">
                <h3>${escapeHtml(finding.title)}</h3>
                <span>${t("falsePositive")}</span>
              </div>
              <p>${escapeHtml(finding.suppressionReason || finding.review?.reason || finding.context)}</p>
              <div class="evidence-row">
                <span>${escapeHtml(finding.suppressionEvidence || finding.review?.evidence || finding.evidence)}</span>
                <strong>${t("confidence", { value: Math.round((finding.review?.confidence || finding.confidence || 0.5) * 100) })}</strong>
              </div>
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function analystNotesTemplate(openai) {
  const findings = openai?.findings || [];
  if (!findings.length && !openai?.summary) return "";
  return `
    <div class="analyst-panel">
      <div class="panel-heading compact">
        <h2>${t("analystNotes")}</h2>
        <span>${escapeHtml(localizeStatus(openai?.status || "unknown"))}</span>
      </div>
      ${openai?.summary ? `<p class="analyst-summary">${escapeHtml(openai.summary)}</p>` : ""}
      <div class="signals-list compact-list">
        ${findings.map(findingTemplate).join("")}
      </div>
    </div>
  `;
}

function researchEvidenceTemplate(evidence) {
  const artifacts = evidence?.artifacts || [];
  if (!artifacts.length) return "";
  return `
    <div class="research-panel">
      <div class="panel-heading compact">
        <h2>${t("projectEvidence")}</h2>
        <span>${t("artifactCount", { count: artifacts.length, plural: artifacts.length === 1 ? "" : "s" })}</span>
      </div>
      <div class="artifact-list">
        ${artifacts.slice(0, 8).map(artifactTemplate).join("")}
      </div>
    </div>
  `;
}

function artifactTemplate(artifact) {
  const Icon = iconForArtifact(artifact.type);
  const facts = artifactFacts(artifact);
  return `
    <article class="artifact-row artifact-${escapeHtml(artifact.status || "ok")}">
      <div class="artifact-icon">${icon(Icon)}</div>
      <div class="artifact-body">
        <div class="artifact-title-row">
          <h3>${escapeHtml(artifact.title)}</h3>
          <span>${escapeHtml(artifact.type.replace(/_/g, " "))}</span>
        </div>
        <p>${escapeHtml(artifact.summary || t("evidenceAttached"))}</p>
        <div class="artifact-meta">
          ${facts.map((fact) => `<strong>${escapeHtml(fact)}</strong>`).join("")}
          <a href="${escapeHtml(artifact.url)}" target="_blank" rel="noreferrer">${icon(ExternalLink)} <span>${t("open")}</span></a>
        </div>
        ${(artifact.addresses || []).length ? `<div class="artifact-addresses">${artifact.addresses.slice(0, 3).map((address) => `<code>${escapeHtml(shortAddress(address))}</code>`).join("")}</div>` : ""}
      </div>
    </article>
  `;
}

function artifactFacts(artifact) {
  const facts = [];
  if (artifact.status) facts.push(artifact.status);
  if (artifact.facts?.stars !== undefined && artifact.facts?.stars !== null) facts.push(`${formatNumber(artifact.facts.stars)} stars`);
  if (artifact.facts?.pushedAt) facts.push(`pushed ${formatDate(artifact.facts.pushedAt)}`);
  if (artifact.facts?.pages) facts.push(`${formatNumber(artifact.facts.pages)} pages`);
  if (artifact.facts?.textChars) facts.push(`${formatNumber(artifact.facts.textChars)} chars`);
  if (artifact.facts?.candidateCount !== undefined) facts.push(`${formatNumber(artifact.facts.candidateCount)} candidates`);
  return facts.slice(0, 4);
}

function iconForArtifact(type) {
  if (String(type).startsWith("github")) return Github;
  if (type === "whitepaper") return FileText;
  if (type === "docs") return BookOpen;
  return Database;
}

function contractEvidenceTemplate(report) {
  const contracts = report.project?.contracts || [];
  if (!contracts.length) return "";
  return `
    <div class="asset-panel">
      <div class="panel-heading compact">
        <h2>${t("contractEvidence")}</h2>
        <span>${t("contractCount", { count: contracts.length, plural: contracts.length === 1 ? "" : "s" })}</span>
      </div>
      <div class="asset-list">
        ${contracts.map((contract) => `
          <article class="asset-row">
            <div>
              <strong>${escapeHtml(contractDisplayName(contract))}</strong>
              <span>${escapeHtml(shortAddress(contract.address))} / ${escapeHtml(contract.chain?.label || "Unknown chain")} / ${escapeHtml(contract.classification?.label || "contract")}</span>
            </div>
            <div>
              <strong>${escapeHtml(localizeSummaryLabel(contract.riskLabel || "Unknown"))}</strong>
              <span>${escapeHtml(contractScoreText(contract))}</span>
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function contractDisplayName(contract) {
  if (!contract) return "N/A";
  return contract.contractName || contract.name || contract.symbol || "Contract";
}

function contractScoreText(contract) {
  if (!contract) return "N/A";
  if (contract.trustScore === null || contract.trustScore === undefined) return localizeSummaryLabel(contract.riskLabel || "Unscored");
  return `${formatNumber(contract.trustScore)} ${t("score").toLowerCase()} / ${localizeSummaryLabel(contract.riskLabel || "Scored")}`;
}

function tokenModelExcluded(classification) {
  return classification?.tokenModel === "excluded" || classification?.assetType !== "erc20_token";
}

function detailCard(title, Icon, rows) {
  return `
    <article class="detail-card">
      <h3>${icon(Icon)} ${escapeHtml(title)}</h3>
      ${rows.map(([label, value]) => `
        <div class="detail-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value ?? "N/A")}</strong>
        </div>
      `).join("")}
    </article>
  `;
}

function previewItem(Icon, title, text) {
  return `
    <article>
      ${icon(Icon)}
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function walletMetric(label, value) {
  return `<div class="wallet-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function severityPill(severity, count) {
  return `<span class="severity-pill severity-${severity}">${localizeSeverity(severity)} ${count}</span>`;
}

function icon(Icon, extraClass = "") {
  const node = createElement(Icon, {
    class: `icon ${extraClass}`.trim(),
    "stroke-width": 2
  });
  return node.outerHTML;
}

function iconForSeverity(severity) {
  return severity === "critical" || severity === "high" ? AlertTriangle : ShieldAlert;
}

function iconForAgent(id) {
  return {
    "research-agent": BookOpen,
    "open-source-review-agent": Code2,
    "onchain-risk-agent": Activity,
    "synthesis-agent": Sparkles,
    "recommendation-agent": Lightbulb
  }[id] || Bot;
}

function recommendationAgent(report) {
  return (report.agents || []).find((agent) => agent.id === "recommendation-agent");
}

function t(key, params = {}) {
  const text = messages[state.locale]?.[key] ?? messages.en[key] ?? key;
  return Object.entries(params).reduce((value, [name, replacement]) => {
    return value.replaceAll(`{${name}}`, String(replacement));
  }, text);
}

function loadLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.locale);
    return saved === "zh" || saved === "en" ? saved : "en";
  } catch {
    return "en";
  }
}

function saveLocale(locale) {
  try {
    localStorage.setItem(STORAGE_KEYS.locale, locale);
  } catch {
    // Local storage can be unavailable in private contexts; the in-memory state still works.
  }
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.report).slice(0, MAX_HISTORY_ITEMS) : [];
  } catch {
    return [];
  }
}

function persistHistory(history) {
  let next = history.slice(0, MAX_HISTORY_ITEMS);
  while (next.length >= 0) {
    try {
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(next));
      return next;
    } catch {
      if (!next.length) return [];
      next = next.slice(0, -1);
    }
  }
  return [];
}

function rememberReport(report, meta = {}) {
  const item = buildHistoryItem(report, meta);
  const previous = (state.history || []).filter((entry) => entry.id !== item.id);
  return persistHistory([item, ...previous].slice(0, MAX_HISTORY_ITEMS));
}

function buildHistoryItem(report, meta = {}) {
  const generatedAt = report.generatedAt || new Date().toISOString();
  const name = report.project?.name || meta.query || "ChainLens report";
  return {
    id: `${Date.now()}-${slugify(name)}`,
    generatedAt,
    name,
    query: meta.query || report.project?.query || "",
    chainId: meta.chainId || report.project?.primaryChain?.id || "1",
    address: meta.address || report.project?.contracts?.[0]?.address || "",
    score: report.summary?.projectScore ?? null,
    level: report.summary?.level || "",
    levelLabel: report.summary?.label || "",
    findingCount: report.findings?.length || 0,
    report
  };
}

function loadHistoryItem(id) {
  const item = (state.history || []).find((entry) => entry.id === id);
  if (!item?.report) return;
  state = {
    ...state,
    loading: false,
    error: null,
    report: item.report,
    query: item.query || item.report.project?.query || state.query,
    chainId: item.chainId || state.chainId,
    address: item.address || item.report.project?.contracts?.[0]?.address || state.address,
    wallet: {
      ...state.wallet,
      exposure: null,
      error: null
    }
  };
  render();
}

function deleteHistoryItem(id) {
  const history = persistHistory((state.history || []).filter((entry) => entry.id !== id));
  state = { ...state, history };
  render();
}

function exportReport(format) {
  if (!state.report) return;
  if (format === "json") {
    downloadFile(buildReportFilename(state.report, "json"), JSON.stringify(state.report, null, 2), "application/json");
    return;
  }
  if (format === "markdown") {
    downloadFile(buildReportFilename(state.report, "md"), buildMarkdownReport(state.report), "text/markdown");
    return;
  }
  if (format === "pdf") {
    printReport();
  }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function printReport() {
  const previousTitle = document.title;
  document.body.classList.add("print-report");
  document.title = buildReportFilename(state.report, "pdf").replace(/\.pdf$/i, "");
  const restore = () => {
    document.body.classList.remove("print-report");
    document.title = previousTitle;
  };
  window.addEventListener("afterprint", restore, { once: true });
  setTimeout(() => {
    window.print();
    setTimeout(restore, 1200);
  }, 0);
}

function buildMarkdownReport(report) {
  const lines = [];
  const actions = riskActions(report);
  const contracts = report.project?.contracts || [];
  const findings = report.findings || [];

  lines.push(`# ChainLens ${t("projectRisk")}: ${report.project?.name || "Project"}`);
  lines.push("");
  lines.push(`- ${t("generatedAt")}: ${formatDateTime(report.generatedAt)}`);
  lines.push(`- ${t("network")}: ${report.project?.primaryChain?.label || "N/A"}`);
  lines.push(`- ${t("score")}: ${report.summary?.projectScore ?? "N/A"}`);
  lines.push(`- ${t("summary")}: ${localizeSummaryLabel(report.summary?.label)} - ${localizeSummaryDescription(report.summary?.description, report.summary?.level)}`);
  lines.push("");

  lines.push(`## ${t("riskActionsTitle")}`);
  if (actions.length) {
    actions.forEach((action, index) => {
      lines.push(`${index + 1}. **${localizePriority(action.priority || "low")} / ${localizeRecommendationText(action.title)}**`);
      lines.push(`   - ${localizeRecommendationText(action.action || action.reason || "")}`);
      if (action.evidence) lines.push(`   - ${t("evidence")}: ${action.evidence}`);
    });
  } else {
    lines.push(t("riskActionsEmpty"));
  }
  lines.push("");

  lines.push(`## ${t("projectFindings")}`);
  if (findings.length) {
    findings.forEach((finding) => {
      lines.push(`- **${localizeSeverity(finding.severity)} / ${finding.title}**`);
      lines.push(`  ${finding.context || ""}`);
      lines.push(`  ${t("evidence")}: ${finding.evidence || "N/A"}`);
    });
  } else {
    lines.push(t("noMaterialFindings"));
  }
  lines.push("");

  lines.push(`## ${t("contractEvidence")}`);
  if (contracts.length) {
    contracts.forEach((contract) => {
      lines.push(`- ${contractDisplayName(contract)} (${shortAddress(contract.address)}): ${contractScoreText(contract)}`);
    });
  } else {
    lines.push("N/A");
  }
  lines.push("");

  lines.push(`## ${t("sources")}`);
  (report.sources || []).forEach((source) => {
    lines.push(`- ${source.name}: ${localizeStatus(source.status)}${source.cache ? ` / ${source.cache}` : ""}`);
  });

  return `${lines.join("\n")}\n`;
}

function buildReportFilename(report, extension) {
  const date = new Date(report.generatedAt || Date.now());
  const datePart = Number.isNaN(date.getTime()) ? "report" : date.toISOString().slice(0, 10);
  return `chainlens-${slugify(report.project?.name || "report")}-${datePart}.${extension}`;
}

function localizeSeverity(severity) {
  return {
    critical: t("critical"),
    high: t("high"),
    medium: t("medium"),
    low: t("low"),
    info: t("info")
  }[severity] || severity || "N/A";
}

function localizePriority(priority) {
  if (state.locale !== "zh") return priority || "low";
  return {
    urgent: "紧急",
    high: "高",
    medium: "中",
    low: "低"
  }[priority] || priority || "低";
}

function localizeStatus(status) {
  const value = String(status || "unknown");
  if (state.locale !== "zh") return value;
  return {
    ok: "正常",
    partial: "部分可用",
    error: "错误",
    not_configured: "未配置",
    empty: "空",
    unknown: "未知",
    fixture: "示例数据",
    mock: "模拟",
    candidate: "候选",
    disabled: "已禁用",
    needs_review: "需复核"
  }[value] || value;
}

function localizeSummaryLabel(label) {
  const value = String(label || "");
  if (state.locale !== "zh") return value || "N/A";
  return {
    "High Project Risk": "项目高风险",
    "Project Needs Review": "项目需要复核",
    "Evidence Incomplete": "证据不完整",
    "No Major Signals": "未发现重大信号",
    "High Risk": "高风险",
    "Elevated Risk": "风险升高",
    "Needs Attention": "需要关注",
    "Token Model Not Applied": "未应用代币模型",
    "Analysis Failed": "分析失败",
    Scored: "已评分",
    Unscored: "未评分",
    Unknown: "未知"
  }[value] || value || "N/A";
}

function localizeSummaryDescription(description, level) {
  if (state.locale !== "zh") return description || "";
  return {
    high: "项目级证据或代币证据中发现了需要优先处理的重大风险。",
    watch: "项目存在应在依赖或交互前复核的风险信号。",
    incomplete: "当前项目证据不完整；建议补充官方入口、文档、仓库或搜索源后重新分析。",
    low: "当前证据中未发现重大项目级风险信号。",
    unscored: "该地址未被识别为 ERC-20 代币，因此跳过持有人、税费和流动性评分。"
  }[level] || description || "";
}

function localizeDimension(dimension) {
  const key = typeof dimension === "string" ? dimension : dimension?.key;
  if (state.locale !== "zh") return (typeof dimension === "string" ? dimension : dimension?.label) || "N/A";
  return {
    identity: "身份",
    asset: "资产",
    market: "市场",
    governance: "治理",
    community: "社区",
    data: "数据质量",
    contract: "合约",
    holders: "分布",
    liquidity: "流动性"
  }[key] || (typeof dimension === "string" ? dimension : dimension?.label) || "N/A";
}

function localizeAgentName(agent) {
  if (state.locale !== "zh") return agent.name || "AI Agent";
  return {
    "research-agent": "研究 Agent",
    "open-source-review-agent": "开源审查 Agent",
    "onchain-risk-agent": "链上风险 Agent",
    "synthesis-agent": "综合判断 Agent",
    "recommendation-agent": "建议 Agent",
    "agent-orchestrator": "Agent 编排器"
  }[agent.id] || agent.name || "AI Agent";
}

function localizeRecommendationText(text) {
  const value = String(text || "");
  if (state.locale !== "zh") return value;
  return {
    "Escalate critical contract signals": "升级处理严重合约信号",
    "Run a manual contract and admin-control review before depending on this project.": "在依赖该项目之前，先人工复核合约逻辑和管理员权限。",
    "Critical findings can indicate direct user-exit, balance, or contract-integrity risk.": "严重发现可能意味着退出、余额或合约完整性存在直接风险。",
    "Review direct control behavior": "复核直接控制行为",
    "Verify whether the flagged behavior is mitigated by governance, timelock, or confirmed false-positive evidence.": "确认该行为是否已被治理、时间锁或可靠误报证据缓解。",
    "Direct transfer, exit, or balance-control signals deserve immediate human review.": "直接转账、退出或余额控制信号需要立即人工复核。",
    "Reduce direct wallet exposure": "降低钱包直接暴露",
    "Review and revoke unnecessary approvals for this project before further interaction.": "继续交互前检查并撤销该项目不必要的授权。",
    "Wallet-specific exposure can remain risky even when project-level evidence is mixed.": "即使项目证据并不单一，钱包级暴露仍可能带来直接风险。",
    "Manually review high-severity on-chain signals": "人工复核高严重度链上信号",
    "Inspect the highest-severity token, holder, and liquidity findings against live explorer data.": "用实时浏览器/区块浏览器数据核对代币、持有人和流动性中的高严重度发现。",
    "High-severity signals can be legitimate in context, but should be reconciled before relying on the project.": "高严重度信号可能有合理背景，但在依赖项目前应先解释清楚。",
    "Verify liquidity control": "核实流动性控制",
    "Check LP ownership, lock status, and pair liquidity on the current trading venue.": "检查当前交易场所的 LP 持有人、锁仓状态和交易对流动性。",
    "Liquidity control can affect exit reliability and market manipulation risk.": "流动性控制会影响退出可靠性和市场操纵风险。",
    "Bind the report to an official project surface": "绑定官方项目入口",
    "Add an official website, docs page, repository, or whitepaper URL and rerun the report.": "补充官网、文档、仓库或白皮书 URL 后重新运行报告。",
    "Project identity is weak without an official surface tying claims to contracts.": "缺少能把项目声明与合约绑定的官方入口时，项目身份证据较弱。",
    "Check independent audit evidence": "检查独立审计证据",
    "Look for an audit report with matching scope, date, contract address, and commit hash.": "查找范围、日期、合约地址和 commit hash 都匹配的审计报告。",
    "The current evidence set did not confirm an audit surface.": "当前证据集没有确认审计入口。",
    "Review repository maintenance": "复核仓库维护状态",
    "Compare repository activity with the project's release, governance, and deployment claims.": "将仓库活动与项目的发布、治理和部署声明进行对照。",
    "Inactive or archived repositories can be an evidence gap for active project claims.": "不活跃或归档仓库会削弱项目仍活跃的证据链。",
    "Keep a manual diligence trail": "保留人工尽调记录",
    "Record official docs, repository, governance, and contract links before relying on the project.": "在依赖项目前记录官方文档、仓库、治理和合约链接。",
    "No major action was triggered, but evidence should remain reproducible.": "当前没有触发重大动作，但证据链仍应可复现。",
    "Review the highest-risk evidence first": "优先复核最高风险证据",
    "Start with the highest-severity finding, verify it against live sources, and document whether it is mitigated.": "从最高严重度发现开始，用实时数据源核对，并记录它是否已被缓解。"
  }[value] || value;
}

function openAIStatus(report) {
  return report.openai?.status || "not_configured";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "N/A";
  return new Intl.NumberFormat("en-US").format(Number(value));
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat(state.locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat(state.locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function shortAddress(address) {
  if (!address) return "N/A";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function slugify(value) {
  return String(value || "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "report";
}

render();
