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
  Layers,
  Lightbulb,
  Loader2,
  Network,
  Search,
  ShieldAlert,
  Sparkles,
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

let state = {
  loading: false,
  error: null,
  report: null,
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
  app.innerHTML = `
    <main class="shell">
      <section class="command-panel">
        <div class="brand-row">
          <div class="brand-mark">${icon(ShieldAlert)}</div>
          <div>
            <p class="eyebrow">ChainLens</p>
            <h1>Project risk investigation console</h1>
          </div>
        </div>
        <form id="analyze-form" class="search-panel">
          <label class="field">
            <span>Network</span>
            <select id="chain-select">
              ${chains.map((chain) => `<option value="${chain.id}" ${chain.id === state.chainId ? "selected" : ""}>${chain.label}</option>`).join("")}
            </select>
          </label>
          <label class="field address-field">
            <span>Project, website, or contract evidence</span>
            <input id="query-input" value="${escapeHtml(state.query)}" placeholder="Project name, website, 0x contract..." spellcheck="false" />
          </label>
          <button class="primary-action" type="submit" ${state.loading ? "disabled" : ""}>
            ${state.loading ? icon(Loader2, "spin") : icon(Search)}
            <span>${state.loading ? "Investigating" : "Analyze Project"}</span>
          </button>
        </form>
        <div class="example-row">
          ${examples.map((item) => `<button class="example-chip" data-query="${escapeHtml(item.query)}" data-address="${item.address}" data-chain="${item.chainId}">${item.label}</button>`).join("")}
        </div>
        ${state.error ? `<div class="error-banner">${icon(AlertTriangle)}<span>${escapeHtml(state.error)}</span></div>` : ""}
      </section>
      ${state.report ? reportTemplate(state.report) : emptyTemplate()}
      ${walletPanelTemplate(state.report, state.wallet)}
    </main>
  `;

  bindEvents();
  if (state.report) renderRadar(state.report);
}

function bindEvents() {
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
    state = { ...state, loading: false, report };
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
        <p class="eyebrow">Investigation model</p>
        <h2>Ready for analysis</h2>
        <p>No project has been analyzed in this session.</p>
      </div>
      <div class="signal-preview">
        ${previewItem(Network, "Project identity", "Waiting for official surfaces")}
        ${previewItem(WalletCards, "Asset evidence", "Waiting for contracts")}
        ${previewItem(Users, "Governance and traction", "Waiting for project evidence")}
      </div>
    </section>
  `;
}

function reportTemplate(report) {
  const primaryContract = report.project.contracts[0];
  const tokenReportCount = (report.project.contracts || []).filter((contract) => !tokenModelExcluded(contract.classification)).length;
  const researchCount = report.projectEvidence?.artifactCount || 0;
  return `
    <section class="report-grid" aria-label="Project Risk">
      <div class="score-panel level-${report.summary.level}">
        <div class="score-topline">
          <span>${icon(Gauge)} Project Risk score</span>
          <strong>${report.summary.projectScore}</strong>
        </div>
        <h2>${escapeHtml(report.summary.label)}</h2>
        <p>${escapeHtml(report.summary.description)}</p>
        <div class="severity-row">
          ${severityPill("critical", report.summary.counts.critical)}
          ${severityPill("high", report.summary.counts.high)}
          ${severityPill("medium", report.summary.counts.medium)}
          ${severityPill("low", report.summary.counts.low)}
        </div>
      </div>

      <div class="token-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Project Risk</p>
            <h2>${escapeHtml(report.project.name)} <span>${escapeHtml(report.project.website || "surface pending")}</span></h2>
          </div>
          <span class="network-pill">${escapeHtml(report.project.primaryChain.label)}</span>
        </div>
        <div class="metric-grid">
          ${metric("Contracts", formatNumber(report.project.contracts.length))}
          ${metric("Scored tokens", formatNumber(tokenReportCount))}
          ${metric("Research", `${formatNumber(researchCount)} item${researchCount === 1 ? "" : "s"}`)}
          ${metric("Findings", formatNumber(report.findings.length))}
        </div>
      </div>

      ${agentCrewTemplate(report)}

      <div class="radar-panel">
        <div class="panel-heading compact">
          <h2>Dimension health</h2>
        </div>
        <canvas id="radar-chart" width="360" height="260"></canvas>
      </div>

      <div class="signals-panel">
        <div class="panel-heading compact">
          <h2>Project findings</h2>
          <span>${report.findings.length} found</span>
        </div>
        <div class="signals-list">
          ${report.findings.map(findingTemplate).join("") || `<div class="clean-card">${icon(CheckCircle2)} No material findings in available data.</div>`}
        </div>
      </div>

      <div class="details-panel">
        ${detailCard("Identity", Network, [
          ["Website", report.project.website || "N/A"],
          ["Input", report.project.query || "N/A"],
          ["Primary chain", report.project.primaryChain.label],
          ["Research status", report.projectEvidence?.status || "empty"]
        ])}
        ${detailCard("Contract", Layers, [
          ["Contracts", formatNumber(report.project.contracts.length)],
          ["Primary", contractDisplayName(primaryContract)],
          ["Model", primaryContract?.classification?.label || "N/A"],
          ["Score", contractScoreText(primaryContract)]
        ])}
        ${detailCard("Evidence", Database, [
          ["Critical", formatNumber(report.summary.counts.critical)],
          ["High", formatNumber(report.summary.counts.high)],
          ["Medium", formatNumber(report.summary.counts.medium)],
          ["Low", formatNumber(report.summary.counts.low)],
          ["OpenAI", openAIStatus(report)]
        ])}
      </div>

      ${researchEvidenceTemplate(report.projectEvidence)}
      ${contractEvidenceTemplate(report)}
      ${suppressedFindingsTemplate(report.suppressedFindings || [])}
      ${analystNotesTemplate(report.openai)}
      ${recommendationsTemplate(report)}

      <div class="sources-panel">
        <div class="panel-heading compact">
          <h2>Sources</h2>
        </div>
        ${report.sources.map((source) => `
          <div class="source-row">
            <span>${escapeHtml(source.name)}</span>
            <strong class="source-${escapeHtml(source.status)}">${escapeHtml(source.status)}${source.cache ? ` / ${source.cache}` : ""}</strong>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function walletPanelTemplate(report, wallet) {
  const providerAvailable = hasWalletProvider();
  const status = walletStatus(report, wallet, providerAvailable);
  const contractCount = report?.project?.contracts?.length || 0;

  return `
    <section class="wallet-panel" aria-label="Your Wallet Exposure">
      <div class="panel-heading wallet-heading">
        <div>
          <p class="eyebrow">Wallet Exposure</p>
          <h2>Your Wallet Exposure</h2>
        </div>
        <span class="wallet-status wallet-status-${status.key}">${escapeHtml(status.label)}</span>
      </div>

      <div class="wallet-summary-grid">
        ${walletMetric("Wallet", wallet.account ? shortAddress(wallet.account) : "Not connected")}
        ${walletMetric("Wallet chain", wallet.chainId || "N/A")}
        ${walletMetric("Project contracts", report ? formatNumber(contractCount) : "N/A")}
        ${walletMetric("Mode", "Read-only")}
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
    return `<div class="wallet-empty">${icon(AlertTriangle)} <span>Wallet provider unavailable.</span></div>`;
  }

  if (wallet.error) {
    return `<div class="wallet-alert">${icon(AlertTriangle)} <span>${escapeHtml(wallet.error)}</span></div>`;
  }

  if (!wallet.account) {
    return `<div class="wallet-empty">${icon(WalletCards)} <span>Wallet not connected.</span></div>`;
  }

  if (!report) {
    return `<div class="wallet-empty">${icon(Search)} <span>No project report selected.</span></div>`;
  }

  if (wallet.loading) {
    return `<div class="wallet-empty">${icon(Loader2, "spin")} <span>Checking wallet exposure.</span></div>`;
  }

  if (!wallet.exposure) {
    return `<div class="wallet-empty">${icon(Activity)} <span>Exposure not checked.</span></div>`;
  }

  const exposure = wallet.exposure;
  return `
    <div class="wallet-evidence-grid">
      ${walletMetric("Holdings", formatNumber(exposure.holdings.length))}
      ${walletMetric("Allowances", formatNumber(exposure.allowances.length))}
      ${walletMetric("Recent events", formatNumber(exposure.events.length))}
      ${walletMetric("Wallet findings", formatNumber(exposure.findings.length))}
    </div>

    <div class="wallet-section">
      <div class="section-title">
        <h3>Wallet findings</h3>
        <span>${escapeHtml(exposure.status)}</span>
      </div>
      <div class="wallet-list">
        ${exposure.findings.map(walletFindingTemplate).join("") || `<div class="wallet-record clean">${icon(CheckCircle2)} <span>No wallet findings.</span></div>`}
      </div>
    </div>

    ${walletRecordsSection("Holdings", exposure.holdings, holdingTemplate)}
    ${walletRecordsSection("Allowances", exposure.allowances, allowanceTemplate)}
    ${walletRecordsSection("Recent activity", exposure.events, eventTemplate)}
  `;
}

function walletActionTemplate(report, wallet, providerAvailable) {
  if (!providerAvailable) {
    return `<button id="wallet-action" class="secondary-action" type="button" disabled>Wallet unavailable</button>`;
  }

  if (!wallet.account) {
    return `<button id="wallet-action" class="secondary-action" type="button" data-action="connect">${icon(WalletCards)} <span>Connect Wallet</span></button>`;
  }

  if (!report) {
    return `<button id="wallet-action" class="secondary-action" type="button" disabled>${icon(CheckCircle2)} <span>Connected</span></button>`;
  }

  return `<button id="wallet-action" class="secondary-action" type="button" data-action="refresh" ${wallet.loading ? "disabled" : ""}>${wallet.loading ? icon(Loader2, "spin") : icon(Activity)} <span>${wallet.loading ? "Checking" : "Recheck Exposure"}</span></button>`;
}

function walletStatus(report, wallet, providerAvailable) {
  if (!providerAvailable) return { key: "unavailable", label: "Unavailable" };
  if (wallet.loading) return { key: "checking", label: "Checking" };
  if (wallet.error) return { key: "error", label: "Error" };
  if (!wallet.account) return { key: "idle", label: "Not connected" };
  if (!report) return { key: "connected", label: "Connected" };
  if (wallet.exposure?.status === "chain_mismatch") return { key: "mismatch", label: "Chain mismatch" };
  if (wallet.exposure?.status === "contract_specific_unavailable") return { key: "connected", label: "Contract-specific" };
  if (wallet.exposure?.status === "ok") return { key: "ok", label: "Checked" };
  return { key: "connected", label: "Connected" };
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
        <span>${escapeHtml(finding.severity)}</span>
      </div>
      <p>${escapeHtml(finding.context)}</p>
      <div class="evidence-row">
        <span>${escapeHtml(finding.evidence)}</span>
        <strong>${Math.round(finding.confidence * 100)}% confidence</strong>
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
        <span>${escapeHtml(counterparty ? shortAddress(counterparty) : shortAddress(event.txHash))} · block ${escapeHtml(event.blockNumber)}</span>
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
      labels: report.dimensions.map((dimension) => dimension.label),
      datasets: [
        {
          label: "Health",
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
          <p class="eyebrow">AI Agent Crew</p>
          <h2>Coordinated diligence</h2>
        </div>
        <span>${agents.length} agent${agents.length === 1 ? "" : "s"}</span>
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
          <h3>${escapeHtml(agent.name || "AI Agent")}</h3>
          <span>${escapeHtml(agent.status || "partial")} · ${formatNumber(agent.evidenceCount || 0)} evidence</span>
        </div>
      </div>
      <p>${escapeHtml(agent.summary || "Agent result pending.")}</p>
      <div class="agent-meta-row">
        <strong>${formatNumber(findings.length)} finding${findings.length === 1 ? "" : "s"}</strong>
        <span>${Math.round((agent.confidence || 0.5) * 100)}% confidence</span>
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
          <span>${escapeHtml(signal.severity)}</span>
        </div>
        <p>${escapeHtml(signal.context)}</p>
        <div class="evidence-row">
          <span>${escapeHtml(signal.evidence)}</span>
          <strong>${Math.round(signal.confidence * 100)}% confidence</strong>
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
          <p class="eyebrow">Recommendation Agent</p>
          <h2>Next diligence actions</h2>
        </div>
        <span>${recommendations.length} action${recommendations.length === 1 ? "" : "s"}</span>
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
      <div class="recommendation-priority">${escapeHtml(recommendation.priority || "low")}</div>
      <div class="recommendation-body">
        <h3>${escapeHtml(recommendation.title)}</h3>
        <p>${escapeHtml(recommendation.action)}</p>
        <div class="evidence-row">
          <span>${escapeHtml(recommendation.reason)}</span>
          <strong>${escapeHtml(recommendation.evidence || "Evidence attached")}</strong>
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
        <h2>Suppressed false positives</h2>
        <span>${findings.length} suppressed</span>
      </div>
      <div class="signals-list compact-list">
        ${findings.map((finding) => `
          <article class="signal-card suppressed-card severity-info">
            <div class="signal-icon">${icon(CheckCircle2)}</div>
            <div>
              <div class="signal-title-row">
                <h3>${escapeHtml(finding.title)}</h3>
                <span>false positive</span>
              </div>
              <p>${escapeHtml(finding.suppressionReason || finding.review?.reason || finding.context)}</p>
              <div class="evidence-row">
                <span>${escapeHtml(finding.suppressionEvidence || finding.review?.evidence || finding.evidence)}</span>
                <strong>${Math.round((finding.review?.confidence || finding.confidence || 0.5) * 100)}% confidence</strong>
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
        <h2>Analyst notes</h2>
        <span>${escapeHtml(openai?.status || "unknown")}</span>
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
        <h2>Project evidence</h2>
        <span>${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}</span>
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
        <p>${escapeHtml(artifact.summary || "Evidence collected.")}</p>
        <div class="artifact-meta">
          ${facts.map((fact) => `<strong>${escapeHtml(fact)}</strong>`).join("")}
          <a href="${escapeHtml(artifact.url)}" target="_blank" rel="noreferrer">${icon(ExternalLink)} <span>Open</span></a>
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
        <h2>Contract evidence</h2>
        <span>${contracts.length} contract${contracts.length === 1 ? "" : "s"}</span>
      </div>
      <div class="asset-list">
        ${contracts.map((contract) => `
          <article class="asset-row">
            <div>
              <strong>${escapeHtml(contractDisplayName(contract))}</strong>
              <span>${escapeHtml(shortAddress(contract.address))} · ${escapeHtml(contract.chain?.label || "Unknown chain")} · ${escapeHtml(contract.classification?.label || "contract")}</span>
            </div>
            <div>
              <strong>${escapeHtml(contract.riskLabel || "Unknown")}</strong>
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
  if (contract.trustScore === null || contract.trustScore === undefined) return contract.riskLabel || "Unscored";
  return `${formatNumber(contract.trustScore)} score · ${contract.riskLabel || "Scored"}`;
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
  return `<span class="severity-pill severity-${severity}">${severity} ${count}</span>`;
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
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function shortAddress(address) {
  if (!address) return "N/A";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

render();
