// Pure helpers for the end-of-game review overlay and the ctx.choose modal.

// Text for the review banner. With no opts it equals the original 3D 탑쌓기 wording.
export function reviewText(score, best, opts = {}) {
  const o = opts || {};
  const lines = Array.isArray(o.lines) ? o.lines.filter((l) => l != null && String(l) !== '').map(String) : [];
  return {
    heading: typeof o.heading === 'string' && o.heading ? o.heading : '게임 종료',
    score: (typeof o.label === 'string' ? o.label : '쌓은') + ' ' + score + (o.unit || ''),
    best: '최고 기록 ' + best,
    lines,
  };
}

// Normalise ctx.choose options: drop entries without id, stringify fields. Returns null if nothing to choose.
export function normalizeChoose(cfg) {
  const c = cfg || {};
  const options = (Array.isArray(c.options) ? c.options : [])
    .filter((o) => o && o.id != null)
    .map((o) => ({ id: String(o.id), label: String(o.label ?? o.id), desc: o.desc ? String(o.desc) : '', emoji: o.emoji ? String(o.emoji) : '' }));
  if (!options.length) return null;
  return { title: String(c.title ?? ''), subtitle: c.subtitle ? String(c.subtitle) : '', options };
}

// Sequential queue: only one job runs at a time; each job returns a promise.
export function createSerialQueue() {
  let tail = Promise.resolve();
  return (job) => {
    const p = tail.then(job, job);
    tail = p.catch(() => {});
    return p;
  };
}
