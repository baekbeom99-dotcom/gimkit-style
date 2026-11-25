// 3D 탑쌓기: casual-vector isometric visual renderer (graded slabs, pedestal, volumetric clouds, review crown).
// Pure Canvas 2D helpers; safe with headless Proxy g2d test mocks.
import { safeRadialGlow } from '../common/canvas-fx.js';

function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0].sx, pts[0].sy);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].sx, pts[i].sy);
  g.closePath();
}

export function drawStackBackground(g, W, H, camY, bgHue, floors, clouds, time = 0, K = 0.57) {
  const h = ((bgHue % 360) + 360) % 360;
  const alt = Math.min(1, Math.max(0, floors / 45));
  const topL = 82 - alt * 44; // 82% pastel -> 38% deep twilight
  const botL = 93 - alt * 35; // 93% -> 58%
  const sat = 40 + alt * 18;

  g.save();
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, `hsl(${h},${sat}%,${topL}%)`);
  gr.addColorStop(1, `hsl(${(h + 28) % 360},${sat}%,${botL}%)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);

  // subtle stars as tower climbs high
  if (alt > 0.2) {
    const sa = Math.min(0.85, (alt - 0.2) / 0.8);
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 73 + 29) % (W - 20)) + 10;
      const sy = ((i * 137 + 19) % Math.round(H * 0.65)) + 12;
      const tw = 0.45 + 0.55 * Math.sin(time * 2.1 + i * 1.4);
      g.fillStyle = `rgba(255,252,230,${(sa * tw).toFixed(3)})`;
      g.fillRect(sx, sy, i % 3 === 0 ? 2 : 1.5, i % 3 === 0 ? 2 : 1.5);
    }
  }

  // multi-lobe volumetric clouds
  const span = H + 260;
  const cloudAlpha = 0.34 - alt * 0.14;
  for (const c of clouds) {
    const cy = ((c.y + camY * K * c.par) % span + span) % span - 130;
    const rx = c.r * 1.15;
    const ry = c.r * 0.55;
    g.fillStyle = `rgba(210,220,255,${(cloudAlpha * 0.6).toFixed(3)})`;
    g.beginPath();
    g.ellipse(c.x, cy + 5, rx * 1.15, ry * 0.9, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = `rgba(255,255,255,${cloudAlpha.toFixed(3)})`;
    g.beginPath();
    g.ellipse(c.x - rx * 0.45, cy + 1, rx * 0.62, ry * 0.75, 0, 0, Math.PI * 2);
    g.ellipse(c.x + rx * 0.42, cy + 2, rx * 0.58, ry * 0.7, 0, 0, Math.PI * 2);
    g.ellipse(c.x, cy - ry * 0.22, rx * 0.78, ry * 0.92, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function drawPedestal(g, baseSlab, P, hue) {
  const x0 = baseSlab.cx - baseSlab.w / 2, x1 = baseSlab.cx + baseSlab.w / 2;
  const z0 = baseSlab.cz - baseSlab.d / 2, z1 = baseSlab.cz + baseSlab.d / 2;
  const yTop = 0, yBot = -460;

  g.save();
  // right face gradient fading deep downward
  const pRT = P(x1, z0, yTop), pRB = P(x1, z1, yBot);
  const grR = g.createLinearGradient(pRT.sx, pRT.sy, pRT.sx, pRB.sy);
  grR.addColorStop(0, `hsl(${hue},52%,42%)`);
  grR.addColorStop(1, `hsl(${hue},44%,22%)`);
  poly(g, [P(x1, z0, yTop), P(x1, z1, yTop), P(x1, z1, yBot), P(x1, z0, yBot)]);
  g.fillStyle = grR;
  g.fill();

  // left face gradient
  const grL = g.createLinearGradient(pRT.sx, pRT.sy, pRT.sx, pRB.sy);
  grL.addColorStop(0, `hsl(${hue},52%,52%)`);
  grL.addColorStop(1, `hsl(${hue},44%,28%)`);
  poly(g, [P(x0, z1, yTop), P(x1, z1, yTop), P(x1, z1, yBot), P(x0, z1, yBot)]);
  g.fillStyle = grL;
  g.fill();
  g.restore();
}

export function drawSlabPro(g, s, y0, slabH, hue, P, vk = 0.57, opts = {}) {
  const { alpha = 1, flash = 0, regrow = 0 } = opts;
  const x0 = s.cx - s.w / 2, x1 = s.cx + s.w / 2, z0 = s.cz - s.d / 2, z1 = s.cz + s.d / 2;
  const y1 = y0 + slabH;

  g.save();
  if (alpha < 1) g.globalAlpha = Math.max(0, alpha);

  // right face (shaded)
  const prTop = P(x1, z0, y1), prBot = P(x1, z1, y0);
  const grR = g.createLinearGradient(prTop.sx, prTop.sy, prBot.sx, prBot.sy);
  grR.addColorStop(0, `hsl(${hue},70%,52%)`);
  grR.addColorStop(1, `hsl(${hue},68%,42%)`);
  poly(g, [P(x1, z0, y1), P(x1, z1, y1), P(x1, z1, y0), P(x1, z0, y0)]);
  g.fillStyle = grR;
  g.fill();

  // left face (midtone)
  const plTop = P(x0, z1, y1), plBot = P(x1, z1, y0);
  const grL = g.createLinearGradient(plTop.sx, plTop.sy, plBot.sx, plBot.sy);
  grL.addColorStop(0, `hsl(${hue},70%,64%)`);
  grL.addColorStop(1, `hsl(${hue},66%,53%)`);
  poly(g, [P(x0, z1, y1), P(x1, z1, y1), P(x1, z1, y0), P(x0, z1, y0)]);
  g.fillStyle = grL;
  g.fill();

  // top face (bright with diagonal light)
  const pt0 = P(x0, z0, y1), pt1 = P(x1, z1, y1);
  const topL = Math.min(96, 76 + flash * 20);
  const topL2 = Math.min(92, 68 + flash * 22);
  const grT = g.createLinearGradient(pt0.sx, pt0.sy, pt1.sx, pt1.sy);
  grT.addColorStop(0, `hsl(${hue},78%,${topL}%)`);
  grT.addColorStop(1, `hsl(${hue},70%,${topL2}%)`);
  poly(g, [P(x0, z0, y1), P(x1, z0, y1), P(x1, z1, y1), P(x0, z1, y1)]);
  g.fillStyle = grT;
  g.fill();

  if (vk > 0.2) {
    // subtle edge stroke + bright top front ridge highlight
    g.strokeStyle = `hsla(${hue},55%,32%,0.28)`;
    g.lineWidth = 1;
    g.stroke();

    const pL = P(x0, z1, y1), pF = P(x1, z1, y1), pR = P(x1, z0, y1);
    g.strokeStyle = `rgba(255,255,255,${(0.45 + flash * 0.45).toFixed(2)})`;
    g.lineWidth = 1.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(pL.sx, pL.sy);
    g.lineTo(pF.sx, pF.sy);
    g.lineTo(pR.sx, pR.sy);
    g.stroke();
  }

  if (regrow > 0) {
    g.strokeStyle = `rgba(255,224,102,${(regrow * 0.9).toFixed(2)})`;
    g.lineWidth = 3;
    poly(g, [P(x0, z0, y1), P(x1, z0, y1), P(x1, z1, y1), P(x0, z1, y1)]);
    g.stroke();
  }
  g.restore();
}

export function drawMovingShadow(g, prevSlab, movingSlab, yTop, P) {
  const loX = Math.max(prevSlab.cx - prevSlab.w / 2, movingSlab.cx - movingSlab.w / 2);
  const hiX = Math.min(prevSlab.cx + prevSlab.w / 2, movingSlab.cx + movingSlab.w / 2);
  const loZ = Math.max(prevSlab.cz - prevSlab.d / 2, movingSlab.cz - movingSlab.d / 2);
  const hiZ = Math.min(prevSlab.cz + prevSlab.d / 2, movingSlab.cz + movingSlab.d / 2);
  if (hiX <= loX || hiZ <= loZ) return;

  g.save();
  g.fillStyle = 'rgba(15,10,38,0.16)';
  poly(g, [P(loX, loZ, yTop), P(hiX, loZ, yTop), P(hiX, hiZ, yTop), P(loX, hiZ, yTop)]);
  g.fill();
  g.restore();
}

export function drawReviewCrown(g, topSlab, topY, P, time) {
  const c = P(topSlab.cx, topSlab.cz, topY);
  const bob = Math.sin(time * 3) * 4;
  const cx = c.sx, cy = c.sy - 26 + bob;
  g.save();
  safeRadialGlow(g, cx, cy, 22, 'rgba(255,215,64,0.5)', 'rgba(255,215,64,0)');
  g.fillStyle = '#ffd23f';
  g.strokeStyle = '#3b2200';
  g.lineWidth = 1.8;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(cx - 12, cy + 7);
  g.lineTo(cx - 14, cy - 6);
  g.lineTo(cx - 6, cy + 1);
  g.lineTo(cx, cy - 9);
  g.lineTo(cx + 6, cy + 1);
  g.lineTo(cx + 14, cy - 6);
  g.lineTo(cx + 12, cy + 7);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(cx, cy - 11, 2.2, 0, Math.PI * 2); g.fill();
  g.restore();
}

export function drawTapPrompt(g, cssW, cssH, time) {
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 34px sans-serif';
  g.globalAlpha = 0.35 + 0.25 * Math.sin(time * 5);
  g.fillStyle = '#ffffff';
  g.fillText('TAP!', cssW / 2, cssH - 130);
  g.restore();
}
