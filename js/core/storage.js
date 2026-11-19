// High scores in localStorage; all access guarded (private mode etc.).
const key = (id) => `gimkit-energy:best:${id}`;

export function getBest(gameId) {
  try {
    const n = Number(globalThis.localStorage.getItem(key(gameId)));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function recordScore(gameId, score) {
  const prev = getBest(gameId);
  const isNewRecord = score > prev;
  const best = isNewRecord ? score : prev;
  if (isNewRecord) {
    try { globalThis.localStorage.setItem(key(gameId), String(score)); } catch { /* ignore */ }
  }
  return { best, isNewRecord };
}

// Per-item right/wrong stats, persisted per question set; never throws.
const statsKey = (id) => `gimkit-energy:stats:${id}`;
const MAX_WRONG = 6;

export function createItemStats(setId) {
  let data = {};
  try {
    const raw = globalThis.localStorage.getItem(statsKey(setId));
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch { /* in-memory fallback */ }
  const read = (k) => {
    const v = data[k];
    return { wrong: Number(v && v.wrong) || 0, right: Number(v && v.right) || 0 };
  };
  return {
    get: (k) => read(k),
    record(k, correct) {
      const v = read(k);
      if (correct) { v.right += 1; v.wrong = Math.max(0, v.wrong - 1); }
      else v.wrong = Math.min(MAX_WRONG, v.wrong + 1);
      data[k] = v;
      try { globalThis.localStorage.setItem(statsKey(setId), JSON.stringify(data)); } catch { /* ignore */ }
    },
    weakItems(n = 5) {
      return Object.keys(data)
        .map((key) => ({ key, ...read(key) }))
        .filter((e) => e.wrong > 0)
        .sort((a, b) => b.wrong - a.wrong || a.right - b.right)
        .slice(0, n);
    },
  };
}
