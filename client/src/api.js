const DEFAULT_API_BASE = import.meta.env.PROD ? window.location.origin : "http://localhost:8787";
const API_BASE = import.meta.env.VITE_API_BASE || DEFAULT_API_BASE;

export async function analyzeToken({ chainId, address }) {
  const url = new URL("/api/analyze", API_BASE);
  url.searchParams.set("chainId", chainId);
  url.searchParams.set("address", address);

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Analysis failed");
  }
  return data;
}

export async function analyzeProject(payload, options = {}) {
  if (typeof options.onProgress === "function") {
    return analyzeProjectStream(payload, options);
  }

  return analyzeProjectJson(payload);
}

async function analyzeProjectJson(payload) {
  const url = new URL("/api/project/analyze", API_BASE);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Project analysis failed");
  }
  return data;
}

async function analyzeProjectStream(payload, { onProgress }) {
  const url = new URL("/api/project/analyze/stream", API_BASE);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await safeJson(response);
    throw new Error(data.message || "Project analysis failed");
  }

  if (!response.body) {
    return analyzeProjectJson(payload);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let report = null;

  const handleLine = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "progress") {
      onProgress(event.progress);
      return;
    }
    if (event.type === "report") {
      report = event.report;
      return;
    }
    if (event.type === "error") {
      throw new Error(event.error?.detail || event.error?.message || "Project analysis failed");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(handleLine);
  }

  buffer += decoder.decode();
  handleLine(buffer);

  if (!report) {
    throw new Error("Project analysis stream ended without a report.");
  }

  return report;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function analyzeOpenAIProject(payload) {
  const url = new URL("/api/openai/project", API_BASE);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "OpenAI-compatible project analysis failed");
  }
  return data;
}

export async function fetchHotProjects({ chainId = "1", dex = "uniswap", limit = 8 } = {}) {
  const url = new URL("/api/hot-projects", API_BASE);
  url.searchParams.set("chainId", chainId);
  url.searchParams.set("dex", dex);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Hot projects failed to load");
  }
  return data;
}

export async function attestProjectReport(report) {
  const url = new URL("/api/project/attest", API_BASE);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ report })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Report credential failed");
  }
  return data;
}

export async function verifyProjectReport(payload) {
  const url = new URL("/api/project/verify", API_BASE);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Report credential verification failed");
  }
  return data;
}
