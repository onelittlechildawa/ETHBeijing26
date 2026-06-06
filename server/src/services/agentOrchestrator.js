import { requestStructuredAI } from "./openai.js";

const VALID_STATUSES = new Set(["ok", "partial", "error", "not_configured"]);
const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);
const VALID_PRIORITIES = new Set(["urgent", "high", "medium", "low"]);
const PRIORITY_WEIGHT = { urgent: 4, high: 3, medium: 2, low: 1 };

export async function runAgentOrchestrator(context) {
  const baseAgents = [
    buildResearchAgent(context),
    buildOpenSourceReviewAgent(context),
    buildOnchainRiskAgent(context),
    buildSynthesisAgent(context)
  ];
  const recommendationAgent = await buildRecommendationAgent({ ...context, agents: baseAgents });
  return [...baseAgents, recommendationAgent];
}

export function extractAgentRecommendations(agents = []) {
  return agents
    .find((agent) => agent.id === "recommendation-agent")
    ?.recommendations || [];
}

function buildResearchAgent({ projectEvidence, localFindings = [], project }) {
  const artifacts = projectEvidence?.artifacts || [];
  const surfaces = projectEvidence?.surfaces || {};
  const surfaceCount = Object.values(surfaces).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
  const findings = localFindings
    .filter((finding) => ["identity", "data", "community"].includes(finding.dimension))
    .slice(0, 5);

  return normalizeAgent({
    id: "research-agent",
    name: "Research Agent",
    status: normalizeStatus(projectEvidence?.status, artifacts.length ? "ok" : "partial"),
    summary: artifacts.length
      ? `Collected ${artifacts.length} evidence artifact${artifacts.length === 1 ? "" : "s"} across ${surfaceCount} project surface${surfaceCount === 1 ? "" : "s"}.`
      : "No official project evidence was collected yet; project identity remains thin.",
    confidence: artifacts.length ? 0.78 : 0.48,
    findings,
    evidenceCount: artifacts.length + surfaceCount + (projectEvidence?.addresses?.length || 0),
    sources: projectEvidence?.sources || [],
    meta: {
      project: project?.name || null,
      artifacts: artifacts.map((artifact) => ({
        type: artifact.type,
        title: artifact.title,
        url: artifact.url,
        status: artifact.status
      })).slice(0, 8)
    }
  });
}

function buildOpenSourceReviewAgent({ project, projectEvidence, contractProfiles = [] }) {
  const findings = [];
  const artifacts = projectEvidence?.artifacts || [];
  const repositories = artifacts.filter((artifact) => artifact.type === "github_repository");
  const audits = project?.surfaces?.audits || [];
  let verifiedCount = 0;

  for (const result of contractProfiles) {
    const profile = result.profile;
    const verified = profile?.verifiedContract;
    const contractName = profile?.contractName || profile?.name || "Contract";

    if (!verified) {
      findings.push(agentFinding({
        dimension: "technical",
        title: `${contractName} verified source was not confirmed`,
        severity: "medium",
        confidence: 0.68,
        evidence: `No Sourcify verified source metadata for ${shortAddress(result.address)}`,
        context: "Manual review should confirm whether source code is verified on the relevant explorer or repository."
      }));
      continue;
    }

    verifiedCount += 1;
    findings.push(agentFinding({
      dimension: "technical",
      title: `${contractName} source is verified`,
      severity: "info",
      confidence: 0.9,
      evidence: `Sourcify ${verified.match}; ${verified.fullyQualifiedName || profile?.fullyQualifiedName || "verified source"}`,
      context: "Verified source metadata makes deeper contract review possible."
    }));

    const proxyText = JSON.stringify(verified.proxyResolution || {}).toLowerCase();
    if (proxyText && proxyText !== "{}") {
      findings.push(agentFinding({
        dimension: "technical",
        title: `${contractName} proxy metadata needs review`,
        severity: "low",
        confidence: 0.72,
        evidence: "Sourcify returned proxy resolution metadata",
        context: "Proxy or implementation metadata should be matched to governance and admin controls before relying on the contract."
      }));
    }

    const sensitiveFunctions = (verified.abiSummary?.functions || [])
      .filter((name) => /owner|admin|upgrade|implementation|pause|blacklist|whitelist|mint/i.test(name))
      .slice(0, 6);
    if (sensitiveFunctions.length) {
      findings.push(agentFinding({
        dimension: "technical",
        title: `${contractName} exposes permission-oriented ABI functions`,
        severity: "medium",
        confidence: 0.74,
        evidence: sensitiveFunctions.join(", "),
        context: "These functions are not automatically unsafe, but their callers and governance controls should be reviewed."
      }));
    }
  }

  for (const repo of repositories) {
    const pushedAt = repo.facts?.pushedAt ? new Date(repo.facts.pushedAt) : null;
    const staleDays = pushedAt && Number.isFinite(pushedAt.getTime())
      ? Math.floor((Date.now() - pushedAt.getTime()) / 86400000)
      : null;
    if (repo.facts?.archived || repo.facts?.disabled || (staleDays !== null && staleDays > 540)) {
      findings.push(agentFinding({
        dimension: "community",
        title: `${repo.title} maintenance needs review`,
        severity: repo.facts?.archived || repo.facts?.disabled ? "medium" : "low",
        confidence: 0.72,
        evidence: repo.facts?.archived || repo.facts?.disabled
          ? "Repository is archived or disabled"
          : `Last push was ${staleDays} days ago`,
        context: "Repository maintenance should be reconciled with the project's current claims and release cadence."
      }));
    }
  }

  if ((contractProfiles.length || repositories.length) && !audits.length) {
    findings.push(agentFinding({
      dimension: "technical",
      title: "Independent audit surface was not confirmed",
      severity: "medium",
      confidence: 0.58,
      evidence: "No audit URL was collected from project surfaces",
      context: "Look for a matching audit report, scope, date, and commit hash before treating this as reviewed code."
    }));
  }

  return normalizeAgent({
    id: "open-source-review-agent",
    name: "Open Source Review Agent",
    status: contractProfiles.length || repositories.length ? "ok" : "partial",
    summary: verifiedCount
      ? `Reviewed ${verifiedCount} verified contract source profile${verifiedCount === 1 ? "" : "s"} and ${repositories.length} repository artifact${repositories.length === 1 ? "" : "s"}.`
      : "Open-source review is limited because verified source or repository evidence is thin.",
    confidence: verifiedCount || repositories.length ? 0.72 : 0.44,
    findings: orderFindings(findings).slice(0, 7),
    evidenceCount: verifiedCount + repositories.length + audits.length,
    sources: [
      ...contractProfiles.flatMap((result) => result.sources || [result.source]).filter(Boolean),
      ...repositories.map((repo) => ({ name: "GitHub Repository Evidence", status: repo.status || "ok", url: repo.url }))
    ]
  });
}

function buildOnchainRiskAgent({ tokenReports = [], localFindings = [] }) {
  const tokenSignals = tokenReports
    .flatMap((report) => (report.signals || []).map((signal) => ({
      ...signal,
      title: signal.title || signal.signal,
      context: signal.context || "",
      tokenSymbol: report.token?.symbol,
      address: report.address
    })));
  const materialSignals = tokenSignals
    .filter((signal) => ["critical", "high", "medium"].includes(signal.severity))
    .map((signal) => agentFinding({
      dimension: signal.dimension || "asset",
      title: signal.tokenSymbol ? `${signal.tokenSymbol}: ${signal.title}` : signal.title,
      severity: signal.severity,
      confidence: signal.confidence,
      evidence: signal.evidence,
      context: signal.context
    }));
  const fallbackFindings = localFindings
    .filter((finding) => ["asset", "market"].includes(finding.dimension))
    .slice(0, 4);
  const findings = orderFindings([...materialSignals, ...fallbackFindings]).slice(0, 8);
  const critical = tokenSignals.filter((signal) => signal.severity === "critical").length;
  const high = tokenSignals.filter((signal) => signal.severity === "high").length;

  return normalizeAgent({
    id: "onchain-risk-agent",
    name: "On-chain Risk Agent",
    status: tokenReports.length ? "ok" : "partial",
    summary: tokenReports.length
      ? `Reviewed ${tokenReports.length} contract target${tokenReports.length === 1 ? "" : "s"} with ${critical} critical and ${high} high on-chain signal${critical + high === 1 ? "" : "s"}.`
      : "No contract target was available for chain-level risk analysis.",
    confidence: tokenReports.length ? 0.86 : 0.42,
    findings,
    evidenceCount: tokenSignals.length,
    sources: tokenReports.flatMap((report) => report.sources || [])
  });
}

function buildSynthesisAgent({ openai, localFindings = [], summary }) {
  const openaiFindings = openai?.findings || [];
  const findingReviews = openai?.findingReviews || [];
  return normalizeAgent({
    id: "synthesis-agent",
    name: "Synthesis Agent",
    status: normalizeStatus(openai?.status, "not_configured"),
    summary: openai?.summary || summary?.description || "Deterministic findings are available; model synthesis is not configured.",
    confidence: openai?.status === "ok" || openai?.status === "mock" ? 0.78 : 0.54,
    findings: openaiFindings.slice(0, 6),
    evidenceCount: localFindings.length + findingReviews.length,
    sources: [
      {
        name: "OpenAI-compatible Project Analysis",
        status: openai?.status || "not_configured",
        message: openai?.message
      }
    ]
  });
}

async function buildRecommendationAgent(context) {
  const fallbackRecommendations = buildRuleRecommendations(context);
  const aiResult = await requestRecommendationAI(context, fallbackRecommendations);
  const aiRecommendations = normalizeRecommendations(aiResult.payload?.recommendations);
  const recommendations = dedupeRecommendations([
    ...aiRecommendations,
    ...fallbackRecommendations
  ]).sort(sortRecommendation).slice(0, 5);
  const status = recommendations.length ? "ok" : normalizeStatus(aiResult.status, "partial");

  return normalizeAgent({
    id: "recommendation-agent",
    name: "Recommendation Agent",
    status,
    summary: aiResult.payload?.summary || summarizeRecommendations(recommendations),
    confidence: aiResult.status === "ok" || aiResult.status === "mock" ? 0.78 : 0.68,
    findings: [],
    recommendations,
    evidenceCount: context.findings?.length || context.localFindings?.length || 0,
    sources: [
      {
        name: "Rule-based Recommendation Fallback",
        status: fallbackRecommendations.length ? "ok" : "partial"
      },
      {
        name: "OpenAI-compatible Recommendation Agent",
        status: aiResult.status,
        message: aiResult.message
      }
    ]
  });
}

async function requestRecommendationAI(context, fallbackRecommendations) {
  const payload = {
    project: {
      name: context.project?.name,
      website: context.project?.website,
      primaryChain: context.project?.primaryChain?.label,
      contracts: (context.project?.contracts || []).map((contract) => ({
        address: contract.address,
        name: contract.name || contract.contractName || contract.symbol,
        classification: contract.classification?.label,
        riskLabel: contract.riskLabel,
        trustScore: contract.trustScore
      }))
    },
    summary: context.summary,
    findings: summarizeFindings(context.findings || context.localFindings || []),
    agentSummaries: (context.agents || []).map((agent) => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      summary: agent.summary,
      evidenceCount: agent.evidenceCount
    })),
    fallbackRecommendations
  };

  return requestStructuredAI({
    system: [
      "You are ChainLens' Recommendation Agent.",
      "Return JSON only. Do not include markdown.",
      "Schema: {\"summary\":\"string\",\"recommendations\":[{\"priority\":\"urgent|high|medium|low\",\"title\":\"string\",\"action\":\"string\",\"reason\":\"string\",\"evidence\":\"string\"}]}",
      "Recommend next diligence and safety actions only.",
      "Do not provide investment advice, buy or sell instructions, price predictions, guaranteed outcomes, or scam labels.",
      "Use urgent only for critical findings, honeypot-like behavior, owner balance modification, or direct wallet exposure.",
      "Keep recommendations concrete and evidence-backed."
    ].join(" "),
    payload,
    temperature: 0.15
  });
}

function buildRuleRecommendations({ project, projectEvidence, tokenReports = [], findings = [], localFindings = [], walletExposure = null }) {
  const activeFindings = findings.length ? findings : localFindings;
  const tokenSignals = tokenReports.flatMap((report) => report.signals || []);
  const recommendations = [];

  const criticalSignals = tokenSignals.filter((signal) => signal.severity === "critical");
  const criticalFindings = activeFindings.filter((finding) => finding.severity === "critical");
  if (criticalSignals.length || criticalFindings.length) {
    recommendations.push(recommendation({
      priority: "urgent",
      title: "Escalate critical contract signals",
      action: "Run a manual contract and admin-control review before depending on this project.",
      reason: "Critical findings can indicate direct user-exit, balance, or contract-integrity risk.",
      evidence: firstEvidence([...criticalSignals, ...criticalFindings])
    }));
  }

  const directControlSignal = tokenSignals.find((signal) => {
    const text = `${signal.signal} ${signal.evidence}`;
    return signal.severity === "critical" && (
      /honeypot|owner can modify balances/i.test(text) ||
      /(?:is_honeypot|owner_change_balance)\s*=\s*1/i.test(text)
    );
  });
  if (directControlSignal) {
    recommendations.push(recommendation({
      priority: "urgent",
      title: "Review direct control behavior",
      action: "Verify whether the flagged behavior is mitigated by governance, timelock, or confirmed false-positive evidence.",
      reason: "Direct transfer, exit, or balance-control signals deserve immediate human review.",
      evidence: directControlSignal.evidence
    }));
  }

  const walletFinding = (walletExposure?.findings || []).find((finding) => finding.severity === "high" || /unlimited|allowance/i.test(`${finding.title} ${finding.evidence}`));
  if (walletFinding) {
    recommendations.push(recommendation({
      priority: "urgent",
      title: "Reduce direct wallet exposure",
      action: "Review and revoke unnecessary approvals for this project before further interaction.",
      reason: "Wallet-specific exposure can remain risky even when project-level evidence is mixed.",
      evidence: walletFinding.evidence || walletFinding.title
    }));
  }

  const liquiditySignal = tokenSignals.find((signal) => /lp appears mostly unlocked|liquidity is|lp ownership/i.test(signal.signal || ""));
  const highSignals = tokenSignals.filter((signal) => signal.severity === "high" && signal !== liquiditySignal);
  if (highSignals.length) {
    recommendations.push(recommendation({
      priority: "high",
      title: "Manually review high-severity on-chain signals",
      action: "Inspect the highest-severity token, holder, and liquidity findings against live explorer data.",
      reason: "High-severity signals can be legitimate in context, but should be reconciled before relying on the project.",
      evidence: firstEvidence(highSignals)
    }));
  }

  if (liquiditySignal) {
    recommendations.push(recommendation({
      priority: liquiditySignal.severity === "critical" ? "urgent" : "high",
      title: "Verify liquidity control",
      action: "Check LP ownership, lock status, and pair liquidity on the current trading venue.",
      reason: "Liquidity control can affect exit reliability and market manipulation risk.",
      evidence: liquiditySignal.evidence
    }));
  }

  if (!project?.website) {
    recommendations.push(recommendation({
      priority: "high",
      title: "Bind the report to an official project surface",
      action: "Add an official website, docs page, repository, or whitepaper URL and rerun the report.",
      reason: "Project identity is weak without an official surface tying claims to contracts.",
      evidence: "No official project website is attached"
    }));
  }

  const artifacts = projectEvidence?.artifacts || [];
  const hasAudit = (project?.surfaces?.audits || []).length > 0;
  if ((project?.contracts || []).length && !hasAudit) {
    recommendations.push(recommendation({
      priority: "medium",
      title: "Check independent audit evidence",
      action: "Look for an audit report with matching scope, date, contract address, and commit hash.",
      reason: "The current evidence set did not confirm an audit surface.",
      evidence: "No audit URL collected"
    }));
  }

  const staleRepo = artifacts.find((artifact) => {
    if (artifact.type !== "github_repository") return false;
    const pushedAt = artifact.facts?.pushedAt ? new Date(artifact.facts.pushedAt) : null;
    const staleDays = pushedAt && Number.isFinite(pushedAt.getTime()) ? Math.floor((Date.now() - pushedAt.getTime()) / 86400000) : null;
    return artifact.facts?.archived || artifact.facts?.disabled || (staleDays !== null && staleDays > 540);
  });
  if (staleRepo) {
    recommendations.push(recommendation({
      priority: "medium",
      title: "Review repository maintenance",
      action: "Compare repository activity with the project's release, governance, and deployment claims.",
      reason: "Inactive or archived repositories can be an evidence gap for active project claims.",
      evidence: staleRepo.title
    }));
  }

  if (!recommendations.length) {
    recommendations.push(recommendation({
      priority: "low",
      title: "Keep a manual diligence trail",
      action: "Record official docs, repository, governance, and contract links before relying on the project.",
      reason: "No major action was triggered, but evidence should remain reproducible.",
      evidence: `${artifacts.length} evidence artifact${artifacts.length === 1 ? "" : "s"} currently attached`
    }));
  }

  return dedupeRecommendations(recommendations).sort(sortRecommendation).slice(0, 5);
}

function normalizeAgent(input) {
  return {
    id: input.id,
    name: input.name,
    status: normalizeStatus(input.status, "partial"),
    summary: input.summary || "",
    confidence: clampConfidence(input.confidence),
    findings: normalizeFindings(input.findings),
    recommendations: normalizeRecommendations(input.recommendations),
    evidenceCount: Number.isFinite(Number(input.evidenceCount)) ? Number(input.evidenceCount) : 0,
    sources: input.sources || [],
    meta: input.meta
  };
}

function normalizeFindings(findings = []) {
  if (!Array.isArray(findings)) return [];
  return findings.map((finding, index) => agentFinding({
    id: finding.id,
    dimension: finding.dimension,
    title: finding.title || finding.signal,
    severity: finding.severity,
    confidence: finding.confidence,
    evidence: finding.evidence,
    context: finding.context || finding.description,
    index
  }));
}

function agentFinding(input) {
  const title = input.title || "Agent finding";
  return {
    id: input.id || `agent-${slugify(title)}-${input.index || 0}`,
    dimension: input.dimension || "technical",
    title,
    severity: VALID_SEVERITIES.has(input.severity) ? input.severity : "info",
    confidence: clampConfidence(input.confidence),
    evidence: input.evidence || "Agent analysis",
    context: input.context || ""
  };
}

function normalizeRecommendations(recommendations = []) {
  if (!Array.isArray(recommendations)) return [];
  return recommendations
    .map(recommendation)
    .filter((item) => item.title && item.action)
    .sort(sortRecommendation);
}

function recommendation(input = {}) {
  const priority = VALID_PRIORITIES.has(input.priority) ? input.priority : "low";
  return {
    priority,
    title: String(input.title || "").trim(),
    action: String(input.action || "").trim(),
    reason: String(input.reason || "").trim(),
    evidence: String(input.evidence || "").trim()
  };
}

function dedupeRecommendations(recommendations) {
  const seen = new Set();
  return recommendations.filter((item) => {
    const key = slugify(`${item.priority}-${item.title}-${item.action}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeRecommendations(recommendations) {
  if (!recommendations.length) return "No recommendation was generated from the available evidence.";
  const topPriority = recommendations[0].priority;
  return `${recommendations.length} next-step recommendation${recommendations.length === 1 ? "" : "s"} generated; highest priority is ${topPriority}.`;
}

function summarizeFindings(findings) {
  return findings.slice(0, 12).map((finding) => ({
    id: finding.id,
    dimension: finding.dimension,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    evidence: finding.evidence,
    context: finding.context
  }));
}

function orderFindings(findings) {
  return [...findings].sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity));
}

function severityWeight(severity) {
  return {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1
  }[severity] || 0;
}

function sortRecommendation(left, right) {
  return (PRIORITY_WEIGHT[right.priority] || 0) - (PRIORITY_WEIGHT[left.priority] || 0);
}

function normalizeStatus(status, fallback) {
  if (status === "mock") return "ok";
  if (status === "empty" || status === "candidate") return "partial";
  return VALID_STATUSES.has(status) ? status : fallback;
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

function firstEvidence(items) {
  return items.find((item) => item?.evidence)?.evidence || items[0]?.title || "Project findings";
}

function shortAddress(address) {
  if (!address) return "unknown address";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}
