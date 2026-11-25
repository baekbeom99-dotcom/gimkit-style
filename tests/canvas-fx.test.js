import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hudTopY, rr, safeRadialGlow, drawBoltIcon, drawQuestionIcon, drawFlagIcon, drawTrophyIcon,
  drawBadgePill, drawChipPill, drawBannerCard, drawCharacter, drawPlatformPro,
  drawPickupPro, createParticlePool,
} from '../js/games/common/canvas-fx.js';
import { drawPill, drawMutatorCard } from '../js/games/obby/render.js';

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

test('all canvas-fx drawing helpers run cleanly and balance save/restore on Proxy mock', () => {
  const { g, getDepth } = makeProxyG2d();
  rr(g, 10, 10, 50, 20, 6);
  safeRadialGlow(g, 20, 20, 15, 'rgba(255,0,0,0.5)', 'rgba(255,0,0,0)');
  drawBoltIcon(g, 20, 20, 14, '#ffd23f', '#000');
  drawQuestionIcon(g, 20, 20, 14, '#fff');
  drawFlagIcon(g, 20, 20, 12, '#3ccf5a', true);
  drawTrophyIcon(g, 50, 50, 26, 1.2);
  drawBadgePill(g, 350, 62, '42m', '최고 100m');
  drawBadgePill(g, 10, 56, '구간 1/8', '도전 1 · ⚡15', { align: 'left', border: '#ffd23f' });
  drawPill(g, 360, '구간 2/8', '도전 3 · ⚡12');
  drawMutatorCard(g, 360, 56, { title: '⏱ 점프력 110% ▲', desc: '4초 뒤 80%로 변경', accent: '#4ade80', progress: 0.4 });
  drawChipPill(g, 350, 130, '🔥 콤보', '#ffd23f');
  drawBannerCard(g, 360, 150, { text: '체크포인트!', sub: '다음 구간으로 이동', t: 0.4, dur: 1.6 });

  drawCharacter(g, { x: 180, y: 300, facing: 1, vy: 200, onGround: false, time: 0.5 });
  drawCharacter(g, { x: 180, y: 300, facing: 1, vy: 0, onGround: true, move: 1, movePhase: 2.3, time: 0.5 });
  drawCharacter(g, { x: 180, y: 300, facing: -1, vy: -400, onGround: false, dead: true, time: 0.5 });
  drawCharacter(g, { x: 180, y: 300, invincible: 0.25, time: 0.5 });

  const plats = [
    { x: 0, y: 0, w: 360, type: 'static', surface: 'normal' },
    { x: 40, y: 80, w: 80, type: 'static', surface: 'normal', feature: 'spring', springT: 0.1 },
    { x: 140, y: 140, w: 90, type: 'static', surface: 'ice' },
    { x: 60, y: 200, w: 100, type: 'static', surface: 'conveyor', belt: 1 },
    { x: 80, y: 260, w: 70, type: 'static', surface: 'crumble', crumbleT: 0.4 },
    { x: 100, y: 320, w: 80, type: 'moving' },
    { x: 120, y: 380, w: 48, type: 'spike' },
    { x: 120, y: 420, w: 48, type: 'spike', ceiling: true },
    { x: 120, y: 460, w: 16, type: 'spike', wall: true },
    { x: 0, y: 500, w: 360, rest: true, section: 2, feature: 'checkpoint', reached: true },
    { x: 0, y: 560, w: 360, rest: true, section: 7, feature: 'goal' },
  ];
  for (const p of plats) drawPlatformPro(g, p, 200, 1.5);

  drawPickupPro(g, { x: 100, y: 100, type: 'energy' }, 150, 1.0);
  drawPickupPro(g, { x: 140, y: 100, type: 'mystery' }, 150, 1.0);
  assert.equal(getDepth(), 0);
});

test('particle pool emits, steps, caps, and expires cleanly', () => {
  const { g, getDepth } = makeProxyG2d();
  const pool = createParticlePool(10);
  pool.emitDust(100, 50, 6);
  pool.emitSparks(120, 60, '#ffd23f', 6);
  assert.equal(pool.count, 10); // capped at maxCount

  pool.draw(g, (y) => 600 - y);
  assert.equal(getDepth(), 0);

  pool.step(0.2);
  assert.ok(pool.count > 0);
  pool.step(1.0);
  assert.equal(pool.count, 0);
});

test('hudTopY returns fallback without DOM and accounts for zoomed HUD height with DOM', () => {
  assert.equal(hudTopY(null, 66, 10), 66);
  const prevDoc = globalThis.document;
  try {
    globalThis.document = {
      documentElement: { style: { getPropertyValue: () => '1.45' } },
      getElementById: (id) => (id === 'hud' ? { getBoundingClientRect: () => ({ bottom: 76, height: 76 }) } : null),
    };
    const canvas = { getBoundingClientRect: () => ({ top: 0, width: 640 }) };
    assert.equal(hudTopY(canvas, 66, 10), 86);
  } finally {
    globalThis.document = prevDoc;
  }
});
