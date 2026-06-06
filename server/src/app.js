import "./services/env.js";
import express from "express";
import cors from "cors";
import { analyzeToken } from "./services/analyzer.js";
import { getHotProjects, refreshHotProjects } from "./services/hotProjects.js";
import { analyzeProject } from "./services/projectAnalyzer.js";
import { requestProjectOpenAI } from "./services/openai.js";
import { attestProjectReport, verifyProjectReport } from "./services/reportNotary.js";
import { SUPPORTED_CHAINS } from "./services/chains.js";

const app = express();
const isVercel = process.env.VERCEL === "1";

if (!isVercel) {
  app.use(cors());
}

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "chainlens-api" });
});

app.get("/api/chains", (_req, res) => {
  res.json({ chains: SUPPORTED_CHAINS });
});

app.get("/api/analyze", analyzeHandler);
app.post("/api/analyze", analyzeHandler);
app.post("/api/project/analyze", projectAnalyzeHandler);
app.post("/api/project/analyze/stream", projectAnalyzeStreamHandler);
app.post("/api/project/attest", projectAttestHandler);
app.post("/api/project/verify", projectVerifyHandler);
app.get("/api/hot-projects", hotProjectsHandler);
app.get("/api/cron/hot-projects", hotProjectsCronHandler);
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

async function projectAnalyzeStreamHandler(req, res) {
  const query = String(req.body?.query || req.body?.name || req.body?.website || req.body?.address || "").trim();
  if (!query) {
    return res.status(400).json({
      error: "INVALID_PROJECT_INPUT",
      message: "Provide a project name, website, or at least one contract address."
    });
  }

  res.status(200);
  res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  res.setHeader("cache-control", "no-cache, no-transform");
  res.setHeader("x-accel-buffering", "no");
  res.flushHeaders?.();

  const send = (payload) => {
    if (res.writableEnded) return;
    res.write(`${JSON.stringify(payload)}\n`);
  };

  try {
    const report = await analyzeProject(req.body || {}, {
      onProgress: (progress) => send({ type: "progress", progress })
    });
    send({ type: "report", report });
    res.end();
  } catch (error) {
    console.error(error);
    send({
      type: "error",
      error: {
        message: "ChainLens could not complete this project analysis.",
        detail: process.env.NODE_ENV === "production" ? undefined : error.message
      }
    });
    res.end();
  }
}

async function hotProjectsHandler(req, res) {
  try {
    const digest = await getHotProjects({
      chainId: req.query?.chainId,
      dex: req.query?.dex,
      limit: req.query?.limit
    });
    res.json(digest);
  } catch (error) {
    console.error(error);
    res.status(503).json({
      error: "HOT_PROJECTS_UNAVAILABLE",
      message: "ChainLens could not load the hot projects digest.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
}

async function projectAttestHandler(req, res) {
  if (!req.body?.report) {
    return res.status(400).json({
      error: "INVALID_REPORT",
      message: "Provide a ChainLens project report."
    });
  }

  try {
    const result = await attestProjectReport(req.body.report);
    if (result.status === "invalid_report") {
      return res.status(400).json({
        error: "INVALID_REPORT",
        message: result.message || "The report credential could not be verified.",
        ...result
      });
    }
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "REPORT_ATTESTATION_FAILED",
      message: "ChainLens could not notarize this report.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
}

async function projectVerifyHandler(req, res) {
  try {
    const result = await verifyProjectReport({
      report: req.body?.report || null,
      reportHash: req.body?.reportHash || null
    });

    if (result.status === "invalid_report") {
      return res.status(400).json({
        error: "INVALID_REPORT",
        message: result.message || "Provide a report or reportHash.",
        ...result
      });
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "REPORT_VERIFICATION_FAILED",
      message: "ChainLens could not verify this report credential.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
}

async function hotProjectsCronHandler(req, res) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || req.get("authorization") !== expected) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Hot projects cron requires a valid CRON_SECRET bearer token."
    });
  }

  try {
    const digest = await refreshHotProjects({
      chainId: req.query?.chainId,
      dex: req.query?.dex,
      limit: req.query?.limit
    });
    res.json({
      ok: true,
      generatedAt: digest.generatedAt,
      sourceStatus: digest.sourceStatus,
      candidateCount: digest.candidateCount,
      itemCount: digest.items.length,
      storage: digest.storage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "HOT_PROJECTS_REFRESH_FAILED",
      message: "ChainLens could not refresh hot projects.",
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
