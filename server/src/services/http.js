const queue = [];
let active = false;

export function enqueueRequest(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    drainQueue();
  });
}

function drainQueue() {
  if (active) return;
  const next = queue.shift();
  if (!next) return;

  active = true;
  Promise.resolve()
    .then(next.task)
    .then(next.resolve, next.reject)
    .finally(() => {
      setTimeout(() => {
        active = false;
        drainQueue();
      }, 1100);
    });
}

export async function fetchJson(url, options = {}) {
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 12000;
  const method = options.method ?? "GET";
  const body = options.body;
  const extraHeaders = options.headers || {};

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          "user-agent": "ChainLens/0.1",
          ...extraHeaders
        },
        body,
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timer);
      if (attempt === retries) throw error;
      await sleep(400 * 2 ** attempt);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
