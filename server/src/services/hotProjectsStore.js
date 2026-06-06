import { get, put } from "@vercel/blob";

const HOT_PROJECTS_PATH = "hot-projects/latest.json";
let memoryDigest = null;

export function hotProjectsStorageStatus() {
  if (hasBlobConfig()) return { status: "blob", path: HOT_PROJECTS_PATH };
  return { status: "memory", path: HOT_PROJECTS_PATH };
}

export async function readHotProjectsDigest() {
  if (!hasBlobConfig()) {
    return memoryDigest;
  }

  const result = await get(HOT_PROJECTS_PATH, {
    access: "private",
    useCache: false
  });
  if (!result?.stream) return null;

  const text = await streamToText(result.stream);
  return JSON.parse(text);
}

export async function writeHotProjectsDigest(digest) {
  memoryDigest = digest;

  if (!hasBlobConfig()) {
    return { status: "memory", path: HOT_PROJECTS_PATH };
  }

  const blob = await put(HOT_PROJECTS_PATH, JSON.stringify(digest, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });

  return {
    status: "blob",
    path: blob.pathname,
    url: blob.url
  };
}

function hasBlobConfig() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID));
}

async function streamToText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
