import { requestStructuredAI } from "./openai.js";

const MAX_LOCALIZED_TEXTS = 80;
const MAX_TEXT_LENGTH = 1200;

export async function buildReportLocalization(report) {
  const texts = collectReportTexts(report);
  const localized = {
    en: {
      status: "canonical",
      source: "report-fields",
      texts: Object.fromEntries(texts.map((text) => [text, text]))
    },
    zh: {
      status: texts.length ? "pending" : "empty",
      source: "openai-compatible",
      texts: {}
    }
  };

  if (!texts.length) return localized;

  const result = await requestStructuredAI({
    system: buildLocalizationInstructions(),
    payload: {
      project: {
        name: report.project?.name,
        website: report.project?.website,
        chain: report.project?.primaryChain?.label
      },
      language: {
        source: "en",
        target: "zh-CN",
        tone: "plain Chinese for non-Web3 readers"
      },
      texts
    },
    temperature: 0.1
  });

  return {
    ...localized,
    zh: {
      status: result.status,
      source: "openai-compatible",
      generatedAt: new Date().toISOString(),
      message: result.message,
      texts: normalizeLocalizedTexts(result.payload || result.raw, texts)
    }
  };
}

function collectReportTexts(report) {
  const texts = [];
  const add = (value) => {
    const text = String(value || "").trim();
    if (!shouldLocalizeText(text)) return;
    texts.push(text);
  };

  add(report.skepticReview?.headline);
  (report.summary?.actions || []).forEach((action) => {
    add(action.title);
    add(action.action);
    add(action.reason);
    add(action.evidence);
  });
  (report.recommendations || []).forEach((recommendation) => {
    add(recommendation.title);
    add(recommendation.action);
    add(recommendation.reason);
    add(recommendation.evidence);
  });
  (report.skepticReview?.nextQuestions || []).forEach(add);
  (report.skepticReview?.claimAudit || []).forEach((claim) => {
    add(claim.claim);
    add(claim.question);
  });
  add(report.openai?.summary);
  (report.findings || []).forEach((finding) => {
    add(finding.title);
    add(finding.context);
    add(finding.evidence);
  });
  (report.suppressedFindings || []).forEach((finding) => {
    add(finding.title);
    add(finding.suppressionReason || finding.review?.reason || finding.context);
    add(finding.suppressionEvidence || finding.review?.evidence || finding.evidence);
  });
  (report.openai?.findings || []).forEach((finding) => {
    add(finding.title);
    add(finding.context);
    add(finding.evidence);
  });
  (report.agents || []).forEach((agent) => add(agent.summary));
  (report.projectEvidence?.artifacts || []).forEach((artifact) => {
    add(artifact.title);
    add(artifact.summary);
  });

  return [...new Set(texts)].slice(0, MAX_LOCALIZED_TEXTS);
}

function shouldLocalizeText(text) {
  if (!text || text.length > MAX_TEXT_LENGTH) return false;
  if (/[\u4e00-\u9fff]/.test(text)) return false;
  if (!/[a-zA-Z]/.test(text)) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^0x[a-fA-F0-9]{8,}$/.test(text)) return false;
  if (/^(N\/A|n\/a|unknown|ok|error)$/i.test(text)) return false;
  if (/^[A-Z0-9_.:/-]{1,16}$/.test(text)) return false;
  if (text.split(/\s+/).length === 1 && /^[A-Z][A-Za-z0-9_.-]{0,24}$/.test(text)) return false;
  return true;
}

function buildLocalizationInstructions() {
  return [
    "You write ChainLens report display copy in Chinese while preserving the English canonical report fields.",
    "Return JSON only. Do not include markdown.",
    "Schema: {\"items\":[{\"source\":\"exact source string\",\"zh\":\"plain Chinese string\"}]}",
    "Rewrite only the provided source strings. Do not add new facts, remove risk meaning, soften warnings, or invent evidence.",
    "Use plain, natural Chinese for ordinary people who do not know Web3. Avoid stiff terms like 尽职调查, 勤勉, 叙事兑现, 赋能, or 祛魅.",
    "Preserve product names, project names, token symbols, protocol names, URLs, addresses, chain names, legal entity names, and standards such as ERC-20, MiCA, GitHub, Uniswap, Ethereum, Sepolia, Stellar Consensus Protocol.",
    "Keep the target close in length to the source when possible."
  ].join(" ");
}

function normalizeLocalizedTexts(payload, requestedTexts) {
  const allowed = new Set(requestedTexts);
  const localizedTexts = {};

  if (Array.isArray(payload?.items)) {
    payload.items.forEach((item) => {
      const source = String(item?.source || "").trim();
      const target = String(item?.zh || item?.target || "").trim();
      if (allowed.has(source) && target) localizedTexts[source] = target;
    });
  }

  const textMap = payload?.texts || payload?.zh || payload?.localized;
  if (textMap && typeof textMap === "object" && !Array.isArray(textMap)) {
    Object.entries(textMap).forEach(([source, target]) => {
      const key = String(source || "").trim();
      const value = String(target || "").trim();
      if (allowed.has(key) && value) localizedTexts[key] = value;
    });
  }

  return localizedTexts;
}
