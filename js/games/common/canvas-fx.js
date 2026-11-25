// Shared casual-vector canvas visual helpers for Phase 1+ games.
// Pure Canvas 2D drawing utilities; safe with headless Proxy g2d test mocks.

export function rr(g, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  g.beginPath();
  if (typeof g.roundRect === 'function') {
    g.roundRect(x, y, w, h, rad);
  } else {
    g.moveTo(x + rad, y);
    g.lineTo(x + w - rad, y);
    g.arcTo(x + w, y, x + w, y + rad, rad);
    g.lineTo(x + w, y + h - rad);
    g.arcTo(x + w, y + h, x + w - rad, y + h, rad);
    g.lineTo(x + rad, y + h);
    g.arcTo(x, y + h, x, y + h - rad, rad);
    g.lineTo(x, y + rad);
    g.arcTo(x, y, x + rad, y, rad);
    g.closePath();
  }
}

export function safeRadialGlow(g, x, y, r, innerColor, outerColor) {
  let rg = null;
  if (typeof g.createRadialGradient === 'function') {
    rg = g.createRadialGradient(x, y, 0, x, y, r);
  }
  if (rg && typeof rg.addColorStop === 'function') {
    rg.addColorStop(0, innerColor);
    rg.addColorStop(1, outerColor);
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    return;
  }
  g.fillStyle = innerColor;
  g.beginPath();
  g.arc(x, y, r * 0.6, 0, Math.PI * 2);
  g.fill();
}

export function drawBoltIcon(g, cx, cy, size = 14, fill = '#7a4a00', stroke = null) {
  const s = size / 14;
  g.save();
  g.translate(cx, cy);
  g.beginPath();
  g.moveTo(1.5 * s, -7 * s);
  g.lineTo(-4.8 * s, 0.8 * s);
  g.lineTo(-0.4 * s, 0.8 * s);
  g.lineTo(-1.8 * s, 7 * s);
  g.lineTo(4.8 * s, -0.8 * s);
  g.lineTo(0.4 * s, -0.8 * s);
  g.closePath();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = Math.max(1.5, 2 * s);
    g.lineJoin = 'round';
    g.stroke();
  }
  g.fillStyle = fill;
  g.fill();
  g.restore();
}

export function drawQuestionIcon(g, cx, cy, size = 14, fill = '#ffffff') {
  const s = size / 14;
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = fill;
  g.fillStyle = fill;
  g.lineWidth = Math.max(2, 2.4 * s);
  g.lineCap = 'round';
  g.beginPath();
  g.arc(0, -2.5 * s, 3.2 * s, Math.PI * 1.05, Math.PI * 0.2);
  g.quadraticCurveTo(0, 1.2 * s, 0, 2.4 * s);
  g.stroke();
  g.beginPath();
  g.arc(0, 5.2 * s, 1.35 * s, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function drawFlagIcon(g, cx, cy, size = 12, color = '#ff4d6d', reached = true) {
  const s = size / 12;
  g.save();
  g.translate(cx, cy);
  g.fillStyle = reached ? '#f4d35e' : '#c9ced6';
  g.fillRect(-1 * s, -6 * s, 1.8 * s, 12 * s);
  g.fillStyle = reached ? color : '#9aa0aa';
  g.beginPath();
  g.moveTo(0.8 * s, -5.5 * s);
  g.lineTo(7 * s, -3 * s);
  g.lineTo(0.8 * s, -0.2 * s);
  g.closePath();
  g.fill();
  g.restore();
}

export function drawTrophyIcon(g, cx, cy, size = 24, time = 0) {
  const s = size / 24;
  const bob = Math.sin(time * 3) * 2 * s;
  g.save();
  g.translate(cx, cy + bob);
  safeRadialGlow(g, 0, -2 * s, 18 * s, 'rgba(255,215,64,0.45)', 'rgba(255,215,64,0)');

  // handles
  g.strokeStyle = '#e59f00';
  g.lineWidth = 2.4 * s;
  g.beginPath();
  g.arc(-6.5 * s, -5 * s, 4 * s, Math.PI * 0.5, Math.PI * 1.55);
  g.stroke();
  g.beginPath();
  g.arc(6.5 * s, -5 * s, 4 * s, -Math.PI * 0.55, Math.PI * 0.5);
  g.stroke();

  // cup body
  const grad = g.createLinearGradient(-8 * s, -11 * s, 8 * s, 4 * s);
  grad.addColorStop(0, '#fff29c');
  grad.addColorStop(0.5, '#ffd23f');
  grad.addColorStop(1, '#d98c00');
  g.fillStyle = grad;
  g.strokeStyle = '#4a2600';
  g.lineWidth = 1.6 * s;
  g.beginPath();
  g.moveTo(-7.5 * s, -10.5 * s);
  g.lineTo(7.5 * s, -10.5 * s);
  g.quadraticCurveTo(7.5 * s, 1.5 * s, 0, 3 * s);
  g.quadraticCurveTo(-7.5 * s, 1.5 * s, -7.5 * s, -10.5 * s);
  g.closePath();
  g.fill();
  g.stroke();

  // shine stripe
  g.fillStyle = 'rgba(255,255,255,0.65)';
  g.beginPath();
  g.ellipse(-3 * s, -5.5 * s, 1.5 * s, 3.8 * s, -0.15, 0, Math.PI * 2);
  g.fill();

  // stem + base
  g.fillStyle = '#e59f00';
  g.fillRect(-2 * s, 2.5 * s, 4 * s, 4.5 * s);
  g.fillStyle = '#6b3e11';
  rr(g, -6.5 * s, 6.5 * s, 13 * s, 4.2 * s, 1.6 * s);
  g.fill();
  g.strokeStyle = '#3a1f05';
  g.lineWidth = 1.3 * s;
  g.stroke();

  // twinkle star
  const tw = 0.55 + 0.45 * Math.sin(time * 5);
  g.globalAlpha = tw;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(5 * s, -9 * s, 2.1 * s, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function drawBadgePill(g, anchorX, topY, bigText, smallText, opts = {}) {
  const accent = opts.accent || '#ffd23f';
  const align = opts.align === 'left' ? 'left' : 'right';
  const border = opts.border || 'rgba(255,255,255,0.95)';
  g.save();
  g.textBaseline = 'middle';
  g.font = '900 24px sans-serif';
  const w1 = g.measureText(bigText).width;
  g.font = 'bold 13px sans-serif';
  const w2 = smallText ? g.measureText(smallText).width : 0;
  const pw = Math.max(w1, w2) + 26;
  const ph = smallText ? 54 : 40;
  const px = align === 'left' ? anchorX : anchorX - pw;
  const py = topY;

  // crisp arcade drop shadow
  g.fillStyle = 'rgba(8,4,22,0.82)';
  rr(g, px, py + 3, pw, ph, 14);
  g.fill();

  // solid high-contrast card body
  g.fillStyle = '#191142';
  rr(g, px, py, pw, ph, 14);
  g.fill();

  // subtle top bevel gloss
  g.fillStyle = 'rgba(255,255,255,0.1)';
  rr(g, px + 3, py + 2.5, pw - 6, 12, 9);
  g.fill();

  // crisp border
  g.strokeStyle = border;
  g.lineWidth = 2.5;
  rr(g, px, py, pw, ph, 14);
  g.stroke();

  g.textAlign = align;
  const tx = align === 'left' ? px + 13 : px + pw - 13;

  g.fillStyle = accent;
  g.font = '900 24px sans-serif';
  g.fillText(bigText, tx, py + (smallText ? 20 : ph / 2 + 1));

  if (smallText) {
    g.fillStyle = '#f1edff';
    g.font = 'bold 13px sans-serif';
    g.fillText(smallText, tx, py + 41);
  }
  g.restore();
  return py + ph;
}

export function drawChipPill(g, rightX, y, text, color = '#ffffff') {
  g.save();
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.font = 'bold 14px sans-serif';
  const w = g.measureText(text).width + 24;
  const px = rightX - w;
  g.fillStyle = 'rgba(11,6,32,0.38)';
  rr(g, px, y + 2, w, 28, 14);
  g.fill();

  g.fillStyle = 'rgba(27,19,64,0.9)';
  rr(g, px, y, w, 28, 14);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 2;
  g.stroke();

  g.fillStyle = color;
  g.fillText(text, rightX - 12, y + 14.5);
  g.restore();
  return y + 28;
}

export function drawBannerCard(g, cssW, y, banner) {
  const dur = banner.dur || 1.6;
  const t = banner.t || 0;
  const enter = Math.min(1, t / 0.22);
  const exit = t > dur - 0.35 ? Math.max(0, (dur - t) / 0.35) : 1;
  const alpha = Math.max(0, Math.min(1, enter, exit));
  const pop = t < 0.22 ? 0.9 + 0.1 * Math.sin(enter * Math.PI * 0.7) / Math.sin(Math.PI * 0.7) : 1;

  g.save();
  g.globalAlpha = alpha;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 21px sans-serif';
  let bw = g.measureText(banner.text).width + 44;
  if (banner.sub) {
    g.font = 'bold 14px sans-serif';
    bw = Math.max(bw, g.measureText(banner.sub).width + 36);
  }
  bw = Math.min(cssW - 16, bw);
  const bh = banner.sub ? 70 : 46;
  const by = y - 10 * (1 - enter);
  const cx = cssW / 2;
  const cy = by + bh / 2;

  g.translate(cx, cy);
  g.scale(pop, pop);
  g.translate(-cx, -cy);

  // drop shadow
  g.fillStyle = 'rgba(11,6,32,0.48)';
  rr(g, cx - bw / 2, by + 4, bw, bh, 22);
  g.fill();

  const bg = g.createLinearGradient(0, by, 0, by + bh);
  bg.addColorStop(0, 'rgba(38,27,84,0.96)');
  bg.addColorStop(1, 'rgba(20,14,50,0.96)');
  g.fillStyle = bg;
  rr(g, cx - bw / 2, by, bw, bh, 22);
  g.fill();

  g.fillStyle = 'rgba(255,255,255,0.1)';
  rr(g, cx - bw / 2 + 4, by + 3, bw - 8, 15, 12);
  g.fill();

  g.strokeStyle = banner.color || '#ffd23f';
  g.lineWidth = 3;
  rr(g, cx - bw / 2, by, bw, bh, 22);
  g.stroke();

  g.fillStyle = '#ffffff';
  g.font = '900 21px sans-serif';
  g.fillText(banner.text, cx, by + 23, cssW - 36);
  if (banner.sub) {
    g.fillStyle = '#ffe9a8';
    g.font = 'bold 14px sans-serif';
    g.fillText(banner.sub, cx, by + 50, cssW - 36);
  }
  g.restore();
}

export function drawCharacter(g, opts) {
  const {
    x, y, halfW = 12, height = 30, facing = 1, vy = 0, onGround = true,
    dead = false, invincible = 0, time = 0, squash = 0, move = 0, movePhase = 0,
  } = opts;
  if (invincible > 0 && Math.floor(invincible * 10) % 2 === 0) return;

  const w = halfW * 2 + 4;
  const h = height;
  const airStretch = onGround ? 1 : 1 + Math.min(0.14, Math.abs(vy) / 4600);
  const landSq = 1 - squash * 0.22;

  // Larva-style inchworm wriggle while moving
  const m = dead ? 0 : Math.max(0, Math.min(1, move));
  const s = Math.sin(movePhase);
  const c = Math.cos(movePhase);
  const gMove = onGround ? m : m * 0.35;
  const wiggleX = 1 + gMove * 0.16 * s;
  const wiggleY = 1 - gMove * 0.17 * s;
  const hopY = onGround ? -Math.max(0, c) * 3.8 * m : 0;
  const scootX = onGround ? facing * (-s * 2.2 * m) : 0;
  const tilt = facing * (onGround ? (0.12 * c + 0.05) * m : 0.13 * m);

  const sxScale = (1 / airStretch) / landSq * wiggleX;
  const syScale = airStretch * landSq * wiggleY;

  g.save();
  g.translate(x, y);

  // ground contact shadow (pulses with inchworm scoot)
  if (onGround) {
    const shScale = 1 + gMove * 0.14 * s - Math.max(0, c) * 0.15 * m;
    g.fillStyle = 'rgba(15,10,38,0.28)';
    g.beginPath();
    g.ellipse(scootX * 0.4, 1, (halfW + 2) * shScale, 4, 0, 0, Math.PI * 2);
    g.fill();
  }

  g.translate(scootX, hopY);
  if (tilt) g.rotate(tilt);
  g.scale(sxScale, syScale);

  // cute top hair/antenna sprout (whips slightly behind the inchworm motion)
  const sway = Math.sin(time * 7) * 1.4 - facing * (1.5 + m * 3.2) + Math.sin(movePhase - 0.9) * 3.2 * m;
  g.strokeStyle = '#3b1c08';
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, -h + 1);
  g.quadraticCurveTo(sway * 0.6, -h - 6, sway, -h - 8);
  g.stroke();
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.arc(sway, -h - 8, 3, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3b1c08';
  g.lineWidth = 1.5;
  g.stroke();

  // body gradient + dark crisp outline
  const bodyGrad = g.createLinearGradient(0, -h, 0, 0);
  bodyGrad.addColorStop(0, '#ffd057');
  bodyGrad.addColorStop(0.58, '#ff9d23');
  bodyGrad.addColorStop(1, '#f26f00');
  g.fillStyle = bodyGrad;
  rr(g, -w / 2, -h, w, h, 9);
  g.fill();

  // belly / bottom pants band
  g.fillStyle = '#e56200';
  rr(g, -w / 2 + 1, -9, w - 2, 8.5, 4.5);
  g.fill();

  // subtle Larva-like belly segment line when wriggling
  if (m > 0.1) {
    g.strokeStyle = `rgba(110,38,0,${(0.28 * m).toFixed(2)})`;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-w / 2 + 4, -5.5);
    g.quadraticCurveTo(0, -4.5 - s * 1.5, w / 2 - 4, -5.5);
    g.stroke();
  }

  // top specular highlight
  g.fillStyle = 'rgba(255,255,255,0.45)';
  rr(g, -w / 2 + 4, -h + 2.5, w - 8, 4.5, 2.5);
  g.fill();

  // body outline
  g.strokeStyle = '#3b1c08';
  g.lineWidth = 2;
  rr(g, -w / 2, -h, w, h, 9);
  g.stroke();

  // rosy cheeks
  g.fillStyle = 'rgba(255,77,109,0.48)';
  g.beginPath();
  g.ellipse(-8.5, -14.5, 2.6, 1.6, 0, 0, Math.PI * 2);
  g.ellipse(8.5, -14.5, 2.6, 1.6, 0, 0, Math.PI * 2);
  g.fill();

  // eyes
  const eyeY = -20;
  const eyeRx = !onGround && vy > 120 ? 5.2 : 4.8;
  const eyeRy = !onGround && vy > 120 ? 5.6 : 5;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(-5, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
  g.ellipse(5.5, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
  g.fill();

  if (dead) {
    g.strokeStyle = '#22140c';
    g.lineWidth = 2;
    g.lineCap = 'round';
    for (const ex of [-5, 5.5]) {
      g.beginPath();
      g.moveTo(ex - 2.6, eyeY - 2.6); g.lineTo(ex + 2.6, eyeY + 2.6);
      g.moveTo(ex + 2.6, eyeY - 2.6); g.lineTo(ex - 2.6, eyeY + 2.6);
      g.stroke();
    }
  } else {
    const px = facing * 1.5;
    const py = !onGround ? Math.max(-1.8, Math.min(1.8, -vy / 350)) : 0;
    g.fillStyle = '#1d142c';
    g.beginPath();
    g.arc(-5 + px, eyeY + py, 2.4, 0, Math.PI * 2);
    g.arc(5.5 + px, eyeY + py, 2.4, 0, Math.PI * 2);
    g.fill();
    // eye catchlights
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(-5.7 + px, eyeY - 0.8 + py, 0.9, 0, Math.PI * 2);
    g.arc(4.8 + px, eyeY - 0.8 + py, 0.9, 0, Math.PI * 2);
    g.fill();
  }

  // mouth expression
  g.strokeStyle = '#3b1c08';
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  if (dead || (!onGround && vy < -280)) {
    // surprised O mouth
    g.fillStyle = '#5c1f10';
    g.beginPath();
    g.ellipse(facing * 0.8, -12.5, 2.2, 2.8, 0, 0, Math.PI * 2);
    g.fill();
  } else if (!onGround && vy > 120) {
    // happy open grin
    g.fillStyle = '#5c1f10';
    g.beginPath();
    g.arc(facing * 0.8, -13.5, 2.8, 0, Math.PI);
    g.closePath();
    g.fill();
  } else {
    // gentle smile
    g.beginPath();
    g.arc(facing * 0.8, -13.5, 2.3, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }

  g.restore();
}

const REST_COLORS = [
  ['#ff6b8b', '#ffd6e0'], ['#ffb02e', '#ffe9b8'], ['#4ccf5a', '#d4f7d8'], ['#2d9cdb', '#cdeeff'],
  ['#8b5cf6', '#e6dcff'], ['#ff8a3d', '#ffe0c7'], ['#14b8a6', '#c9f5ee'], ['#e8384f', '#ffd3d9'],
];

function drawSpikeCluster(g, p, sy, spikeH) {
  if (p.wall) {
    const top = sy - spikeH;
    g.fillStyle = '#661126';
    g.fillRect(p.x + 3, top, p.w - 6, spikeH);
    for (const [bx, dir] of [[p.x + 3, -1], [p.x + p.w - 3, 1]]) {
      g.fillStyle = '#ff4d6d';
      g.beginPath();
      g.moveTo(bx, top); g.lineTo(bx + dir * 6.5, top + spikeH / 2); g.lineTo(bx, sy);
      g.closePath(); g.fill();
      g.fillStyle = '#b81d3a';
      g.beginPath();
      g.moveTo(bx, top + spikeH / 2); g.lineTo(bx + dir * 6.5, top + spikeH / 2); g.lineTo(bx, sy);
      g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(p.x + p.w / 2 - 1, top + 3, 2, 10);
    return;
  }
  const n = Math.max(2, Math.round(p.w / 12));
  const tw = p.w / n;
  if (p.ceiling) {
    const top = sy - spikeH;
    g.fillStyle = '#5b1424';
    rr(g, p.x, top - 6, p.w, 7, 2);
    g.fill();
    for (let s = 0; s < n; s++) {
      const x0 = p.x + s * tw, xm = x0 + tw / 2, x1 = x0 + tw;
      g.fillStyle = '#ff546e';
      g.beginPath(); g.moveTo(x0, top); g.lineTo(xm, sy + 2); g.lineTo(xm, top); g.closePath(); g.fill();
      g.fillStyle = '#c41d3c';
      g.beginPath(); g.moveTo(xm, top); g.lineTo(xm, sy + 2); g.lineTo(x1, top); g.closePath(); g.fill();
      g.strokeStyle = '#3b0916'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0, top); g.lineTo(xm, sy + 2); g.lineTo(x1, top); g.stroke();
    }
    return;
  }
  for (let s = 0; s < n; s++) {
    const x0 = p.x + s * tw, xm = x0 + tw / 2, x1 = x0 + tw;
    g.fillStyle = '#ff546e';
    g.beginPath(); g.moveTo(x0, sy); g.lineTo(xm, sy - spikeH - 2); g.lineTo(xm, sy); g.closePath(); g.fill();
    g.fillStyle = '#c41d3c';
    g.beginPath(); g.moveTo(xm, sy); g.lineTo(xm, sy - spikeH - 2); g.lineTo(x1, sy); g.closePath(); g.fill();
    g.strokeStyle = '#3b0916'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, sy); g.lineTo(xm, sy - spikeH - 2); g.lineTo(x1, sy); g.stroke();
  }
  g.fillStyle = '#6e1429';
  rr(g, p.x, sy, p.w, 5.5, 2);
  g.fill();
}

function drawFlagPole(g, cx, sy, time, got, color) {
  g.save();
  g.fillStyle = got ? '#c99a1c' : '#9ca5b5';
  g.fillRect(cx - 2, sy - 54, 4, 56);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(cx - 1.5, sy - 54, 1.5, 54);

  g.fillStyle = got ? '#ffd23f' : '#8e95a3';
  g.strokeStyle = '#1b1340';
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(cx, sy - 56, 4.2, 0, Math.PI * 2); g.fill(); g.stroke();

  const w1 = Math.sin(time * 5.2) * 2.5;
  const w2 = Math.cos(time * 5.2) * 2;
  g.fillStyle = got ? color : '#9aa0aa';
  g.beginPath();
  g.moveTo(cx + 2, sy - 52);
  g.quadraticCurveTo(cx + 15, sy - 50 + w1, cx + 28, sy - 42 + w2);
  g.lineTo(cx + 2, sy - 31);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(27,19,64,0.55)';
  g.lineWidth = 1.5;
  g.stroke();

  if (got) {
    g.fillStyle = '#fff3a8';
    g.beginPath();
    g.arc(cx + 11, sy - 41.5 + w1 * 0.4, 3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function drawPlatformPro(g, p, sy, time, opts = {}) {
  const spikeH = opts.spikeH || 14;
  const springPadHalf = opts.springPadHalf || 15;
  const springAnim = opts.springAnim || 0.3;
  const crumbleSec = opts.crumbleSec || 0.65;
  const worldW = opts.worldW || 360;
  const viewH = opts.viewH || 640;

  if (p.type === 'spike') {
    drawSpikeCluster(g, p, sy, spikeH);
    return;
  }

  // Rest platforms (obby)
  if (p.rest) {
    if (p.ground) {
      g.fillStyle = '#7c4d24';
      rr(g, p.x, sy, p.w, 28, 6); g.fill();
      g.fillStyle = '#4fd258';
      rr(g, p.x, sy, p.w, 10, 5); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      rr(g, p.x + 4, sy + 1.5, p.w - 8, 3, 1.5); g.fill();
      return;
    }
    const [c1, c2] = REST_COLORS[((p.section ?? -1) + 8) % REST_COLORS.length];
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
    g.fillStyle = 'rgba(255,255,255,0.48)';
    g.fillRect(p.x, sy, p.w, 4);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(p.x, sy + 14, p.w, 4);
    g.restore();
    g.strokeStyle = 'rgba(27,19,64,0.65)';
    g.lineWidth = 2;
    rr(g, p.x, sy, p.w, 18, 7); g.stroke();

    const cx = p.x + p.w / 2;
    if (p.feature === 'checkpoint') drawFlagPole(g, cx + 34, sy, time, !!p.reached, '#3ccf5a');
    else if (p.feature === 'goal') {
      drawFlagPole(g, cx - 30, sy, time, true, '#ffd23f');
      drawTrophyIcon(g, cx + 26, sy - 16, 28, time);
    }
    return;
  }

  // Full-width ground (jump)
  if (p.w >= worldW) {
    const dirt = g.createLinearGradient(0, sy, 0, sy + Math.min(120, viewH));
    dirt.addColorStop(0, '#8f5d2e');
    dirt.addColorStop(1, '#5e391a');
    g.fillStyle = dirt;
    g.fillRect(p.x, sy, p.w, viewH);
    g.fillStyle = '#4fd258';
    g.fillRect(p.x, sy, p.w, 11);
    g.fillStyle = '#8ef576';
    g.fillRect(p.x, sy, p.w, 3);
    g.fillStyle = '#2ea33a';
    for (let x = 8; x < p.w; x += 26) {
      g.beginPath();
      g.arc(x, sy + 11, 4, 0, Math.PI);
      g.fill();
    }
    return;
  }

  // Moving platform
  if (p.type === 'moving') {
    const grad = g.createLinearGradient(0, sy, 0, sy + 16);
    grad.addColorStop(0, '#44b9ff');
    grad.addColorStop(1, '#1d82c4');
    g.fillStyle = grad;
    rr(g, p.x, sy, p.w, 16, 8); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.42)';
    rr(g, p.x + 4, sy + 2, p.w - 8, 4.5, 2.5); g.fill();
    g.strokeStyle = '#124b78';
    g.lineWidth = 1.6;
    rr(g, p.x, sy, p.w, 16, 8); g.stroke();
    // vector directional arrows
    const cx = p.x + p.w / 2;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(cx - 12, sy + 8); g.lineTo(cx - 5, sy + 4.5); g.lineTo(cx - 5, sy + 11.5); g.closePath();
    g.moveTo(cx + 12, sy + 8); g.lineTo(cx + 5, sy + 4.5); g.lineTo(cx + 5, sy + 11.5); g.closePath();
    g.fill();
  } else if (p.surface === 'ice') {
    const grad = g.createLinearGradient(0, sy, 0, sy + 16);
    grad.addColorStop(0, '#eefaff');
    grad.addColorStop(0.5, '#a8e3ff');
    grad.addColorStop(1, '#6cc0ed');
    g.fillStyle = grad;
    rr(g, p.x, sy, p.w, 16, 8); g.fill();
    // glass specular bands
    g.save();
    rr(g, p.x, sy, p.w, 16, 8); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = p.x + 6; x < p.x + p.w - 6; x += 22) {
      g.beginPath();
      g.moveTo(x, sy + 16); g.lineTo(x + 7, sy); g.lineTo(x + 12, sy); g.lineTo(x + 5, sy + 16);
      g.closePath(); g.fill();
    }
    g.restore();
    g.strokeStyle = '#4c9ecc';
    g.lineWidth = 1.6;
    rr(g, p.x, sy, p.w, 16, 8); g.stroke();
    // tiny icicles under platform
    g.fillStyle = '#bdeaff';
    for (let x = p.x + 12; x < p.x + p.w - 10; x += 18) {
      g.beginPath();
      g.moveTo(x - 3, sy + 15.5); g.lineTo(x, sy + 21); g.lineTo(x + 3, sy + 15.5);
      g.closePath(); g.fill();
    }
  } else if (p.surface === 'conveyor') {
    g.fillStyle = '#3c424f';
    rr(g, p.x, sy, p.w, 16, 8); g.fill();
    g.fillStyle = '#626b7a';
    rr(g, p.x + 2, sy + 1.5, p.w - 4, 4, 2); g.fill();
    g.save();
    rr(g, p.x + 8, sy + 2.5, p.w - 16, 11, 4); g.clip();
    const dirn = p.belt >= 0 ? 1 : -1;
    const off = ((time * 28 * dirn) % 14 + 14) % 14;
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    for (let x = p.x - 14 + off; x < p.x + p.w + 14; x += 14) {
      g.beginPath();
      g.moveTo(x - 3 * dirn, sy + 4); g.lineTo(x + 3 * dirn, sy + 8); g.lineTo(x - 3 * dirn, sy + 12);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = '#1f232b';
    g.lineWidth = 1.5;
    rr(g, p.x, sy, p.w, 16, 8); g.stroke();
    // spinning side rollers
    for (const rx of [p.x + 7, p.x + p.w - 7]) {
      g.fillStyle = '#252932';
      g.beginPath(); g.arc(rx, sy + 8, 5.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#9aa4b8';
      g.lineWidth = 1.4;
      const ang = time * 5 * dirn;
      g.beginPath();
      g.moveTo(rx + Math.cos(ang) * 3.5, sy + 8 + Math.sin(ang) * 3.5);
      g.lineTo(rx - Math.cos(ang) * 3.5, sy + 8 - Math.sin(ang) * 3.5);
      g.stroke();
    }
  } else if (p.surface === 'crumble') {
    const t = p.crumbleT || 0;
    const frac = Math.min(1, t / crumbleSec);
    const sh = t > 0 ? Math.min(3.5, 1 + frac * 3) : 0;
    g.save();
    if (sh) g.translate(Math.sin(time * 72) * sh, Math.cos(time * 57) * sh * 0.6);
    g.fillStyle = frac > 0.35 ? '#874828' : '#9c6e46';
    rr(g, p.x, sy, p.w, 16, 6); g.fill();
    g.fillStyle = frac > 0.35 ? '#b37148' : '#c9a373';
    rr(g, p.x + 1, sy + 1, p.w - 2, 7.5, 4); g.fill();
    g.strokeStyle = '#472511';
    g.lineWidth = 1.7;
    for (let x = p.x + 12; x < p.x + p.w - 8; x += 22) {
      g.beginPath();
      g.moveTo(x, sy + 1);
      g.lineTo(x + 4, sy + 6);
      g.lineTo(x - 2, sy + 10);
      g.lineTo(x + 3, sy + 15);
      g.stroke();
    }
    g.strokeStyle = '#3b1e0d';
    g.lineWidth = 1.5;
    rr(g, p.x, sy, p.w, 16, 6); g.stroke();
    g.restore();
  } else {
    // normal / checkpoint grass platform
    const isCp = p.feature === 'checkpoint';
    g.fillStyle = '#855528';
    rr(g, p.x, sy, p.w, 16, 8); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)';
    rr(g, p.x + 2, sy + 10, p.w - 4, 5, 3); g.fill();
    g.fillStyle = isCp ? '#ffd23f' : '#4fd258';
    rr(g, p.x, sy, p.w, 9, 5); g.fill();
    g.fillStyle = isCp ? '#fff2a6' : '#8ef576';
    rr(g, p.x + 4, sy + 1.5, p.w - 8, 3, 1.5); g.fill();
    g.strokeStyle = 'rgba(27,19,64,0.58)';
    g.lineWidth = 1.5;
    rr(g, p.x, sy, p.w, 16, 8); g.stroke();
  }

  // Spring / checkpoint attachments
  const cx = p.x + p.w / 2;
  if (p.feature === 'spring') {
    const sq = p.springT > 0 ? p.springT / springAnim : 0;
    const h = 16 - 9 * sq;
    g.fillStyle = '#ffd23f';
    rr(g, cx - springPadHalf, sy - 3, springPadHalf * 2, 5, 2.5); g.fill();
    g.strokeStyle = '#5c3c00'; g.lineWidth = 1.2; g.stroke();

    const top = sy - 3 - h;
    // coil outline + shine
    for (const [col, lw] of [['#2b2f3a', 4.5], ['#dfe5f0', 2.4]]) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(cx - 9, sy - 3);
      for (let k = 0; k < 4; k++) {
        const y0 = sy - 3 - (h * k) / 4, y1 = sy - 3 - (h * (k + 1)) / 4;
        g.lineTo(cx + (k % 2 ? -9 : 9), y0 - (y0 - y1) * 0.5);
        g.lineTo(cx + (k % 2 ? 9 : -9), y1);
      }
      g.stroke();
    }
    g.fillStyle = '#ff4d6d';
    rr(g, cx - 14, top - 6, 28, 7, 3.5); g.fill();
    g.fillStyle = '#ffb3c0';
    rr(g, cx - 11, top - 5, 16, 2.4, 1); g.fill();
    g.strokeStyle = '#4a0c1a'; g.lineWidth = 1.4;
    rr(g, cx - 14, top - 6, 28, 7, 3.5); g.stroke();
  } else if (p.feature === 'checkpoint' && !p.rest) {
    drawFlagPole(g, cx, sy, time, !!p.reached, '#3ccf5a');
  }
}

export function drawPickupPro(g, it, sy, time, r = 14) {
  const y = sy + Math.sin(time * 3.2 + it.x * 0.1) * 4;
  g.save();
  if (it.type === 'energy') {
    safeRadialGlow(g, it.x, y, r * 1.75, 'rgba(255,215,64,0.5)', 'rgba(255,215,64,0)');
    const grad = g.createLinearGradient(it.x, y - r, it.x, y + r);
    grad.addColorStop(0, '#fff29c');
    grad.addColorStop(0.55, '#ffd23f');
    grad.addColorStop(1, '#f09b00');
    g.fillStyle = grad;
    g.beginPath(); g.arc(it.x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2.6;
    g.stroke();
    drawBoltIcon(g, it.x, y, r * 1.1, '#6b3e00');
  } else {
    safeRadialGlow(g, it.x, y, r * 1.8, 'rgba(139,92,246,0.52)', 'rgba(139,92,246,0)');
    const grad = g.createLinearGradient(it.x, y - r, it.x, y + r);
    grad.addColorStop(0, '#b394ff');
    grad.addColorStop(1, '#6d39e8');
    g.fillStyle = grad;
    rr(g, it.x - r, y - r, r * 2, r * 2, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    rr(g, it.x - r + 3, y - r + 2.5, r * 2 - 6, 5, 2.5); g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2.5;
    rr(g, it.x - r, y - r, r * 2, r * 2, 7); g.stroke();
    drawQuestionIcon(g, it.x, y, r * 1.05, '#ffffff');
  }
  g.restore();
}

export function createParticlePool(maxCount = 80) {
  const list = [];
  const push = (p) => {
    if (list.length >= maxCount) list.shift();
    list.push(p);
  };

  return {
    get count() { return list.length; },
    emitDust(x, y, count = 6, color = '#fff4e0') {
      for (let i = 0; i < count; i++) {
        const dir = i % 2 ? 1 : -1;
        push({
          kind: 'circle',
          x: x + dir * (3 + (i * 2.5)),
          y: y + 1,
          vx: dir * (22 + (i % 3) * 18),
          vy: 18 + (i % 4) * 12,
          grav: -80,
          r: 2.2 + (i % 3) * 0.8,
          life: 0.34,
          max: 0.34,
          color,
        });
      }
    },
    emitSparks(x, y, color = '#ffd23f', count = 8) {
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const spd = 45 + (i % 2) * 30;
        push({
          kind: 'spark',
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          grav: -60,
          r: 3.2,
          life: 0.42,
          max: 0.42,
          color,
        });
      }
    },
    emitChips(x, y, color = '#a67b52', count = 3) {
      for (let i = 0; i < count; i++) {
        push({
          kind: 'square',
          x: x + (i - 1) * 8,
          y: y - 4,
          vx: (i - 1) * 24,
          vy: -40 - i * 15,
          grav: -260,
          r: 2.4,
          life: 0.45,
          max: 0.45,
          color,
        });
      }
    },
    step(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    draw(g, toScreenY) {
      if (!list.length) return;
      g.save();
      for (const p of list) {
        const k = Math.max(0, p.life / p.max);
        const sy = toScreenY(p.y);
        g.globalAlpha = k;
        g.fillStyle = p.color;
        if (p.kind === 'square') {
          const s = p.r * (0.6 + 0.4 * k);
          g.fillRect(p.x - s, sy - s, s * 2, s * 2);
        } else if (p.kind === 'spark') {
          const r = p.r * k;
          g.beginPath();
          g.moveTo(p.x, sy - r * 1.4);
          g.lineTo(p.x + r * 0.6, sy);
          g.lineTo(p.x, sy + r * 1.4);
          g.lineTo(p.x - r * 0.6, sy);
          g.closePath();
          g.fill();
        } else {
          g.beginPath();
          g.arc(p.x, sy, p.r * (0.5 + 0.5 * k), 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    },
    clear() { list.length = 0; },
  };
}
