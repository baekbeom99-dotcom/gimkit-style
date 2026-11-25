import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createWorld } from '../js/games/tower2d/world.js';

const Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');
const NO = { left: false, right: false, down: false };

function sim(w, sec, input = NO) { for (let i = 0; i < Math.round(sec * 60); i++) w.step(1 / 60, input); }

test('(a) six aligned O bricks on the platform stay put for 6 s', () => {
  const lost = [];
  const w = createWorld(Matter, { onLost: (b) => lost.push(b) });
  const xs = [180 - 48.5, 180, 180 + 48.5];
  const bs = [];
  for (const x of xs) bs.push(w.place('O', x, -23.5));
  for (const x of xs) bs.push(w.place('O', x, -70.6));
  const start = bs.map((b) => ({ x: b.body.position.x, y: b.body.position.y }));
  sim(w, 6);
  assert.equal(lost.length, 0);
  assert.equal(w.bricks.length, 6);
  bs.forEach((b, i) => {
    assert.ok(Math.abs(b.body.position.x - start[i].x) < 2, 'dx ' + i);
    assert.ok(Math.abs(b.body.position.y - start[i].y) < 2, 'dy ' + i);
    // 홈 때문에 가운데/양쪽 O는 좁은 솟은 면 위에 얹혀 아주 살짝(약 1°) 기운다
    assert.ok(Math.abs(b.body.angle) < 0.04, 'angle ' + i);
    assert.equal(b.state, 'settled');
  });
  assert.ok(Math.abs(w.heightPx() - 94) < 2, 'height ' + w.heightPx());
});

test('(a2) a single column of six O bricks stays standing', () => {
  const w = createWorld(Matter);
  const bs = [];
  for (let i = 0; i < 6; i++) bs.push(w.place('O', 180, -23.5 - i * 47.2));
  sim(w, 6);
  assert.equal(w.bricks.length, 6);
  // 가운데 솟은 면(26px) 위의 기둥이라 조금 기울어도(약 1°) 서 있어야 한다
  for (const b of bs) assert.ok(Math.abs(b.body.position.x - 180) < 9 && Math.abs(b.body.angle) < 0.04);
  assert.ok(Math.abs(w.heightPx() - 282) < 3, 'height ' + w.heightPx());
});

test('(b) a controlled T brick dropped on the centre settles stably', () => {
  const settled = [];
  const contacts = [];
  const w = createWorld(Matter, { onSettled: (b) => settled.push(b), onContact: (b, o, ctl) => contacts.push(ctl) });
  const t = w.spawn('T', null, { x: 180, y: -200 });
  assert.equal(w.controlled, t);
  sim(w, 6, { left: false, right: false, down: true });
  assert.equal(contacts[0], true);
  assert.equal(settled.length, 1);
  assert.equal(t.state, 'settled');
  assert.ok(Math.abs(t.body.angle) < 0.02, 'angle ' + t.body.angle);
  assert.ok(Math.abs(t.body.position.x - 180) < 2);
  assert.ok(Math.abs(w.heightPx() - 48) < 2, 'h ' + w.heightPx());
  assert.equal(w.busy(), false);
});

test('(c) a brick dropped beside the platform is reported lost', () => {
  const lost = [];
  const w = createWorld(Matter, { onLost: (b, info) => lost.push({ b, info }) });
  const b = w.spawn('O', null, { x: 330, y: -100 });
  sim(w, 6, { left: false, right: false, down: true });
  assert.equal(lost.length, 1);
  assert.equal(lost[0].b, b);
  assert.equal(lost[0].info.byUndo, false);
  assert.equal(b.touched, false);
  assert.equal(w.bricks.length, 0);
  assert.equal(w.controlled, null);
});

test('(d) controlled brick moved sideways at max speed stops at contact and becomes dynamic', () => {
  const w = createWorld(Matter);
  const o = w.place('O', 180, -24); // obstacle on the platform
  sim(w, 1);
  const b = w.spawn('I', null, { x: 60, y: -40 }); // horizontal I, at the obstacle's height band
  w.setFallSpeed(0.001);
  let maxVx = 0;
  let released = -1;
  for (let i = 0; i < 180 && released < 0; i++) {
    w.step(1 / 60, { left: false, right: true, down: false });
    maxVx = Math.max(maxVx, b.body.velocity.x * 60);
    if (b.state !== 'controlled') released = i;
  }
  assert.ok(released > 0, 'should release on contact');
  assert.ok(maxVx > 150 && maxVx < 175, 'max vx ' + maxVx);
  sim(w, 3);
  assert.notEqual(w.controlled, b);
  // it did not pass through the obstacle (may nudge it a little)
  assert.ok(b.body.bounds.max.x < o.body.bounds.min.x + 1.5, 'stopped at obstacle ' + b.body.bounds.max.x);
  assert.ok(o.body.bounds.min.x - 156.5 < 15, 'obstacle pushed ' + o.body.bounds.min.x);
  assert.equal(w.bricks.length, 2);
  assert.ok(Math.abs(b.body.velocity.x) < 0.2);
});

test('(e) rotation turns the footprint and nudges up when overlapping', () => {
  const w = createWorld(Matter);
  const b = w.spawn('I', null, { x: 180, y: -300 });
  const bw = () => b.body.bounds.max.x - b.body.bounds.min.x;
  const bh = () => b.body.bounds.max.y - b.body.bounds.min.y;
  assert.ok(bw() > 90 && bh() < 30);
  assert.equal(w.rotate(), true);
  assert.ok(bw() < 30 && bh() > 90, `rotated ${bw()}x${bh()}`);
  w.rotate(); w.rotate(); w.rotate();
  assert.ok(bw() > 90 && bh() < 30);
  // overlap case: a brick right under a horizontal I; rotating to vertical would dig in -> nudged up
  const w2 = createWorld(Matter);
  w2.place('O', 180, -24);
  sim(w2, 1);
  const c = w2.spawn('I', null, { x: 180, y: -60.5 });
  const y0 = c.body.position.y;
  const ok = w2.rotate();
  if (ok) {
    assert.ok(c.body.position.y < y0, 'nudged up');
    assert.ok(w2.overlapDepth(c) < 0.5);
  } else {
    assert.ok(Math.abs(c.body.position.y - y0) < 1e-6);
  }
});

test('(f) vine constraint keeps a brick from sliding off a tilted base', () => {
  function run(vine) {
    const w = createWorld(Matter);
    const base = w.place('I', 180, -12);
    sim(w, 1);
    // top brick with ice-like low friction would slide when tilted; vine should hold it
    const top = w.place('O', 180, -48, { magic: vine ? { kind: 'light', effect: 'vine' } : null });
    top.body.friction = 0; // ice-like
    sim(w, 2);
    assert.equal(top.state, 'settled');
    if (vine) assert.ok(w.vines.length >= 1, 'vines ' + w.vines.length);
    // tilt the world: sideways gravity
    w.engine.gravity.x = 0.6;
    for (const b of w.bricks) Matter.Sleeping.set(b.body, false);
    const x0 = top.body.position.x - base.body.position.x;
    sim(w, 1.5);
    return Math.abs(top.body.position.x - base.body.position.x - x0);
  }
  const slideFree = run(false);
  const slideVine = run(true);
  assert.ok(slideFree > 15, 'free slide ' + slideFree);
  assert.ok(slideVine < 4, 'vine slide ' + slideVine);
});

test('(g) heavy / ice / giant / undo property changes apply', () => {
  const magic = [];
  const lost = [];
  const w = createWorld(Matter, { onMagic: (b, e) => magic.push(e), onLost: (b, i) => lost.push(i) });
  const a = w.place('O', 150, -24);
  const m0 = a.body.mass;
  sim(w, 1.5);
  w.applyLight(a, 'heavy');
  assert.ok(Math.abs(a.body.mass / m0 - 4) < 1e-6, 'mass x4');
  assert.equal(a.body.friction, 1.1);
  assert.equal(a.tint, 'steel');

  const ice = w.spawn('L', { kind: 'dark', effect: 'ice' }, { x: 180, y: -300 });
  assert.equal(ice.body.friction, 0);
  assert.equal(ice.body.frictionStatic, 0);
  assert.equal(ice.tint, 'ice');
  w.removeBrick(ice);

  const big = w.spawn('O', { kind: 'dark', effect: 'giant' }, { x: 180, y: -300 });
  assert.equal(big.cell, 36);
  assert.ok(Math.abs(big.body.bounds.max.x - big.body.bounds.min.x - 71) < 1.5);
  w.removeBrick(big);
  assert.deepEqual(magic, ['heavy', 'ice', 'giant']);
  lost.length = 0;

  // undo: settle two bricks, the 2nd is an undo brick -> removes the 1st (no byUndo=false loss)
  const w2 = createWorld(Matter, { onLost: (b, i) => lost.push({ b, i }) });
  const first = w2.place('O', 150, -24);
  sim(w2, 1.5);
  assert.equal(first.state, 'settled');
  const u = w2.place('O', 210, -24, { magic: { kind: 'light', effect: 'undo' } });
  sim(w2, 1.5);
  assert.equal(u.state, 'settled');
  assert.equal(lost.length, 1);
  assert.equal(lost[0].b, first);
  assert.equal(lost[0].i.byUndo, true);
  assert.equal(w2.bricks.length, 1);
});

test('fixed timestep: variable dt accumulates, capped at 0.05', () => {
  const w = createWorld(Matter);
  assert.equal(w.step(0.008, NO), 0);
  assert.equal(w.step(0.009, NO), 1);
  assert.equal(w.step(1, NO), 3); // capped to 0.05 (+leftover)
  assert.ok(w.ticks === 4);
});

test('grooved platform: base slab + 3 raised blocks, two 26px grooves', () => {
  const w = createWorld(Matter);
  const parts = w.platform.parts.slice(1);
  assert.equal(parts.length, 4);
  assert.ok(w.platform.isStatic);
  const g = w.grooves;
  assert.deepEqual(g.map((s) => s.groove), [false, true, false, true, false]);
  assert.deepEqual(g.map((s) => Math.round(s.x1 - s.x0)), [41, 26, 26, 26, 41]);
  assert.equal(g[0].x0, 100);
  assert.equal(g[4].x1, 260);
  // raised tops at platformTop, groove floor (base slab top) 2 cells = 48 px lower, total thickness 56
  const tops = parts.map((p) => Math.round(p.bounds.min.y) + 0).sort((a, b) => a - b);
  assert.deepEqual(tops, [0, 0, 0, 48]);
  assert.equal(Math.round(w.platform.bounds.max.y), 56);
  assert.equal(w.platformH, 56);
});

test('a single cell column seats 48 px (2 cells) lower in a groove than on a raised block', () => {
  const w = createWorld(Matter);
  const inG = w.place('I', 154, -60, { rot: 1 }); // groove 141..167
  const onR = w.place('I', 120, -60, { rot: 1 }); // raised 100..141
  sim(w, 3);
  assert.equal(inG.state, 'settled');
  assert.equal(onR.state, 'settled');
  const d = inG.body.bounds.max.y - onR.body.bounds.max.y;
  assert.ok(Math.abs(d - 48) < 1.5, 'groove drop ' + d);
  assert.ok(Math.abs(inG.body.angle) < 0.05 && Math.abs(onR.body.angle) < 0.05);
  // a controlled vertical I can slide into the groove, and a sideways push is held by the groove walls
  // frictionless + slight sideways gravity: the one on the raised block slides, the one in the groove is held
  for (const b of [inG, onR]) { b.body.friction = 0; b.body.frictionStatic = 0; Matter.Sleeping.set(b.body, false); }
  const r0 = onR.body.position.x;
  w.engine.gravity.x = 0.12;
  sim(w, 1);
  assert.ok(onR.body.position.x - r0 > 10, 'raised slides ' + (onR.body.position.x - r0));
  // the column may lean, but its foot stays inside the groove (walls hold it sideways)
  const foot = inG.body.parts.slice(1).reduce((a, p) => (p.position.y > a.position.y ? p : a));
  assert.ok(foot.position.x > 141 && foot.position.x < 167, 'foot x ' + foot.position.x);
  assert.ok(w.bricks.includes(inG));
});

test('friction is +10% (0.99 / 1.1) on bricks and platform', () => {
  const w = createWorld(Matter);
  const b = w.place('O', 180, -100);
  assert.equal(b.body.friction, 0.99);
  assert.equal(b.body.frictionStatic, 1.1);
  // Matter forces friction = 1 on static bodies; the contact uses min(0.99, 1) = 0.99
  assert.ok(w.platform.friction >= 0.99);
  assert.equal(w.platform.frictionStatic, 1.1);
});

test('concrete brick becomes static after settling and does not move when hit or pushed', () => {
  const settled = [];
  const w = createWorld(Matter, { onSettled: (x) => settled.push(x) });
  const c = w.spawn('O', null, { x: 180, y: -120 });
  assert.equal(w.makeConcrete(c), true);
  assert.equal(c.body.isStatic, false); // only fixed once it settles
  sim(w, 4, { left: false, right: false, down: true });
  assert.equal(c.state, 'settled');
  assert.equal(c.body.isStatic, true);
  const p0 = { x: c.body.position.x, y: c.body.position.y, a: c.body.angle };
  // a heavy brick slams onto it, then a sideways push
  const top = w.spawn('O', null, { x: 180, y: -260 });
  sim(w, 4, { left: false, right: false, down: true });
  assert.equal(top.state, 'settled');
  assert.equal(w.bricks.includes(top), true); // stays stacked on it
  Matter.Body.applyForce(c.body, c.body.position, { x: 5, y: 0 });
  w.engine.gravity.x = 0.4;
  sim(w, 1);
  assert.equal(c.body.position.x, p0.x);
  assert.equal(c.body.position.y, p0.y);
  assert.equal(c.body.angle, p0.a);
  assert.ok(w.heightPx() > 50);
  // a concrete brick lost before settling simply goes away
  const w2 = createWorld(Matter);
  const lostOne = w2.spawn('O', null, { x: 330, y: -100 });
  w2.makeConcrete(lostOne);
  sim(w2, 4, { left: false, right: false, down: true });
  assert.equal(w2.bricks.length, 0);
});

test('first contact reports the impact speed before the fast-fall cap', () => {
  const hits = [];
  const w = createWorld(Matter, { onContact: (b, o, ctl, impact) => hits.push({ ctl, impact }) });
  w.spawn('O', null, { x: 180, y: -100 });
  sim(w, 2, { left: false, right: false, down: true });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].ctl, true);
  assert.ok(hits[0].impact > 4.5, 'impact ' + hits[0].impact); // 340 px/s ≈ 5.7 px per 1/60 s
});

test('a vertical I dropped into a groove stands on the groove floor, upright, half sticking out', () => {
  const w = createWorld(Matter);
  const b = w.spawn('I', null, { x: 206, y: -200, rot: 1 }); // groove 193..219
  sim(w, 2, { left: false, right: false, down: true });
  sim(w, 2);
  assert.equal(b.state, 'settled');
  assert.ok(Math.abs(b.body.bounds.max.y - 48) < 1, 'bottom ' + b.body.bounds.max.y);
  assert.ok(Math.abs(b.body.angle) < 0.07, 'angle ' + b.body.angle); // 3 px play in a 26 px groove
  assert.ok(Math.abs(b.body.bounds.min.y + 48) < 2, 'sticks out 48 px: top ' + b.body.bounds.min.y);
  assert.ok(Math.abs(w.heightPx() - 48) < 2);
});

test('a horizontal brick cannot enter a groove: it rests on the raised blocks across it', () => {
  const w = createWorld(Matter);
  const b = w.spawn('I', null, { x: 154, y: -150 }); // spans 106..202 over groove 141..167
  sim(w, 3, { left: false, right: false, down: true });
  assert.equal(b.state, 'settled');
  assert.ok(Math.abs(b.body.bounds.max.y) < 1, 'bottom ' + b.body.bounds.max.y);
  assert.ok(Math.abs(b.body.angle) < 0.02);
});

test('an O dropped on the centre strip does not wedge: it rests flat or tips into a groove and comes to rest', () => {
  const w = createWorld(Matter);
  const b = w.spawn('O', null, { x: 180, y: -150 });
  sim(w, 4, { left: false, right: false, down: true });
  assert.equal(b.state, 'settled');
  assert.ok(b.body.speed < 0.2 && w.bricks.includes(b));
  // either flat on the 26 px strip or tipped with one column down in a groove (bottom no deeper than the floor)
  assert.ok(b.body.bounds.max.y <= 48.5, 'bottom ' + b.body.bounds.max.y);
});

test('bricks sliding off the thick platform sides are still lost', () => {
  const lost = [];
  const w = createWorld(Matter, { onLost: (b) => lost.push(b) });
  const b = w.spawn('O', null, { x: 268, y: -100 }); // half over the right edge
  sim(w, 6, { left: false, right: false, down: true });
  assert.equal(lost.length, 1);
  assert.equal(lost[0], b);
});
