// 덧셈/뺄셈 문제 생성기. 출력은 QuestionSet 형식과 같다.
// opts.units: 단원 id 배열(비어 있거나 유효한 값이 없으면 전체), opts.rng: () => [0,1) (테스트용)

const SAMPLE = 150;
const MINUS = '−';

const DEFS = {
  add: {
    title: '덧셈',
    op: '+',
    units: [
      { id: 'a11', title: '1자리+1자리' },
      { id: 'a21', title: '2자리+1자리' },
      { id: 'a22', title: '2자리+2자리' },
    ],
  },
  sub: {
    title: '뺄셈',
    op: MINUS,
    units: [
      { id: 's11', title: `1자리${MINUS}1자리` },
      { id: 's21', title: `2자리${MINUS}1자리` },
      { id: 's22', title: `2자리${MINUS}2자리` },
    ],
  },
};

export const ADDSUB_INFO = [
  { id: 'add', title: '덧셈', subject: '수학', grade: '1~2' },
  { id: 'sub', title: '뺄셈', subject: '수학', grade: '1~2' },
];

const ri = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function distractors(answer, rng) {
  const pool = [];
  const push = (v) => { if (Number.isInteger(v) && v >= 0 && v !== answer && !pool.includes(v)) pool.push(v); };
  // 가까운 오답을 우선하되 순서는 섞는다.
  const near = shuffle([answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10], rng);
  near.forEach(push);
  if (answer >= 10) {
    const s = String(answer);
    push(Number(s.split('').reverse().join('')));
  }
  for (let d = 3; pool.length < 3 && d < 200; d++) { push(answer + d); push(answer - d); }
  return pool.slice(0, 3).map(String);
}

function makeItem(unit, a, b, op, rng) {
  const answer = op === '+' ? a + b : a - b;
  return { unit, q: `${a} ${op} ${b}`, answer: String(answer), distractors: distractors(answer, rng) };
}

// 후보 쌍 전체에서 중복 없이 n개 뽑기
function sample(pairs, n, rng) {
  return pairs.length <= n ? pairs : shuffle(pairs, rng).slice(0, n);
}

function allPairs(aLo, aHi, bLo, bHi, ok = () => true) {
  const out = [];
  for (let a = aLo; a <= aHi; a++) for (let b = bLo; b <= bHi; b++) if (ok(a, b)) out.push([a, b]);
  return out;
}

// 이어 올림/받아내림 여부로 나눠 절반씩 뽑는다.
function mixed(pairs, isHard, n, rng) {
  const hard = pairs.filter(([a, b]) => isHard(a, b));
  const easy = pairs.filter(([a, b]) => !isHard(a, b));
  const h = Math.min(hard.length, Math.ceil(n / 2));
  const e = Math.min(easy.length, n - h);
  const h2 = Math.min(hard.length, n - e);
  return shuffle([...sample(hard, h2, rng), ...sample(easy, e, rng)], rng);
}

function pairsFor(unit, rng) {
  const carry = (a, b) => (a % 10) + (b % 10) >= 10;
  const borrow = (a, b) => (a % 10) < (b % 10);
  switch (unit) {
    case 'a11': return allPairs(1, 9, 1, 9);
    case 'a21': return mixed(allPairs(10, 99, 1, 9), carry, SAMPLE, rng);
    case 'a22': {
      // 합이 100 이상인 문제도 충분히 섞이도록 올림 쪽에서 많이 뽑힌다.
      const all = allPairs(10, 99, 10, 99);
      return mixed(all, carry, SAMPLE, rng);
    }
    case 's11': return allPairs(1, 9, 1, 9, (a, b) => a >= b);
    case 's21': return mixed(allPairs(10, 99, 1, 9), borrow, SAMPLE, rng);
    case 's22': return mixed(allPairs(10, 99, 10, 99, (a, b) => a > b), borrow, SAMPLE, rng);
    default: return [];
  }
}

export function generateAddSub(id, opts = {}) {
  const def = DEFS[id];
  if (!def) throw new Error(`unknown addsub set: ${id}`);
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const want = new Set((Array.isArray(opts.units) ? opts.units : []).map(String));
  let selected = def.units.filter((u) => want.has(u.id));
  if (selected.length === 0) selected = def.units;

  const items = [];
  for (const u of selected) {
    for (const [a, b] of pairsFor(u.id, rng)) items.push(makeItem(u.id, a, b, def.op, rng));
  }
  return {
    id,
    title: def.title,
    subject: '수학',
    grade: '1~2',
    units: selected.map((u) => ({ ...u })),
    items,
  };
}
