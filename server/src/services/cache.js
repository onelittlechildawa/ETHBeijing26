const store = new Map();

export function getCache(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function setCache(key, value, ttlMs) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

export async function cached(key, ttlMs, factory) {
  const hit = getCache(key);
  if (hit) return { value: hit, cache: "hit" };
  const value = await factory();
  setCache(key, value, ttlMs);
  return { value, cache: "miss" };
}

