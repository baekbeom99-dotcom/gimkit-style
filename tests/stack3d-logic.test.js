import test from 'node:test';
import assert from 'node:assert/strict';
import {
  place, speedFor, axisFor, hueFor, triangle, offsetAt, movingAt, createBase, periodFor, sideFor,
  SLAB_H, BASE_SIZE, AMPLITUDE, SPEED_CAP,
} from '../js/games/stack3d/logic.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const prev = { cx: 10, cz: -20, w: 100, d: 80 };

test('constants', () => { assert.equal(SLAB_H, 28); assert.equal(BASE_SIZE, 200); assert.deepEqual(createBase(), { cx: 0, cz: 0, w: 200, d: 200 }); });

test('perfect within tolerance snaps onto prev centre and keeps size', () => {
  for (const off of [0, 3.9, -4, 4]) {
    const r = place(prev, { ...prev, cx: prev.cx + off }, 'x', 0);
    assert.equal(r.kind, 'perfect');
    assert.deepEqual(r.slab, { cx: 10, cz: -20, w: 100, d: 80 });
    assert.equal(r.debris, null);
    assert.equal(r.combo, 1);
  }
  const rz = place(prev, { ...prev, cz: prev.cz - 3 }, 'z', 2);
  assert.equal(rz.kind, 'perfect'); assert.equal(rz.combo, 3);
  assert.deepEqual(rz.slab, { cx: 10, cz: -20, w: 100, d: 80 });
});

test('cut on x axis, positive offset', () => {
  const r = place(prev, { ...prev, cx: prev.cx + 30 }, 'x', 5);
  assert.equal(r.kind, 'cut');
  assert.equal(r.combo, 0);
  near(r.slab.w, 70); near(r.slab.cx, 10 + 15); assert.equal(r.slab.d, 80); assert.equal(r.slab.cz, -20);
  // debris: overhang on + side, from prev right edge (60) to moving right edge (90)
  near(r.debris.w, 30); near(r.debris.cx, 75); assert.equal(r.debris.d, 80);
});

test('cut on x axis, negative offset', () => {
  const r = place(prev, { ...prev, cx: prev.cx - 30 }, 'x', 0);
  near(r.slab.w, 70); near(r.slab.cx, 10 - 15);
  near(r.debris.w, 30); near(r.debris.cx, 10 - 65);
});

test('cut on z axis both directions', () => {
  const a = place(prev, { ...prev, cz: prev.cz + 25 }, 'z', 0);
  near(a.slab.d, 55); near(a.slab.cz, -20 + 12.5); assert.equal(a.slab.w, 100);
  near(a.debris.d, 25); near(a.debris.cz, -20 + 40 + 12.5);
  const b = place(prev, { ...prev, cz: prev.cz - 25 }, 'z', 0);
  near(b.slab.d, 55); near(b.slab.cz, -20 - 12.5);
  near(b.debris.d, 25); near(b.debris.cz, -20 - 40 - 12.5);
  // slab + debris tile the moving block exactly
  near(a.slab.d + a.debris.d, 80);
});

test('miss when no overlap (edge touching counts as miss)', () => {
  const r = place(prev, { ...prev, cx: prev.cx + 100 }, 'x', 4);
  assert.equal(r.kind, 'miss'); assert.equal(r.slab, null); assert.equal(r.combo, 0);
  assert.deepEqual(r.debris, { cx: 110, cz: -20, w: 100, d: 80 });
  assert.equal(place(prev, { ...prev, cx: prev.cx - 250 }, 'x', 0).kind, 'miss');
  assert.equal(place(prev, { ...prev, cz: prev.cz + 80 }, 'z', 0).kind, 'miss');
  assert.equal(place(prev, { ...prev, cx: prev.cx + 99.9 }, 'x', 0).kind, 'cut');
});

test('combo regrows only once combo >= 3, +6 on both axes, capped at 200', () => {
  const p = { cx: 0, cz: 0, w: 150, d: 150 };
  for (const c of [0, 1, 2]) {
    const r = place(p, { ...p }, 'x', c);
    assert.equal(r.slab.w, 150); assert.equal(r.slab.d, 150); assert.equal(r.combo, c + 1);
  }
  const r3 = place(p, { ...p }, 'x', 3);
  assert.equal(r3.slab.w, 156); assert.equal(r3.slab.d, 156); assert.equal(r3.combo, 4);
  const big = { cx: 0, cz: 0, w: 198, d: 200 };
  const rc = place(big, { ...big }, 'z', 9);
  assert.equal(rc.slab.w, 200); assert.equal(rc.slab.d, 200);
  // a cut never regrows and resets combo
  const cut = place(p, { ...p, cx: 20 }, 'x', 7);
  assert.equal(cut.combo, 0); assert.equal(cut.slab.w, 130);
});

test('speed curve: 140 + 6*layer, capped at 420', () => {
  assert.equal(speedFor(0), 140); assert.equal(speedFor(1), 146); assert.equal(speedFor(10), 200);
  assert.equal(speedFor(46), 416); assert.equal(speedFor(47), 420); assert.equal(speedFor(500), SPEED_CAP);
});

test('axis alternates x, z, x, z', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(axisFor), ['x', 'z', 'x', 'z', 'x']);
});

test('hue formula (base + 12*layer) % 360', () => {
  assert.equal(hueFor(200, 0), 200); assert.equal(hueFor(200, 1), 212); assert.equal(hueFor(200, 14), 8);
  assert.equal(hueFor(0, 30), 0); assert.equal(hueFor(10, 31), 22);
});

test('triangle wave: amplitude and period', () => {
  const A = AMPLITUDE;
  near(triangle(0), -A); near(triangle(A), 0); near(triangle(2 * A), A); near(triangle(3 * A), 0); near(triangle(4 * A), -A);
  for (let s = 0; s < 3000; s += 37) { const v = triangle(s); assert.ok(v >= -A - 1e-9 && v <= A + 1e-9); near(triangle(s + 4 * A), v, 1e-6); }
  near(periodFor(0), 4 * A / 140);
  // time-based: after half a period the block is at the far end
  near(Math.abs(offsetAt(3, periodFor(3) / 2)), A, 1e-6);
});

test('start side alternates per layer', () => {
  assert.notEqual(sideFor(1), sideFor(2));
  assert.equal(Math.sign(offsetAt(1, 0)), -Math.sign(offsetAt(2, 0)));
});

test('movingAt inherits size/centre and offsets along the axis only', () => {
  const m = movingAt(prev, 1, periodFor(1) / 4); // quarter period: at centre
  assert.equal(m.axis, 'x'); near(m.slab.cx, prev.cx, 1e-6); assert.equal(m.slab.cz, prev.cz);
  assert.equal(m.slab.w, 100); assert.equal(m.slab.d, 80);
  const z = movingAt(prev, 2, 0);
  assert.equal(z.axis, 'z'); assert.equal(z.slab.cx, prev.cx); near(Math.abs(z.slab.cz - prev.cz), AMPLITUDE);
});

test('floors counting: each successful placement adds one, miss does not', () => {
  let slab = createBase(); let floors = 0; let layer = 1; let combo = 0;
  const seq = [0, 20, 500, 0, -10];
  for (const off of seq) {
    const axis = axisFor(layer);
    const m = { ...slab }; if (axis === 'x') m.cx += off; else m.cz += off;
    const r = place(slab, m, axis, combo);
    combo = r.combo;
    if (r.slab) { slab = r.slab; floors++; layer++; }
  }
  assert.equal(floors, 4);
});

import { sparkleAt, sparkleCount, sparkleDuration, sparkleDone } from '../js/games/stack3d/logic.js';

test('sparkle: deterministic per layer, stars inside the top face', () => {
  const a = sparkleAt(5, 0.2, false), b = sparkleAt(5, 0.2, false);
  assert.deepEqual(a, b);
  assert.notDeepEqual(sparkleAt(6, 0.2, false).stars, a.stars);
  for (let L = 0; L < 20; L++) for (const t of [0.05, 0.15, 0.3, 0.45]) {
    for (const s of sparkleAt(L, t, L % 2 === 0).stars) {
      assert.ok(s.u >= 0.1 && s.u <= 0.9 && s.v >= 0.1 && s.v <= 0.9);
      assert.ok(s.scale >= 0 && s.alpha >= 0 && s.alpha <= 1);
    }
  }
});

test('sparkle: star counts 4-6 normal, none for perfect (no star effect on perfect)', () => {
  for (let L = 0; L < 9; L++) {
    assert.ok(sparkleCount(L, false) >= 4 && sparkleCount(L, false) <= 6);
    assert.equal(sparkleCount(L, true), 0);
  }
});

test('sparkle: ends after its duration, sweep runs 0..1 then null', () => {
  const dn = sparkleDuration(false), dp = sparkleDuration(true);
  assert.ok(dn >= 0.5 && dn <= 0.75); assert.ok(dp > dn);
  for (const [perfect, d] of [[false, dn], [true, dp]]) {
    const e = sparkleAt(3, d + 0.01, perfect);
    assert.equal(e.sweep, null); assert.equal(e.stars.length, 0); assert.ok(sparkleDone(d, perfect));
    assert.ok(!sparkleDone(d - 0.05, perfect));
  }
  assert.equal(sparkleAt(3, 0, false).sweep, 0);
  assert.ok(sparkleAt(3, 0.25, false).sweep > 0.4 && sparkleAt(3, 0.25, false).sweep < 0.6);
  assert.equal(sparkleAt(3, 0.55, false).sweep, null);
  assert.notEqual(sparkleAt(3, 0.55, true).sweep, null);
});

test('sparkle: perfect shows no stars at any time (only the shine sweep), normal still does', () => {
  let normalStars = 0;
  for (let L = 0; L < 12; L++) for (let t = 0; t < 1; t += 0.01) {
    assert.equal(sparkleAt(L, t, true).stars.length, 0, `perfect layer ${L} t ${t}`);
    normalStars = Math.max(normalStars, sparkleAt(L, t, false).stars.length);
  }
  assert.ok(normalStars > 0);
  assert.notEqual(sparkleAt(4, 0.3, true).sweep, null); // 빛줄기는 남아 있음
});

import { fitView, project, PLAY_K, REVIEW_K_MIN } from '../js/games/stack3d/logic.js';

function projectedBox(slabs, v) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  slabs.forEach((s, i) => {
    for (const x of [s.cx - s.w / 2, s.cx + s.w / 2]) for (const z of [s.cz - s.d / 2, s.cz + s.d / 2]) for (const y of [i * SLAB_H, (i + 1) * SLAB_H]) {
      const p = project(x, z, y, v.k, { x: 0, z: 0, y: 0 }, v.ox, v.oy);
      minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx); minY = Math.min(minY, p.sy); maxY = Math.max(maxY, p.sy);
    }
  });
  return { minX, maxX, minY, maxY };
}
const tower = (n, w = 200, shift = 0) => Array.from({ length: n }, (_, i) => ({ cx: shift * i, cz: -shift * i * 0.5, w: Math.max(30, w - i), d: Math.max(30, w - i) }));

test('fitView: tower fits inside the padded rect for several shapes', () => {
  const W = 360, H = 812, pad = { top: 120, bottom: 130, side: 24 };
  for (const slabs of [tower(12), tower(40), tower(80, 200, 2), tower(150, 120, -3), tower(8, 60, 5)]) {
    const v = fitView(slabs, W, H, pad);
    const b = projectedBox(slabs, v);
    if (v.k > REVIEW_K_MIN + 1e-9) {
      assert.ok(b.minX >= pad.side - 1e-6 && b.maxX <= W - pad.side + 1e-6, 'x');
      assert.ok(b.minY >= pad.top - 1e-6 && b.maxY <= H - pad.bottom + 1e-6, 'y');
    }
    assert.ok(v.k <= PLAY_K && v.k >= REVIEW_K_MIN);
  }
});

test('fitView: taller towers get smaller k; 1-layer and 0-layer return the play scale', () => {
  const W = 360, H = 640, pad = { top: 120, bottom: 130, side: 24 };
  const k = (n) => fitView(tower(n), W, H, pad).k;
  assert.ok(k(60) < k(20)); assert.ok(k(20) < k(5) + 1e-9);
  assert.equal(fitView([createBase()], W, H, pad).k, PLAY_K);
  assert.equal(fitView([], W, H, pad).k, PLAY_K);
  assert.equal(fitView(tower(5000), W, H, pad).k, REVIEW_K_MIN);
});
