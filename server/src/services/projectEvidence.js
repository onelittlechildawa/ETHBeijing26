import { cached } from "./cache.js";
import { isBurnAddress } from "./knownAddresses.js";

const TTL_MS = 30 * 60 * 1000;
const ADDRESS_RE = /0x[a-fA-F0-9]{40}/g;
const URL_RE = /\b(?:https?:\/\/)?(?:github\.com\/[^\s"'<>),]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s"'<>),]+)?)\b/gi;
const MAX_INITIAL_URLS = 8;
const MAX_ARTIFACTS = 12;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 24000;

export async function collectProjectEvidence({ seed, project = null, existingEvidence = null }) {
  const artifactsByUrl = new Map((existingEvidence?.artifacts || []).map((artifact) => [artifact.url, artifact]));
  const sources = [...(existingEvidence?.sources || [])];
  const candidates = buildCandidateUrls(seed, project, existingEvidence)
    .filter((url) => !artifactsByUrl.has(url))
    .slice(0, MAX_INITIAL_URLS);

  for (const url of candidates) {
    if (artifactsByUrl.size >= MAX_ARTIFACTS) break;
    const result = await collectUrlEvidence(url);
    if (result.artifact) {
      const artifact = markDiscovery(result.artifact, "direct");
      artifactsByUrl.set(artifact.url, artifact);
    }
    sources.push(result.source);
  }

  const discoveredUrls = collectDiscoveredUrls([...artifactsByUrl.values()])
    .filter((url) => !artifactsByUrl.has(url))
    .slice(0, Math.max(0, MAX_ARTIFACTS - artifactsByUrl.size));

  for (const url of discoveredUrls) {
    const result = await collectUrlEvidence(url);
    if (result.artifact) {
      const artifact = markDiscovery(result.artifact, "linked");
      artifactsByUrl.set(artifact.url, artifact);
    }
    sources.push(result.source);
  }

  if (shouldSearchByName(seed, project, artifactsByUrl)) {
    const result = await collectGitHubSearchEvidence(project?.name || seed?.name || seed?.query);
    if (result.artifact) {
      const artifact = markDiscovery(result.artifact, "search");
      artifactsByUrl.set(artifact.url, artifact);
    }
    sources.push(result.source);
  }

  const xapiResult = await collectXapiSearchEvidence(project?.name || seed?.name || seed?.query);
  if (xapiResult.artifact) {
    const artifact = markDiscovery(xapiResult.artifact, "search");
    artifactsByUrl.set(artifact.url, artifact);
  }
  if (xapiResult.source) sources.push(xapiResult.source);

  const artifacts = [...artifactsByUrl.values()].slice(0, MAX_ARTIFACTS);
  const surfaces = buildSurfaces(artifacts, seed, project);
  const addresses = unique([
    ...extractAddresses(seed?.query),
    ...artifacts.filter(shouldPromoteArtifactAddresses).flatMap((artifact) => artifact.addresses || [])
  ]);

  return {
    status: artifacts.length ? "ok" : sources.some((source) => source.status === "error") ? "partial" : "empty",
    artifactCount: artifacts.length,
    addresses,
    surfaces,
    artifacts,
    sources: dedupeSources(sources)
  };
}

export function extractEvidenceUrls(value) {
  const matches = String(value || "").match(URL_RE) || [];
  return unique(matches.map(normalizeEvidenceUrl).filter(Boolean));
}

async function collectUrlEvidence(url) {
  if (isGitHubUrl(url)) {
    return collectGitHubEvidence(url);
  }
  return collectWebEvidence(url);
}

async function collectWebEvidence(url) {
  try {
    const { value, cache } = await cached(`project-evidence:web:${url}`, TTL_MS, async () => fetchWebArtifact(url));
    return {
      artifact: value,
      source: {
        name: sourceNameForArtifact(value),
        status: value.status || "ok",
        cache,
        url: value.url
      }
    };
  } catch (error) {
    return {
      artifact: null,
      source: {
        name: "Project Surface Fetch",
        status: "error",
        message: error.message,
        url
      }
    };
  }
}

async function fetchWebArtifact(url) {
  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.4",
      "user-agent": "ChainLens/0.1"
    },
    timeoutMs: 14000
  });

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
    throw new Error(`Document is too large (${contentLength} bytes)`);
  }

  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`Document is too large (${buffer.byteLength} bytes)`);
  }

  const finalUrl = response.url || url;
  if (isPdfUrl(finalUrl, contentType, buffer)) {
    return buildPdfArtifact(finalUrl, contentType, buffer);
  }

  const raw = buffer.toString("utf8");
  const parsed = contentType.includes("html") || raw.includes("<html")
    ? parseHtml(raw, finalUrl)
    : { title: titleFromUrl(finalUrl), text: normalizeText(raw), links: [] };
  const type = classifySurfaceType(finalUrl, parsed.title, parsed.text);

  return normalizeArtifact({
    type,
    title: parsed.title || titleFromUrl(finalUrl),
    url: finalUrl,
    status: "ok",
    summary: summarizeText(parsed.text),
    excerpts: selectExcerpts(parsed.text),
    facts: {
      contentType: contentType || "unknown",
      bytes: buffer.byteLength,
      textChars: parsed.text.length
    },
    addresses: extractAddresses(parsed.text),
    links: parsed.links
  });
}

async function buildPdfArtifact(url, contentType, buffer) {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    try {
      const text = normalizeText(result.text || "");
      return normalizeArtifact({
        type: "whitepaper",
        title: result.info?.Title || titleFromUrl(url),
        url,
        status: "ok",
        summary: summarizeText(text),
        excerpts: selectExcerpts(text),
        facts: {
          contentType: contentType || "application/pdf",
          bytes: buffer.byteLength,
          pages: result.total || null,
          textChars: text.length
        },
        addresses: extractAddresses(text),
        links: extractEvidenceUrls(text).map((link) => ({ type: categorizeSurface(link), label: "PDF link", url: link }))
      });
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    return normalizeArtifact({
      type: "whitepaper",
      title: titleFromUrl(url),
      url,
      status: "unreadable",
      summary: "PDF text extraction is unavailable in this runtime.",
      excerpts: [],
      facts: {
        contentType: contentType || "application/pdf",
        bytes: buffer.byteLength,
        parseError: error.message
      },
      addresses: [],
      links: []
    });
  }
}

async function collectGitHubEvidence(url) {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    return {
      artifact: null,
      source: { name: "GitHub Evidence", status: "empty", message: "URL is not a GitHub project URL", url }
    };
  }

  try {
    if (parsed.repo) {
      const { value, cache } = await cached(`project-evidence:github-repo:${parsed.owner}/${parsed.repo}`, TTL_MS, async () => fetchGitHubRepoArtifactWithFallback(parsed));
      return {
        artifact: value,
        source: { name: "GitHub Repository Evidence", status: value.status || "ok", cache, url: value.url }
      };
    }

    const { value, cache } = await cached(`project-evidence:github-profile:${parsed.owner}`, TTL_MS, async () => fetchGitHubProfileArtifact(parsed.owner, url));
    return {
      artifact: value,
      source: { name: "GitHub Profile Evidence", status: value.status || "ok", cache, url: value.url }
    };
  } catch (error) {
    return {
      artifact: null,
      source: {
        name: "GitHub Evidence",
        status: "error",
        message: error.message,
        url
      }
    };
  }
}

async function fetchGitHubRepoArtifactWithFallback(parsed) {
  try {
    return await fetchGitHubRepoArtifact(parsed);
  } catch (error) {
    return fetchGitHubRepoFallbackArtifact(parsed, error);
  }
}

async function fetchGitHubRepoArtifact({ owner, repo }) {
  const [repoResult, readmeResult, commitsResult, releasesResult] = await Promise.allSettled([
    githubJson(`/repos/${owner}/${repo}`),
    githubText(`/repos/${owner}/${repo}/readme`, { accept: "application/vnd.github.raw" }),
    githubJson(`/repos/${owner}/${repo}/commits?per_page=5`),
    githubJson(`/repos/${owner}/${repo}/releases?per_page=3`)
  ]);

  const repoData = unwrapRequired(repoResult, "GitHub repository not found");
  const readme = readmeResult.status === "fulfilled" ? normalizeText(readmeResult.value) : "";
  const commits = commitsResult.status === "fulfilled" && Array.isArray(commitsResult.value) ? commitsResult.value : [];
  const releases = releasesResult.status === "fulfilled" && Array.isArray(releasesResult.value) ? releasesResult.value : [];
  const text = normalizeText([repoData.description, readme, commits.map((commit) => commit.commit?.message).join(" ")].join(" "));
  const links = [
      ...extractEvidenceUrls(readme).map((link) => ({ type: categorizeSurface(link), label: "README link", url: link })),
    repoData.homepage ? { type: "website", label: "Repository homepage", url: normalizeEvidenceUrl(repoData.homepage) } : null
  ].filter((link) => link?.url);

  return normalizeArtifact({
    type: "github_repository",
    title: repoData.full_name || `${owner}/${repo}`,
    url: repoData.html_url || `https://github.com/${owner}/${repo}`,
    status: repoData.archived || repoData.disabled ? "needs_review" : "ok",
    summary: summarizeGitHubRepo(repoData),
    excerpts: [
      ...selectExcerpts(readme, 3),
      ...commits.slice(0, 3).map((commit) => `Commit: ${commit.commit?.message || "No message"}`)
    ].slice(0, 5),
    facts: {
      stars: repoData.stargazers_count ?? null,
      forks: repoData.forks_count ?? null,
      openIssues: repoData.open_issues_count ?? null,
      defaultBranch: repoData.default_branch || null,
      license: repoData.license?.spdx_id || null,
      archived: Boolean(repoData.archived),
      disabled: Boolean(repoData.disabled),
      pushedAt: repoData.pushed_at || null,
      createdAt: repoData.created_at || null,
      recentCommits: commits.map((commit) => ({
        sha: commit.sha,
        message: firstLine(commit.commit?.message),
        date: commit.commit?.committer?.date || commit.commit?.author?.date || null
      })),
      releases: releases.map((release) => ({
        tag: release.tag_name,
        name: release.name,
        publishedAt: release.published_at
      }))
    },
    addresses: extractAddresses(text),
    links
  });
}

async function fetchGitHubRepoFallbackArtifact({ owner, repo }, error) {
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const [pageResult, readmeResult] = await Promise.allSettled([
    fetchPlainText(repoUrl),
    fetchRawReadme(owner, repo)
  ]);
  if (pageResult.status === "rejected" && readmeResult.status === "rejected") {
    throw error;
  }

  const page = pageResult.status === "fulfilled" ? pageResult.value : "";
  const readme = readmeResult.status === "fulfilled" ? readmeResult.value : "";
  const parsedPage = page ? parseHtml(page, repoUrl) : { title: `${owner}/${repo}`, text: "", links: [] };
  const text = normalizeText([parsedPage.text, readme].join(" "));
  return normalizeArtifact({
    type: "github_repository",
    title: `${owner}/${repo}`,
    url: repoUrl,
    status: "partial",
    summary: `GitHub repository page fetched without full API metadata. API detail was unavailable: ${error.message}`,
    excerpts: selectExcerpts(readme || parsedPage.text, 5),
    facts: {
      apiFallback: true,
      apiError: error.message,
      textChars: text.length
    },
    addresses: extractAddresses(text),
    links: extractEvidenceUrls(readme)
      .map((link) => ({ type: categorizeSurface(link), label: "README link", url: link }))
      .filter((link) => ["repo", "docs", "whitepaper", "audit", "governance"].includes(link.type))
  });
}

async function fetchGitHubProfileArtifact(owner, sourceUrl) {
  const [profileResult, reposResult] = await Promise.allSettled([
    githubJson(`/users/${owner}`),
    githubJson(`/users/${owner}/repos?sort=pushed&per_page=8`)
  ]);
  const profile = unwrapRequired(profileResult, "GitHub profile not found");
  const repos = reposResult.status === "fulfilled" && Array.isArray(reposResult.value) ? reposResult.value : [];
  const homepage = normalizeEvidenceUrl(profile.blog);

  return normalizeArtifact({
    type: "github_profile",
    title: profile.name || profile.login || owner,
    url: profile.html_url || sourceUrl,
    status: "candidate",
    summary: `${profile.name || profile.login || owner} GitHub profile with ${repos.length} recent repositories available for project binding.`,
    excerpts: repos.slice(0, 5).map((repo) => `${repo.full_name}: ${repo.description || "No description"} (pushed ${repo.pushed_at || "unknown"})`),
    facts: {
      login: profile.login,
      type: profile.type,
      publicRepos: profile.public_repos,
      followers: profile.followers,
      homepage,
      recentRepos: repos.map((repo) => ({
        name: repo.full_name,
        url: repo.html_url,
        stars: repo.stargazers_count,
        pushedAt: repo.pushed_at,
        description: repo.description
      }))
    },
    addresses: extractAddresses([profile.bio, repos.map((repo) => repo.description).join(" ")].join(" ")),
    links: [
      homepage ? { type: "website", label: "Profile homepage", url: homepage } : null,
      ...repos.slice(0, 5).map((repo) => ({ type: "repo", label: repo.full_name, url: repo.html_url }))
    ].filter(Boolean)
  });
}

async function collectGitHubSearchEvidence(name) {
  const query = meaningfulName(name);
  if (!query) {
    return {
      artifact: null,
      source: { name: "GitHub Repository Search", status: "empty", message: "No project name available for repository search" }
    };
  }

  try {
    const searchQuery = encodeURIComponent(`${query} web3 crypto protocol`);
    const { value, cache } = await cached(`project-evidence:github-search:${searchQuery}`, TTL_MS, async () => githubJson(`/search/repositories?q=${searchQuery}&sort=stars&order=desc&per_page=5`));
    const items = Array.isArray(value.items) ? value.items : [];
    return {
      artifact: normalizeArtifact({
        type: "github_search",
        title: `GitHub candidates for ${query}`,
        url: `https://github.com/search?q=${searchQuery}&type=repositories`,
        status: items.length ? "candidate" : "empty",
        summary: items.length
          ? `Found ${items.length} GitHub repository candidates. Treat these as candidates until an official surface confirms them.`
          : "No GitHub repository candidates were returned.",
        excerpts: items.map((item) => `${item.full_name}: ${item.description || "No description"} (${item.stargazers_count || 0} stars)`),
        facts: {
          candidateCount: items.length,
          candidates: items.map((item) => ({
            name: item.full_name,
            url: item.html_url,
            stars: item.stargazers_count,
            pushedAt: item.pushed_at,
            description: item.description
          }))
        },
        addresses: [],
        links: items.map((item) => ({ type: "repo", label: item.full_name, url: item.html_url }))
      }),
      source: { name: "GitHub Repository Search", status: items.length ? "candidate" : "empty", cache }
    };
  } catch (error) {
    return {
      artifact: null,
      source: { name: "GitHub Repository Search", status: "error", message: error.message }
    };
  }
}

async function collectXapiSearchEvidence(name) {
  const query = meaningfulName(name);
  if (!query) return { artifact: null, source: null };
  if (!process.env.XAPI_API_KEY) {
    return {
      artifact: null,
      source: {
        name: "xAPI Search",
        status: "disabled",
        message: "Set XAPI_API_KEY and XAPI_SEARCH_URL to enable external web search."
      }
    };
  }
  if (!process.env.XAPI_SEARCH_URL) {
    return {
      artifact: null,
      source: {
        name: "xAPI Search",
        status: "empty",
        message: "XAPI_API_KEY is configured, but XAPI_SEARCH_URL is not set."
      }
    };
  }

  try {
    const response = await fetchWithTimeout(process.env.XAPI_SEARCH_URL, {
      method: "POST",
      timeoutMs: 16000,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${process.env.XAPI_API_KEY}`,
        "user-agent": "ChainLens/0.1"
      },
      body: JSON.stringify({ query, limit: 5 })
    });
    const raw = await response.json();
    const results = normalizeSearchResults(raw);
    return {
      artifact: normalizeArtifact({
        type: "web_search",
        title: `xAPI search results for ${query}`,
        url: process.env.XAPI_SEARCH_URL,
        status: results.length ? "candidate" : "empty",
        summary: results.length ? `xAPI returned ${results.length} candidate public surfaces.` : "xAPI search returned no candidates.",
        excerpts: results.map((item) => `${item.title || item.url}: ${item.snippet || ""}`),
        facts: { results },
        addresses: extractAddresses(JSON.stringify(results)),
        links: results.map((item) => ({ type: categorizeSurface(item.url), label: item.title || "Search result", url: item.url }))
      }),
      source: { name: "xAPI Search", status: results.length ? "candidate" : "empty" }
    };
  } catch (error) {
    return {
      artifact: null,
      source: { name: "xAPI Search", status: "error", message: error.message }
    };
  }
}

function buildCandidateUrls(seed, project, existingEvidence) {
  const allowProjectSurfaceExpansion = !existingEvidence?.artifactCount;
  return unique([
    ...extractEvidenceUrls(seed?.query),
    seed?.website,
    project?.website,
    ...(allowProjectSurfaceExpansion ? project?.surfaces?.repos || [] : []).map((surface) => surface.url),
    ...(allowProjectSurfaceExpansion ? project?.surfaces?.whitepapers || [] : []).map((surface) => surface.url),
    ...(allowProjectSurfaceExpansion ? project?.surfaces?.audits || [] : []).map((surface) => surface.url),
    ...(allowProjectSurfaceExpansion ? project?.surfaces?.governance || [] : []).map((surface) => surface.url),
    ...(allowProjectSurfaceExpansion ? project?.surfaces?.profiles || [] : []).map((surface) => surface.url),
    ...(existingEvidence?.surfaces?.whitepapers || []).map((surface) => surface.url),
    ...(existingEvidence?.surfaces?.audits || []).map((surface) => surface.url),
    ...(existingEvidence?.surfaces?.governance || []).map((surface) => surface.url)
  ].map(normalizeEvidenceUrl).filter(Boolean));
}

function collectDiscoveredUrls(artifacts) {
  return unique(artifacts
    .filter((artifact) => artifact.facts?.discovery !== "linked" && artifact.facts?.discovery !== "search")
    .flatMap((artifact) => artifact.links || [])
    .filter((link) => ["repo", "whitepaper", "audit", "governance"].includes(link.type))
    .map((link) => normalizeEvidenceUrl(link.url))
    .filter(Boolean));
}

function buildSurfaces(artifacts, seed, project) {
  const surfaces = {
    websites: [],
    docs: [],
    whitepapers: [],
    repos: [],
    audits: [],
    governance: [],
    socials: []
  };

  for (const url of [seed?.website, project?.website].map(normalizeEvidenceUrl).filter(Boolean)) {
    surfaces.websites.push({ label: "Website", url });
  }

  for (const artifact of artifacts) {
    addSurface(surfaces, artifact.type, artifact.title, artifact.url);
    for (const link of artifact.links || []) {
      addSurface(surfaces, link.type, link.label, link.url);
    }
  }

  return Object.fromEntries(Object.entries(surfaces).map(([key, value]) => [key, uniqueSurfaces(value)]));
}

function addSurface(surfaces, type, label, url) {
  const normalized = normalizeEvidenceUrl(url);
  if (!normalized) return;
  const surface = { label: label || type, url: normalized };
  const bucket = {
    github_repository: "repos",
    github_profile: "repos",
    github_search: "repos",
    repo: "repos",
    docs: "docs",
    whitepaper: "whitepapers",
    audit: "audits",
    governance: "governance",
    social: "socials",
    website: "websites",
    homepage: "websites",
    web_page: "websites"
  }[type] || "websites";
  surfaces[bucket].push(surface);
}

function parseHtml(html, baseUrl) {
  const title = decodeHtml(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)) || titleFromUrl(baseUrl);
  const metaDescription = decodeHtml(
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    firstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i)
  );
  const links = extractLinks(html, baseUrl);
  const text = normalizeText([
    title,
    metaDescription,
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
  ].filter(Boolean).join(" "));
  return { title, text, links };
}

function extractLinks(html, baseUrl) {
  const links = [];
  const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRe.exec(html)) !== null) {
    const url = resolveUrl(match[1], baseUrl);
    if (!url) continue;
    const label = normalizeText(match[2].replace(/<[^>]+>/g, " ")).slice(0, 80) || categorizeSurface(url);
    const type = categorizeSurface(`${url} ${label}`, url);
    if (isRelevantSurface(type, url, label)) {
      links.push({ type, label, url });
    }
  }
  return uniqueSurfaces(links).slice(0, 24);
}

function categorizeSurface(value, urlValue = value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("github.com") && parseGitHubUrl(urlValue)) return "repo";
  if (/\b(whitepaper|white-paper|litepaper|paper|pdf)\b/.test(text)) return "whitepaper";
  if (/\b(docs|documentation|developer|devs|learn)\b/.test(text)) return "docs";
  if (/\b(audit|security|certik|trailofbits|openzeppelin|code4rena|sherlock)\b/.test(text)) return "audit";
  if (/\b(governance|forum|snapshot|vote|dao|tally)\b/.test(text)) return "governance";
  if (/\b(twitter\.com|x\.com|discord|telegram|reddit|medium\.com|mirror\.xyz)\b/.test(text)) return "social";
  return "website";
}

function isRelevantSurface(type, url, label) {
  if (["repo", "docs", "whitepaper", "audit", "governance", "social"].includes(type)) return true;
  return /\b(contract|token|address|protocol|app)\b/i.test(`${url} ${label}`);
}

function classifySurfaceType(url, title, text) {
  const type = categorizeSurface(`${url} ${title}`);
  if (type !== "website") return type;
  if (/\bwhitepaper\b/i.test(text.slice(0, 3000))) return "whitepaper";
  if (/\bdocumentation|developer docs\b/i.test(text.slice(0, 3000))) return "docs";
  return "web_page";
}

function normalizeArtifact(artifact) {
  return {
    id: `${artifact.type}-${slugify(artifact.title || artifact.url)}`,
    type: artifact.type,
    title: artifact.title || titleFromUrl(artifact.url),
    url: normalizeEvidenceUrl(artifact.url),
    status: artifact.status || "ok",
    summary: artifact.summary || "",
    excerpts: (artifact.excerpts || []).map((excerpt) => String(excerpt || "").slice(0, 420)).filter(Boolean).slice(0, 5),
    facts: artifact.facts || {},
    addresses: unique((artifact.addresses || []).map((address) => address.toLowerCase())),
    links: uniqueSurfaces(artifact.links || [])
  };
}

function summarizeGitHubRepo(repoData) {
  const parts = [
    `${repoData.full_name} GitHub repository`,
    repoData.description,
    `${repoData.stargazers_count ?? 0} stars`,
    `last pushed ${repoData.pushed_at || "unknown"}`,
    repoData.archived ? "archived" : null
  ].filter(Boolean);
  return parts.join("; ");
}

function summarizeText(text) {
  const clean = normalizeText(text);
  if (!clean) return "No readable text was extracted.";
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((item) => item.length > 30);
  return (sentences.slice(0, 2).join(" ") || clean).slice(0, 420);
}

function selectExcerpts(text, count = 4) {
  const clean = normalizeText(text).slice(0, MAX_TEXT_CHARS);
  const keywords = ["contract", "token", "treasury", "governance", "audit", "whitepaper", "github", "bridge", "security"];
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((item) => item.length > 40 && item.length < 500);
  const prioritized = sentences.filter((sentence) => keywords.some((keyword) => sentence.toLowerCase().includes(keyword)));
  return unique([...prioritized, ...sentences]).slice(0, count);
}

function normalizeSearchResults(raw) {
  const candidates = Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
      : Array.isArray(raw?.items) ? raw.items
        : [];
  return candidates
    .map((item) => ({
      title: item.title || item.name || item.label || null,
      url: normalizeEvidenceUrl(item.url || item.link || item.href),
      snippet: item.snippet || item.description || item.text || ""
    }))
    .filter((item) => item.url)
    .slice(0, 8);
}

async function githubJson(path) {
  const response = await githubRequest(path, { accept: "application/vnd.github+json" });
  return response.json();
}

async function githubText(path, { accept }) {
  const response = await githubRequest(path, { accept });
  return response.text();
}

async function githubRequest(path, { accept }) {
  const headers = {
    accept,
    "user-agent": "ChainLens/0.1"
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return fetchWithTimeout(`https://api.github.com${path}`, { headers, timeoutMs: 14000 });
}

async function fetchPlainText(url) {
  const response = await fetchWithTimeout(url, {
    timeoutMs: 14000,
    headers: {
      accept: "text/html,text/plain;q=0.9,*/*;q=0.4",
      "user-agent": "ChainLens/0.1"
    }
  });
  return response.text();
}

async function fetchRawReadme(owner, repo) {
  const branches = ["main", "master", "develop"];
  const names = ["README.md", "readme.md", "README"];
  let lastError = null;
  for (const branch of branches) {
    for (const name of names) {
      try {
        return await fetchPlainText(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${name}`);
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError || new Error("README not found");
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 12000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function unwrapRequired(result, message) {
  if (result.status === "fulfilled") return result.value;
  throw new Error(result.reason?.message || message);
}

function shouldSearchByName(seed, project, artifactsByUrl) {
  if ((seed?.addresses || []).length) return false;
  if (artifactsByUrl.size > 0) return false;
  return Boolean(meaningfulName(project?.name || seed?.name || seed?.query));
}

function meaningfulName(value) {
  const text = String(value || "").trim();
  if (!text || /^unknown project$/i.test(text) || /^project 0x/i.test(text)) return null;
  const withoutNoise = text
    .replace(ADDRESS_RE, " ")
    .replace(URL_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!withoutNoise || withoutNoise.length < 2 || withoutNoise.length > 80) return null;
  return withoutNoise;
}

function parseGitHubUrl(url) {
  const parsed = safeUrl(url);
  if (!parsed || !/(^|\.)github\.com$/i.test(parsed.hostname)) return null;
  const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
  if (!owner || [
    "about",
    "blog",
    "business",
    "customer-stories",
    "enterprise",
    "events",
    "features",
    "login",
    "marketplace",
    "mcp",
    "mobile",
    "orgs",
    "pricing",
    "readme",
    "search",
    "security",
    "sponsors",
    "topics"
  ].includes(owner.toLowerCase())) return null;
  return {
    owner,
    repo: repo && !["orgs", "users"].includes(repo.toLowerCase()) ? repo.replace(/\.git$/i, "") : null
  };
}

function isGitHubUrl(url) {
  return Boolean(parseGitHubUrl(url));
}

function isPdfUrl(url, contentType, buffer) {
  return contentType.includes("pdf") || /\.pdf(?:$|[?#])/i.test(url) || buffer.slice(0, 4).toString() === "%PDF";
}

function sourceNameForArtifact(artifact) {
  if (artifact.type === "whitepaper") return "Whitepaper Fetch";
  if (artifact.type === "docs") return "Documentation Fetch";
  if (artifact.type === "audit") return "Audit Surface Fetch";
  return "Project Surface Fetch";
}

function normalizeEvidenceUrl(value) {
  const raw = String(value || "").trim().replace(/[).,;]+$/g, "");
  if (!raw || raw.startsWith("mailto:") || raw.startsWith("javascript:")) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function resolveUrl(value, baseUrl) {
  try {
    return normalizeEvidenceUrl(new URL(value, baseUrl).toString());
  } catch {
    return normalizeEvidenceUrl(value);
  }
}

function safeUrl(value) {
  try {
    return new URL(normalizeEvidenceUrl(value));
  } catch {
    return null;
  }
}

function extractAddresses(value) {
  return unique((String(value || "").match(ADDRESS_RE) || [])
    .map((address) => address.toLowerCase())
    .filter((address) => !isBurnAddress(address)));
}

function markDiscovery(artifact, discovery) {
  return {
    ...artifact,
    facts: {
      ...(artifact.facts || {}),
      discovery
    }
  };
}

function shouldPromoteArtifactAddresses(artifact) {
  if (!artifact?.addresses?.length) return false;
  if (artifact.facts?.discovery === "direct") return true;
  return ["whitepaper", "github_repository"].includes(artifact.type);
}

function firstMatch(value, pattern) {
  return String(value || "").match(pattern)?.[1] || "";
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/)[0].trim();
}

function normalizeText(value) {
  return decodeHtml(String(value || ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function titleFromUrl(url) {
  const parsed = safeUrl(url);
  if (!parsed) return "Project surface";
  const last = parsed.pathname.split("/").filter(Boolean).pop();
  return decodeURIComponent(last || parsed.hostname.replace(/^www\./, ""));
}

function slugify(value) {
  return String(value || "artifact").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "artifact";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueSurfaces(surfaces) {
  const seen = new Set();
  return surfaces.filter((surface) => {
    const url = normalizeEvidenceUrl(surface?.url);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    surface.url = url;
    return true;
  });
}

function dedupeSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source.name}:${source.url || ""}:${source.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
