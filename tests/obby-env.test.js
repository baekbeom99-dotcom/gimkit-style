// stepPlayer env additions for 못깨는 타워 (gravityScale / jumpScale): the default path must stay bit-identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPlayer, stepPlayer, MAX_JUMP_HEIGHT, DOUBLE_JUMP_HEIGHT, SPRING_V, GRAVITY } from '../js/games/jump/world.js';

// A scripted 10 s run over every surface kind (ice, conveyor, crumble, spring, spike) with a wind zone.
function trace(env) {
  const plats = [
    { x: 0, y: 0, w: 360, type: 'static', surface: 'normal' },
    { x: 100, y: 70, w: 80, type: 'static', surface: 'ice' },
    { x: 200, y: 140, w: 70, type: 'static', surface: 'conveyor', belt: 70 },
    { x: 40, y: 200, w: 60, type: 'static', surface: 'crumble' },
    { x: 150, y: 260, w: 60, type: 'static', surface: 'normal', feature: 'spring' },
    { x: 260, y: 90, w: 36, type: 'spike' },
  ];
  const p = createPlayer(120, 0);
  const out = [];
  for (let i = 0; i < 600; i++) {
    const ph = i % 97;
    const input = { left: ph > 50 && ph < 70, right: ph < 30, jump: i % 37 === 0 || i % 53 === 5 };
    const r = stepPlayer(p, input, 1 / 60, plats, env);
    out.push(p.x, p.y, p.vy, p.vx, r.events.join(','));
  }
  return out.join('|');
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
// Hash of the same trace produced by the stepPlayer from before the env additions (git HEAD 4a8c820).
const GOLDEN = 'bf27092939e1b6191eee495e65c40f0d8f508a19ead4beca1788c6f29fb4453d';
const WIND = [{ y0: 100, y1: 200, vx: -45 }];

test('stepPlayer env: default path is bit-identical to the pre-change physics', () => {
  assert.equal(sha(trace({ wind: WIND })), GOLDEN);
  assert.equal(sha(trace({ wind: WIND, gravityScale: 1, jumpScale: 1 })), GOLDEN);
  assert.equal(sha(trace({ wind: WIND, gravityScale: undefined, jumpScale: undefined })), GOLDEN);
});

function apex(env, double = false) {
  const ground = { x: 0, y: 0, w: 360, type: 'static', surface: 'normal' };
  const s = createPlayer(180, 0);
  stepPlayer(s, { jump: false }, 1 / 60, [ground], env); // land
  let top = 0, i = 0, pressed = false;
  stepPlayer(s, { jump: true }, 1 / 60, [ground], env);
  while (i++ < 600) {
    const press = double && !pressed && s.vy <= 0;
    if (press) pressed = true;
    stepPlayer(s, { jump: press }, 1 / 60, [ground], env);
    top = Math.max(top, s.y);
    if (s.onGround) break;
  }
  return top;
}

test('stepPlayer env: jumpScale scales ground and air jump launch speed (height ~ scale^2)', () => {
  const h1 = apex({});
  assert.ok(Math.abs(h1 - MAX_JUMP_HEIGHT) < 6, 'base ' + h1);
  for (const k of [0.75, 1.25]) {
    const h = apex({ jumpScale: k });
    assert.ok(Math.abs(h / h1 - k * k) < 0.04, `jumpScale ${k}: ${h} vs ${h1}`);
  }
  const d1 = apex({}, true), dLow = apex({ jumpScale: 0.75 }, true);
  assert.ok(d1 > MAX_JUMP_HEIGHT + DOUBLE_JUMP_HEIGHT - 10, 'double ' + d1);
  assert.ok(Math.abs(dLow / d1 - 0.5625) < 0.04, 'scaled double ' + dLow);
});

test('stepPlayer env: gravityScale scales gravity (height ~ 1/scale), springs keep their launch speed', () => {
  const h1 = apex({}), h = apex({ gravityScale: 0.6 });
  assert.ok(Math.abs(h / h1 - 1 / 0.6) < 0.05, `low gravity ${h} vs ${h1}`);
  const spring = { x: 140, y: 0, w: 80, type: 'static', surface: 'normal', feature: 'spring' };
  for (const env of [{}, { gravityScale: 0.6 }, { jumpScale: 1.25 }]) {
    const s = createPlayer(180, 20);
    let sprang = false;
    for (let i = 0; i < 30 && !sprang; i++) sprang = stepPlayer(s, {}, 1 / 60, [spring], env).events.includes('sprang');
    assert.ok(sprang);
    assert.equal(s.vy, SPRING_V);
    let top = 0;
    for (let i = 0; i < 120; i++) { stepPlayer(s, {}, 1 / 60, [], env); top = Math.max(top, s.y); }
    const expect = SPRING_V * SPRING_V / (2 * GRAVITY * (env.gravityScale ?? 1));
    assert.ok(Math.abs(top - expect) < 12, `spring apex ${top} vs ${expect}`);
  }
});
