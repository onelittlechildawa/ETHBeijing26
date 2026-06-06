import app from "../server/src/app.js";

export default function handler(req, res) {
  normalizeRewrittenApiUrl(req);
  return app(req, res);
}

function normalizeRewrittenApiUrl(req) {
  if (!req.url?.startsWith("/api/[...path]")) return;

  const url = new URL(req.url, "http://localhost");
  const rewrittenPath = url.searchParams.get("...path") || url.searchParams.get("path");
  if (!rewrittenPath) return;

  url.searchParams.delete("...path");
  url.searchParams.delete("path");
  const search = url.searchParams.toString();
  req.url = `/api/${rewrittenPath}${search ? `?${search}` : ""}`;
}
