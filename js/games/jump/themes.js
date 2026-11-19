// Altitude-based background themes for the jump map.
const PX_PER_M = 40;
const BLEND_M = 6; // transition width in meters (centered on each boundary)

export const THEMES = [
  { name: '맑은 하늘', startMeters: 0, top: [120, 190, 255], mid: [165, 215, 255], bottom: [205, 236, 255], starAlpha: 0, cloudAlpha: 0.55, cloudColor: [255, 255, 255], glowAlpha: 0, moonAlpha: 0, nebulaAlpha: 0, planetAlpha: 0, shootAlpha: 0, horizonAlpha: 0, mountainAlpha: 0, auroraAlpha: 0, fireflyAlpha: 0 },
  { name: '노을', startMeters: 30, top: [255, 140, 110], mid: [255, 172, 125], bottom: [255, 205, 140], starAlpha: 0, cloudAlpha: 0.5, cloudColor: [255, 214, 190], glowAlpha: 1, moonAlpha: 0, nebulaAlpha: 0, planetAlpha: 0, shootAlpha: 0, horizonAlpha: 0, mountainAlpha: 0, auroraAlpha: 0, fireflyAlpha: 0 },
  { name: '밤하늘', startMeters: 70, blend: 10, top: [7, 10, 38], mid: [26, 30, 88], bottom: [66, 56, 128], starAlpha: 0.85, cloudAlpha: 0.38, cloudColor: [74, 84, 150], glowAlpha: 0, moonAlpha: 1, nebulaAlpha: 0, planetAlpha: 0, shootAlpha: 0.8, horizonAlpha: 1, mountainAlpha: 1, auroraAlpha: 1, fireflyAlpha: 1 },
  { name: '우주', startMeters: 120, blend: 12, top: [4, 2, 14], mid: [14, 7, 36], bottom: [30, 12, 56], starAlpha: 1, cloudAlpha: 0, cloudColor: [74, 84, 150], glowAlpha: 0, moonAlpha: 0, nebulaAlpha: 1, planetAlpha: 1, shootAlpha: 1, horizonAlpha: 0, mountainAlpha: 0, auroraAlpha: 0, fireflyAlpha: 0 },
];

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const NUM_KEYS = ['starAlpha', 'cloudAlpha', 'glowAlpha', 'moonAlpha', 'nebulaAlpha', 'planetAlpha', 'shootAlpha', 'horizonAlpha', 'mountainAlpha', 'auroraAlpha', 'fireflyAlpha'];

export function themeAt(meters) {
  const m = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  // find the boundary window (start-3 .. start+3) we are in, if any
  let from = THEMES[0], to = THEMES[0], k = 0;
  for (let i = 1; i < THEMES.length; i++) {
    const w = THEMES[i].blend || BLEND_M;
    const lo = THEMES[i].startMeters - w / 2;
    if (m >= lo) {
      from = THEMES[i - 1];
      to = THEMES[i];
      k = Math.min(1, (m - lo) / w);
    }
  }
  const out = {
    name: k >= 0.5 ? to.name : from.name,
    top: lerp3(from.top, to.top, k),
    mid: lerp3(from.mid, to.mid, k),
    bottom: lerp3(from.bottom, to.bottom, k),
    cloudColor: lerp3(from.cloudColor, to.cloudColor, k),
  };
  for (const key of NUM_KEYS) out[key] = lerp(from[key], to[key], k);
  return out;
}

function hash(n) {
  let x = (n | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const rgb = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const wrap = (v, r) => ((v % r) + r) % r;

const rgba3 = (r, g2, b, a) => `rgba(${r},${g2},${b},${a.toFixed(3)})`;

// soft radial glow; falls back to stacked translucent circles when radial gradients are unavailable
function glow(g, x, y, r, c, a) {
  let rg = null;
  if (typeof g.createRadialGradient === 'function') rg = g.createRadialGradient(x, y, 0, x, y, r);
  if (rg && typeof rg.addColorStop === 'function') {
    rg.addColorStop(0, `rgba(${c},${a})`);
    rg.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    return;
  }
  for (let s = 0; s < 4; s++) {
    g.fillStyle = `rgba(${c},${(a * 0.3).toFixed(3)})`;
    g.beginPath();
    g.arc(x, y, r * (1 - s * 0.22), 0, Math.PI * 2);
    g.fill();
  }
}

function mountains(g, W, H, seed, baseY, amp, color, alpha, shift) {
  g.fillStyle = rgb(color, alpha);
  g.beginPath();
  g.moveTo(-10, H + 2);
  const step = 34;
  for (let x = -10, i = 0; x <= W + step; x += step, i++) {
    const n = hash(seed + ((i + Math.floor(shift / step)) | 0));
    g.lineTo(x - (shift % step), baseY - n * amp);
  }
  g.lineTo(W + 10, H + 2);
  g.closePath();
  g.fill();
}

export function drawBackground(g, W, H, camY, time = 0) {
  const meters = (camY + H / 2) / PX_PER_M;
  const th = themeAt(meters);

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, rgb(th.top, 1));
  grad.addColorStop(0.55, rgb(th.mid, 1));
  grad.addColorStop(1, rgb(th.bottom, 1));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // nebula blobs (space), slow drift
  if (th.nebulaAlpha > 0.01) {
    const cols = [[120, 60, 190], [50, 80, 190], [190, 60, 140]];
    for (let n = 0; n < 3; n++) {
      const cx = wrap(hash(n + 50) * W + time * (2 + n), W + 200) - 100;
      const cy = H - wrap(hash(n + 60) * H + camY * 0.04, H + 200) + 100;
      g.fillStyle = rgb(cols[n], 0.07 * th.nebulaAlpha);
      for (let s = 0; s < 3; s++) {
        g.beginPath();
        g.ellipse(cx, cy, 130 - s * 30, 70 - s * 15, n, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // sunset glow near the bottom
  if (th.glowAlpha > 0.01) {
    const sy = H * 0.82 + wrap(camY * 0.02, 40);
    glow(g, W * 0.72, sy, 140, '255,200,130', 0.5 * th.glowAlpha);
    g.fillStyle = `rgba(255,248,210,${0.85 * th.glowAlpha})`;
    g.beginPath();
    g.arc(W * 0.72, sy, 26, 0, Math.PI * 2);
    g.fill();
  }

  // night horizon glow: teal -> magenta band at the bottom
  if (th.horizonAlpha > 0.01) {
    const hg = g.createLinearGradient(0, H * 0.45, 0, H);
    hg.addColorStop(0, 'rgba(80,60,170,0)');
    hg.addColorStop(0.6, rgba3(200, 70, 150, 0.2 * th.horizonAlpha));
    hg.addColorStop(1, rgba3(60, 200, 200, 0.26 * th.horizonAlpha));
    g.fillStyle = hg;
    g.fillRect(0, H * 0.45, W, H * 0.55);
  }

  // aurora ribbons
  if (th.auroraAlpha > 0.01) {
    for (let n = 0; n < 2; n++) {
      const y0 = H * (0.36 + n * 0.14) + wrap(camY * 0.03, 20);
      const sh = Math.sin(time * 0.25 + n * 2) * 18;
      const ag = g.createLinearGradient(0, y0 - 40, 0, y0 + 50);
      ag.addColorStop(0, 'rgba(90,255,200,0)');
      ag.addColorStop(0.5, rgba3(n ? 150 : 90, n ? 120 : 255, n ? 255 : 190, 0.09 * th.auroraAlpha));
      ag.addColorStop(1, 'rgba(90,255,200,0)');
      g.fillStyle = ag;
      g.beginPath();
      g.moveTo(0, y0);
      g.bezierCurveTo(W * 0.3, y0 - 40 + sh, W * 0.6, y0 + 40 - sh, W, y0 - 10 + sh);
      g.lineTo(W, y0 + 50);
      g.bezierCurveTo(W * 0.6, y0 + 90 - sh, W * 0.3, y0 + 10 + sh, 0, y0 + 50);
      g.closePath();
      g.fill();
    }
  }

  // stars: 3 parallax layers (far / mid / near) + 4-point sparkles
  if (th.starAlpha > 0.01) {
    const span = H + 20;
    const layers = [[26, 1, 0.02], [16, 2, 0.05], [8, 2, 0.09]];
    let id = 0;
    for (let L = 0; L < 3; L++) {
      const [cnt, size, par] = layers[L];
      for (let n = 0; n < cnt; n++, id++) {
        const sx = hash(id * 3 + 1) * W;
        const sy = H - wrap(hash(id * 3 + 3) * span + camY * par, span);
        const tw = 0.5 + 0.5 * Math.sin(time * (1 + hash(id + 200) * 2.5) + id * 1.7);
        const warm = hash(id + 500) > 0.7;
        g.fillStyle = `rgba(${warm ? '255,236,200' : '225,235,255'},${(th.starAlpha * (L === 0 ? 0.35 + 0.35 * tw : 0.55 + 0.45 * tw)).toFixed(3)})`;
        g.fillRect(sx, sy, size, size);
      }
    }
    for (let n = 0; n < 5; n++) {
      const sx = hash(n + 700) * (W - 20) + 10;
      const sy = H - wrap(hash(n + 710) * span + camY * 0.07, span);
      const tw = Math.max(0, Math.sin(time * 1.3 + n * 2.1));
      const L = 3 + tw * 4;
      g.fillStyle = `rgba(255,250,230,${(th.starAlpha * (0.35 + 0.6 * tw)).toFixed(3)})`;
      g.fillRect(sx - L, sy, L * 2 + 1, 1);
      g.fillRect(sx, sy - L, 1, L * 2 + 1);
    }
    if (th.nebulaAlpha > 0.01) {
      // dense extra stars in space
      g.fillStyle = `rgba(255,255,255,${(0.7 * th.nebulaAlpha).toFixed(3)})`;
      for (let n = 0; n < 14; n++) {
        g.fillRect(hash(n + 800) * W, H - wrap(hash(n + 810) * span + camY * 0.03, span), 1, 1);
      }
    }
  }

  // moon with halo, craters and rim light
  if (th.moonAlpha > 0.01) {
    const mx = W * 0.74, my = H * 0.2 + wrap(camY * 0.01, 30);
    glow(g, mx, my, 90, '190,200,255', 0.3 * th.moonAlpha);
    g.fillStyle = `rgba(150,160,210,${0.16 * th.moonAlpha})`;
    g.beginPath();
    g.arc(mx, my, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(255,246,210,${0.95 * th.moonAlpha})`;
    g.beginPath();
    g.arc(mx, my, 30, 0, Math.PI * 2);
    g.moveTo(mx + 40, my - 6);
    g.arc(mx + 13, my - 6, 25, 0, Math.PI * 2, true);
    g.fill();
    g.fillStyle = `rgba(200,180,140,${0.35 * th.moonAlpha})`;
    g.beginPath(); g.arc(mx - 20, my + 6, 3.5, 0, Math.PI * 2); g.arc(mx - 12, my + 18, 2.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(255,255,255,${0.8 * th.moonAlpha})`;
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(mx, my, 30, Math.PI * 0.55, Math.PI * 1.45); g.stroke();
    g.lineWidth = 1;
  }

  // ringed planet
  if (th.planetAlpha > 0.01) {
    const px = W * 0.25, py = H * 0.28 + wrap(camY * 0.02, 20);
    g.fillStyle = `rgba(150,110,210,${0.8 * th.planetAlpha})`;
    g.beginPath();
    g.arc(px, py, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(90,60,150,${0.35 * th.planetAlpha})`;
    g.beginPath();
    g.arc(px + 8, py + 6, 20, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(230,205,255,${0.65 * th.planetAlpha})`;
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(px, py, 44, 11, -0.4, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1;
  }

  // shooting stars: deterministic from time (one per ~5s, visible ~0.9s, fading tail)
  if (th.shootAlpha > 0.01) {
    const period = 5;
    const phase = (time % period) / 0.9;
    if (phase < 1) {
      const seed = Math.floor(time / period);
      const x0 = hash(seed + 400) * W * 0.8 + W * 0.2, y0 = hash(seed + 401) * H * 0.35;
      const x = x0 - phase * 150, y = y0 + phase * 75;
      const a = (1 - phase) * th.shootAlpha;
      g.lineCap = 'round';
      g.strokeStyle = `rgba(255,255,255,${(a * 0.35).toFixed(3)})`;
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 52, y - 26); g.stroke();
      g.strokeStyle = `rgba(255,255,255,${(a * 0.95).toFixed(3)})`;
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30, y - 15); g.stroke();
      g.lineWidth = 1;
      g.lineCap = 'butt';
    }
  }

  // clouds (parallax, slow drift; moonlit edge at night)
  if (th.cloudAlpha > 0.01) {
    const range = H + 120;
    for (let n = 0; n < 6; n++) {
      const cy = wrap(n * 170 + camY * 0.25, range) - 60;
      const cx = wrap(n * 143 + time * (3 + n), W + 120) - 60;
      g.fillStyle = rgb(th.cloudColor, th.cloudAlpha);
      g.beginPath();
      g.ellipse(cx, H - cy, 46, 16, 0, 0, Math.PI * 2);
      g.ellipse(cx + 26, H - cy - 8, 28, 14, 0, 0, Math.PI * 2);
      g.fill();
      if (th.moonAlpha > 0.05 && n % 2 === 0) {
        g.strokeStyle = `rgba(200,210,255,${(0.35 * th.moonAlpha).toFixed(3)})`;
        g.beginPath();
        g.ellipse(cx + 26, H - cy - 8, 28, 14, 0, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      }
    }
  }

  // far mountain silhouettes + fireflies (fade out with height)
  if (th.mountainAlpha > 0.01) {
    const a = th.mountainAlpha;
    mountains(g, W, H, 900, H * 0.93, 46, [40, 36, 96], 0.55 * a, time * 0.8);
    mountains(g, W, H, 950, H * 0.98, 34, [14, 16, 52], 0.7 * a, time * 1.6);
  }
  if (th.fireflyAlpha > 0.01) {
    for (let n = 0; n < 6; n++) {
      const fx = hash(n + 1000) * W + Math.sin(time * 0.6 + n) * 12;
      const fy = H * (0.72 + hash(n + 1010) * 0.2) + Math.cos(time * 0.5 + n * 1.3) * 8;
      const tw = Math.max(0, Math.sin(time * 1.8 + n * 2.3));
      g.fillStyle = `rgba(255,240,150,${(0.7 * tw * th.fireflyAlpha).toFixed(3)})`;
      g.fillRect(fx, fy, 2, 2);
    }
  }

  // subtle vignette at the top
  if (th.starAlpha > 0.01) {
    const vg = g.createLinearGradient(0, 0, 0, H * 0.25);
    vg.addColorStop(0, `rgba(0,0,12,${(0.28 * th.starAlpha).toFixed(3)})`);
    vg.addColorStop(1, 'rgba(0,0,12,0)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H * 0.25);
  }
}
