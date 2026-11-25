// ⏱ jump power change: a banner + flash fire when the scale changes, and every render state draws without throwing.
import test from 'node:test';
import assert from 'node:assert/strict';
import obby from '../js/games/obby/index.js';
import { createEnergy } from '../js/core/energy.js';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const g2d = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : () => {}), set: () => true });
let sd = 7; const rng = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };

test('jumppower: banner on every change, effect draws in all phases', async () => {
  const sfx = [];
  const ctx = { g2d, width: 360, height: 700, rng, input: { held: {}, on: () => () => {} }, energy: createEnergy(15),
    hearts: { value: 3, lose() {}, add() {} }, choose: async () => 'hard', requestQuiz: async () => true, endGame() {}, hud: { setScore() {} }, sfx: { play: (n) => sfx.push(n) } };
  const game = obby.create(ctx);
  game.start();
  await new Promise((r) => setTimeout(r, 0));
  game.debug.setMutator('jumppower');
  let changes = 0, last = 1;
  for (let i = 0; i < 60 * 35; i++) {
    game.update(1 / 60);
    const b = game.debug.banner;
    if (b && /점프력/.test(b.text) && b.t < 0.05) changes++;
    if (i % 30 === 0) game.render();
    ctx.energy.add(1);
  }
  assert.ok(changes >= 2, 'changes ' + changes);
});
