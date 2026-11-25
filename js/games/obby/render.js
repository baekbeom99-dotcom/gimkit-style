// 못깨는 타워: canvas drawing helpers (world x == screen x, sy = screen y of a world height).
import { PLAYER_HALF_W, PLAYER_H, SPIKE_H, SPRING_PAD_HALF, CRUMBLE_SEC } from '../jump/world.js';
import { drawHazard } from './render-hazards.js';
import {
  rr as fxRr, drawCharacter, drawPlatformPro, drawBadgePill, drawChipPill, drawBannerCard, drawFlagIcon,
} from '../common/canvas-fx.js';

export const SPRING_ANIM = 0.3;

export function rr(g, x, y, w, h, r) {
  fxRr(g, x, y, w, h, r);
}

const PLAT_OPTS = { spikeH: SPIKE_H, springPadHalf: SPRING_PAD_HALF, springAnim: SPRING_ANIM, crumbleSec: CRUMBLE_SEC };

export function drawPlatform(g, p, sy, time) {
  if (p.type === 'spike' && p.hz) return drawHazard(g, p, sy, time);
  return drawPlatformPro(g, p, sy, time, PLAT_OPTS);
}

// same character as 점프맵
export function drawPlayer(g, player, sy, dead, time = 0, squash = 0, move = 0, movePhase = 0) {
  drawCharacter(g, {
    x: player.x,
    y: sy,
    halfW: PLAYER_HALF_W,
    height: PLAYER_H,
    facing: player.facing,
    vy: player.vy,
    onGround: player.onGround,
    dead: !!dead,
    squash,
    move,
    movePhase,
    time,
  });
}

// ghosted section label on the background, e.g. '구간 3 · 무너지는 계단'
export function drawSectionLabel(g, W, s, sy) {
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.globalAlpha = 0.48;
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(20,14,50,0.95)';
  g.lineJoin = 'round';
  g.lineWidth = 5;
  g.font = '900 42px sans-serif';
  g.strokeText(`구간 ${s.index + 1}`, W / 2, sy - 16);
  g.fillText(`구간 ${s.index + 1}`, W / 2, sy - 16);
  g.font = '900 19px sans-serif';
  g.lineWidth = 4;
  g.strokeText(s.name, W / 2, sy + 22);
  g.fillText(s.name, W / 2, sy + 22);
  g.restore();
}

// 🌊 animated water from the surface (screen y `top`) down to the bottom edge, with foam
export function drawWater(g, W, H, top, time) {
  if (top > H + 20) return;
  g.save();
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 12) g.lineTo(x, top + Math.sin(x * 0.05 + time * 3) * 4 + Math.sin(x * 0.11 - time * 2) * 2);
  g.lineTo(W, H);
  g.closePath();
  g.fillStyle = 'rgba(30,136,229,0.72)';
  g.fill();
  g.fillStyle = 'rgba(10,80,170,0.35)';
  g.fillRect(0, top + 30, W, Math.max(0, H - top - 30));
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let x = 6; x < W; x += 18) {
    const y = top + Math.sin(x * 0.05 + time * 3) * 4 + Math.sin(x * 0.11 - time * 2) * 2;
    g.beginPath(); g.arc(x + Math.sin(time * 2 + x) * 3, y, 3 + ((x / 18) % 3), 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// warning arrow when the water is just below / at the bottom of the screen
export function drawWaterWarning(g, W, y, time) {
  g.save();
  const a = 0.65 + 0.35 * Math.sin(time * 10);
  g.globalAlpha = a;
  g.fillStyle = '#ff4d4d';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2.5;
  const cx = W / 2;
  rr(g, cx - 54, y - 14, 108, 28, 14); g.fill(); g.stroke();
  g.fillStyle = '#ffffff';
  g.font = '900 14px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('▲ 물이 와요!', cx, y + 1);
  g.restore();
}

// 💨 full-screen wind streaks + direction arrows at both sides
export function drawWindStreaks(g, W, H, vx, time, strong) {
  if (!vx) return;
  const dirn = Math.sign(vx);
  g.save();
  g.lineCap = 'round';
  const n = strong ? 22 : 10, len = strong ? 34 : 18;
  g.beginPath();
  for (let k = 0; k < n; k++) {
    const x = (((k * 97 + time * vx * (strong ? 4 : 2.4) + k * k * 11) % (W + 60)) + W + 60) % (W + 60) - 30;
    const y = ((k * 131 + k * k * 17) % 1000) / 1000 * H;
    g.moveTo(x, y); g.lineTo(x - dirn * len, y);
  }
  g.strokeStyle = strong ? 'rgba(27,19,64,0.16)' : 'rgba(27,19,64,0.08)';
  g.lineWidth = 5;
  g.stroke();
  g.strokeStyle = strong ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)';
  g.lineWidth = 2;
  g.stroke();
  g.restore();
}

export function drawWindArrow(g, W, y, vx) {
  const dirn = Math.sign(vx);
  const ax = dirn > 0 ? W - 18 : 18;
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.strokeStyle = 'rgba(27,19,64,0.75)';
  g.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const bx = ax - dirn * k * 11;
    g.beginPath();
    g.moveTo(bx - dirn * 7, y - 10); g.lineTo(bx + dirn * 7, y); g.lineTo(bx - dirn * 7, y + 10);
    g.closePath();
    g.stroke(); g.fill();
  }
  g.restore();
}

const CONFETTI = ['#ff6b8b', '#ffd23f', '#4ccf5a', '#2d9cdb', '#8b5cf6', '#ff8a3d'];
export function makeConfetti(rng, W, H, n = 90) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: rng() * W, y: -20 - rng() * H * 0.5, vx: (rng() - 0.5) * 80, vy: 80 + rng() * 120,
      r: rng() * Math.PI, vr: (rng() - 0.5) * 10, c: CONFETTI[i % CONFETTI.length], s: 5 + rng() * 5,
    });
  }
  return out;
}
export function stepConfetti(list, dt, H) {
  for (const c of list) {
    c.x += c.vx * dt; c.y += c.vy * dt; c.r += c.vr * dt;
    c.vx *= 0.99;
    if (c.y > H + 20) { c.y = -20; }
  }
}
export function drawConfetti(g, list) {
  for (const c of list) {
    g.save();
    g.translate(c.x, c.y);
    g.rotate(c.r);
    g.fillStyle = c.c;
    g.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2);
    g.restore();
  }
}

// banner in CSS px: { text, sub?, t, dur, color? }
export function drawBanner(g, cssW, b, y = 150) {
  drawBannerCard(g, cssW, y, b);
}

// section box under the energy gauge (top left, CSS px): crisp '구간 N/8' + '도전 K · ⚡E'. Returns its bottom y.
export function drawPill(g, _cssW, big, small, topY = 66) {
  return drawBadgePill(g, 10, topY, big, small, { align: 'left', accent: '#ffd23f', border: '#ffd23f' });
}

// small chip under the pill (CSS px), kept for compatibility
export function drawChip(g, cssW, y, text, color = '#ffffff') {
  return drawChipPill(g, cssW - 10, y, text, color);
}

// clear mutator card on the top-right (CSS px) explaining the active hard-mode modifier at a glance
export function drawMutatorCard(g, cssW, topY, info) {
  if (!info) return topY;
  const maxW = Math.max(148, cssW - 146);
  const accent = info.accent || '#ffd23f';
  g.save();
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.font = '900 15px sans-serif';
  const w1 = g.measureText(info.title).width;
  g.font = 'bold 12px sans-serif';
  const w2 = info.desc ? g.measureText(info.desc).width : 0;
  const pw = Math.min(maxW, Math.max(w1, w2) + 26);
  const hasBar = typeof info.progress === 'number';
  const ph = hasBar ? 56 : 52;
  const px = cssW - 10 - pw;
  const py = topY;

  // solid shadow + opaque high-contrast body
  g.fillStyle = 'rgba(8,4,22,0.82)';
  rr(g, px, py + 3, pw, ph, 13);
  g.fill();
  g.fillStyle = '#191142';
  rr(g, px, py, pw, ph, 13);
  g.fill();

  // colored accent bar along the left edge
  g.fillStyle = accent;
  rr(g, px + 3, py + 7, 4, ph - 14, 2);
  g.fill();

  g.strokeStyle = accent;
  g.lineWidth = 2.2;
  rr(g, px, py, pw, ph, 13);
  g.stroke();

  const textMaxW = pw - 22;
  g.fillStyle = accent;
  g.font = '900 15px sans-serif';
  g.fillText(info.title, cssW - 20, py + 17, textMaxW);

  if (info.desc) {
    g.fillStyle = '#f1edff';
    g.font = 'bold 12px sans-serif';
    g.fillText(info.desc, cssW - 20, py + 37, textMaxW);
  }

  if (hasBar) {
    const bw = pw - 20;
    const bx = px + 11;
    const by = py + ph - 8;
    g.fillStyle = 'rgba(255,255,255,0.18)';
    rr(g, bx, by, bw, 4, 2);
    g.fill();
    g.fillStyle = accent;
    rr(g, bx, by, bw * Math.max(0, Math.min(1, info.progress)), 4, 2);
    g.fill();
  }
  g.restore();
  return py + ph;
}

// left-edge progress bar (CSS px): sections, checkpoints, current / best height
export function drawProgress(g, top, bottom, frac, bestFrac, sections, cps) {
  const x = 8, w = 8, h = bottom - top;
  g.save();
  rr(g, x, top, w, h, 4);
  g.fillStyle = 'rgba(27,19,64,0.6)'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.68)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = 'rgba(255,210,63,0.48)';
  const bh = h * Math.min(1, bestFrac);
  g.fillRect(x + 1, bottom - bh, w - 2, bh);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 1; i < sections; i++) g.fillRect(x - 2, bottom - (h * i) / sections, w + 4, 1.5);
  for (const f of cps) drawFlagIcon(g, x + w + 5, bottom - h * f, 11, '#3ccf5a', bestFrac >= f);
  const py = bottom - h * Math.min(1, frac);
  g.fillStyle = 'rgba(255,176,46,0.35)';
  g.beginPath(); g.arc(x + w / 2, py, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffb02e'; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
  g.beginPath(); g.arc(x + w / 2, py, 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
  g.restore();
}

// ⏱ jump power change effect: a full-screen flash right after a change, a pulsing border in the last 1.5 s
// (colour of the UPCOMING power) and, while the power is not 100%, an aura + chevrons on the character
// (red / down = weaker, green / up = stronger).
export function drawJumpPowerFx(g, W, H, player, sy, info, fx, time) {
  const col = (sc) => (sc < 1 ? '255,90,90' : sc > 1 ? '90,255,130' : '255,255,255');
  g.save();
  if (info.remaining <= 1.5 && info.next !== info.scale) {
    const pulse = 0.35 + 0.35 * Math.abs(Math.sin(time * 9));
    const c = col(info.next);
    g.lineWidth = 10; g.strokeStyle = `rgba(${c},${pulse})`;
    g.strokeRect(5, 5, W - 10, H - 10);
  }
  if (fx) {
    const k = 1 - fx.t / fx.dur;
    g.fillStyle = `rgba(${col(fx.scale)},${0.38 * k * k})`;
    g.fillRect(0, 0, W, H);
  }
  if (info.scale !== 1) {
    const down = info.scale < 1, c = col(info.scale);
    const cx = player.x, cy = sy - 16;
    g.strokeStyle = `rgba(${c},${0.55 + 0.25 * Math.sin(time * 6)})`; g.lineWidth = 3;
    g.beginPath(); g.ellipse(cx, cy, 24, 28, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = `rgba(${c},0.95)`;
    for (let i = 0; i < 2; i++) {
      const ph = ((time * 1.6 + i * 0.5) % 1);
      const yy = down ? cy - 40 + ph * 22 : cy - 18 - ph * 22;
      g.globalAlpha = 1 - ph;
      g.beginPath();
      if (down) { g.moveTo(cx - 8, yy); g.lineTo(cx + 8, yy); g.lineTo(cx, yy + 10); } else { g.moveTo(cx - 8, yy); g.lineTo(cx + 8, yy); g.lineTo(cx, yy - 10); }
      g.closePath(); g.fill();
    }
  }
  g.restore();
}
