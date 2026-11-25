import test from 'node:test';
import assert from 'node:assert/strict';
import { appWidth, uiScale, isLandscapePhone, logicalHeight, portraitStage, canvasFit, canvasDpr } from '../js/core/layout.js';

// [vw, vh, expected column width, landscape phone?]
const MATRIX = [
  [320, 568, 320, false], [360, 640, 360, false], [375, 667, 375, false], [375, 812, 375, false],
  [390, 844, 390, false], [412, 915, 412, false], [430, 932, 430, false], [320, 480, 320, false],
  [768, 1024, 634.88, false], [820, 1180, 640, false], [1024, 1366, 640, false],
  [1024, 768, 480, false], [1280, 720, 480, false], [1366, 768, 480, false], [1920, 1080, 640, false],
  [667, 375, 480, true], [844, 390, 480, true], [915, 412, 480, true],
];

test('appWidth: phones use full width, big screens a centred 480..640 column', () => {
  for (const [vw, vh, w] of MATRIX) assert.ok(Math.abs(appWidth(vw, vh) - w) < 0.01, `${vw}x${vh} -> ${appWidth(vw, vh)}`);
});
test('appWidth never exceeds the viewport or 640', () => {
  for (let vw = 200; vw <= 2600; vw += 37) for (let vh = 200; vh <= 1600; vh += 53) {
    const w = appWidth(vw, vh);
    assert.ok(w <= vw && w <= 640 && w > 0);
  }
  assert.equal(appWidth(0, 500), 0);
});
test('uiScale: 1 on phones, grows to 1.45 on wide columns', () => {
  for (const [vw, vh] of MATRIX.filter((m) => m[0] <= 440)) assert.equal(uiScale(appWidth(vw, vh)), 1);
  assert.equal(uiScale(480), 1.09);
  assert.equal(uiScale(640), 1.45);
  assert.equal(uiScale(5000), 1.45);
  assert.equal(uiScale(0), 1);
});
test('isLandscapePhone: only short landscape screens', () => {
  for (const [vw, vh, , lp] of MATRIX) assert.equal(isLandscapePhone(vw, vh), lp, `${vw}x${vh}`);
});
test('logicalHeight follows stage aspect with 520..1000 clamp', () => {
  assert.equal(logicalHeight(375, 812), 780);
  assert.equal(logicalHeight(320, 568), 639);
  assert.equal(logicalHeight(480, 390), 520);
  assert.equal(logicalHeight(300, 1200), 1000);
  assert.equal(logicalHeight(0, 100), 640);
});
test('portraitStage swaps a landscape phone to its portrait column', () => {
  assert.deepEqual(portraitStage(844, 390), { w: 390, h: 844 });
  assert.deepEqual(portraitStage(390, 844), { w: 390, h: 844 });
  assert.equal(logicalHeight(portraitStage(844, 390).w, portraitStage(844, 390).h), 779);
});
test('canvasFit: fill within 2%, contain otherwise (no distortion)', () => {
  assert.equal(canvasFit(375, 812, 360, 780).mode, 'fill');
  assert.equal(canvasFit(376, 812, 360, 780).mode, 'fill');
  const c = canvasFit(480, 390, 360, 780); // 세로 게임을 가로 무대에 -> 높이에 맞추고 좌우 여백
  assert.equal(c.mode, 'contain');
  assert.equal(c.height, 390);
  assert.equal(c.width, 180);
  const d = canvasFit(640, 1024, 360, 520); // 더 길쭉한 무대 -> 폭에 맞추고 위아래 여백
  assert.equal(d.mode, 'contain');
  assert.equal(d.width, 640);
  assert.ok(Math.abs(d.width / d.height - 360 / 520) < 0.01);
  for (const [vw, vh] of MATRIX) {
    const f = canvasFit(appWidth(vw, vh), vh, 360, 640);
    assert.ok(f.width <= appWidth(vw, vh) + 0.01 && f.height <= vh + 0.01);
  }
});
test('canvasDpr clamps to (0,3]', () => {
  assert.equal(canvasDpr(2), 2);
  assert.equal(canvasDpr(4), 3);
  assert.equal(canvasDpr(undefined), 1);
  assert.equal(canvasDpr(0.5), 0.5);
});
