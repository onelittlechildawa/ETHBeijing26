import { fetchJson } from "./http.js";

const DEFAULT_BASE_URL = "https://opencode.ai/zen/go/v1";
const DEFAULT_MODEL = "glm-5.1";
const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);

export async function requestProjectOpenAI({ project, tokenReports = [], walletExposure = null, localFindings = [], researchEvidence = null }) {
  if (process.env.OPENAI_MOCK_RESPONSE) {
    return normalizeOpenAIResult(JSON.parse(process.env.OPENAI_MOCK_RESPONSE), "mock");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return emptyOpenAIResult("not_configured");
  }

  try {
    const baseUrl = (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
    const raw = await fetchJson(`${baseUrl}/chat/completions`, {
      method: "POST",
      retries: 1,
      timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 90000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        messages: buildMessages({ project, tokenReports, walletExposure, localFindings, researchEvidence })
      })
    });

    return normalizeOpenAIResult(raw, "ok");
  } catch (error) {
    return {
      ...emptyOpenAIResult("error"),
      message: error.message
    };
  }
}

function buildMessages({ project, tokenReports, walletExposure, localFindings, researchEvidence }) {
  return [
    {
      role: "system",
      content: [
        "You are ChainLens' project diligence analyst.",
        "Act as researcher, security analyst, and synthesizer.",
        "Return JSON only. Do not include markdown.",
        "Schema: {\"summary\":\"string\",\"findingReviews\":[{\"findingId\":\"string\",\"verdict\":\"valid|false_positive|needs_review\",\"confidence\":0.0,\"reason\":\"string\",\"evidence\":\"string\"}],\"findings\":[{\"dimension\":\"identity|asset|market|governance|community|data|wallet|technical\",\"title\":\"string\",\"severity\":\"critical|high|medium|low|info\",\"confidence\":0.0,\"evidence\":\"string\",\"context\":\"string\"}]}",
        "Review localFindings for false positives caused by contract type mismatch, such as token holder/liquidity checks on oracle, marketplace, router, proxy, or infrastructure contracts.",
        "Treat exchanges, custody wallets, bridges, routers, governance treasuries, multisigs, timelocks, and protocol infrastructure as out of scope for ERC-20 token holder/liquidity/tax scoring unless evidence proves the address is the actual project token.",
        "Mark false_positive only when project metadata, verified contract metadata, ABI, or source evidence contradicts the local finding.",
        "Use researchEvidence when it is provided, but do not claim you browsed or inspected external surfaces that are absent from researchEvidence.",
        "Do not emit credential-configuration instructions as project risk findings.",
        "Separate model-derived findings from deterministic on-chain evidence by explaining evidence sources clearly."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        project,
        tokenReports: summarizeTokenReports(tokenReports),
        researchEvidence: summarizeResearchEvidence(researchEvidence),
        walletExposure,
        localFindings
      })
    }
  ];
}

function summarizeResearchEvidence(researchEvidence) {
  if (!researchEvidence) return null;
  return {
    status: researchEvidence.status,
    artifactCount: researchEvidence.artifactCount,
    addresses: researchEvidence.addresses,
    surfaces: researchEvidence.surfaces,
    artifacts: (researchEvidence.artifacts || []).slice(0, 8).map((artifact) => ({
      type: artifact.type,
      title: artifact.title,
      url: artifact.url,
      status: artifact.status,
      summary: artifact.summary,
      excerpts: (artifact.excerpts || []).slice(0, 3),
      facts: artifact.facts,
      addresses: artifact.addresses,
      links: (artifact.links || []).slice(0, 8)
    })),
    sources: researchEvidence.sources
  };
}

function summarizeTokenReports(tokenReports) {
  return tokenReports.map((report) => ({
    address: report.address,
    chain: report.chain?.label,
    token: report.token,
    summary: report.summary,
    dimensions: report.dimensions,
    signals: (report.signals || []).slice(0, 12),
    sources: report.sources
  }));
}

function normalizeOpenAIResult(raw, status) {
  const payload = extractPayload(raw);
  return {
    status,
    summary: typeof payload?.summary === "string" ? payload.summary : null,
    findingReviews: normalizeFindingReviews(payload?.findingReviews),
    findings: normalizeFindings(payload?.findings),
    raw
  };
}

function extractPayload(raw) {
  if (raw?.findings || raw?.summary) return raw;

  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return {};

  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

function normalizeFindings(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.map((finding, index) => {
    const severity = VALID_SEVERITIES.has(finding.severity) ? finding.severity : "info";
    return {
      id: finding.id || `openai-finding-${index + 1}`,
      dimension: finding.dimension || "technical",
      title: finding.title || finding.signal || "OpenAI finding",
      severity,
      confidence: clampConfidence(finding.confidence),
      evidence: finding.evidence || "OpenAI-compatible analysis",
      context: finding.context || finding.description || ""
    };
  });
}

function normalizeFindingReviews(reviews) {
  if (!Array.isArray(reviews)) return [];
  const validVerdicts = new Set(["valid", "false_positive", "needs_review"]);
  return reviews
    .filter((review) => review?.findingId)
    .map((review) => ({
      findingId: String(review.findingId),
      verdict: validVerdicts.has(review.verdict) ? review.verdict : "needs_review",
      confidence: clampConfidence(review.confidence),
      reason: review.reason || "",
      evidence: review.evidence || "OpenAI-compatible finding review"
    }));
}

function emptyOpenAIResult(status) {
  return {
    status,
    summary: null,
    findingReviews: [],
    findings: [],
    raw: null
  };
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}
