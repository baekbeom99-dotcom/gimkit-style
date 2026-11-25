import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, ALLOWED, figureParts, figureSvg, renderFigure, variantCount } from '../js/ui/fraction-figure.js';

const area = (pts) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
};
const TABLE = { circle: '2..12', square: '2,3,4,5,6,8,9,10,12', triangle: '2,3,4,6,9', pentagon: '5,10', hexagon: '2,3,6,12', octagon: '2,4,8' };

// 전체 넓이(이론값): 같은 변수로 나눈 조각들의 합이 한 도형이어야 한다.
const combos = [];
for (const shape of SHAPES) for (const n of ALLOWED[shape]) for (let v = 0; v < variantCount(shape, n) + 2; v++) combos.push([shape, n, v]);

test('allowed denominators table', () => {
  assert.deepEqual(ALLOWED.circle, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (const s of SHAPES.slice(1)) assert.equal(ALLOWED[s].join(','), TABLE[s]);
  assert.throws(() => figureParts({ shape: 'hexagon', n: 5, shaded: [] }));
  assert.throws(() => figureParts({ shape: 'blob', n: 2, shaded: [] }));
});

test('every division has n equal-area parts', () => {
  for (const [shape, n, v] of combos) {
    const parts = figureParts({ shape, n, shaded: [], variant: v });
    assert.equal(parts.length, n, `${shape} ${n}`);
    const a = parts.map((p) => area(p.points));
    const avg = a.reduce((x, y) => x + y, 0) / n;
    for (const x of a) assert.ok(Math.abs(x - avg) / avg < 0.01, `${shape} n=${n} v=${v}: ${a.join(',')}`);
  }
});

test('parts tile the whole shape (total area constant over n and variant)', () => {
  const total = {};
  for (const [shape, n, v] of combos) {
    const sum = figureParts({ shape, n, shaded: [], variant: v }).reduce((s, p) => s + area(p.points), 0);
    total[shape] ??= sum;
    assert.ok(Math.abs(sum - total[shape]) / total[shape] < 0.01, `${shape} n=${n} v=${v}`);
  }
  assert.ok(Math.abs(total.circle - Math.PI * 44 * 44) / total.circle < 0.01);
  assert.ok(Math.abs(total.square - 6400) < 1);
});

test('svg string: n parts, m shaded, well-formed', () => {
  for (const [shape, n, v] of combos) {
    const shaded = [0, n - 1].filter((x, i, arr) => arr.indexOf(x) === i);
    const svg = figureSvg({ shape, n, shaded, variant: v }, { size: 140 });
    assert.equal((svg.match(/class="fp[ "]/g) || []).length, n);
    assert.equal((svg.match(/fill="#ff9f43"/g) || []).length, shaded.length);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 100 100"[^>]*width="140"/);
    assert.ok(svg.endsWith('</svg>'));
    assert.equal((svg.match(/<svg/g) || []).length, 1);
    assert.ok(!svg.includes('NaN') && !svg.includes('undefined'));
    // 태그 균형 확인
    const open = (svg.match(/<(g)[ >]/g) || []).length, close = (svg.match(/<\/g>/g) || []).length;
    assert.equal(open, close);
  }
});

test('invalid shaded indexes are ignored', () => {
  const svg = figureSvg({ shape: 'square', n: 4, shaded: [-1, 1, 9, 1.5] });
  assert.equal((svg.match(/fill="#ff9f43"/g) || []).length, 1);
});

test('renderFigure sets innerHTML', () => {
  const el = { innerHTML: '' };
  assert.equal(renderFigure(el, { shape: 'circle', n: 3, shaded: [1] }), el);
  assert.match(el.innerHTML, /<svg/);
});
