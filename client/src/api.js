const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

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

export async function analyzeProject(payload) {
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
