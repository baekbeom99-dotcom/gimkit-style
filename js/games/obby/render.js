// 못깨는 타워: canvas drawing helpers (world x == screen x, sy = screen y of a world height).
import { PLAYER_HALF_W, PLAYER_H, SPIKE_H, SPRING_PAD_HALF, CRUMBLE_SEC } from '../jump/world.js';

export const SPRING_ANIM = 0.3;
const REST_COLORS = [
  ['#ff6b8b', '#ffd6e0'], ['#ffb02e', '#ffe9b8'], ['#4ccf5a', '#d4f7d8'], ['#2d9cdb', '#cdeeff'],
  ['#8b5cf6', '#e6dcff'], ['#ff8a3d', '#ffe0c7'], ['#14b8a6', '#c9f5ee'], ['#e8384f', '#ffd3d9'],
];

export function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}

function drawSpike(g, p, sy) {
  if (p.wall) {
    // one 16px piece of a vertical spike pillar: dark core + teeth pointing left and right
    const top = sy - SPIKE_H;
    g.fillStyle = '#7a1730';
    g.fillRect(p.x + 3, top, p.w - 6, SPIKE_H);
    g.fillStyle = '#e8384f';
    for (const [bx, dir] of [[p.x + 3, -1], [p.x + p.w - 3, 1]]) {
      g.beginPath();
      g.moveTo(bx, top); g.lineTo(bx + dir * 6, top + SPIKE_H / 2); g.lineTo(bx, sy);
      g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(p.x + p.w / 2 - 1, top + 4, 2, 8);
    return;
  }
  const n = Math.max(2, Math.round(p.w / 12));
  const tw = p.w / n;
  if (p.ceiling) {
    // hangs over a walkway: hitbox y..y+SPIKE_H, base on top, tips pointing down to y
    const top = sy - SPIKE_H;
    g.fillStyle = '#5b1424';
    g.fillRect(p.x, top - 6, p.w, 7);
    g.fillStyle = '#e8384f';
    for (let s = 0; s < n; s++) {
      g.beginPath();
      g.moveTo(p.x + s * tw, top);
      g.lineTo(p.x + s * tw + tw / 2, sy + 2);
      g.lineTo(p.x + (s + 1) * tw, top);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let s = 0; s < n; s++) g.fillRect(p.x + s * tw + tw / 2 - 3, top + 1, 2, 5);
    return;
  }
  g.fillStyle = '#e8384f';
  for (let s = 0; s < n; s++) {
    g.beginPath();
    g.moveTo(p.x + s * tw, sy);
    g.lineTo(p.x + s * tw + tw / 2, sy - SPIKE_H - 2);
    g.lineTo(p.x + (s + 1) * tw, sy);
    g.closePath();
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let s = 0; s < n; s++) g.fillRect(p.x + s * tw + tw / 2 - 1, sy - SPIKE_H + 3, 2, 5);
  g.fillStyle = '#7a1730';
  g.fillRect(p.x, sy, p.w, 5);
}

function drawFlag(g, cx, sy, time, got, color) {
  g.fillStyle = got ? '#c99a1c' : '#c9ced6';
  g.fillRect(cx - 1.5, sy - 52, 3, 54);
  g.fillStyle = got ? '#ffd23f' : '#8e95a3';
  g.beginPath(); g.arc(cx, sy - 54, 4, 0, Math.PI * 2); g.fill();
  const wave = Math.sin(time * 5) * 2;
  g.fillStyle = got ? color : '#9aa0aa';
  g.beginPath();
  g.moveTo(cx + 1.5, sy - 50);
  g.lineTo(cx + 26, sy - 41 + wave);
  g.lineTo(cx + 1.5, sy - 30);
  g.closePath();
  g.fill();
}

function drawRest(g, p, sy, time) {
  const [c1, c2] = REST_COLORS[((p.section ?? -1) + 8) % REST_COLORS.length];
  if (p.ground) {
    g.fillStyle = '#8a5a2b';
    rr(g, p.x, sy, p.w, 26, 6); g.fill();
    g.fillStyle = '#4ccf5a';
    rr(g, p.x, sy, p.w, 10, 5); g.fill();
    return;
  }
  g.save();
  rr(g, p.x, sy, p.w, 18, 7); g.clip();
  g.fillStyle = c1;
  g.fillRect(p.x, sy, p.w, 18);
  g.fillStyle = c2;
  for (let x = p.x - 18; x < p.x + p.w + 18; x += 18) {
    g.beginPath();
    g.moveTo(x, sy + 18); g.lineTo(x + 9, sy + 18); g.lineTo(x + 18, sy); g.lineTo(x + 9, sy);
    g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(p.x, sy, p.w, 3);
  g.restore();
  g.strokeStyle = 'rgba(27,19,64,0.55)';
  g.lineWidth = 2;
  rr(g, p.x, sy, p.w, 18, 7); g.stroke();
  const cx = p.x + p.w / 2;
  if (p.feature === 'checkpoint') drawFlag(g, cx + 34, sy, time, !!p.reached, '#3ccf5a');
  else if (p.feature === 'goal') {
    // golden goal flag + trophy
    drawFlag(g, cx - 30, sy, time, true, '#ffd23f');
    g.font = '28px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText('🏆', cx + 24, sy - 6 + Math.sin(time * 3) * 2);
  }
}

export function drawPlatform(g, p, sy, time) {
  if (p.type === 'spike') return drawSpike(g, p, sy);
  if (p.rest) return drawRest(g, p, sy, time);
  if (p.type === 'moving') {
    g.fillStyle = '#2d9cdb';
    rr(g, p.x, sy, p.w, 16, 8); g.fill();
    g.fillStyle = '#9be0ff';
    rr(g, p.x + 2, sy + 1, p.w - 4, 6, 3); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 12px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText('◀ ▶', p.x + p.w / 2, sy + 13);
    return;
  }
  const cx = p.x + p.w / 2;
  if (p.surface === 'ice') {
    g.fillStyle = '#8fd0f2';
    rr(g, p.x, sy, p.w, 16, 8); g.fill();
    g.fillStyle = '#e4f6ff';
    rr(g, p.x, sy, p.w, 9, 5); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 2;
    for (let x = p.x + 10; x < p.x + p.w - 8; x += 22) {
      g.beginPath(); g.moveTo(x, sy + 7); g.lineTo(x + 6, sy + 2); g.stroke();
    }
    g.strokeStyle = '#5db3e0';
    g.lineWidth = 1.5;
    rr(g, p.x, sy, p.w, 16, 8); g.stroke();
  } else if (p.surface === 'conveyor') {
    g.fillStyle = '#454b57';
    rr(g, p.x, sy, p.w, 16, 8); g.fill();
    g.save();
    rr(g, p.x + 4, sy + 2, p.w - 8, 12, 4); g.clip();
    const dirn = p.belt >= 0 ? 1 : -1;
    const off = ((time * 26 * dirn) % 14 + 14) % 14;
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 2.5;
    for (let x = p.x - 14 + off; x < p.x + p.w + 14; x += 14) {
      g.beginPath();
      g.moveTo(x - 3 * dirn, sy + 3); g.lineTo(x + 3 * dirn, sy + 8); g.lineTo(x - 3 * dirn, sy + 13);
      g.stroke();
    }
    g.restore();
  } else if (p.surface === 'crumble') {
    const t = p.crumbleT || 0;
    const sh = t > 0 ? Math.min(3, 1 + (t / CRUMBLE_SEC) * 3) : 0;
    g.save();
    if (sh) g.translate(Math.sin(time * 70) * sh, Math.cos(time * 55) * sh * 0.6);
    g.fillStyle = t > 0.25 ? '#8a4b2a' : '#a67b52';
    rr(g, p.x, sy, p.w, 16, 6); g.fill();
    g.fillStyle = '#c9a373';
    rr(g, p.x, sy, p.w, 8, 4); g.fill();
    g.strokeStyle = '#4e2d17';
    g.lineWidth = 1.8;
    for (let x = p.x + 10; x < p.x + p.w - 6; x += 20) {
      g.beginPath();
      g.moveTo(x, sy + 1); g.lineTo(x + 4, sy + 6); g.lineTo(x - 2, sy + 10); g.lineTo(x + 3, sy + 15);
      g.stroke();
    }
    g.restore();
  } else {
    g.fillStyle = '#8a5a2b';
    rr(g, p.x, sy, p.w, 16, 8); g.fill();
    g.fillStyle = '#4ccf5a';
    rr(g, p.x, sy, p.w, 9, 5); g.fill();
  }
  if (p.feature === 'spring') {
    const sq = p.springT > 0 ? p.springT / SPRING_ANIM : 0;
    const h = 16 - 9 * sq;
    g.fillStyle = '#ffd23f';
    rr(g, cx - SPRING_PAD_HALF, sy - 3, SPRING_PAD_HALF * 2, 5, 2); g.fill();
    g.strokeStyle = '#d5dae3';
    g.lineWidth = 3;
    g.beginPath();
    const top = sy - 3 - h;
    g.moveTo(cx - 9, sy - 3);
    for (let k = 0; k < 4; k++) {
      const y0 = sy - 3 - (h * k) / 4, y1 = sy - 3 - (h * (k + 1)) / 4;
      g.lineTo(cx + (k % 2 ? -9 : 9), y0 - (y0 - y1) * 0.5);
      g.lineTo(cx + (k % 2 ? 9 : -9), y1);
    }
    g.stroke();
    g.fillStyle = '#ff4d4d';
    rr(g, cx - 14, top - 6, 28, 7, 3); g.fill();
  }
}

// same character as 점프맵
export function drawPlayer(g, player, sy, dead) {
  const stretch = player.onGround ? 1 : 1 + Math.min(0.12, Math.abs(player.vy) / 5000);
  g.save();
  g.translate(player.x, sy);
  g.scale(1 / stretch, stretch);
  g.fillStyle = '#ffb02e';
  rr(g, -PLAYER_HALF_W - 2, -PLAYER_H, PLAYER_HALF_W * 2 + 4, PLAYER_H, 9); g.fill();
  g.fillStyle = '#ff8a00';
  rr(g, -PLAYER_HALF_W - 2, -10, PLAYER_HALF_W * 2 + 4, 10, 5); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(-5, -20, 5, 0, Math.PI * 2); g.arc(6, -20, 5, 0, Math.PI * 2); g.fill();
  if (dead) {
    g.strokeStyle = '#222'; g.lineWidth = 2;
    for (const ex of [-5, 6]) {
      g.beginPath(); g.moveTo(ex - 3, -23); g.lineTo(ex + 3, -17); g.moveTo(ex + 3, -23); g.lineTo(ex - 3, -17); g.stroke();
    }
  } else {
    g.fillStyle = '#222';
    g.beginPath(); g.arc(-5 + player.facing * 1.5, -20, 2.4, 0, Math.PI * 2); g.arc(6 + player.facing * 1.5, -20, 2.4, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ghosted section label on the background, e.g. '구간 3 · 무너지는 계단'
export function drawSectionLabel(g, W, s, sy) {
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.globalAlpha = 0.3;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#1b1340';
  g.lineJoin = 'round';
  g.lineWidth = 4;
  g.font = '900 44px sans-serif';
  g.strokeText(`구간 ${s.index + 1}`, W / 2, sy - 16);
  g.fillText(`구간 ${s.index + 1}`, W / 2, sy - 16);
  g.font = '900 20px sans-serif';
  g.lineWidth = 3;
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
  const a = 0.6 + 0.4 * Math.sin(time * 10);
  g.globalAlpha = a;
  g.fillStyle = '#ff4d4d';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  const cx = W / 2;
  rr(g, cx - 50, y - 14, 100, 28, 14); g.fill(); g.stroke();
  g.fillStyle = '#ffffff';
  g.font = '900 15px sans-serif';
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
  const a = b.t < 0.2 ? b.t / 0.2 : b.t > b.dur - 0.35 ? (b.dur - b.t) / 0.35 : 1;
  g.save();
  g.globalAlpha = Math.max(0, Math.min(1, a));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 22px sans-serif';
  let bw = g.measureText(b.text).width + 40;
  let sw = 0;
  if (b.sub) { g.font = 'bold 14px sans-serif'; sw = g.measureText(b.sub).width + 32; }
  bw = Math.min(cssW - 16, Math.max(bw, sw));
  const bh = b.sub ? 70 : 46;
  const by = y - 10 * (1 - Math.min(1, b.t / 0.2));
  g.fillStyle = 'rgba(27,19,64,0.92)';
  g.strokeStyle = b.color || '#ffd23f';
  g.lineWidth = 3;
  rr(g, cssW / 2 - bw / 2, by, bw, bh, 23);
  g.fill(); g.stroke();
  g.fillStyle = '#ffffff';
  g.font = '900 22px sans-serif';
  g.fillText(b.text, cssW / 2, by + 24, cssW - 32);
  if (b.sub) {
    g.fillStyle = '#ffe9a8';
    g.font = 'bold 14px sans-serif';
    g.fillText(b.sub, cssW / 2, by + 51, cssW - 32);
  }
  g.restore();
}

// record pill under the HUD, top right (CSS px): big '구간 N/8', small '도전 K · ⚡E'. Returns its bottom y.
export function drawPill(g, cssW, big, small) {
  g.save();
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.font = '900 28px sans-serif';
  const w1 = g.measureText(big).width;
  g.font = 'bold 15px sans-serif';
  const w2 = g.measureText(small).width;
  const pw = Math.max(w1, w2) + 28, ph = 62, px = cssW - 10 - pw, py = 62;
  g.fillStyle = 'rgba(27,19,64,0.88)';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  rr(g, px, py, pw, ph, 18); g.fill(); g.stroke();
  g.fillStyle = '#ffd23f';
  g.font = '900 28px sans-serif';
  g.fillText(big, cssW - 24, py + 24);
  g.fillStyle = '#ffffff';
  g.font = 'bold 15px sans-serif';
  g.fillText(small, cssW - 24, py + 49);
  g.restore();
  return py + ph;
}

// small chip under the pill (CSS px), e.g. mutator name / jump power countdown
export function drawChip(g, cssW, y, text, color = '#ffffff', bg = 'rgba(27,19,64,0.85)') {
  g.save();
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.font = 'bold 15px sans-serif';
  const w = g.measureText(text).width + 22;
  rr(g, cssW - 10 - w, y, w, 28, 14);
  g.fillStyle = bg; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = color;
  g.fillText(text, cssW - 21, y + 15);
  g.restore();
  return y + 28;
}

// left-edge progress bar (CSS px): sections, checkpoints, current / best height
export function drawProgress(g, top, bottom, frac, bestFrac, sections, cps) {
  const x = 8, w = 8, h = bottom - top;
  g.save();
  rr(g, x, top, w, h, 4);
  g.fillStyle = 'rgba(27,19,64,0.55)'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = 'rgba(255,210,63,0.45)';
  const bh = h * Math.min(1, bestFrac);
  g.fillRect(x + 1, bottom - bh, w - 2, bh);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 1; i < sections; i++) g.fillRect(x - 2, bottom - (h * i) / sections, w + 4, 1.5);
  for (const f of cps) { g.font = '11px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('🚩', x + w + 1, bottom - h * f); }
  const py = bottom - h * Math.min(1, frac);
  g.fillStyle = '#ffb02e'; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
  g.beginPath(); g.arc(x + w / 2, py, 6, 0, Math.PI * 2); g.fill(); g.stroke();
  g.restore();
}
