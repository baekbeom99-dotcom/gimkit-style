// 무한의 계단: casual-vector visual renderer (altitude themes, 3D windows, beveled stairs, expressive climber).
// Pure Canvas 2D helpers; safe with headless Proxy g2d test mocks.
import { rr, safeRadialGlow } from '../common/canvas-fx.js';

export const STAIRS_THEMES = [
  { name: '낮', startFloor: 0, wallA: [244, 232, 218], wallB: [236, 221, 205], trim: [198, 178, 158], skyTop: [125, 198, 255], skyBot: [210, 239, 255], litProb: 0, starAlpha: 0, hazeAlpha: 0.22 },
  { name: '노을', startFloor: 30, wallA: [234, 195, 184], wallB: [222, 178, 168], trim: [168, 125, 126], skyTop: [255, 130, 110], skyBot: [255, 204, 145], litProb: 0.25, starAlpha: 0.12, hazeAlpha: 0.18 },
  { name: '밤하늘', startFloor: 70, blend: 12, wallA: [46, 48, 92], wallB: [38, 40, 80], trim: [24, 24, 54], skyTop: [12, 16, 48], skyBot: [42, 42, 102], litProb: 0.65, starAlpha: 0.9, hazeAlpha: 0.1 },
  { name: '우주', startFloor: 120, blend: 14, wallA: [26, 20, 62], wallB: [20, 15, 50], trim: [68, 56, 132], skyTop: [6, 4, 20], skyBot: [34, 18, 72], litProb: 0.45, starAlpha: 1, hazeAlpha: 0.08 },
];

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = (c, a = 1) => (a >= 1
  ? `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`
  : `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`);

export function stairsThemeAt(floor) {
  const f = Number.isFinite(floor) ? Math.max(0, floor) : 0;
  let from = STAIRS_THEMES[0], to = STAIRS_THEMES[0], k = 0;
  for (let i = 1; i < STAIRS_THEMES.length; i++) {
    const w = STAIRS_THEMES[i].blend || 8;
    const lo = STAIRS_THEMES[i].startFloor - w / 2;
    if (f >= lo) {
      from = STAIRS_THEMES[i - 1];
      to = STAIRS_THEMES[i];
      k = Math.min(1, (f - lo) / w);
    }
  }
  return {
    name: k >= 0.5 ? to.name : from.name,
    wallA: lerp3(from.wallA, to.wallA, k),
    wallB: lerp3(from.wallB, to.wallB, k),
    trim: lerp3(from.trim, to.trim, k),
    skyTop: lerp3(from.skyTop, to.skyTop, k),
    skyBot: lerp3(from.skyBot, to.skyBot, k),
    litProb: lerp(from.litProb, to.litProb, k),
    starAlpha: lerp(from.starAlpha, to.starAlpha, k),
    hazeAlpha: lerp(from.hazeAlpha, to.hazeAlpha, k),
  };
}

function hash2(a, b) {
  let x = ((a * 374761393) ^ (b * 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function drawStairsBackground(g, W, H, camX, camY, floor, time = 0) {
  const th = stairsThemeAt(floor);
  g.save();
  g.fillStyle = rgb(th.wallA);
  g.fillRect(0, 0, W, H);

  const py = -camY * 0.45;
  const rowH = 72;
  const colW = 84;
  const offY = ((py % rowH) + rowH) % rowH;
  const offX = (((-camX * 0.45) % colW) + colW) % colW;

  for (let r = -1; r < H / rowH + 2; r++) {
    const y = r * rowH + offY;
    const idx = Math.round((y - py) / rowH);
    g.fillStyle = idx % 2 ? rgb(th.wallB) : rgb(th.wallA);
    g.fillRect(0, y, W, rowH - 3);
    // subtle horizontal mortar line
    g.fillStyle = rgb(th.trim, 0.35);
    g.fillRect(0, y + rowH - 3, W, 3);

    for (let c = -1; c < W / colW + 2; c++) {
      const x = c * colW + offX + 16;
      const colIdx = Math.round((x - offX) / colW);
      const hVal = hash2(idx, colIdx);
      const isPlaque = idx !== 0 && Math.abs(idx) % 4 === 0 && Math.abs(colIdx) % 3 === 1;

      if (isPlaque) {
        // decorative wall banner/emblem between windows
        g.fillStyle = rgb(th.trim, 0.65);
        rr(g, x + 6, y + 18, 30, 22, 6); g.fill();
        g.fillStyle = th.starAlpha > 0.4 ? '#3c366b' : '#ffffff';
        rr(g, x + 9, y + 21, 24, 16, 4); g.fill();
        g.fillStyle = '#ffd23f';
        g.beginPath(); g.arc(x + 21, y + 29, 3.5, 0, Math.PI * 2); g.fill();
        continue;
      }

      const winW = 38, winH = 38;
      // outer frame shadow
      g.fillStyle = 'rgba(15,10,38,0.16)';
      rr(g, x - 3, y + 10, winW + 6, winH + 8, 7); g.fill();
      // frame
      g.fillStyle = rgb(th.trim);
      rr(g, x - 3, y + 8, winW + 6, winH + 6, 7); g.fill();

      const lit = hVal < th.litProb;
      if (lit) {
        const glow = g.createLinearGradient(0, y + 11, 0, y + 11 + winH);
        glow.addColorStop(0, '#fff2a8');
        glow.addColorStop(1, '#ffc44d');
        g.fillStyle = glow;
      } else {
        const sky = g.createLinearGradient(0, y + 11, 0, y + 11 + winH);
        sky.addColorStop(0, rgb(th.skyTop));
        sky.addColorStop(1, rgb(th.skyBot));
        g.fillStyle = sky;
      }
      rr(g, x, y + 11, winW, winH, 5); g.fill();

      // stars or daytime cloud glint inside window
      if (!lit && th.starAlpha > 0.25) {
        g.fillStyle = `rgba(255,255,255,${(th.starAlpha * (0.6 + 0.4 * Math.sin(time * 2 + colIdx))).toFixed(2)})`;
        g.fillRect(x + 8, y + 18, 2, 2);
        g.fillRect(x + 27, y + 25, 2, 2);
        g.fillRect(x + 14, y + 34, 1.5, 1.5);
      } else if (!lit) {
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.beginPath();
        g.ellipse(x + 12, y + 24, 7, 3.5, 0, 0, Math.PI * 2);
        g.ellipse(x + 26, y + 32, 6, 3, 0, 0, Math.PI * 2);
        g.fill();
      }

      // window crossbars + glass shine
      g.fillStyle = 'rgba(255,255,255,0.24)';
      g.beginPath();
      g.moveTo(x + 3, y + 22); g.lineTo(x + 14, y + 11); g.lineTo(x + 20, y + 11); g.lineTo(x + 3, y + 28);
      g.closePath(); g.fill();

      g.fillStyle = rgb(th.trim);
      g.fillRect(x + winW / 2 - 1.5, y + 11, 3, winH);
      g.fillRect(x, y + 11 + winH * 0.55, winW, 2.5);

      // sill
      g.fillStyle = rgb(th.trim);
      rr(g, x - 5, y + 11 + winH, winW + 10, 5, 2.5); g.fill();
    }
  }

  // soft atmospheric haze
  g.fillStyle = th.starAlpha > 0.5
    ? `rgba(14,10,42,${th.hazeAlpha.toFixed(2)})`
    : `rgba(255,248,238,${th.hazeAlpha.toFixed(2)})`;
  g.fillRect(0, 0, W, H);
  g.restore();
}

const STAIR_COLORS = [
  { top: '#ff7a7a', side: '#c93b4b' },
  { top: '#59b4ff', side: '#2573bd' },
  { top: '#5ad973', side: '#2b9c43' },
  { top: '#ffd84d', side: '#cc9314' },
  { top: '#b89eff', side: '#7354c7' },
];

export function drawStairBlock(g, i, sx, sy, w = 56, h = 16, current = false, wrongFlash = 0) {
  const milestone = i > 0 && i % 10 === 0;
  const pal = milestone ? { top: '#ffe066', side: '#d48a00' } : STAIR_COLORS[i % STAIR_COLORS.length];
  const x = sx - w / 2;

  g.save();
  // contact drop shadow
  g.fillStyle = 'rgba(20,14,48,0.28)';
  rr(g, x + 3, sy + 4, w, h + 3, 6); g.fill();

  // 3D bottom lip (thickness)
  g.fillStyle = pal.side;
  rr(g, x, sy + 4, w, h, 6); g.fill();

  // main top face
  g.fillStyle = pal.top;
  rr(g, x, sy, w, h - 1, 6); g.fill();

  // top bevel highlight
  g.fillStyle = 'rgba(255,255,255,0.42)';
  rr(g, x + 4, sy + 2, w - 8, 3.5, 2); g.fill();

  // wrong step flash overlay
  if (wrongFlash > 0) {
    g.fillStyle = `rgba(255,45,65,${Math.min(0.75, wrongFlash * 1.8).toFixed(2)})`;
    rr(g, x, sy, w, h + 2, 6); g.fill();
  }

  // outline
  g.strokeStyle = wrongFlash > 0 ? '#ff2d43' : (milestone ? '#5c3800' : 'rgba(27,19,64,0.82)');
  g.lineWidth = current || milestone ? 2.2 : 1.8;
  rr(g, x, sy, w, h + 2, 6); g.stroke();

  if (current) {
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 1.8;
    rr(g, x + 2.5, sy + 2, w - 5, h - 4, 4); g.stroke();
  }

  if (milestone) {
    // golden floor tag
    g.fillStyle = '#3b2200';
    g.font = '900 10px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${i}F`, sx, sy + h / 2 + 0.5);
  }
  g.restore();
}

export function drawClimber(g, opts) {
  const {
    x, y, facing = 1, sq = 1, scx = 1, air = 0, time = 0, wrong = false, fast = false,
  } = opts;

  g.save();
  g.translate(x, y);

  // ground contact shadow (shrinks mid-hop)
  const sh = Math.max(0.45, 1 - air * 0.55);
  g.fillStyle = `rgba(20,14,48,${(0.28 * sh).toFixed(2)})`;
  g.beginPath();
  g.ellipse(0, 1, 13 * sh, 3.8 * sh, 0, 0, Math.PI * 2);
  g.fill();

  g.scale(scx, sq);

  // fluttering scarf tail behind neck
  const tailDir = -facing;
  const wave = Math.sin(time * 12) * 2.5 + air * 5;
  g.strokeStyle = '#ff4d6d';
  g.lineWidth = 4.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(tailDir * 4, -18);
  g.quadraticCurveTo(tailDir * 12, -19 + wave * 0.4, tailDir * 16, -13 + wave);
  g.stroke();
  g.strokeStyle = '#9e1934';
  g.lineWidth = 1.4;
  g.stroke();

  // stepping legs
  const legLift = air * 4;
  g.fillStyle = '#2b3670';
  g.strokeStyle = '#191432';
  g.lineWidth = 1.6;
  rr(g, -9, -7 - legLift * 0.6, 7.5, 7, 3); g.fill(); g.stroke();
  rr(g, 1.5, -7 + legLift * 0.2, 7.5, 7, 3); g.fill(); g.stroke();

  // shoes
  g.fillStyle = '#5c2d16';
  rr(g, -10 + (facing < 0 ? -1 : 0), -3 - legLift * 0.6, 9, 3.5, 1.5); g.fill();
  rr(g, 1 + (facing > 0 ? 1 : 0), -3 + legLift * 0.2, 9, 3.5, 1.5); g.fill();

  // torso jacket
  const jGrad = g.createLinearGradient(0, -21, 0, -6);
  jGrad.addColorStop(0, '#4dabf7');
  jGrad.addColorStop(1, '#2563eb');
  g.fillStyle = jGrad;
  rr(g, -10.5, -20.5, 21, 15, 6); g.fill();
  g.strokeStyle = '#191432';
  g.lineWidth = 1.8;
  g.stroke();

  // jacket highlight + scarf collar
  g.fillStyle = 'rgba(255,255,255,0.35)';
  rr(g, -7.5, -18.5, 10, 3, 1.5); g.fill();
  g.fillStyle = '#ff4d6d';
  rr(g, -9, -21, 18, 4, 2); g.fill();

  // arms swinging with hop
  const armSwing = air * 5;
  g.fillStyle = '#ffe0bd';
  g.strokeStyle = '#191432';
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(-11.5, -14 - armSwing, 3.2, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.arc(11.5, -14 + armSwing * 0.5, 3.2, 0, Math.PI * 2); g.fill(); g.stroke();

  // head
  g.fillStyle = '#ffe0bd';
  g.strokeStyle = '#191432';
  g.lineWidth = 1.8;
  g.beginPath(); g.arc(0, -29, 10.5, 0, Math.PI * 2); g.fill(); g.stroke();

  // rosy cheeks
  g.fillStyle = 'rgba(255,95,120,0.45)';
  g.beginPath();
  g.ellipse(-6 + facing * 1.5, -26, 2.2, 1.4, 0, 0, Math.PI * 2);
  g.ellipse(6 + facing * 1.5, -26, 2.2, 1.4, 0, 0, Math.PI * 2);
  g.fill();

  // eyes & mouth
  if (wrong) {
    g.strokeStyle = '#191432';
    g.lineWidth = 1.8;
    for (const ex of [-3.5 + facing * 1.5, 3.5 + facing * 1.5]) {
      g.beginPath();
      g.moveTo(ex - 2, -31); g.lineTo(ex + 2, -27);
      g.moveTo(ex + 2, -31); g.lineTo(ex - 2, -27);
      g.stroke();
    }
    // sweat drop
    g.fillStyle = '#60d5ff';
    g.beginPath(); g.arc(facing * -8, -32, 2.2, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = '#191432';
    const ex1 = -3 + facing * 2.2;
    const ex2 = 3.5 + facing * 2.2;
    g.beginPath();
    g.arc(ex1, -29, 1.7, 0, Math.PI * 2);
    g.arc(ex2, -29, 1.7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(ex1 - 0.5, -29.6, 0.6, 0, Math.PI * 2);
    g.arc(ex2 - 0.5, -29.6, 0.6, 0, Math.PI * 2);
    g.fill();

    // mouth
    g.strokeStyle = '#5c2d16';
    g.lineWidth = 1.4;
    if (fast) {
      g.fillStyle = '#b8324f';
      g.beginPath(); g.arc(facing * 2, -25.2, 2.5, 0, Math.PI); g.closePath(); g.fill();
    } else {
      g.beginPath(); g.arc(facing * 2, -25.5, 2, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
    }
  }

  // red explorer cap + visor brim
  g.fillStyle = '#e82545';
  g.strokeStyle = '#191432';
  g.lineWidth = 1.8;
  g.beginPath();
  g.arc(0, -31, 10.6, Math.PI, 0);
  g.closePath();
  g.fill(); g.stroke();

  // cap highlight
  g.fillStyle = '#ff6a82';
  rr(g, -6, -39.5, 7, 2.5, 1.2); g.fill();

  // visor brim pointing in facing direction
  g.fillStyle = '#b8142e';
  g.strokeStyle = '#191432';
  g.lineWidth = 1.5;
  rr(g, facing > 0 ? 1 : -13, -32.5, 12, 3.5, 1.8); g.fill(); g.stroke();

  g.restore();
}

export function drawTapHint(g, sx, sy, dir, time = 0) {
  const pulse = 0.65 + 0.35 * Math.sin(time * 5);
  const dx = dir === 'L' ? -24 : 24;
  g.save();
  g.globalAlpha = pulse;
  safeRadialGlow(g, sx + dx, sy - 14, 18, 'rgba(255,210,63,0.45)', 'rgba(255,210,63,0)');
  g.fillStyle = '#ffd23f';
  g.strokeStyle = '#191432';
  g.lineWidth = 2;
  const cx = sx + dx, cy = sy - 14;
  g.beginPath();
  if (dir === 'L') {
    g.moveTo(cx - 8, cy); g.lineTo(cx + 5, cy - 7); g.lineTo(cx + 5, cy + 7);
  } else {
    g.moveTo(cx + 8, cy); g.lineTo(cx - 5, cy - 7); g.lineTo(cx - 5, cy + 7);
  }
  g.closePath();
  g.fill(); g.stroke();
  g.restore();
}
