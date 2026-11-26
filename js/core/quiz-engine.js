// Quiz engine: choices, energy gain, session with streaks.
export const LOCK_MS = 1000;
const CHOICE_COUNT = 4;
const MIN_POOL = 8;

export function energyGain(streak) {
  const mult = streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
  return Math.ceil(2 * mult);
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isNumeric = (s) => /^-?\d+$/.test(String(s));

export function buildChoices(item, pool = [], rng = Math.random) {
  const answer = String(item.answer);
  const wrong = [];
  const seen = new Set([answer]);
  const take = (v) => {
    const s = String(v);
    if (!seen.has(s) && wrong.length < CHOICE_COUNT - 1) { seen.add(s); wrong.push(s); }
  };
  if (Array.isArray(item.distractors)) shuffle(item.distractors, rng).forEach(take);
  if (wrong.length < CHOICE_COUNT - 1 && isNumeric(answer)) {
    const n = Number(answer);
    const offsets = [];
    for (let d = 1; d <= 10; d++) offsets.push(d, -d);
    const near = shuffle(offsets.filter((d) => Math.abs(d) <= 3), rng);
    const far = shuffle(offsets.filter((d) => Math.abs(d) > 3), rng);
    for (const d of [...near, ...far]) {
      if (n >= 0 && n + d < 0) continue;
      take(String(n + d));
    }
  }
  if (wrong.length < CHOICE_COUNT - 1) shuffle(pool, rng).forEach(take);
  const choices = shuffle([answer, ...wrong], rng);
  return { choices, correctIndex: choices.indexOf(answer) };
}

function memoryStats() {
  const m = new Map();
  return {
    get: (k) => ({ ...(m.get(k) || { wrong: 0, right: 0 }) }),
    record(k, correct) {
      const v = m.get(k) || { wrong: 0, right: 0 };
      if (correct) { v.right++; v.wrong = Math.max(0, v.wrong - 1); } else v.wrong = Math.min(6, v.wrong + 1);
      m.set(k, v);
    },
    weakItems: () => [],
  };
}

export function createQuizSession({ items, units, rng = Math.random, gainMultiplier = 1, stats, kind = 'equation', speak = null, prompt = null }) {
  stats = stats || memoryStats();
  let source = items;
  if (Array.isArray(units) && units.length) {
    const set = new Set(units.map(String));
    const filtered = items.filter((it) => set.has(String(it.unit)));
    if (filtered.length) source = filtered;
  }
  const pool = [...new Set(source.map((it) => String(it.answer)))];
  if (pool.length < MIN_POOL) { // 단원이 작으면 세트 전체 정답에서 보기 후보를 보충한다
    const have = new Set(pool);
    for (const it of items) { const a = String(it.answer); if (!have.has(a)) { have.add(a); pool.push(a); } }
  }
  const keyOf = (it) => `${it.unit}|${it.q}`;
  const recent = [];
  const avoid = source.length >= 4 ? 2 : 1;
  let current = null;
  const session = {
    streak: 0,
    wrongStreak: 0,
    next() {
      let cands = source.filter((it) => !recent.includes(it));
      if (!cands.length) cands = source; // single item: repeat unavoidable
      const weights = cands.map((it) => 1 + 3 * (stats.get(keyOf(it)).wrong || 0));
      let r = rng() * weights.reduce((a, b) => a + b, 0);
      let item = cands[cands.length - 1];
      for (let i = 0; i < cands.length; i++) { r -= weights[i]; if (r < 0) { item = cands[i]; break; } }
      recent.push(item);
      if (recent.length > avoid) recent.shift();
      const { choices, correctIndex } = buildChoices(item, pool, rng);
      let removedIndex = null;
      if (session.wrongStreak >= 2 && choices.length > 2) {
        const others = choices.map((_, i) => i).filter((i) => i !== correctIndex);
        removedIndex = others[Math.floor(rng() * others.length)];
      }
      current = { correctIndex, answered: false, key: keyOf(item) };
      // 그림 문제(kind 'figure'): q는 통계용 내부 키이므로 화면에는 figure(그림)와 prompt(안내 글)를 쓴다
      return { q: item.q, choices, correctIndex, removedIndex, kind, speak, figure: item.figure || null, prompt: item.prompt || prompt || null };
    },
    answer(choiceIndex) {
      if (!current || current.answered) {
        return { correct: false, gain: 0, streak: session.streak, correctIndex: current ? current.correctIndex : -1, lockMs: 0 };
      }
      current.answered = true;
      const correct = choiceIndex === current.correctIndex;
      try { stats.record(current.key, correct); } catch { /* ignore */ }
      if (correct) {
        session.streak++;
        session.wrongStreak = 0;
        return { correct, gain: energyGain(session.streak) * gainMultiplier, streak: session.streak, correctIndex: current.correctIndex, lockMs: 0 };
      }
      session.streak = 0;
      session.wrongStreak++;
      return { correct, gain: 0, streak: 0, correctIndex: current.correctIndex, lockMs: LOCK_MS };
    },
  };
  return session;
}
