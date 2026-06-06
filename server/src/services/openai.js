import { fetchJson } from "./http.js";

const DEFAULT_BASE_URL = "https://opencode.ai/zen/go/v1";
const DEFAULT_MODEL = "glm-5.1";
const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);

export async function requestProjectOpenAI({ project, tokenReports = [], walletExposure = null, localFindings = [], researchEvidence = null }) {
  const result = await requestStructuredAI({
    system: buildProjectAnalystInstructions(),
    payload: {
      project,
      tokenReports: summarizeTokenReports(tokenReports),
      researchEvidence: summarizeResearchEvidence(researchEvidence),
      walletExposure,
      localFindings
    },
    temperature: 0.2
  });
  const normalized = normalizeOpenAIResult(result.payload || result.raw, result.status);
  return {
    ...normalized,
    raw: result.raw ?? normalized.raw,
    message: result.message
  };
}

export async function requestStructuredAI({ system, payload, temperature = 0.2 }) {
  if (process.env.OPENAI_MOCK_RESPONSE) {
    const mock = JSON.parse(process.env.OPENAI_MOCK_RESPONSE);
    return {
      status: "mock",
      payload: extractPayload(mock),
      raw: mock
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      status: "not_configured",
      payload: null,
      raw: null
    };
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
        temperature,
        messages: [
          {
            role: "system",
            content: system
          },
          {
            role: "user",
            content: JSON.stringify(payload)
          }
        ]
      })
    });

    return {
      status: "ok",
      payload: extractPayload(raw),
      raw
    };
  } catch (error) {
    return {
      status: "error",
      payload: null,
      raw: null,
      message: error.message
    };
  }
}

export async function requestWebResearchAI({ query, project = null, addresses = [] }) {
  if (process.env.OPENAI_WEB_SEARCH_ENABLED === "0") {
    return {
      status: "disabled",
      payload: null,
      raw: null,
      message: "OpenAI web search is disabled by OPENAI_WEB_SEARCH_ENABLED=0."
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      status: "not_configured",
      payload: null,
      raw: null,
      message: "Set OPENAI_API_KEY to enable OpenAI-compatible web search."
    };
  }

  try {
    const baseUrl = (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
    const model = process.env.OPENAI_WEB_SEARCH_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
    const raw = await fetchJson(`${baseUrl}/chat/completions`, {
      method: "POST",
      retries: 1,
      timeoutMs: Number(process.env.OPENAI_WEB_SEARCH_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || 90000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: buildWebResearchInstructions()
          },
          {
            role: "user",
            content: JSON.stringify({
              query,
              project,
              addresses
            })
          }
        ],
        tools: [
          {
            type: "web_search",
            web_search: {
              enable: true,
              search_result: true,
              search_engine: process.env.OPENAI_WEB_SEARCH_ENGINE || "search-prime",
              count: Number(process.env.OPENAI_WEB_SEARCH_COUNT || 5),
              content_size: process.env.OPENAI_WEB_SEARCH_CONTEXT_SIZE || "medium"
            }
          }
        ]
      })
    });

    const payload = extractPayload(raw);
    return {
      status: "ok",
      payload: {
        ...payload,
        results: mergeWebSearchResults(payload?.results, raw?.web_search)
      },
      raw,
      model
    };
  } catch (error) {
    return {
      status: "error",
      payload: null,
      raw: null,
      message: error.message
    };
  }
}

function buildProjectAnalystInstructions() {
  return [
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
  ].join(" ");
}

function buildWebResearchInstructions() {
  return [
    "You are ChainLens' web research collector for crypto project diligence.",
    "Use the provided web_search tool to find official or high-signal public project surfaces for the provided project.",
    "Prioritize the official website, docs, GitHub or source repository, whitepaper, audit/security page, governance page, and canonical social/profile pages.",
    "Prefer official sources over directory listings or news. Treat search results as candidates unless the result itself proves official binding.",
    "Do not provide investment advice, buy/sell instructions, price predictions, guaranteed outcomes, or scam labels.",
    "Return JSON only. Do not include markdown.",
    "Schema: {\"summary\":\"string\",\"results\":[{\"title\":\"string\",\"url\":\"string\",\"type\":\"website|docs|whitepaper|audit|governance|repo|social|profile|other\",\"snippet\":\"string\",\"official\":true,\"confidence\":0.0}],\"addresses\":[\"string\"],\"warnings\":[\"string\"]}",
    "Keep results to the 8 strongest public sources and include only URLs you found through web search or were provided in input."
  ].join(" ");
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

function mergeWebSearchResults(modelResults = [], webSearchResults = []) {
  const seen = new Set();
  return [...(Array.isArray(modelResults) ? modelResults : []), ...normalizeProviderWebSearchResults(webSearchResults)]
    .filter((item) => item?.url)
    .filter((item) => {
      const key = String(item.url).trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function normalizeProviderWebSearchResults(webSearchResults = []) {
  if (!Array.isArray(webSearchResults)) return [];
  return webSearchResults.map((item) => ({
    title: item.title || item.link || "Web search result",
    url: item.link || item.url,
    type: inferWebSearchType(`${item.title || ""} ${item.link || ""}`),
    snippet: item.content || item.snippet || item.summary || "",
    official: false,
    confidence: 0.58
  }));
}

function inferWebSearchType(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("github.com")) return "repo";
  if (/\bdocs|documentation|developer\b/.test(text)) return "docs";
  if (/\bwhitepaper|litepaper|paper|pdf\b/.test(text)) return "whitepaper";
  if (/\baudit|security|certik|trailofbits|openzeppelin|code4rena|sherlock\b/.test(text)) return "audit";
  if (/\bgovernance|forum|snapshot|vote|dao|tally\b/.test(text)) return "governance";
  if (/\btwitter\.com|x\.com|discord|telegram|reddit|medium\.com|mirror\.xyz\b/.test(text)) return "social";
  return "website";
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

  const outputText = extractResponsesOutputText(raw);
  if (outputText) return parseJsonPayload(outputText);

  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return {};

  return parseJsonPayload(content);
}

function extractResponsesOutputText(raw) {
  if (typeof raw?.output_text === "string") return raw.output_text;
  const content = (raw?.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  return content || null;
}

function parseJsonPayload(content) {
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
