import { analyzeToken } from "./analyzer.js";
import { extractAgentRecommendations, runAgentOrchestrator } from "./agentOrchestrator.js";
import { SUPPORTED_CHAINS, getChain } from "./chains.js";
import { fetchContractProfiles } from "./contractSearch.js";
import { requestProjectOpenAI } from "./openai.js";
import { collectProjectEvidence } from "./projectEvidence.js";
import { classifyContractScope, isTokenModelExcluded } from "./projectScope.js";
import { createReportCredential } from "./reportCredential.js";

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/g;
const MAX_CONTRACT_TARGETS = 12;
const PROJECT_ANALYSIS_PROGRESS_STEPS = [
  "normalize",
  "input_evidence",
  "contract_analysis",
  "project_evidence",
  "contract_refresh",
  "scoring",
  "ai_review",
  "agent_review",
  "report"
];
const PROJECT_ANALYSIS_PROGRESS_LABELS = {
  normalize: "Normalize input",
  input_evidence: "Collect supplied evidence",
  contract_analysis: "Analyze contract targets",
  project_evidence: "Expand project evidence",
  contract_refresh: "Refresh discovered contracts",
  scoring: "Score findings",
  ai_review: "Run analyst review",
  agent_review: "Coordinate agent review",
  report: "Assemble report"
};
const NARRATIVE_LANGUAGE_PATTERNS = [
  {
    label: "future or revolution language",
    category: "vision",
    claim: "Vision-heavy language",
    question: "What live product, usage, or deployed contract proves the vision is already shipping?",
    pattern: /\b(future of|revolutioni[sz]e|revolutionary|disrupt|transform|next[- ]generation|redefine)\b/i
  },
  {
    label: "superlative positioning",
    category: "positioning",
    claim: "Market-leading positioning",
    question: "Which independent metric, user base, or production evidence supports the positioning?",
    pattern: /\b(leading|world[- ]class|best[- ]in[- ]class|cutting[- ]edge|breakthrough|game[- ]changing|ultimate)\b/i
  },
  {
    label: "growth or reward promises",
    category: "rewards",
    claim: "Reward or growth promise",
    question: "Where do the rewards, yield, or growth claims come from after incentives are removed?",
    pattern: /\b(unlock|empower|mass adoption|passive income|yield|rewards?|airdrop|guaranteed|risk[- ]free|100x|moon)\b/i
  },
  {
    label: "trend-heavy labels",
    category: "trend",
    claim: "Trend label",
    question: "Is the AI, DePIN, RWA, GameFi, or SocialFi label tied to a reproducible implementation?",
    pattern: /\b(ai[- ]powered|ai agent|depin|rwa|metaverse|gamefi|socialfi)\b/i
  },
  {
    label: "decentralization claims",
    category: "decentralization",
    claim: "Decentralization claim",
    question: "Who controls admin keys, upgrades, treasury movement, frontends, and governance execution?",
    pattern: /\b(decentralized|trustless|permissionless|dao[- ]governed|community[- ]owned)\b|去中心化|无需信任|无需许可|社区治理|DAO 治理/i
  },
  {
    label: "Chinese vision or promotion terms",
    category: "promotion",
    claim: "Promotional wording",
    question: "Which verifiable artifact turns the promotional claim into shipped evidence?",
    pattern: /叙事|愿景|赋能|革命|颠覆|下一代|重新定义|引领|打造|生态|空投|收益|稳赚|无风险|百倍|万倍|爆发/i
  }
];
const NARRATIVE_ARTIFACT_TYPES = new Set(["web_page", "whitepaper", "docs", "web_search"]);

export async function analyzeProject(input, options = {}) {
  const progress = createProjectProgressReporter(options.onProgress);
  progress("normalize");
  const seed = normalizeProjectInput(input);
  progress("input_evidence");
  const inputEvidence = await collectProjectEvidence({ seed });
  let analysisSeed = enrichSeedWithEvidence(seed, inputEvidence);
  progress("contract_analysis", `${analysisSeed.addresses.length} target${analysisSeed.addresses.length === 1 ? "" : "s"}`);
  let { rawTokenReports, contractProfiles } = await analyzeSeedTargets(analysisSeed);
  let tokenReports = applyScopeClassifications(analysisSeed, rawTokenReports, contractProfiles, inputEvidence);
  const draftProject = buildProjectProfile(analysisSeed, tokenReports, contractProfiles, inputEvidence);
  progress("project_evidence", draftProject.name);
  let projectEvidence = await collectProjectEvidence({ seed: analysisSeed, project: draftProject, existingEvidence: inputEvidence });
  const finalSeed = enrichSeedWithEvidence(analysisSeed, projectEvidence);

  if (finalSeed.addresses.length !== analysisSeed.addresses.length) {
    analysisSeed = finalSeed;
    progress("contract_refresh", `${analysisSeed.addresses.length} target${analysisSeed.addresses.length === 1 ? "" : "s"}`);
    ({ rawTokenReports, contractProfiles } = await analyzeSeedTargets(analysisSeed));
  } else {
    analysisSeed = finalSeed;
  }

  tokenReports = applyScopeClassifications(analysisSeed, rawTokenReports, contractProfiles, projectEvidence);
  const project = buildProjectProfile(analysisSeed, tokenReports, contractProfiles, projectEvidence);
  progress("scoring", project.name);
  const localFindings = buildLocalFindings(analysisSeed, tokenReports, project, contractProfiles, projectEvidence);
  progress("ai_review", `${localFindings.length} local finding${localFindings.length === 1 ? "" : "s"}`);
  const openai = await requestProjectOpenAI({ project, tokenReports, localFindings, researchEvidence: projectEvidence });
  const scoringFindings = mergeAiFindings(localFindings, openai.findings);
  const adjudicated = adjudicateFindings(scoringFindings, openai.findingReviews);
  let summary = summarizeProject(adjudicated.activeFindings, tokenReports);
  const dimensions = buildProjectDimensions(adjudicated.activeFindings, tokenReports);
  progress("agent_review", `${adjudicated.activeFindings.length} active finding${adjudicated.activeFindings.length === 1 ? "" : "s"}`);
  const agents = await buildAgents({
    project,
    tokenReports,
    localFindings,
    findings: adjudicated.activeFindings,
    suppressedFindings: adjudicated.suppressedFindings,
    summary,
    dimensions,
    openai,
    projectEvidence,
    contractProfiles
  });
  const recommendations = extractAgentRecommendations(agents);
  summary = applyAgentScoreAdjustment(summary, {
    agents,
    recommendations,
    findings: adjudicated.activeFindings
  });
  const summaryActions = buildSummaryActions({ summary, recommendations, findings: adjudicated.activeFindings });
  const skepticReview = buildSkepticReview({
    project,
    tokenReports,
    findings: adjudicated.activeFindings,
    projectEvidence,
    contractProfiles,
    agents,
    recommendations,
    summary
  });
  const report = {
    generatedAt: new Date().toISOString(),
    project,
    summary: {
      ...summary,
      actions: summaryActions
    },
    dimensions,
    skepticReview,
    agents,
    recommendations,
    findings: adjudicated.activeFindings,
    suppressedFindings: adjudicated.suppressedFindings,
    tokenReports,
    openai: {
      status: openai.status,
      summary: openai.summary,
      message: openai.message,
      findings: openai.findings,
      findingReviews: openai.findingReviews
    },
    projectEvidence,
    contractProfiles,
    sources: buildSources(tokenReports, contractProfiles, openai, projectEvidence, agents)
  };
  progress("report", "ready");
  report.credential = await createReportCredential(report);

  return report;
}

function createProjectProgressReporter(onProgress) {
  if (typeof onProgress !== "function") return () => {};
  const startedAt = Date.now();

  return (id, detail = "") => {
    const index = PROJECT_ANALYSIS_PROGRESS_STEPS.indexOf(id);
    const step = index >= 0 ? index + 1 : 0;
    try {
      onProgress({
        id,
        label: PROJECT_ANALYSIS_PROGRESS_LABELS[id] || id,
        detail,
        step,
        total: PROJECT_ANALYSIS_PROGRESS_STEPS.length,
        percent: step ? Math.round((step / PROJECT_ANALYSIS_PROGRESS_STEPS.length) * 100) : 0,
        elapsedMs: Date.now() - startedAt,
        at: new Date().toISOString()
      });
    } catch {
      // Progress reporting is best-effort and must not interrupt analysis.
    }
  };
}

async function buildAgents(context) {
  try {
    return await runAgentOrchestrator(context);
  } catch (error) {
    return [
      {
        id: "agent-orchestrator",
        name: "AI Agent Orchestrator",
        status: "error",
        summary: "Agent orchestration failed; deterministic report fields are still available.",
        confidence: 0.3,
        findings: [],
        recommendations: [],
        evidenceCount: 0,
        sources: [
          {
            name: "AI Agent Orchestrator",
            status: "error",
            message: error.message
          }
        ]
      }
    ];
  }
}

async function analyzeSeedTargets(seed) {
  const tokenTargets = deriveTokenTargets(seed);
  const [rawTokenReports, contractProfiles] = await Promise.all([
    analyzeTokenTargets(tokenTargets),
    fetchContractProfiles(tokenTargets)
  ]);
  return { rawTokenReports, contractProfiles };
}

function applyScopeClassifications(seed, tokenReports, contractProfiles, projectEvidence) {
  const profilesByAddress = new Map(contractProfiles.map((result) => [String(result.address).toLowerCase(), result.profile]));
  return tokenReports.map((report) => {
    const profile = profilesByAddress.get(String(report.address).toLowerCase());
    const override = classifyContractScope({ seed, report, profile, projectEvidence });
    if (!override) return report;

    return {
      ...report,
      classification: override,
      summary: {
        trustScore: null,
        level: "unscored",
        label: "Token Model Not Applied",
        description: `${override.label} detected from verified contract metadata, so ERC-20 holder, tax, and liquidity scoring were skipped.`,
        counts: { critical: 0, high: 0, medium: 0, low: 0 }
      },
      signals: [
        {
          id: "contract-token-model-not-applied",
          dimension: "contract",
          signal: "Token-specific model was not applied",
          severity: "info",
          confidence: override.confidence,
          evidence: override.reason,
          context: `${override.label} is outside the ERC-20 token model. Holder, tax, and DEX-liquidity findings are excluded instead of scored as token risk.`
        }
      ]
    };
  });
}

function adjudicateFindings(findings, reviews = []) {
  const reviewsByFindingId = new Map(reviews.map((review) => [review.findingId, review]));
  const activeFindings = [];
  const suppressedFindings = [];

  for (const finding of findings) {
    const review = reviewsByFindingId.get(finding.id);
    const reviewedFinding = review ? { ...finding, review } : finding;
    if (review?.verdict === "false_positive" && review.confidence >= 0.7) {
      suppressedFindings.push({
        ...reviewedFinding,
        suppressed: true,
        suppressionReason: review.reason,
        suppressionEvidence: review.evidence
      });
    } else {
      activeFindings.push(reviewedFinding);
    }
  }

  return { activeFindings, suppressedFindings };
}

function mergeAiFindings(localFindings, aiFindings = []) {
  const merged = [...localFindings];
  const seen = new Set(localFindings.map(findingKey));

  for (const finding of aiFindings) {
    if (!finding?.title || !finding?.context) continue;
    const normalized = {
      ...finding,
      id: finding.id || `ai-${slugify(`${finding.dimension || "technical"}-${finding.title}`)}`,
      source: "ai_review",
      confidence: clampConfidence(finding.confidence, 0.72)
    };
    const key = findingKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }

  return merged;
}

function findingKey(finding) {
  return slugify(`${finding.dimension || "technical"}-${finding.title || ""}-${finding.evidence || ""}`);
}

function normalizeProjectInput(input) {
  const query = String(input.query || "").trim();
  const website = normalizeUrl(input.website || extractUrl(query));
  const chainId = String(input.chainId || "1");
  const addresses = unique([
    ...extractAddresses(query),
    ...extractAddresses(input.addresses || input.address || "")
  ]);

  return {
    query,
    name: String(input.name || inferName(query, website, addresses[0]) || "Unknown project").trim(),
    website,
    chainId,
    addresses
  };
}

function enrichSeedWithEvidence(seed, evidence) {
  const evidenceWebsite = evidence?.surfaces?.websites?.[0]?.url || evidence?.surfaces?.docs?.[0]?.url || null;
  const evidenceName = inferEvidenceName(evidence);
  const currentName = String(seed.name || "");
  return {
    ...seed,
    name: isGenericName(currentName) && evidenceName ? evidenceName : seed.name,
    website: seed.website || evidenceWebsite || null,
    addresses: unique([
      ...(seed.addresses || []),
      ...(evidence?.addresses || [])
    ])
  };
}

function deriveTokenTargets(seed) {
  return seed.addresses.slice(0, MAX_CONTRACT_TARGETS).map((address) => ({
    chainId: SUPPORTED_CHAINS.some((chain) => chain.id === seed.chainId) ? seed.chainId : "1",
    address: address.toLowerCase()
  }));
}

async function analyzeTokenTargets(targets) {
  const results = await Promise.allSettled(targets.map((target) => analyzeToken(target)));
  return results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const target = targets[index];
    return {
      address: target.address,
      chain: getChain(target.chainId),
      error: result.reason?.message || "Token analysis failed",
      summary: {
        trustScore: 0,
        level: "unknown",
        label: "Analysis Failed",
        counts: { critical: 0, high: 0, medium: 0, low: 0 }
      },
      signals: [],
      sources: []
    };
  });
}

function buildProjectProfile(seed, tokenReports, contractProfiles, projectEvidence) {
  const surfaces = extractProjectSurfaces(tokenReports, contractProfiles, projectEvidence);
  const profileName = contractProfiles.find((result) => result.profile?.name)?.profile?.name;
  const profilesByAddress = new Map(contractProfiles.map((result) => [String(result.address).toLowerCase(), result.profile]));
  return {
    name: (seed.name === "Unknown project" || /^Project 0x/i.test(seed.name)) && profileName ? profileName : seed.name,
    query: seed.query,
    website: seed.website || surfaces.websites[0]?.url || null,
    surfaces,
    research: {
      status: projectEvidence?.status || "empty",
      artifactCount: projectEvidence?.artifactCount || 0
    },
    primaryChain: getChain(seed.chainId) || getChain("1"),
    contracts: tokenReports.map((report) => {
      const profile = profilesByAddress.get(String(report.address).toLowerCase());
      return {
        address: report.address,
        chain: report.chain,
        symbol: report.token?.symbol || null,
        name: report.token?.name || profile?.name || null,
        contractName: profile?.contractName || null,
        pairAddress: report.token?.pairAddress || null,
        dexId: report.token?.dexId || null,
        pairUrl: report.token?.pairUrl || null,
        websites: report.token?.websites || [],
        socials: report.token?.socials || [],
        verifiedContract: profile?.verifiedContract || null,
        classification: report.classification || null,
        trustScore: report.summary?.trustScore ?? null,
        riskLabel: report.summary?.label || null
      };
    })
  };
}

function buildLocalFindings(seed, tokenReports, project, contractProfiles, projectEvidence) {
  const findings = [];
  const researchArtifacts = projectEvidence?.artifacts || [];
  const researchSurfaces = projectEvidence?.surfaces || {};
  const hasResearch = researchArtifacts.length > 0;
  const hasRepo = (researchSurfaces.repos || []).length > 0 || researchArtifacts.some((artifact) => artifact.type?.startsWith("github"));
  const hasSocial = (researchSurfaces.socials || []).length > 0;

  if (!project.website) {
    findings.push(finding({
      dimension: "identity",
      title: "Official project surface was not attached",
      severity: "low",
      confidence: 0.7,
      evidence: "Input did not include a website URL",
      context: "This is an evidence gap, not a malicious signal. Project-level diligence needs official docs, token references, team surfaces, and governance links to bind contract evidence to a real project."
    }));
  } else if (!seed.website) {
    const source = contractProfiles.find((result) => result.profile?.homepage)?.source?.name || "contract metadata";
    findings.push(finding({
      dimension: "identity",
      title: "Official surface inferred from contract metadata",
      severity: "info",
      confidence: 0.68,
      evidence: project.website,
      context: `The input did not include a website, so ChainLens inferred this project surface from ${source} for follow-up review.`
    }));
  }

  if (!tokenReports.length) {
    findings.push(finding({
      dimension: "asset",
      title: hasResearch ? "No contract address found in collected project evidence" : "No contract address found in the project input",
      severity: hasResearch ? "medium" : "high",
      confidence: 0.78,
      evidence: hasResearch
        ? `${researchArtifacts.length} off-chain artifact${researchArtifacts.length === 1 ? "" : "s"} scanned; no EVM address matched`
        : "No EVM address matched the input",
      context: "ChainLens can collect off-chain project evidence, but it cannot bind claims to on-chain behavior until at least one contract address is found."
    }));
  }

  for (const report of tokenReports) {
    const counts = report.summary?.counts || {};
    if ((counts.critical || 0) > 0 || (counts.high || 0) > 0) {
      findings.push(finding({
        dimension: "asset",
        title: `${report.token?.symbol || "Token"} carries material token-level risk`,
        severity: counts.critical > 0 ? "critical" : "high",
        confidence: 0.9,
        evidence: `${report.summary?.label}: ${counts.critical || 0} critical, ${counts.high || 0} high signals`,
        context: "Project-level risk inherits token contract, distribution, and liquidity risk when the asset is central to the project."
      }));
    }

    const sourceStatuses = (report.sources || []).map((source) => source.status);
    if (sourceStatuses.includes("fixture") || sourceStatuses.includes("error") || sourceStatuses.includes("empty")) {
      const nonToken = report.classification?.assetType === "non_token_or_unknown";
      const excludedScope = isTokenModelExcluded(report.classification);
      findings.push(finding({
        dimension: "data",
        title: excludedScope ? "Token-specific sources were bypassed for this scope" : `${report.token?.symbol || "Token"} analysis used partial or fallback data`,
        severity: excludedScope ? "info" : "low",
        confidence: excludedScope ? 0.72 : 0.65,
        evidence: (report.sources || []).map((source) => `${source.name}: ${source.status}`).join("; "),
        context: excludedScope
          ? "This is expected for exchanges, bridges, governance treasuries, routers, marketplaces, and infrastructure contracts. It triggers scope research, not ERC-20 risk penalties."
          : "Fallback data keeps the report usable, but project conclusions should be refreshed against live sources."
      }));
    }
  }

  for (const result of contractProfiles) {
    const verified = result.profile?.verifiedContract;
    if (!verified) continue;
    findings.push(finding({
      dimension: "technical",
      title: `${result.profile?.contractName || "Contract"} source is verified`,
      severity: "info",
      confidence: 0.9,
      evidence: `Sourcify ${verified.match}; ${verified.fullyQualifiedName || result.profile?.fullyQualifiedName || "verified source"}`,
      context: `The contract is verified with ${verified.compiler || "compiler"} ${verified.compilerVersion || ""}. ABI role hint: ${verified.abiSummary?.role || "contract"}.`
    }));
  }

  for (const report of tokenReports) {
    if (report.classification?.assetType !== "non_token_or_unknown") continue;
    const profile = contractProfiles.find((result) => String(result.address).toLowerCase() === String(report.address).toLowerCase())?.profile;
    if (profile?.verifiedContract) continue;
    findings.push(finding({
      dimension: "asset",
      title: "Contract identity is unverified across primary sources",
      severity: "high",
      confidence: 0.78,
      evidence: "GoPlus, DEXScreener, CoinGecko, and Sourcify did not return token, market, profile, or verified-source evidence",
      context: "This is not a scam label, but an unverified contract with no token identity should not receive a high trust score. Add an official surface or verified source before relying on it."
    }));
  }

  if (hasResearch) {
    findings.push(finding({
      dimension: "data",
      title: "External project evidence was collected",
      severity: "info",
      confidence: 0.78,
      evidence: `${researchArtifacts.length} artifact${researchArtifacts.length === 1 ? "" : "s"} from ${projectEvidence.sources?.length || 0} source checks`,
      context: "Docs, repositories, whitepapers, and public surfaces are attached as evidence for the analyst step and for manual review."
    }));
  } else {
    findings.push(finding({
      dimension: "data",
      title: "Project research surface remains incomplete",
      severity: "low",
      confidence: 0.58,
      evidence: "No website, docs, GitHub, whitepaper, or search result was fetched",
      context: "Provide an official URL, GitHub link, whitepaper URL, or configure a search provider so ChainLens can collect off-chain project evidence."
    }));
  }

  const narrativeFinding = buildNarrativeDeliveryFinding({
    researchArtifacts,
    researchSurfaces,
    tokenReports,
    contractProfiles,
    projectEvidence
  });
  if (narrativeFinding) findings.push(narrativeFinding);

  for (const artifact of researchArtifacts.filter((item) => item.type === "github_repository")) {
    const pushedAt = artifact.facts?.pushedAt ? new Date(artifact.facts.pushedAt) : null;
    const staleDays = pushedAt && Number.isFinite(pushedAt.getTime())
      ? Math.floor((Date.now() - pushedAt.getTime()) / 86400000)
      : null;
    if (artifact.facts?.archived || artifact.facts?.disabled || (staleDays !== null && staleDays > 540)) {
      findings.push(finding({
        dimension: "community",
        title: "Repository activity needs review",
        severity: artifact.facts?.archived || artifact.facts?.disabled ? "medium" : "low",
        confidence: 0.72,
        evidence: artifact.facts?.archived || artifact.facts?.disabled
          ? `${artifact.title} is archived or disabled`
          : `${artifact.title} was last pushed ${staleDays} days ago`,
        context: "Repository inactivity is not proof of project risk, but it should be reconciled with the project's maintenance claims."
      }));
    }
  }

  const threatMatches = githubThreatIntelMatches(projectEvidence);
  if (threatMatches.length) {
    findings.push(finding({
      dimension: "data",
      title: "Address appears in public threat or label repositories",
      severity: "high",
      confidence: 0.76,
      evidence: threatMatches.map((match) => `${match.repository}${match.path ? `/${match.path}` : ""}`).slice(0, 4).join("; "),
      context: "GitHub code search found this exact address in repositories whose names or paths suggest threat intelligence, labels, blacklists, scams, or phishing corpora. Treat this as candidate evidence and verify it manually."
    }));
  }

  const publicRiskMatches = publicRiskEvidenceMatches(projectEvidence);
  if (publicRiskMatches.length) {
    const critical = publicRiskMatches.some((match) => match.critical);
    findings.push(finding({
      dimension: "data",
      title: "Public web evidence links this address to a known incident or exploit discussion",
      severity: critical ? "critical" : "high",
      confidence: critical ? 0.84 : 0.76,
      evidence: publicRiskMatches.map((match) => `${match.title}: ${match.url}`).slice(0, 4).join("; "),
      context: "Web research found exact-address references with incident, exploit, killed-contract, selfdestruct, scam, phishing, blacklist, or threat language. This should override a missing token score and trigger manual review."
    }));
  }

  if (!hasRepo && !hasSocial) {
    findings.push(finding({
      dimension: "community",
      title: "Repository and community surfaces were not confirmed",
      severity: "low",
      confidence: 0.54,
      evidence: "No official GitHub or social surface was found in fetched evidence",
      context: "This is an evidence gap. Project-level diligence should bind docs, repositories, governance, and social surfaces to the same project identity."
    }));
  }

  return findings;
}

function buildNarrativeDeliveryFinding({ researchArtifacts, researchSurfaces, tokenReports, contractProfiles, projectEvidence }) {
  const narrative = assessNarrativeLanguage(researchArtifacts);
  if (narrative.matchCount < 2) return null;

  const delivery = assessDeliveryEvidence({
    researchArtifacts,
    researchSurfaces,
    tokenReports,
    contractProfiles,
    projectEvidence
  });
  if (delivery.score >= 3) return null;

  const severity = !delivery.contractBinding || delivery.score <= 1 ? "high" : "medium";
  const missingEvidence = delivery.missing.slice(0, 4).join(", ");
  return finding({
    dimension: "delivery",
    title: "Narrative claims outpace verifiable delivery evidence",
    severity,
    confidence: Math.min(0.84, 0.58 + narrative.matchCount * 0.06 + delivery.missing.length * 0.02),
    evidence: `${narrative.samples.join("; ")}; missing: ${missingEvidence || "delivery evidence is thin"}`,
    context: "Collected project surfaces contain promotional or vision-heavy language, but ChainLens did not confirm enough shipped-code, verified-contract, audit, governance, or contract-binding evidence. Treat the story as unproven until claims map to live artifacts."
  });
}

function buildSkepticReview({ project, tokenReports, findings, projectEvidence, contractProfiles, agents, recommendations, summary }) {
  const researchArtifacts = projectEvidence?.artifacts || [];
  const researchSurfaces = projectEvidence?.surfaces || {};
  const narrative = assessNarrativeLanguage(researchArtifacts);
  const delivery = assessDeliveryEvidence({
    researchArtifacts,
    researchSurfaces,
    tokenReports,
    contractProfiles,
    projectEvidence
  });
  const counts = countSeverity(findings);
  const hypePressure = buildHypePressure(narrative, delivery);
  const evidenceCoverage = buildEvidenceCoverage(delivery, projectEvidence, project, contractProfiles);
  const claimAudit = buildClaimAudit(narrative, delivery);
  const verdict = skepticVerdict({ counts, hypePressure, evidenceCoverage, findings, summary });
  const materialAgents = (agents || [])
    .filter((agent) => agent.id !== "recommendation-agent")
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      summary: agent.summary,
      confidence: agent.confidence,
      evidenceCount: agent.evidenceCount
    }));

  return {
    verdict,
    headline: skepticHeadline(verdict, project),
    hypePressure,
    evidenceCoverage,
    claimAudit,
    nextQuestions: buildSkepticQuestions({ delivery, recommendations, findings }).slice(0, 5),
    agentReview: {
      status: agentReviewStatus(agents),
      summaries: materialAgents,
      recommendationCount: recommendations?.length || 0
    }
  };
}

function buildHypePressure(narrative, delivery) {
  const score = Math.max(0, Math.min(100, Math.round(
    narrative.matchCount * 16 +
    (delivery.score < 2 ? 18 : 0) +
    (delivery.missing.length * 5)
  )));
  return {
    score,
    level: score >= 70 ? "high" : score >= 38 ? "medium" : "low",
    signalCount: narrative.matchCount,
    signals: narrative.samples,
    categories: narrative.categories
  };
}

function buildEvidenceCoverage(delivery, projectEvidence, project, contractProfiles) {
  const maxScore = 5.5;
  const score = Math.max(0, Math.min(100, Math.round((delivery.score / maxScore) * 100)));
  const strengths = [
    delivery.contractBinding ? "Contract evidence is attached" : null,
    delivery.hasVerifiedContract ? "Verified contract source was confirmed" : null,
    delivery.hasActiveRepo ? "Active repository evidence was collected" : null,
    delivery.hasAudit ? "Audit surface was collected" : null,
    delivery.hasGovernance ? "Governance surface was collected" : null,
    delivery.hasDocs ? "Documentation surface was collected" : null,
    project?.website ? "Official website or inferred project surface is attached" : null,
    contractProfiles?.length ? `${contractProfiles.length} contract profile check${contractProfiles.length === 1 ? "" : "s"} completed` : null,
    projectEvidence?.artifactCount ? `${projectEvidence.artifactCount} project evidence artifact${projectEvidence.artifactCount === 1 ? "" : "s"} collected` : null
  ].filter(Boolean);

  return {
    score,
    level: score >= 70 ? "strong" : score >= 40 ? "partial" : "thin",
    strengths: strengths.slice(0, 5),
    gaps: delivery.missing
  };
}

function buildClaimAudit(narrative, delivery) {
  const claims = narrative.matches.length
    ? narrative.matches
    : [
        {
          category: "baseline",
          claim: "Project claims",
          sample: "No strong marketing pattern detected in collected surfaces",
          question: "Can the project still bind its identity, contracts, docs, repository, audit, and governance surfaces?"
        }
      ];
  const support = delivery.strengths;
  const gaps = delivery.missing;

  return claims.slice(0, 5).map((claim) => ({
    category: claim.category,
    claim: claim.claim,
    sample: claim.sample,
    support: support.slice(0, 3),
    gaps: gaps.slice(0, 3),
    question: claim.question
  }));
}

function skepticVerdict({ counts, hypePressure, evidenceCoverage, findings, summary }) {
  const hasMaterialTokenRisk = counts.critical > 0 || counts.high >= 2 || summary?.level === "high";
  const deliveryGap = findings.some((finding) => finding.dimension === "delivery" && ["critical", "high", "medium"].includes(finding.severity));

  if (hasMaterialTokenRisk) return "needs_human_review";
  if (deliveryGap || (hypePressure.level === "high" && evidenceCoverage.level !== "strong")) return "narrative_outpaces_evidence";
  if (evidenceCoverage.level === "thin") return "evidence_incomplete";
  if (hypePressure.level === "medium" && evidenceCoverage.level === "partial") return "claims_need_mapping";
  return "evidence_backed";
}

function skepticHeadline(verdict, project) {
  const name = project?.name || "This project";
  return {
    needs_human_review: `${name} has material risk signals that need human review before relying on it.`,
    narrative_outpaces_evidence: `${name}'s story currently runs ahead of the evidence ChainLens could verify.`,
    evidence_incomplete: `${name} needs more official evidence before its claims can be judged fairly.`,
    claims_need_mapping: `${name} has some evidence, but key claims still need to be mapped to shipped artifacts.`,
    evidence_backed: `${name} has a comparatively stronger evidence trail in the collected data.`
  }[verdict] || `${name} needs evidence-first review.`;
}

function buildSkepticQuestions({ delivery, recommendations = [], findings = [] }) {
  const questions = delivery.missing.map(questionForEvidenceGap);
  questions.push(...recommendations.map((item) => item.action || item.title).filter(Boolean));

  const materialFinding = findings.find((finding) => ["critical", "high"].includes(finding.severity));
  if (materialFinding) {
    questions.unshift("Ask the team to explain how the highest-risk finding is mitigated and where that proof is documented.");
  }

  if (!questions.length) {
    questions.push("Can the project keep its evidence trail reproducible through official docs, repositories, audits, governance, and verified contracts?");
  }

  return uniqueText(questions).slice(0, 6);
}

function questionForEvidenceGap(gap) {
  const value = String(gap || "");
  if (value.includes("verified contract source")) return "Ask the team for the verified contract source.";
  if (value.includes("active official repository")) return "Ask where the official code repository is and whether it is still maintained.";
  if (value.includes("independent audit")) return "Ask for an independent audit report with matching contract addresses.";
  if (value.includes("governance")) return "Ask who controls upgrades, admin keys, treasury movement, and governance decisions.";
  if (value.includes("contract address")) return "Ask for the official contract address from the project website or docs.";
  return `Ask the team to explain this missing evidence: ${value}.`;
}

function agentReviewStatus(agents = []) {
  if (!agents.length) return "empty";
  if (agents.some((agent) => agent.status === "error")) return "partial";
  if (agents.some((agent) => agent.status === "partial" || agent.status === "not_configured")) return "partial";
  return "ok";
}

function assessNarrativeLanguage(artifacts = []) {
  const matches = [];
  for (const artifact of artifacts.filter((item) => NARRATIVE_ARTIFACT_TYPES.has(item.type))) {
    const text = narrativeText(artifact);
    if (!text) continue;
    for (const item of NARRATIVE_LANGUAGE_PATTERNS) {
      if (item.pattern.test(text)) {
        matches.push({
          label: item.label,
          category: item.category,
          claim: item.claim,
          question: item.question,
          title: artifact.title || artifact.type,
          url: artifact.url,
          sample: `${item.claim} in ${artifact.title || artifact.type}`
        });
      }
    }
  }

  const seen = new Set();
  const uniqueMatches = matches.filter((match) => {
    const key = `${match.label}-${match.url || match.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    matchCount: uniqueMatches.length,
    matches: uniqueMatches,
    categories: uniqueText(uniqueMatches.map((match) => match.category)),
    samples: uniqueMatches
      .slice(0, 3)
      .map((match) => `${match.label} in ${match.title}`)
  };
}

function assessDeliveryEvidence({ researchArtifacts = [], researchSurfaces = {}, tokenReports = [], contractProfiles = [], projectEvidence = null }) {
  const hasActiveRepo = researchArtifacts.some(isActiveRepositoryArtifact);
  const hasRepoSurface = (researchSurfaces.repos || []).length > 0;
  const hasAudit = (researchSurfaces.audits || []).length > 0;
  const hasGovernance = (researchSurfaces.governance || []).length > 0;
  const hasDocs = (researchSurfaces.docs || []).length > 0;
  const hasVerifiedContract = contractProfiles.some((result) => result.profile?.verifiedContract);
  const contractBinding = tokenReports.length > 0 || (projectEvidence?.addresses || []).length > 0;
  const score = [
    contractBinding,
    hasVerifiedContract,
    hasActiveRepo,
    hasAudit,
    hasGovernance
  ].filter(Boolean).length + (hasDocs ? 0.5 : 0) + (hasRepoSurface && !hasActiveRepo ? 0.5 : 0);
  const missing = [
    contractBinding ? null : "no contract address bound to the project",
    hasVerifiedContract ? null : "no verified contract source confirmed",
    hasActiveRepo ? null : "no active official repository confirmed",
    hasAudit ? null : "no independent audit surface confirmed",
    hasGovernance ? null : "no governance surface confirmed"
  ].filter(Boolean);

  return {
    score,
    missing,
    strengths: [
      contractBinding ? "contract binding" : null,
      hasVerifiedContract ? "verified contract source" : null,
      hasActiveRepo ? "active repository" : null,
      hasAudit ? "audit surface" : null,
      hasGovernance ? "governance surface" : null,
      hasDocs ? "docs surface" : null
    ].filter(Boolean),
    contractBinding,
    hasVerifiedContract,
    hasActiveRepo,
    hasAudit,
    hasGovernance,
    hasDocs,
    hasRepoSurface
  };
}

function isActiveRepositoryArtifact(artifact) {
  if (artifact.type !== "github_repository") return false;
  if (artifact.facts?.archived || artifact.facts?.disabled) return false;
  const pushedAt = artifact.facts?.pushedAt ? new Date(artifact.facts.pushedAt) : null;
  if (!pushedAt || !Number.isFinite(pushedAt.getTime())) return artifact.status === "ok" || artifact.status === "partial";
  const staleDays = Math.floor((Date.now() - pushedAt.getTime()) / 86400000);
  return staleDays <= 540;
}

function narrativeText(artifact) {
  return [
    artifact.title,
    artifact.summary,
    ...(artifact.excerpts || [])
  ].filter(Boolean).join(" ").slice(0, 5000);
}

function summarizeProject(findings, tokenReports) {
  const counts = countSeverity(findings);
  const tokenScores = tokenReports
    .filter(isScoredTokenReport)
    .map((report) => report.summary?.trustScore)
    .filter((score) => Number.isFinite(Number(score)));
  const averageTokenScore = baseProjectScore(tokenScores, tokenReports);
  const penalty = counts.critical * 32 + counts.high * 18 + counts.medium * 8 + counts.low * 3;
  const projectScore = Math.max(0, Math.min(100, Math.round(averageTokenScore - penalty)));
  const severeDeliveryGap = findings.some((finding) => finding.dimension === "delivery" && finding.severity === "high");

  let label = "No Major Signals";
  let level = "low";
  if (counts.critical >= 1 || counts.high >= 3 || severeDeliveryGap) {
    label = "High Project Risk";
    level = "high";
  } else if (counts.high >= 1 || counts.medium >= 2) {
    label = "Project Needs Review";
    level = "watch";
  } else if (counts.medium >= 1 || counts.low >= 3) {
    label = "Evidence Incomplete";
    level = "incomplete";
  }

  return {
    projectScore,
    level,
    label,
    description: describeSummary(level),
    counts,
    tokenCount: tokenReports.length
  };
}

function applyAgentScoreAdjustment(summary, { agents = [], recommendations = [], findings = [] } = {}) {
  const recommendationAgent = agents.find((agent) => agent.id === "recommendation-agent");
  if (!recommendationAgent || recommendationAgent.status === "error") return summary;
  const riskPressure = recommendationAgent.meta?.riskPressure || {};
  const agentScoreImpact = riskPressure.source === "ai"
    ? Math.max(0, Math.min(30, Number(riskPressure.scoreImpact) || 0))
    : 0;

  const priorityCounts = {
    urgent: recommendations.filter((item) => item.priority === "urgent").length,
    high: recommendations.filter((item) => item.priority === "high").length,
    medium: recommendations.filter((item) => item.priority === "medium").length
  };
  const aiFindingCount = findings.filter((finding) => finding.source === "ai_review").length;
  const aiSevereFindingCount = findings.filter((finding) =>
    finding.source === "ai_review" && ["critical", "high"].includes(finding.severity)
  ).length;
  const aiMediumFindingCount = findings.filter((finding) =>
    finding.source === "ai_review" && finding.severity === "medium"
  ).length;
  const aiMaterialFindingCount = findings.filter((finding) =>
    finding.source === "ai_review" && ["critical", "high", "medium"].includes(finding.severity)
  ).length;
  const severeFindingCount = findings.filter((finding) =>
    ["critical", "high"].includes(finding.severity)
  ).length;
  const materialFindingCount = findings.filter((finding) =>
    ["critical", "high", "medium"].includes(finding.severity)
  ).length;
  const mediumRecommendationWeight = severeFindingCount || agentScoreImpact >= 8
    ? 3
    : materialFindingCount
      ? 1
      : 0;
  const mediumRecommendationPenalty = materialFindingCount || agentScoreImpact >= 8
    ? priorityCounts.medium * mediumRecommendationWeight
    : 0;
  const aiFindingPenalty = aiSevereFindingCount * 4 + aiMediumFindingCount * 2;
  const priorityPenalty =
    priorityCounts.urgent * 14 +
    priorityCounts.high * 8 +
    mediumRecommendationPenalty;
  const rawPenalty = Math.max(priorityPenalty, agentScoreImpact) + aiFindingPenalty;
  const cap = summary.level === "low" ? 26 : 34;
  const penalty = Math.min(cap, rawPenalty);

  if (!penalty) {
    return {
      ...summary,
      aiScoreAdjustment: {
        penalty: 0,
        scoreImpact: agentScoreImpact,
        priorityCounts,
        aiFindingCount,
        aiSevereFindingCount,
        aiMediumFindingCount,
        aiMaterialFindingCount,
        materialFindingCount,
        confidence: clampConfidence(riskPressure.confidence, 0.58),
        reason: "Recommendation agent did not add material scoring pressure."
      }
    };
  }

  const projectScore = Math.max(0, summary.projectScore - penalty);
  const level = adjustedLevel(summary.level, projectScore, priorityCounts);
  return {
    ...summary,
    projectScore,
    level,
    label: adjustedLabel(level, summary.label),
    description: describeSummary(level),
    aiScoreAdjustment: {
      penalty,
      scoreImpact: agentScoreImpact,
      priorityCounts,
      aiFindingCount,
      aiSevereFindingCount,
      aiMediumFindingCount,
      aiMaterialFindingCount,
      materialFindingCount,
      confidence: clampConfidence(riskPressure.confidence, 0.58),
      reason: riskPressure.reason || "Recommendation agent priorities and AI findings were included in the score."
    }
  };
}

function adjustedLevel(currentLevel, score, priorityCounts) {
  if (priorityCounts.urgent > 0 || score < 35) return "high";
  if (priorityCounts.high > 0 || score < 55) return currentLevel === "high" ? "high" : "watch";
  if (currentLevel !== "low" && score < 70) return ["high", "watch"].includes(currentLevel) ? currentLevel : "incomplete";
  return currentLevel;
}

function adjustedLabel(level, fallback) {
  return {
    high: "High Project Risk",
    watch: "Project Needs Review",
    incomplete: "Evidence Incomplete",
    low: "No Major Signals"
  }[level] || fallback;
}

function baseProjectScore(tokenScores, tokenReports) {
  if (tokenScores.length) {
    return Math.round(tokenScores.reduce((sum, score) => sum + Number(score), 0) / tokenScores.length);
  }

  if (!tokenReports.length) return 62;

  const unscoredCount = tokenReports.filter((report) => isTokenModelExcluded(report.classification)).length;
  if (unscoredCount === tokenReports.length) return 58;
  if (unscoredCount > 0) return 64;
  return 72;
}

function githubThreatIntelMatches(projectEvidence) {
  return (projectEvidence?.artifacts || [])
    .filter((artifact) => artifact.type === "github_code_search")
    .flatMap((artifact) => artifact.facts?.matches || [])
    .filter((match) => isThreatIntelText(`${match.repository} ${match.path} ${match.url}`));
}

function publicRiskEvidenceMatches(projectEvidence) {
  return (projectEvidence?.artifacts || [])
    .flatMap((artifact) => {
      const results = Array.isArray(artifact.facts?.results) ? artifact.facts.results : [];
      return results.map((result) => ({
        title: result.title || artifact.title || "Public evidence",
        url: result.url || artifact.url,
        text: `${result.title || ""} ${result.url || ""} ${result.snippet || ""} ${artifact.summary || ""}`,
        critical: isCriticalIncidentText(`${result.title || ""} ${result.url || ""} ${result.snippet || ""}`)
      }));
    })
    .filter((match) => match.url && isPublicRiskText(match.text));
}

function isThreatIntelText(text) {
  return /\b(threat|intelligence|blacklist|blocklist|scam|phish|phishing|malware|exploit|abuse|compromise|stolen|drainer|label|sanction)\b/i.test(text);
}

function isPublicRiskText(text) {
  return /\b(hack|exploit|vulnerability|killed|selfdestruct|self-destruct|blacklist|blocklist|scam|phish|phishing|threat|malware|drainer|stolen|compromised|incident|parity bug|restore contract code|anyone can kill)\b/i.test(text);
}

function isCriticalIncidentText(text) {
  return /\b(killed|selfdestruct|self-destruct|parity bug|restore contract code|anyone can kill|exploit|hack|compromised|drainer|stolen)\b/i.test(text);
}

function buildSummaryActions({ summary, recommendations = [], findings = [] }) {
  const actions = recommendations
    .filter((item) => item?.title && (item.action || item.reason))
    .slice(0, 3)
    .map((item) => ({
      priority: item.priority || priorityForSummary(summary),
      title: item.title,
      action: item.action,
      reason: item.reason,
      evidence: item.evidence
    }));

  if (actions.length) return actions;

  const materialFinding = findings.find((finding) => ["critical", "high", "medium"].includes(finding.severity));
  return [
    {
      priority: priorityForSummary(summary),
      title: summary.level === "low" ? "Keep a manual diligence trail" : "Review the highest-risk evidence first",
      action: summary.level === "low"
        ? "Record official docs, repository, governance, and contract links before relying on the project."
        : "Start with the highest-severity finding, verify it against live sources, and document whether it is mitigated.",
      reason: summary.description,
      evidence: materialFinding?.evidence || `${summary.counts.critical} critical, ${summary.counts.high} high, ${summary.counts.medium} medium findings`
    }
  ];
}

function priorityForSummary(summary) {
  if (summary.counts?.critical > 0 || summary.level === "high") return "urgent";
  if (summary.counts?.high > 0 || summary.level === "watch") return "high";
  if (summary.level === "incomplete") return "medium";
  return "low";
}

function buildProjectDimensions(findings, tokenReports) {
  const dimensionKeys = ["identity", "asset", "delivery", "market", "governance", "community", "data"];
  const scoredTokenReports = tokenReports.filter(isScoredTokenReport);
  const tokenPenalty = scoredTokenReports.reduce((sum, report) => {
    const score = Number(report.summary?.trustScore);
    return sum + (Number.isFinite(score) ? Math.max(0, 100 - score) : 20);
  }, 0);

  return dimensionKeys.map((key) => {
    const dimensionFindings = findings.filter((item) => item.dimension === key);
    const penalty = dimensionFindings.reduce((sum, item) => sum + severityWeight(item.severity) * item.confidence, 0);
    const assetPenalty = key === "asset" ? tokenPenalty / Math.max(1, scoredTokenReports.length) : 0;
    return {
      key,
      label: labelForDimension(key),
      score: Math.max(0, Math.round(100 - penalty - assetPenalty)),
      findingCount: dimensionFindings.length
    };
  });
}

function isScoredTokenReport(report) {
  return !isTokenModelExcluded(report.classification) && Number.isFinite(Number(report.summary?.trustScore));
}

function buildSources(tokenReports, contractProfiles, openai, projectEvidence, agents = []) {
  const tokenSources = tokenReports.flatMap((report) => report.sources || []);
  const contractSources = contractProfiles.flatMap((result) => result.sources || [result.source]).filter(Boolean);
  const evidenceSources = projectEvidence?.sources || [];
  const agentStatus = agents.some((agent) => agent.status === "error")
    ? "error"
    : agents.some((agent) => agent.status === "partial" || agent.status === "not_configured")
      ? "partial"
      : "ok";
  return [
    ...tokenSources,
    ...contractSources,
    ...evidenceSources,
    {
      name: "OpenAI-compatible Project Analysis",
      status: openai.status,
      cache: openai.status === "not_configured" ? "disabled" : undefined,
      message: openai.message
    },
    {
      name: "AI Agent Orchestrator",
      status: agentStatus,
      message: `${agents.length} agent${agents.length === 1 ? "" : "s"} completed`
    }
  ];
}

function extractProjectSurfaces(tokenReports, contractProfiles, projectEvidence) {
  const profileSurfaces = contractProfiles.flatMap((result) => [
    ...(result.profile?.websites || []),
    ...(result.profile?.repos || []),
    ...(result.profile?.blockchainSites || [])
  ]);
  const websites = uniqueSurfaces([
    ...(projectEvidence?.surfaces?.websites || []),
    ...contractProfiles.flatMap((result) => result.profile?.websites || []),
    ...tokenReports.flatMap((report) => report.token?.websites || [])
  ]);
  const repos = uniqueSurfaces([
    ...(projectEvidence?.surfaces?.repos || []),
    ...contractProfiles.flatMap((result) => result.profile?.repos || [])
  ]);
  const socials = uniqueSurfaces([
    ...(projectEvidence?.surfaces?.socials || []),
    ...contractProfiles.flatMap((result) => result.profile?.socials || []),
    ...tokenReports.flatMap((report) => report.token?.socials || [])
  ]);
  const pairUrls = uniqueSurfaces(tokenReports
    .map((report) => ({ label: report.token?.dexId || "DEX pair", url: report.token?.pairUrl }))
    .filter((surface) => surface.url));

  return {
    websites,
    repos,
    docs: uniqueSurfaces(projectEvidence?.surfaces?.docs || []),
    whitepapers: uniqueSurfaces(projectEvidence?.surfaces?.whitepapers || []),
    audits: uniqueSurfaces(projectEvidence?.surfaces?.audits || []),
    governance: uniqueSurfaces(projectEvidence?.surfaces?.governance || []),
    socials,
    profiles: uniqueSurfaces(profileSurfaces),
    pairUrls
  };
}

function uniqueSurfaces(surfaces) {
  const seen = new Set();
  return surfaces.filter((surface) => {
    const url = String(surface?.url || "").trim();
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function finding(input) {
  return {
    id: `${input.dimension}-${slugify(input.title)}`,
    ...input
  };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function clampConfidence(value, fallback = 0.7) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0.1, Math.min(0.98, number));
}

function countSeverity(findings) {
  return {
    critical: findings.filter((item) => item.severity === "critical").length,
    high: findings.filter((item) => item.severity === "high").length,
    medium: findings.filter((item) => item.severity === "medium").length,
    low: findings.filter((item) => item.severity === "low").length,
    info: findings.filter((item) => item.severity === "info").length
  };
}

function severityWeight(severity) {
  return {
    critical: 30,
    high: 18,
    medium: 9,
    low: 3,
    info: 0
  }[severity] ?? 0;
}

function describeSummary(level) {
  return {
    high: "Material project-level risks were found across token evidence or required project context.",
    watch: "The project has signals that should be reviewed before relying on it.",
    incomplete: "The available project evidence is incomplete; attach official project surfaces or configure a search provider for broader discovery.",
    low: "No major project-level signals were found in the available evidence."
  }[level];
}

function labelForDimension(key) {
  return {
    identity: "Identity",
    asset: "Asset",
    delivery: "Delivery",
    market: "Market",
    governance: "Governance",
    community: "Community",
    data: "Data Quality"
  }[key];
}

function extractAddresses(value) {
  return String(value || "").match(ADDRESS_RE) || [];
}

function extractUrl(value) {
  return String(value || "").split(/\s+/).find((part) => /^https?:\/\//i.test(part) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(part));
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).toString();
  } catch {
    return null;
  }
}

function inferName(query, website, address) {
  const queryName = String(query || "")
    .replace(ADDRESS_RE, "")
    .split(/\s+/)
    .find((part) => part && !/^https?:\/\//i.test(part) && !/^[a-z0-9.-]+\.[a-z]{2,}/i.test(part));
  if (queryName) return queryName;
  if (website) return new URL(website).hostname.replace(/^www\./, "");
  if (address) return `Project ${address.slice(0, 6)}`;
  return null;
}

function inferEvidenceName(evidence) {
  const artifact = (evidence?.artifacts || []).find((item) => item.type === "github_repository" || item.type === "whitepaper" || item.type === "web_page");
  if (!artifact?.title) return null;
  return artifact.title.replace(/\s*[-|].*$/, "").trim();
}

function isGenericName(name) {
  return !name || /^unknown project$/i.test(name) || /^project 0x/i.test(name) || /^github\.com$/i.test(name);
}

function unique(values) {
  return [...new Set(values.map((value) => String(value).toLowerCase()))];
}

function uniqueText(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
