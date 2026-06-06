import "./services/env.js";
import express from "express";
import cors from "cors";
import { analyzeToken } from "./services/analyzer.js";
import { analyzeProject } from "./services/projectAnalyzer.js";
import { requestProjectOpenAI } from "./services/openai.js";
import { SUPPORTED_CHAINS } from "./services/chains.js";

const app = express();
const isVercel = process.env.VERCEL === "1";

if (!isVercel) {
  app.use(cors());
}

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "chainlens-api" });
});

app.get("/api/chains", (_req, res) => {
  res.json({ chains: SUPPORTED_CHAINS });
});

app.get("/api/analyze", analyzeHandler);
app.post("/api/analyze", analyzeHandler);
app.post("/api/project/analyze", projectAnalyzeHandler);
app.post("/api/openai/project", openAIProjectHandler);

async function analyzeHandler(req, res) {
  const input = req.method === "POST" ? req.body : req.query;
  const address = String(input.address || "").trim();
  const chainId = String(input.chainId || "1").trim();

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({
      error: "INVALID_ADDRESS",
      message: "Please provide a valid EVM contract address."
    });
  }

  if (!SUPPORTED_CHAINS.some((chain) => chain.id === chainId)) {
    return res.status(400).json({
      error: "UNSUPPORTED_CHAIN",
      message: `Chain ${chainId} is not supported in the MVP.`
    });
  }

  try {
    const report = await analyzeToken({ chainId, address });
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "ANALYSIS_FAILED",
      message: "ChainLens could not complete this analysis.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
}

async function projectAnalyzeHandler(req, res) {
  const query = String(req.body?.query || req.body?.name || req.body?.website || req.body?.address || "").trim();
  if (!query) {
    return res.status(400).json({
      error: "INVALID_PROJECT_INPUT",
      message: "Provide a project name, website, or at least one contract address."
    });
  }

  try {
    const report = await analyzeProject(req.body || {});
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "PROJECT_ANALYSIS_FAILED",
      message: "ChainLens could not complete this project analysis.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
}

async function openAIProjectHandler(req, res) {
  try {
    const result = await requestProjectOpenAI({
      project: req.body?.project || {},
      tokenReports: req.body?.tokenReports || [],
      walletExposure: req.body?.walletExposure || null,
      localFindings: req.body?.localFindings || [],
      researchEvidence: req.body?.researchEvidence || null
    });

    res.json({
      openai: {
        status: result.status,
        summary: result.summary,
        message: result.message
      },
      findings: result.findings
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "OPENAI_PROJECT_FAILED",
      message: "ChainLens could not complete OpenAI-compatible project analysis.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
}

export default app;
