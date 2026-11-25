// 못깨는 타워: canvas drawing of the elimination hazards (hazards.js). sy = screen y of the hazard's p.y (its bottom);
// the hitbox spans sy - h .. sy. Colours: spikes red (render.js), lava orange with bubbles, lasers electric violet /
// white (dotted when off, red dashes as the warning), saws steel + a yellow rail, crushers grey stone with a
// yellow-black band, red teeth and a dashed outline where they slam down.
import { hazardHeight } from './hazards.js';

function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}

function drawLava(g, p, sy, time) {
  const h = hazardHeight(p), top = sy - h, x0 = p.x, x1 = p.x + p.w;
  g.save();
  const grad = g.createLinearGradient(0, top, 0, sy + 10);
  grad.addColorStop(0, '#ffd23f'); grad.addColorStop(0.35, '#ff7a1a'); grad.addColorStop(1, '#b3200a');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x0, sy + 10);
  for (let x = x0; x <= x1 + 0.1; x += 6) g.lineTo(x, top + Math.sin(x * 0.12 + time * 3) * 2.5);
  g.lineTo(x1, sy + 10);
  g.closePath(); g.fill();
  g.strokeStyle = '#fff1a8'; g.lineWidth = 2;
  g.beginPath();
  for (let x = x0; x <= x1 + 0.1; x += 6) { const y = top + Math.sin(x * 0.12 + time * 3) * 2.5; if (x === x0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.stroke();
  // bubbles popping on the surface
  g.fillStyle = '#ffe9a0';
  const n = Math.max(1, Math.floor(p.w / 34));
  for (let k = 0; k < n; k++) {
    const ph = (time * 0.9 + k * 0.37) % 1, bx = x0 + 12 + ((k * 53 + 17) % Math.max(1, p.w - 24));
    g.globalAlpha = 1 - ph;
    g.beginPath(); g.arc(bx, top + 5 - ph * 12, 2 + 3 * (1 - ph), 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function drawLaser(g, p, sy, time) {
  const h = hazardHeight(p), top = sy - h, vert = !!p.vertical;
  g.save();
  // emitters (outside the hitbox): dark boxes with a lamp (violet = on, red blinking = about to fire)
  const lamp = p.off ? (p.warn && Math.sin(time * 28) > 0 ? '#ff2d2d' : '#5a6b7d') : '#ff3df2';
  const box = (bx, by, bw, bh) => {
    g.fillStyle = '#2b2f3a'; rr(g, bx, by, bw, bh, 3); g.fill();
    g.strokeStyle = '#8a93a6'; g.lineWidth = 1.5; rr(g, bx, by, bw, bh, 3); g.stroke();
    g.fillStyle = lamp; g.beginPath(); g.arc(bx + bw / 2, by + bh / 2, 3.2, 0, Math.PI * 2); g.fill();
  };
  if (vert) { box(p.x - 3, top - 12, p.w + 6, 12); box(p.x - 3, sy, p.w + 6, 12); }
  else { box(p.x - 12, top - 4, 12, h + 8); box(p.x + p.w, top - 4, 12, h + 8); }
  const cx = p.x + p.w / 2, cy = top + h / 2;
  if (p.off) {
    g.strokeStyle = p.warn && Math.sin(time * 28) > 0 ? 'rgba(255,45,45,0.95)' : 'rgba(150,230,255,0.4)';
    g.lineWidth = p.warn ? 3 : 2; g.setLineDash([5, 7]);
    g.beginPath();
    if (vert) { g.moveTo(cx, top); g.lineTo(cx, sy); } else { g.moveTo(p.x, cy); g.lineTo(p.x + p.w, cy); }
    g.stroke();
  } else {
    const flick = 0.75 + 0.25 * Math.sin(time * 60);
    g.globalAlpha = 0.45 * flick; g.fillStyle = '#ff3df2';
    if (vert) g.fillRect(p.x - 4, top, p.w + 8, h); else g.fillRect(p.x, top - 4, p.w, h + 8);
    g.globalAlpha = 1; g.fillStyle = '#e9b8ff';
    if (vert) g.fillRect(p.x + 1, top, p.w - 2, h); else g.fillRect(p.x, top + 1, p.w, h - 2);
    g.fillStyle = '#ffffff';
    if (vert) g.fillRect(cx - 1.5, top, 3, h); else g.fillRect(p.x, cy - 1.5, p.w, 3);
    // crackling zigzag
    g.strokeStyle = '#7df9ff'; g.lineWidth = 2;
    g.beginPath();
    const len = vert ? h : p.w, steps = Math.max(4, Math.round(len / 12));
    for (let k = 0; k <= steps; k++) {
      const u = k / steps, j = (k % 2 ? 1 : -1) * 4 * Math.sin(time * 40 + k * 1.7);
      const px = vert ? cx + j : p.x + u * p.w, py = vert ? top + u * h : cy + j;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }
  g.restore();
}

function drawSaw(g, p, sy, time) {
  const r = p.w / 2, cx = p.x + r, cy = sy - p.h / 2;
  g.save();
  // rail: the line the blade patrols
  g.lineCap = 'round';
  const rail = (x0, y0, x1, y1) => {
    g.strokeStyle = '#2b2f3a'; g.lineWidth = 7; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 2.5; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
  };
  if (p.axis === 'y') { const bc = cy + (p.y - p.baseY); rail(cx, bc - p.range, cx, bc + p.range); }
  else { const bx = p.baseX + r; rail(bx - p.range, cy, bx + p.range, cy); }
  // blade
  g.translate(cx, cy);
  g.rotate(time * 9 * (p.axis === 'y' ? 1 : -1));
  const teeth = 10;
  g.fillStyle = '#dfe5ee'; g.strokeStyle = '#4a5160'; g.lineWidth = 1.5;
  g.beginPath();
  for (let k = 0; k < teeth * 2; k++) {
    const a = (k / (teeth * 2)) * Math.PI * 2, rad = k % 2 ? r * 0.72 : r + 3;
    if (k === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#9aa3b3'; g.beginPath(); g.arc(0, 0, r * 0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff5a1f'; g.beginPath(); g.arc(0, 0, r * 0.26, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(r * 0.5, 0); g.lineTo(r * 0.85, 0); g.stroke();
  g.restore();
}

function drawCrusher(g, p, sy, time) {
  const h = hazardHeight(p), top = sy - h, y0 = p.y0 ?? p.y, rise = p.rise || 0;
  const slamBottom = sy - (y0 - p.y);               // screen y where the block's bottom sits when slammed down
  g.save();
  // where it lands: dashed outline
  g.strokeStyle = 'rgba(255,170,40,0.7)'; g.lineWidth = 2; g.setLineDash([6, 5]);
  g.strokeRect(p.x, slamBottom - h, p.w, h);
  g.setLineDash([]);
  const shake = p.warn ? Math.sin(time * 70) * 2.2 : 0;
  // ceiling plate + chains
  const plateY = slamBottom - h - rise - 46;
  g.fillStyle = '#2b2f3a'; g.fillRect(p.x - 6, plateY - 10, p.w + 12, 12);
  g.strokeStyle = '#6a7384'; g.lineWidth = 3; g.setLineDash([5, 3]);
  for (const fx of [p.x + 10, p.x + p.w - 10]) { g.beginPath(); g.moveTo(fx, plateY); g.lineTo(fx + shake, top); g.stroke(); }
  g.setLineDash([]);
  g.translate(shake, 0);
  // block
  const grad = g.createLinearGradient(0, top, 0, sy);
  grad.addColorStop(0, '#9aa3b3'); grad.addColorStop(1, '#5c6474');
  g.fillStyle = grad; rr(g, p.x, top, p.w, h - 6, 5); g.fill();
  g.strokeStyle = p.warn && Math.sin(time * 30) > 0 ? '#ff3b3b' : '#2b2f3a'; g.lineWidth = 2.5; rr(g, p.x, top, p.w, h - 6, 5); g.stroke();
  // yellow-black band
  g.save(); rr(g, p.x, top, p.w, 9, 4); g.clip();
  g.fillStyle = '#ffd23f'; g.fillRect(p.x, top, p.w, 9);
  g.fillStyle = '#222';
  for (let x = p.x - 10; x < p.x + p.w + 10; x += 14) { g.beginPath(); g.moveTo(x, top + 9); g.lineTo(x + 7, top + 9); g.lineTo(x + 14, top); g.lineTo(x + 7, top); g.closePath(); g.fill(); }
  g.restore();
  // angry eyes
  const ex = p.x + p.w / 2;
  g.fillStyle = '#fff';
  for (const d of [-1, 1]) { g.beginPath(); g.ellipse(ex + d * 9, top + 17, 5, 4, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#d4182f';
  for (const d of [-1, 1]) { g.beginPath(); g.arc(ex + d * 9, top + 18, 2.2, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#2b2f3a'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(ex - 16, top + 10); g.lineTo(ex - 4, top + 14); g.moveTo(ex + 16, top + 10); g.lineTo(ex + 4, top + 14); g.stroke();
  // teeth at the bottom
  const n = Math.max(3, Math.round(p.w / 12)), tw = p.w / n;
  g.fillStyle = '#e8384f';
  for (let k = 0; k < n; k++) { g.beginPath(); g.moveTo(p.x + k * tw, sy - 6); g.lineTo(p.x + k * tw + tw / 2, sy + 1); g.lineTo(p.x + (k + 1) * tw, sy - 6); g.closePath(); g.fill(); }
  g.restore();
}

export function drawHazard(g, p, sy, time) {
  switch (p.hz) {
    case 'lava': return drawLava(g, p, sy, time);
    case 'laser': return drawLaser(g, p, sy, time);
    case 'saw': return drawSaw(g, p, sy, time);
    case 'crusher': return drawCrusher(g, p, sy, time);
    default: return undefined;
  }
}
