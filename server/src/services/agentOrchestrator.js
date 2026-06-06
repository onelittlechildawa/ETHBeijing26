import { requestStructuredAI } from "./openai.js";
import { requestXapiTwitterSearch } from "./xapi.js";

const VALID_STATUSES = new Set(["ok", "partial", "error", "not_configured"]);
const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);
const VALID_PRIORITIES = new Set(["urgent", "high", "medium", "low"]);
const PRIORITY_WEIGHT = { urgent: 4, high: 3, medium: 2, low: 1 };
const COMMUNITY_RISK_RE = /\b(scam|rug|rugpull|exploit|hack|hacked|phish|phishing|drainer|stolen|blacklist|fraud|ponzi|honeypot|can't withdraw|cannot withdraw|withdrawal issue)\b|跑路|诈骗|钓鱼|被盗|黑客|黑名单|割韭菜/i;
const COMMUNITY_PROMO_RE = /\b(airdrop|giveaway|presale|whitelist|claim now|100x|pump|moon|free mint|guaranteed)\b|空投|预售|白名单|百倍|暴涨|稳赚/i;
const COMMUNITY_DELIVERY_RE = /\b(mainnet|launch|shipped|release|audit|governance|proposal|integration|partnership|docs|testnet|upgrade)\b|主网|上线|发布|审计|治理|提案|集成|合作|升级/i;

export async function runAgentOrchestrator(context) {
  const researchAgent = buildResearchAgent(context);
  const communityResourceAgent = await buildCommunityResourceAgent(context);
  const openSourceReviewAgent = buildOpenSourceReviewAgent(context);
  const onchainRiskAgent = buildOnchainRiskAgent(context);
  const preSynthesisAgents = [
    researchAgent,
    communityResourceAgent,
    openSourceReviewAgent,
    onchainRiskAgent
  ];
  const synthesisAgent = buildSynthesisAgent({ ...context, upstreamAgents: preSynthesisAgents });
  const baseAgents = [...preSynthesisAgents, synthesisAgent];
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
  const candidateCount = artifacts.filter(isCandidateArtifact).length;
  const findings = buildResearchFindings({
    artifacts,
    surfaces,
    sources: projectEvidence?.sources || [],
    localFindings
  });

  return normalizeAgent({
    id: "research-agent",
    name: "Research Agent",
    status: normalizeStatus(projectEvidence?.status, artifacts.length ? "ok" : "partial"),
    summary: artifacts.length
      ? `Collected ${artifacts.length} evidence artifact${artifacts.length === 1 ? "" : "s"} across ${surfaceCount} project surface${surfaceCount === 1 ? "" : "s"}${candidateCount ? `; ${candidateCount} candidate artifact${candidateCount === 1 ? " still needs" : "s still need"} official binding` : ""}.`
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

function buildResearchFindings({ artifacts = [], surfaces = {}, sources = [], localFindings = [] }) {
  const findings = [];
  const evidenceGapFindings = localFindings
    .filter((finding) => ["identity", "data", "community"].includes(finding.dimension))
    .slice(0, artifacts.length ? 2 : 5);

  findings.push(...evidenceGapFindings);

  for (const artifact of artifacts.slice(0, 5)) {
    findings.push(agentFinding({
      dimension: dimensionForArtifact(artifact),
      title: titleForArtifactFinding(artifact),
      severity: severityForArtifact(artifact),
      confidence: confidenceForArtifact(artifact),
      evidence: artifact.url || artifact.title,
      context: artifact.summary || artifact.excerpts?.[0] || "Collected public project evidence for manual review."
    }));
  }

  const surfaceFindings = buildSurfaceFindings(surfaces);
  findings.push(...surfaceFindings);

  for (const source of sources.filter((item) => ["error", "disabled", "empty"].includes(item.status)).slice(0, artifacts.length ? 1 : 3)) {
    findings.push(agentFinding({
      dimension: "data",
      title: `${source.name || "Research source"} returned ${source.status}`,
      severity: source.status === "error" ? "low" : "info",
      confidence: 0.64,
      evidence: source.url || source.message || source.status,
      context: source.message || "Research collection continued with the remaining available sources."
    }));
  }

  if (!findings.length) {
    findings.push(agentFinding({
      dimension: "data",
      title: "Project research surface remains incomplete",
      severity: "low",
      confidence: 0.58,
      evidence: "No website, docs, GitHub, whitepaper, audit, governance, or search evidence was fetched",
      context: "Provide an official URL or enable a search provider so the research step can bind public evidence to this project."
    }));
  }

  return orderFindings(dedupeFindings(findings)).slice(0, 8);
}

function buildSurfaceFindings(surfaces = {}) {
  return [
    surfaceFinding("repos", "Repository surfaces were discovered", "community", surfaces),
    surfaceFinding("audits", "Audit surfaces were discovered", "technical", surfaces),
    surfaceFinding("governance", "Governance surfaces were discovered", "governance", surfaces),
    surfaceFinding("docs", "Documentation surfaces were discovered", "identity", surfaces)
  ].filter(Boolean).slice(0, 3);
}

function surfaceFinding(key, title, dimension, surfaces) {
  const items = Array.isArray(surfaces[key]) ? surfaces[key] : [];
  if (!items.length) return null;
  const sample = items.slice(0, 3).map((item) => item.label || item.url).join(", ");
  return agentFinding({
    dimension,
    title,
    severity: "info",
    confidence: 0.7,
    evidence: `${items.length} ${key} surface${items.length === 1 ? "" : "s"}: ${sample}`,
    context: "These surfaces were collected as research inputs and should be checked for official project binding."
  });
}

function titleForArtifactFinding(artifact) {
  if (isCandidateArtifact(artifact)) return `${labelForArtifactType(artifact.type)} candidates need verification`;
  if (artifact.status === "needs_review") return `${labelForArtifactType(artifact.type)} needs review`;
  if (artifact.status === "unreadable") return `${labelForArtifactType(artifact.type)} was found but not fully readable`;
  return `${labelForArtifactType(artifact.type)} evidence collected`;
}

function labelForArtifactType(type) {
  return {
    audit: "Audit",
    docs: "Documentation",
    github_code_search: "GitHub code search",
    github_profile: "GitHub profile",
    github_repository: "GitHub repository",
    github_search: "GitHub search",
    governance: "Governance",
    web_page: "Website",
    web_search: "Web search",
    whitepaper: "Whitepaper"
  }[type] || "Project";
}

function dimensionForArtifact(artifact) {
  return {
    audit: "technical",
    docs: "identity",
    github_code_search: "technical",
    github_profile: "community",
    github_repository: "community",
    github_search: "community",
    governance: "governance",
    web_page: "identity",
    web_search: "data",
    whitepaper: "identity"
  }[artifact.type] || "data";
}

function severityForArtifact(artifact) {
  if (artifact.status === "needs_review" || artifact.status === "unreadable") return "low";
  if (isCandidateArtifact(artifact)) return "low";
  return "info";
}

function confidenceForArtifact(artifact) {
  if (artifact.status === "ok") return 0.78;
  if (isCandidateArtifact(artifact)) return 0.58;
  return 0.64;
}

function isCandidateArtifact(artifact) {
  return artifact?.status === "candidate" || artifact?.type === "github_search" || artifact?.type === "github_code_search";
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

async function buildCommunityResourceAgent(context) {
  const query = buildCommunitySearchQuery(context);
  if (!query) {
    return normalizeAgent({
      id: "community-resource-agent",
      name: "社区资源 Agent",
      status: "partial",
      summary: "No stable project name, ticker, or social handle was available for X community search.",
      confidence: 0.38,
      findings: [
        agentFinding({
          dimension: "community",
          title: "X community search could not be scoped",
          severity: "low",
          confidence: 0.48,
          evidence: "No project search term available",
          context: "Add an official project name, ticker, website, or X profile so community signals can be collected."
        })
      ],
      evidenceCount: 0,
      sources: [{ name: "xAPI Twitter Search", status: "empty", message: "No search query available" }],
      meta: { query: null, tweets: [] }
    });
  }

  try {
    const count = communityTweetCount();
    const result = await requestXapiTwitterSearch({ query, count });
    if (result.status !== "ok") {
      return normalizeAgent({
        id: "community-resource-agent",
        name: "社区资源 Agent",
        status: normalizeStatus(result.status, "partial"),
        summary: result.message || "xAPI Twitter search is not configured, so community signals were not collected.",
        confidence: 0.42,
        findings: [
          agentFinding({
            dimension: "community",
            title: "X community source was unavailable",
            severity: "low",
            confidence: 0.56,
            evidence: result.message || result.status,
            context: "Community-side risk should be reviewed manually or rerun after xAPI is configured."
          })
        ],
        evidenceCount: 0,
        sources: [{ name: "xAPI Twitter Search", status: result.status, message: result.message }],
        meta: { query, tweets: [] }
      });
    }

    const tweets = normalizeCommunityTweets(result.raw).slice(0, count);
    const findings = buildCommunityFindings({ query, tweets });
    const sourceUrl = result.actionId ? `${result.url}#${result.actionId}` : result.url;

    return normalizeAgent({
      id: "community-resource-agent",
      name: "社区资源 Agent",
      status: tweets.length ? "ok" : "partial",
      summary: summarizeCommunityTweets({ tweets, findings, query }),
      confidence: tweets.length ? communityConfidence(tweets, findings) : 0.44,
      findings,
      evidenceCount: tweets.length,
      sources: [
        {
          name: "xAPI Twitter Search",
          status: tweets.length ? "ok" : "empty",
          url: sourceUrl
        }
      ],
      meta: {
        query,
        metrics: communityMetrics(tweets),
        tweets: tweets.slice(0, 8)
      }
    });
  } catch (error) {
    return normalizeAgent({
      id: "community-resource-agent",
      name: "社区资源 Agent",
      status: "error",
      summary: "X community resource collection failed; other agents can still complete the report.",
      confidence: 0.35,
      findings: [
        agentFinding({
          dimension: "community",
          title: "X community collection failed",
          severity: "low",
          confidence: 0.5,
          evidence: error.message,
          context: "Rerun after xAPI is reachable, or review X manually for project-specific risk and credibility signals."
        })
      ],
      evidenceCount: 0,
      sources: [{ name: "xAPI Twitter Search", status: "error", message: error.message }],
      meta: { query, tweets: [] }
    });
  }
}

function buildCommunitySearchQuery({ project, tokenReports = [] }) {
  const projectTerms = [
    meaningfulProjectTerm(project?.name),
    hostTerm(project?.website),
    ...(project?.surfaces?.socials || []).map((surface) => xHandleTerm(surface.url)),
    ...(project?.contracts || []).map((contract) => meaningfulProjectTerm(contract.symbol || contract.name)),
    ...tokenReports.map((report) => meaningfulProjectTerm(report.token?.symbol || report.token?.name)),
    ...tokenReports.flatMap((report) => (report.token?.socials || []).map((social) => xHandleTerm(social.url)))
  ];

  const terms = uniqueStrings(projectTerms)
    .filter((term) => term && !/^unknown project$/i.test(term) && !/^project 0x/i.test(term))
    .slice(0, 5);

  if (!terms.length) return null;
  return terms.map(formatXSearchTerm).join(" OR ");
}

function normalizeCommunityTweets(raw) {
  const candidates = [];
  collectTweetCandidates(raw, candidates, new Set());
  const seen = new Set();
  return candidates
    .map(normalizeTweetCandidate)
    .filter((tweet) => tweet.text)
    .filter((tweet) => {
      const key = tweet.id || tweet.text;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.engagement - left.engagement)
    .slice(0, 40);
}

function collectTweetCandidates(value, output, seen) {
  if (!value || output.length >= 80) return;
  if (Array.isArray(value)) {
    for (const item of value) collectTweetCandidates(item, output, seen);
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);

  const normalized = normalizeTweetCandidate(value);
  if (normalized.text) output.push(value);

  for (const key of ["data", "results", "items", "tweets", "timeline", "entries", "content", "result", "tweet", "legacy"]) {
    collectTweetCandidates(value[key], output, seen);
  }
}

function normalizeTweetCandidate(value = {}) {
  const tweet = value.tweet || value.result || value.item || value;
  const legacy = tweet.legacy || value.legacy || tweet;
  const noteText = tweet.note_tweet?.note_tweet_results?.result?.text || legacy.note_tweet?.note_tweet_results?.result?.text;
  const text = String(legacy.full_text || legacy.text || tweet.full_text || tweet.text || noteText || "").trim();
  const id = String(legacy.id_str || legacy.id || tweet.rest_id || tweet.id_str || tweet.id || value.id_str || value.id || "").trim();
  const author = normalizeTweetAuthor(tweet, value);
  const metrics = {
    likes: toSafeNumber(legacy.favorite_count ?? tweet.favorite_count ?? value.favorite_count),
    retweets: toSafeNumber(legacy.retweet_count ?? tweet.retweet_count ?? value.retweet_count),
    replies: toSafeNumber(legacy.reply_count ?? tweet.reply_count ?? value.reply_count),
    quotes: toSafeNumber(legacy.quote_count ?? tweet.quote_count ?? value.quote_count),
    views: toSafeNumber(legacy.views_count ?? legacy.view_count ?? tweet.views_count ?? tweet.view_count ?? value.views_count)
  };

  return {
    id,
    text,
    author,
    createdAt: legacy.created_at || tweet.created_at || value.created_at || null,
    metrics,
    engagement: metrics.likes + metrics.retweets * 2 + metrics.replies * 2 + metrics.quotes * 2 + Math.floor(metrics.views / 10000),
    url: id ? `https://x.com/${author.handle || "i"}/status/${id}` : null,
    flags: classifyCommunityText(text)
  };
}

function normalizeTweetAuthor(tweet = {}, value = {}) {
  const author = tweet.author || tweet.user || value.author || value.user || tweet.core?.user_results?.result || {};
  const legacy = author.legacy || author;
  return {
    name: legacy.name || author.name || null,
    handle: legacy.screen_name || author.screen_name || author.username || null,
    followers: toSafeNumber(legacy.followers_count ?? author.followers_count)
  };
}

function buildCommunityFindings({ query, tweets }) {
  if (!tweets.length) {
    return [
      agentFinding({
        dimension: "community",
        title: "No recent X community posts were collected",
        severity: "low",
        confidence: 0.52,
        evidence: query,
        context: "This can mean the query is too narrow, xAPI returned no posts, or the project has limited visible X discussion."
      })
    ];
  }

  const riskTweets = tweets.filter((tweet) => tweet.flags.risk);
  const promoTweets = tweets.filter((tweet) => tweet.flags.promo);
  const deliveryTweets = tweets.filter((tweet) => tweet.flags.delivery);
  const findings = [
    agentFinding({
      dimension: "community",
      title: "X community discussion was collected",
      severity: "info",
      confidence: 0.72,
      evidence: `${tweets.length} post${tweets.length === 1 ? "" : "s"} matched: ${query}`,
      context: "Community evidence is a candidate signal. It should be reconciled with official project surfaces and on-chain data."
    })
  ];

  if (riskTweets.length) {
    findings.push(agentFinding({
      dimension: "community",
      title: "X posts mention risk or incident language",
      severity: riskTweets.length >= 3 ? "high" : "medium",
      confidence: riskTweets.length >= 3 ? 0.74 : 0.64,
      evidence: sampleTweetEvidence(riskTweets),
      context: "Risk-language posts are not proof by themselves, but repeated mentions should be reviewed before trusting the project narrative."
    }));
  }

  if (promoTweets.length >= Math.max(3, Math.ceil(tweets.length * 0.25))) {
    findings.push(agentFinding({
      dimension: "community",
      title: "X discussion is promotion-heavy",
      severity: "medium",
      confidence: 0.62,
      evidence: `${promoTweets.length} promotional post${promoTweets.length === 1 ? "" : "s"} among ${tweets.length}`,
      context: "Airdrop, giveaway, pump, or guaranteed-return language can make community sentiment noisy and should be separated from evidence-backed adoption."
    }));
  }

  if (deliveryTweets.length) {
    findings.push(agentFinding({
      dimension: "delivery",
      title: "X posts reference delivery or governance activity",
      severity: "info",
      confidence: 0.62,
      evidence: sampleTweetEvidence(deliveryTweets),
      context: "Delivery-language posts can support the project narrative when matched to official releases, governance proposals, audits, or deployments."
    }));
  }

  if (tweets.length < 5) {
    findings.push(agentFinding({
      dimension: "community",
      title: "Visible X discussion volume is thin",
      severity: "low",
      confidence: 0.58,
      evidence: `${tweets.length} matching post${tweets.length === 1 ? "" : "s"}`,
      context: "Thin community visibility is an evidence gap, not a risk label. Check official social handles and alternate spellings."
    }));
  }

  return orderFindings(dedupeFindings(findings)).slice(0, 8);
}

function summarizeCommunityTweets({ tweets, findings, query }) {
  if (!tweets.length) return `Searched X for "${query}", but no usable project-related posts were collected.`;
  const metrics = communityMetrics(tweets);
  const material = findings.filter((finding) => ["critical", "high", "medium"].includes(finding.severity));
  return `Collected ${tweets.length} X post${tweets.length === 1 ? "" : "s"} for "${query}"; ${metrics.riskCount} risk-language, ${metrics.promoCount} promotion-heavy, and ${metrics.deliveryCount} delivery/governance mention${metrics.deliveryCount === 1 ? "" : "s"} found${material.length ? `, with ${material.length} item${material.length === 1 ? "" : "s"} needing follow-up` : ""}.`;
}

function communityMetrics(tweets) {
  return {
    riskCount: tweets.filter((tweet) => tweet.flags.risk).length,
    promoCount: tweets.filter((tweet) => tweet.flags.promo).length,
    deliveryCount: tweets.filter((tweet) => tweet.flags.delivery).length,
    totalEngagement: tweets.reduce((sum, tweet) => sum + tweet.engagement, 0)
  };
}

function communityConfidence(tweets, findings) {
  const materialCount = findings.filter((finding) => ["high", "medium"].includes(finding.severity)).length;
  const base = tweets.length >= 10 ? 0.74 : tweets.length >= 5 ? 0.66 : 0.56;
  return Math.min(0.82, base + materialCount * 0.03);
}

function classifyCommunityText(text) {
  return {
    risk: COMMUNITY_RISK_RE.test(text),
    promo: COMMUNITY_PROMO_RE.test(text),
    delivery: COMMUNITY_DELIVERY_RE.test(text)
  };
}

function sampleTweetEvidence(tweets) {
  return tweets
    .slice(0, 3)
    .map((tweet) => {
      const prefix = tweet.author.handle ? `@${tweet.author.handle}` : "X post";
      return `${prefix}: ${tweet.text.slice(0, 160)}${tweet.text.length > 160 ? "..." : ""}`;
    })
    .join(" | ");
}

function communityTweetCount() {
  const value = Number(process.env.XAPI_TWITTER_SEARCH_COUNT || 20);
  if (!Number.isFinite(value)) return 20;
  return Math.max(5, Math.min(40, Math.round(value)));
}

function meaningfulProjectTerm(value) {
  const text = String(value || "").trim();
  if (!text || /^unknown project$/i.test(text) || /^project 0x/i.test(text)) return null;
  return text.replace(/^[$@#]+/, "").slice(0, 64);
}

function hostTerm(value) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "");
    return hostname || null;
  } catch {
    return null;
  }
}

function xHandleTerm(value) {
  try {
    const url = new URL(value);
    if (!/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(url.hostname)) return null;
    const handle = url.pathname.split("/").filter(Boolean)[0];
    if (!handle || ["home", "search", "share", "intent"].includes(handle.toLowerCase())) return null;
    return handle.replace(/^@/, "");
  } catch {
    return null;
  }
}

function formatXSearchTerm(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /\s/.test(text) ? `"${text.replace(/"/g, "")}"` : text;
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function toSafeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildSynthesisAgent({ openai, localFindings = [], summary, upstreamAgents = [] }) {
  const openaiFindings = openai?.findings || [];
  const findingReviews = openai?.findingReviews || [];
  const communityAgent = upstreamAgents.find((agent) => agent.id === "community-resource-agent");
  const upstreamMaterialFindings = upstreamAgents
    .flatMap((agent) => (agent.findings || []).map((finding) => ({
      ...finding,
      evidence: `${agent.name}: ${finding.evidence}`,
      context: finding.context || agent.summary
    })))
    .filter((finding) => ["critical", "high", "medium"].includes(finding.severity))
    .slice(0, 4);
  const synthesisFindings = orderFindings(dedupeFindings([
    ...openaiFindings,
    ...upstreamMaterialFindings
  ])).slice(0, 6);
  const communityTail = communityAgent?.evidenceCount
    ? ` 社区资源 Agent contributed ${communityAgent.evidenceCount} X post${communityAgent.evidenceCount === 1 ? "" : "s"} to this synthesis pass.`
    : "";

  return normalizeAgent({
    id: "synthesis-agent",
    name: "Synthesis Agent",
    status: normalizeStatus(openai?.status, "not_configured"),
    summary: `${openai?.summary || summary?.description || "Deterministic findings are available; model synthesis is not configured."}${communityTail}`,
    confidence: openai?.status === "ok" || openai?.status === "mock" ? 0.78 : 0.54,
    findings: synthesisFindings,
    evidenceCount: localFindings.length + findingReviews.length + upstreamAgents.reduce((sum, agent) => sum + (agent.evidenceCount || 0), 0),
    sources: [
      {
        name: "OpenAI-compatible Project Analysis",
        status: openai?.status || "not_configured",
        message: openai?.message
      },
      ...upstreamAgents.map((agent) => ({
        name: agent.name,
        status: agent.status,
        message: agent.summary
      }))
    ]
  });
}

async function buildRecommendationAgent(context) {
  const fallbackRecommendations = buildRuleRecommendations(context);
  const aiResult = await requestRecommendationAI(context, fallbackRecommendations);
  const aiRecommendations = normalizeRecommendations(aiResult.payload?.recommendations);
  const riskPressure = normalizeRiskPressure(aiResult.payload?.riskPressure, {
    recommendations: aiRecommendations,
    fallbackRecommendations
  });
  const recommendations = dedupeRecommendations([
    ...fallbackRecommendations,
    ...aiRecommendations
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
    ],
    meta: {
      riskPressure
    }
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
    agentFindings: (context.agents || [])
      .flatMap((agent) => summarizeFindings(agent.findings || []).map((finding) => ({
        ...finding,
        agentId: agent.id,
        agentName: agent.name
      })))
      .slice(0, 16),
    fallbackRecommendations
  };

  return requestStructuredAI({
    system: [
      "You are ChainLens' Recommendation Agent.",
      "Return JSON only. Do not include markdown.",
      "Schema: {\"summary\":\"string\",\"riskPressure\":{\"scoreImpact\":0,\"confidence\":0.0,\"reason\":\"string\"},\"recommendations\":[{\"priority\":\"urgent|high|medium|low\",\"title\":\"string\",\"action\":\"string\",\"reason\":\"string\",\"evidence\":\"string\"}]}",
      "Recommend next diligence and safety actions only.",
      "riskPressure.scoreImpact is an integer from 0 to 30 showing how much the final project score should be reduced because the recommendation agent sees unresolved evidence gaps or material risk beyond the deterministic score.",
      "Use scoreImpact 0-4 for evidence-backed projects with routine record-keeping only, 5-12 for missing surfaces or moderate unresolved gaps, 13-20 for high-priority evidence gaps, and 21-30 only for urgent or material unresolved risk.",
      "Do not provide investment advice, buy or sell instructions, price predictions, guaranteed outcomes, or scam labels.",
      "Prioritize narrative-to-delivery gaps when project claims are not backed by verified contracts, active repositories, audits, governance, or other reproducible artifacts.",
      "Use Community Resource Agent findings from X as candidate social evidence; recommend verification when risk-language, incident-language, or promotion-heavy discussion appears.",
      "Use urgent only for critical findings, honeypot-like behavior, owner balance modification, or direct wallet exposure.",
      "Keep recommendations concrete and evidence-backed."
    ].join(" "),
    payload,
    temperature: 0.15
  });
}

function buildRuleRecommendations({ project, projectEvidence, tokenReports = [], findings = [], localFindings = [], walletExposure = null, agents = [] }) {
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

  const communityAgent = agents.find((agent) => agent.id === "community-resource-agent");
  const materialCommunityFinding = (communityAgent?.findings || [])
    .find((finding) => ["high", "medium"].includes(finding.severity));
  if (materialCommunityFinding) {
    recommendations.push(recommendation({
      priority: materialCommunityFinding.severity === "high" ? "high" : "medium",
      title: "Review X community risk signals",
      action: "Inspect the matching X posts, separate verified incident reports from promotion or rumor, and reconcile them with official project updates.",
      reason: "Community-side signals can surface incidents or narrative noise before they appear in official docs, but they need manual source verification.",
      evidence: materialCommunityFinding.evidence || materialCommunityFinding.title
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

  const narrativeFinding = activeFindings.find((finding) => finding.dimension === "delivery" || /narrative claims outpace/i.test(finding.title || ""));
  if (narrativeFinding) {
    recommendations.push(recommendation({
      priority: narrativeFinding.severity === "high" ? "high" : "medium",
      title: "Validate narrative against shipped evidence",
      action: "Map the project's claims to verified contracts, active repositories, audits, governance, usage, or live product evidence before treating the story as substance.",
      reason: "Marketing language without delivery evidence can inflate perceived credibility.",
      evidence: narrativeFinding.evidence || narrativeFinding.title
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

function normalizeRiskPressure(input = {}, { recommendations = [], fallbackRecommendations = [] } = {}) {
  const explicitImpact = Number(input.scoreImpact);
  const hasExplicitImpact = Number.isFinite(explicitImpact);
  const estimatedImpact = estimateRiskPressure([...recommendations, ...fallbackRecommendations]);
  const scoreImpact = hasExplicitImpact
    ? Math.max(0, Math.min(30, Math.round(explicitImpact)))
    : estimatedImpact;
  return {
    scoreImpact,
    source: hasExplicitImpact ? "ai" : "rules",
    confidence: clampConfidence(input.confidence ?? (hasExplicitImpact ? 0.72 : 0.58)),
    reason: String(input.reason || (scoreImpact ? "Recommendation priorities add score pressure." : "Recommendation agent did not add score pressure.")).trim()
  };
}

function estimateRiskPressure(recommendations = []) {
  const counts = recommendations.reduce((acc, item) => {
    acc[item.priority] = (acc[item.priority] || 0) + 1;
    return acc;
  }, {});
  const impact =
    (counts.urgent || 0) * 12 +
    (counts.high || 0) * 7 +
    (counts.medium || 0) * 3;
  return Math.max(0, Math.min(22, impact));
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

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = slugify(`${finding.dimension}-${finding.title}-${finding.evidence}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
