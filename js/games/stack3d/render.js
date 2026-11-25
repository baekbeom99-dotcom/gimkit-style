// 3D 탑쌓기: casual-vector isometric visual renderer (graded slabs, island & ocean, natural clouds, review crown).
// Pure Canvas 2D helpers; safe with headless Proxy g2d test mocks.
import { safeRadialGlow } from '../common/canvas-fx.js';

function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0].sx, pts[0].sy);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].sx, pts[i].sy);
  g.closePath();
}

// Single-contour flat-bottomed cumulus cloud with soft top-to-bottom shading (no overlapping alpha seams).
function drawCumulusCloud(g, cx, cy, r, alpha, bottomColor) {
  const s = r;
  const topY = cy - s * 0.68;
  const botY = cy + s * 0.28;

  g.save();
  g.globalAlpha = alpha;
  const gr = g.createLinearGradient(0, topY, 0, botY);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.68, '#f6faff');
  gr.addColorStop(1, bottomColor);
  g.fillStyle = gr;

  g.beginPath();
  g.moveTo(cx - s * 1.15, botY);
  g.bezierCurveTo(cx - s * 1.48, botY, cx - s * 1.48, cy - s * 0.12, cx - s * 1.05, cy - s * 0.16);
  g.bezierCurveTo(cx - s * 0.98, cy - s * 0.56, cx - s * 0.48, cy - s * 0.62, cx - s * 0.28, cy - s * 0.42);
  g.bezierCurveTo(cx - s * 0.08, cy - s * 0.86, cx + s * 0.56, cy - s * 0.78, cx + s * 0.62, cy - s * 0.32);
  g.bezierCurveTo(cx + s * 0.98, cy - s * 0.36, cx + s * 1.28, cy - s * 0.08, cx + s * 1.16, botY);
  g.quadraticCurveTo(cx, botY + s * 0.08, cx - s * 1.15, botY);
  g.closePath();
  g.fill();
  g.restore();
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

  // dreamy soft cumulus clouds
  const span = H + 260;
  const cloudAlpha = Math.max(0.24, 0.68 - alt * 0.34);
  const bottomTint = alt > 0.45 ? '#b9b4e6' : '#d6eaff';
  for (const c of clouds) {
    const cy = ((c.y + camY * K * c.par) % span + span) % span - 130;
    drawCumulusCloud(g, c.x, cy, c.r * 0.92, cloudAlpha, bottomTint);
  }
  g.restore();
}

function drawIsoPrism(g, cx, cz, w, d, yBot, yTop, P, colors) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;
  poly(g, [P(x1, z0, yTop), P(x1, z1, yTop), P(x1, z1, yBot), P(x1, z0, yBot)]);
  g.fillStyle = colors.right;
  g.fill();

  poly(g, [P(x0, z1, yTop), P(x1, z1, yTop), P(x1, z1, yBot), P(x0, z1, yBot)]);
  g.fillStyle = colors.left;
  g.fill();

  poly(g, [P(x0, z0, yTop), P(x1, z0, yTop), P(x1, z1, yTop), P(x0, z1, yTop)]);
  g.fillStyle = colors.top;
  g.fill();
}

function drawPalmTree(g, P, x, z, yBase, scale, time) {
  const b = P(x, z, yBase);
  const sway = Math.sin(time * 1.8 + x) * 2.5 * scale;
  const tx = b.sx + 4 * scale + sway * 0.4;
  const ty = b.sy - 26 * scale;

  g.save();
  // trunk
  g.strokeStyle = '#7c4a21';
  g.lineWidth = Math.max(2, 4.2 * scale);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(b.sx, b.sy);
  g.quadraticCurveTo(b.sx + 5 * scale, b.sy - 13 * scale, tx, ty);
  g.stroke();

  // leafy palm fronds
  const fronds = [[-14, -4], [-11, 5], [14, -4], [11, 5], [0, -10]];
  for (const [fx, fy] of fronds) {
    g.fillStyle = fy < 0 ? '#34d399' : '#16a34a';
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + fx * 0.65 * scale + sway * 0.4, ty + (fy - 6) * scale, tx + fx * scale + sway, ty + fy * scale);
    g.quadraticCurveTo(tx + fx * 0.5 * scale, ty + (fy + 2) * scale, tx, ty + 1.5 * scale);
    g.closePath();
    g.fill();
  }
  g.restore();
}

function drawBush(g, P, x, z, yBase, scale) {
  const b = P(x, z, yBase);
  g.save();
  g.fillStyle = '#15803d';
  g.beginPath();
  g.arc(b.sx - 4 * scale, b.sy - 2 * scale, 5.5 * scale, 0, Math.PI * 2);
  g.arc(b.sx + 4 * scale, b.sy - 2 * scale, 5 * scale, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4ade80';
  g.beginPath();
  g.arc(b.sx, b.sy - 5.5 * scale, 6.2 * scale, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function drawIslandAndSea(g, baseSlab, P, W, H, time = 0, vk = 0.57) {
  const waterY = -22;
  const center = P(baseSlab.cx, baseSlab.cz, waterY);
  if (center.sy < -80 || center.sy > H + 260) return;

  g.save();
  // 1. Surrounding ocean horizon & water gradient
  const seaTop = center.sy - 135;
  const blendH = 38;
  const seaGr = g.createLinearGradient(0, seaTop, 0, H + 20);
  seaGr.addColorStop(0, 'rgba(56,189,248,0)');
  seaGr.addColorStop(Math.min(0.28, blendH / Math.max(80, H - seaTop)), 'rgba(56,189,248,0.88)');
  seaGr.addColorStop(0.55, '#0284c7');
  seaGr.addColorStop(1, '#0369a1');
  g.fillStyle = seaGr;
  g.fillRect(-10, seaTop, W + 20, Math.max(0, H - seaTop + 20));

  // subtle animated wave glints on the ocean surface
  g.strokeStyle = 'rgba(224,247,255,0.42)';
  g.lineWidth = 2;
  g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const wy = seaTop + 34 + (i * 29) % 190;
    if (wy > H + 10) continue;
    const wx = ((i * 89 + Math.sin(time * 1.3 + i) * 14) % (W - 30)) + 15;
    const len = 14 + (i % 3) * 8;
    g.globalAlpha = 0.25 + 0.2 * Math.sin(time * 2 + i * 1.7);
    g.beginPath();
    g.moveTo(wx, wy);
    g.lineTo(wx + len, wy);
    g.stroke();
  }
  g.globalAlpha = 1;

  // 2. Animated seafoam diamond hugging the island shoreline
  const foamPad = 14 + Math.sin(time * 2.4) * 4;
  const fw = 330 + foamPad * 2, fd = 330 + foamPad * 2;
  const fx0 = baseSlab.cx - fw / 2, fx1 = baseSlab.cx + fw / 2;
  const fz0 = baseSlab.cz - fd / 2, fz1 = baseSlab.cz + fd / 2;
  g.fillStyle = 'rgba(255,255,255,0.45)';
  poly(g, [P(fx0, fz0, waterY), P(fx1, fz0, waterY), P(fx1, fz1, waterY), P(fx0, fz1, waterY)]);
  g.fill();

  // 3. Sandy shoreline terrace
  drawIsoPrism(g, baseSlab.cx, baseSlab.cz, 330, 330, waterY, -11, P, {
    top: '#fde68a',
    left: '#fbbf24',
    right: '#d97706',
  });

  // 4. Lush grassy island plateau
  drawIsoPrism(g, baseSlab.cx, baseSlab.cz, 268, 268, -11, 0, P, {
    top: '#6ee787',
    left: '#22c55e',
    right: '#15803d',
  });

  // crisp sunlit rim on the grass edge
  const gx0 = baseSlab.cx - 134, gx1 = baseSlab.cx + 134;
  const gz0 = baseSlab.cz - 134, gz1 = baseSlab.cz + 134;
  const gL = P(gx0, gz1, 0), gF = P(gx1, gz1, 0), gR = P(gx1, gz0, 0);
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(gL.sx, gL.sy); g.lineTo(gF.sx, gF.sy); g.lineTo(gR.sx, gR.sy); g.stroke();

  // 5. Contact shadow under the tower base
  const bx0 = baseSlab.cx - baseSlab.w / 2 - 5, bx1 = baseSlab.cx + baseSlab.w / 2 + 5;
  const bz0 = baseSlab.cz - baseSlab.d / 2 - 5, bz1 = baseSlab.cz + baseSlab.d / 2 + 5;
  g.fillStyle = 'rgba(10,45,20,0.22)';
  poly(g, [P(bx0, bz0, 0), P(bx1, bz0, 0), P(bx1, bz1, 0), P(bx0, bz1, 0)]);
  g.fill();

  // 6. Island trees/bushes placed safely on the outer diagonal corners (outside moving slab paths)
  const sc = vk / 0.57;
  drawPalmTree(g, P, baseSlab.cx - 114, baseSlab.cz + 112, 0, sc, time);
  drawBush(g, P, baseSlab.cx + 114, baseSlab.cz - 112, 0, sc);
  drawBush(g, P, baseSlab.cx + 116, baseSlab.cz + 112, 0, sc * 0.85);
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
