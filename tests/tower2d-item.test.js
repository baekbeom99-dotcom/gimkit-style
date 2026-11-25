import test from 'node:test';
import assert from 'node:assert/strict';
import {
  concreteGrants, CONCRETE_MAX, CONCRETE_STEP_M, vibrationOffset, vibrationRemaining, trembleStrength, VIBRATION,
} from '../js/games/tower2d/logic.js';
import { createNeedCounter } from '../js/ui/quiz-screen.js';

test('concrete grants: +1 at each new multiple of 10 m, never twice', () => {
  assert.equal(CONCRETE_STEP_M, 10);
  assert.equal(CONCRETE_MAX, 9);
  assert.equal(concreteGrants(0, 0), 0);
  assert.equal(concreteGrants(9.99, 0), 0);
  assert.equal(concreteGrants(10, 0), 1);
  assert.equal(concreteGrants(10.4, 1), 0);
  assert.equal(concreteGrants(19.9, 1), 0);
  assert.equal(concreteGrants(20, 1), 1);
  assert.equal(concreteGrants(35, 1), 2); // jumped past 20 and 30 at once
  assert.equal(concreteGrants(-5, 0), 0);
  // simulate inventory with the cap at 9
  let inv = 1;
  let granted = 0;
  for (let m = 0; m <= 200; m += 0.5) {
    const add = concreteGrants(m, granted);
    granted += add;
    inv = Math.min(CONCRETE_MAX, inv + add);
  }
  assert.equal(granted, 20);
  assert.equal(inv, 9);
});

test('screen vibration: deterministic, small (<=1.6/1.2 px), gone by its duration, stronger hits shake more', () => {
  assert.equal(trembleStrength(5.7), 1); // capped
  assert.ok(trembleStrength(0.9) < trembleStrength(3));
  assert.ok(trembleStrength(1, true) >= trembleStrength(1), 'heavy/concrete bricks hit at least as hard');
  assert.ok(trembleStrength(5.7, true) <= VIBRATION.maxK);
  assert.deepEqual(vibrationOffset(0.05, 1), vibrationOffset(0.05, 1));
  let maxDx = 0;
  let maxDy = 0;
  for (let t = 0; t < VIBRATION.sec; t += 0.002) {
    const o = vibrationOffset(t, 1);
    assert.ok(!('rot' in o), 'the whole screen shifts; nothing rotates');
    maxDx = Math.max(maxDx, Math.abs(o.dx));
    maxDy = Math.max(maxDy, Math.abs(o.dy));
  }
  assert.ok(maxDx > 0.8 && maxDx <= 1.6, 'dx ' + maxDx);
  assert.ok(maxDy > 0.5 && maxDy <= 1.2, 'dy ' + maxDy);
  const weak = Math.max(...Array.from({ length: 120 }, (_, i) => Math.abs(vibrationOffset(i * 0.002, 0.3).dx)));
  assert.ok(weak < maxDx * 0.45, 'weak impact vibrates much less: ' + weak);
  const late = vibrationOffset(0.2, 1);
  assert.ok(Math.abs(late.dx) < 0.15 && Math.abs(late.dy) < 0.15);
  assert.deepEqual(vibrationOffset(VIBRATION.sec, 1), { dx: 0, dy: 0 });
  assert.deepEqual(vibrationOffset(0.1, 0), { dx: 0, dy: 0 });
  assert.ok(vibrationRemaining(0, 0.8) > vibrationRemaining(0.1, 0.8));
  assert.equal(vibrationRemaining(VIBRATION.sec, 1), 0);
});

test('item quiz counter needs 3 correct answers; wrong answers do not count', () => {
  const c = createNeedCounter(3);
  assert.equal(c.need, 3);
  assert.equal(c.done, false);
  assert.equal(c.label(), '🧱 0/3 ○○○');
  assert.equal(c.correct(), false);
  assert.equal(c.wrong(), false);
  assert.equal(c.got, 1);
  assert.equal(c.correct(), false);
  assert.equal(c.label(), '🧱 2/3 ●●○');
  assert.equal(c.correct(), true);
  assert.equal(c.done, true);
  assert.equal(c.correct(), true);
  assert.equal(c.got, 3);
  assert.equal(createNeedCounter().need, 3);
  assert.equal(createNeedCounter(0).need, 1);
});
