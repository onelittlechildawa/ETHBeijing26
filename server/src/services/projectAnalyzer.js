import { analyzeToken } from "./analyzer.js";
import { SUPPORTED_CHAINS, getChain } from "./chains.js";
import { fetchContractProfiles } from "./contractSearch.js";
import { requestProjectOpenAI } from "./openai.js";
import { collectProjectEvidence } from "./projectEvidence.js";
import { classifyContractScope, isTokenModelExcluded } from "./projectScope.js";

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/g;
const MAX_CONTRACT_TARGETS = 12;

export async function analyzeProject(input) {
  const seed = normalizeProjectInput(input);
  const inputEvidence = await collectProjectEvidence({ seed });
  let analysisSeed = enrichSeedWithEvidence(seed, inputEvidence);
  let { rawTokenReports, contractProfiles } = await analyzeSeedTargets(analysisSeed);
  let tokenReports = applyScopeClassifications(analysisSeed, rawTokenReports, contractProfiles, inputEvidence);
  const draftProject = buildProjectProfile(analysisSeed, tokenReports, contractProfiles, inputEvidence);
  let projectEvidence = await collectProjectEvidence({ seed: analysisSeed, project: draftProject, existingEvidence: inputEvidence });
  const finalSeed = enrichSeedWithEvidence(analysisSeed, projectEvidence);

  if (finalSeed.addresses.length !== analysisSeed.addresses.length) {
    analysisSeed = finalSeed;
    ({ rawTokenReports, contractProfiles } = await analyzeSeedTargets(analysisSeed));
  } else {
    analysisSeed = finalSeed;
  }

  tokenReports = applyScopeClassifications(analysisSeed, rawTokenReports, contractProfiles, projectEvidence);
  const project = buildProjectProfile(analysisSeed, tokenReports, contractProfiles, projectEvidence);
  const localFindings = buildLocalFindings(analysisSeed, tokenReports, project, contractProfiles, projectEvidence);
  const openai = await requestProjectOpenAI({ project, tokenReports, localFindings, researchEvidence: projectEvidence });
  const adjudicated = adjudicateFindings(localFindings, openai.findingReviews);
  const summary = summarizeProject(adjudicated.activeFindings, tokenReports);
  const dimensions = buildProjectDimensions(adjudicated.activeFindings, tokenReports);

  return {
    generatedAt: new Date().toISOString(),
    project,
    summary,
    dimensions,
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
    sources: buildSources(tokenReports, contractProfiles, openai, projectEvidence)
  };
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

function summarizeProject(findings, tokenReports) {
  const counts = countSeverity(findings);
  const tokenScores = tokenReports
    .filter(isScoredTokenReport)
    .map((report) => report.summary?.trustScore)
    .filter((score) => Number.isFinite(Number(score)));
  const averageTokenScore = tokenScores.length
    ? Math.round(tokenScores.reduce((sum, score) => sum + Number(score), 0) / tokenScores.length)
    : 82;
  const penalty = counts.critical * 22 + counts.high * 14 + counts.medium * 7 + counts.low * 2;
  const projectScore = Math.max(0, Math.min(100, Math.round(averageTokenScore - penalty / 2)));

  let label = "No Major Signals";
  let level = "low";
  if (counts.critical >= 1 || counts.high >= 3) {
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

function buildProjectDimensions(findings, tokenReports) {
  const dimensionKeys = ["identity", "asset", "market", "governance", "community", "data"];
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

function buildSources(tokenReports, contractProfiles, openai, projectEvidence) {
  const tokenSources = tokenReports.flatMap((report) => report.sources || []);
  const contractSources = contractProfiles.flatMap((result) => result.sources || [result.source]).filter(Boolean);
  const evidenceSources = projectEvidence?.sources || [];
  return [
    ...tokenSources,
    ...contractSources,
    ...evidenceSources,
    {
      name: "OpenAI-compatible Project Analysis",
      status: openai.status,
      cache: openai.status === "not_configured" ? "disabled" : undefined,
      message: openai.message
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
    id: `${input.dimension}-${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    ...input
  };
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
