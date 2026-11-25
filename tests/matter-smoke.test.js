import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');

test('matter.js 0.19.0 loads and a box comes to rest on a platform', () => {
  assert.equal(Matter.version, '0.19.0');
  const { Engine, Bodies, Composite, Body } = Matter;
  const engine = Engine.create({ gravity: { x: 0, y: 1 } });
  const ground = Bodies.rectangle(200, 400, 400, 40, { isStatic: true }); // top at y=380
  const box = Bodies.rectangle(200, 300, 40, 40);
  Composite.add(engine.world, [ground, box]);
  for (let i = 0; i < 120; i++) Engine.update(engine, 1000 / 60);
  assert.ok(Math.abs(box.position.y - 360) < 2, 'box y ' + box.position.y);
  assert.ok(Math.hypot(box.velocity.x, box.velocity.y) < 0.1);
  assert.ok(Body);
});
