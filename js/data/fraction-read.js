// 분수 읽기 문제 생성기. 그림(figure)을 보고 "n분의 m" 읽기를 고른다.
// opts.units: 도형 id 배열(비거나 유효하지 않으면 전체), opts.rng: () => [0,1) (테스트용)

import { ALLOWED, variantCount } from '../ui/fraction-figure.js';

export const FRACTION_READ_INFO = { id: 'fraction-read', title: '분수 읽기', subject: '수학', grade: '3' };

export const FRACTION_UNITS = [
  { id: 'circle', title: '원' },
  { id: 'square', title: '네모' },
  { id: 'triangle', title: '삼각형' },
  { id: 'pentagon', title: '오각형' },
  { id: 'hexagon', title: '육각형' },
  { id: 'octagon', title: '팔각형' },
];

const CAP = 80;
const PROMPT = '색칠한 부분은 전체의 얼마일까요?';
const RADIAL = new Set(['circle', 'pentagon', 'hexagon', 'octagon']);

export const reading = (n, m) => `${n}분의 ${m}`;

const ri = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shadedFor(shape, n, m, variant, rng) {
  const idx = [];
  if (shape === 'square' && n >= 4 && m >= 2 && m <= n - 2 && rng() < 0.2) {
    return shuffle([...Array(n).keys()], rng).slice(0, m).sort((a, b) => a - b); // 떨어진 칸
  }
  const wrap = RADIAL.has(shape) || (shape === 'triangle' && n !== 9 && n !== 4);
  const start = wrap ? ri(rng, 0, n - 1) : ri(rng, 0, n - m);
  for (let i = 0; i < m; i++) idx.push((start + i) % n);
  return idx.sort((a, b) => a - b);
}

export function fractionDistractors(n, m, rng) {
  const answer = reading(n, m);
  const ok = (a, b) => a >= 2 && b >= 1 && reading(a, b) !== answer;
  const groups = [
    [[m, n]],                                              // 분자/분모 바꾸기
    shuffle([[n, m - 1], [n, m + 1]], rng),                // 같은 분모, 분자 ±1
    shuffle([[n - 1, m], [n + 1, m]], rng),                // 같은 분자, 분모 ±1
    [[n, n - m]],                                          // 색칠하지 않은 부분
  ].map((g) => g.filter(([a, b]) => ok(a, b) && (b <= a - 1 || (a === m && b === n))));
  const out = [];
  const seen = new Set([answer]);
  const take = (a, b) => {
    const s = reading(a, b);
    if (out.length < 3 && ok(a, b) && !seen.has(s)) { seen.add(s); out.push(s); return true; }
    return false;
  };
  const order = shuffle(groups, rng);
  for (const g of order) { for (const [a, b] of g) if (take(a, b)) break; }
  // 부족하면 같은 그룹 나머지, 그래도 부족하면 가까운 값으로 채운다.
  for (const g of order) for (const [a, b] of g) take(a, b);
  for (let d = 1; out.length < 3 && d < 30; d++) {
    for (const [a, b] of [[n, m + d], [n + d, m], [n - d, m], [n, m - d], [n + d, m + d]]) take(a, b);
  }
  return out;
}

function itemsFor(shape, rng) {
  const all = [];
  for (const n of ALLOWED[shape]) for (let m = 1; m < n; m++) all.push([n, m]);
  const picked = all.length <= CAP ? all : shuffle(all, rng).slice(0, CAP);
  return picked.map(([n, m]) => {
    const variant = ri(rng, 0, variantCount(shape, n) - 1);
    const shaded = shadedFor(shape, n, m, variant, rng);
    return {
      unit: shape,
      q: `${shape}|${n}|${m}`, // 안정적인 내부 id(오답 통계 키). 화면에 보이지 않는다.
      prompt: PROMPT,
      figure: { shape, n, shaded, variant },
      answer: reading(n, m),
      distractors: fractionDistractors(n, m, rng),
    };
  });
}

export function generateFractionRead(opts = {}) {
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const want = new Set((Array.isArray(opts.units) ? opts.units : []).map(String));
  let selected = FRACTION_UNITS.filter((u) => want.has(u.id));
  if (selected.length === 0) selected = FRACTION_UNITS;
  const items = [];
  for (const u of selected) items.push(...shuffle(itemsFor(u.id, rng), rng));
  return { ...FRACTION_READ_INFO, kind: 'figure', units: selected.map((u) => ({ ...u })), items };
}
