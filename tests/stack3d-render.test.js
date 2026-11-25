import test from 'node:test';
import assert from 'node:assert/strict';
import { project, createBase, SLAB_H } from '../js/games/stack3d/logic.js';
import {
  drawStackBackground, drawIslandAndSea, drawSlabPro, drawMovingShadow, drawReviewCrown, drawTapPrompt,
} from '../js/games/stack3d/render.js';

function makeProxyG2d() {
  let depth = 0;
  const g = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
      if (k === 'save') return () => { depth++; };
      if (k === 'restore') return () => { depth--; };
      return () => {};
    },
    set: () => true,
  });
  return { g, getDepth: () => depth };
}

test('stack3d render helpers run cleanly and balance save/restore on Proxy mock', () => {
  const { g, getDepth } = makeProxyG2d();
  const base = createBase();
  const cam = { x: 0, z: 0, y: 200 };
  const P = (x, z, y) => project(x, z, y, 0.57, cam, 180, 360);
  const clouds = [{ x: 100, y: 120, r: 40, par: 0.2 }, { x: 240, y: 300, r: 32, par: 0.15 }];

  drawStackBackground(g, 360, 640, cam.y, 200, 0, clouds, 1.0);
  drawStackBackground(g, 360, 640, cam.y, 320, 45, clouds, 2.5);
  drawIslandAndSea(g, base, P, 360, 640, 1.0, 0.57);
  drawSlabPro(g, base, 0, SLAB_H, 190, P, 0.57, { flash: 0.5, regrow: 0.8 });
  drawSlabPro(g, base, SLAB_H, SLAB_H, 202, P, 0.57, { alpha: 0.7 });
  drawMovingShadow(g, base, { cx: 30, cz: 0, w: 200, d: 200 }, SLAB_H, P);
  drawReviewCrown(g, base, SLAB_H * 5, P, 1.2);
  drawTapPrompt(g, 360, 640, 0.8);
  assert.equal(getDepth(), 0);
});
