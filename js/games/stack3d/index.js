import {
  SLAB_H, createBase, movingAt, place, hueFor, speedFor, axisFor, project, ISO_X, ISO_Y,
  sparkleAt, sparkleDone, fitView,
} from './logic.js';

const K = 0.57;            // 월드 -> 화면 배율 (바닥 200 -> 약 195px)
const CAM_Y_FRAC = 0.58;   // 맨 위 층이 화면 높이의 58% 지점
const SETTLE_SEC = 0.28;   // 안착 후 다음 블록까지
const MISS_SEC = 0.75;
const END_SEC = 1.0;
const TAP_GUARD = 0.12;    // 새 블록이 나온 직후 오탭 무시
const GRAVITY = 1500;
const DEBRIS_LIFE = 1.1;
const RING_SEC = 0.55;
const TOAST_SEC = 0.8;
const MAX_DRAW_LAYERS = 30;
const REVIEW_ZOOM_SEC = 1.4;
const REVIEW_PAD = { top: 172, bottom: 130, side: 24 }; // CSS px
const ZERO = { x: 0, z: 0, y: 0 };
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}

export default {
  id: 'stack3d',
  title: '3D 탑쌓기',
  icon: '🧊',
  controls: 'tap',
  fullscreen: true,
  energyMax: 20,
  energyGainMultiplier: 2,
  create(ctx) {
    const { g2d: g, width: W, height: H } = ctx;
    const rng = ctx.rng || Math.random;
    const baseHue = Math.floor(rng() * 360);

    let stack;          // [{ slab, hue, flash }]
    let state;          // 'moving' | 'settle' | 'quiz' | 'over'
    let mt, time, combo, settleT, pendingEnd, ended, destroyed, tapped;
    let debris, rings, toasts, clouds;
    let cam, bgHue, off = null, timeScale = 1;
    let rv = null, reviewT = 0; // 리뷰: { from:{k,ox,oy}, to:{k,ox,oy} }
    let vk = K, vcam = null, vox = 0, voy = 0;

    const floors = () => stack.length - 1;
    const layer = () => stack.length; // 지금 놓는 층 번호 (바닥=0)
    const prevSlab = () => stack[stack.length - 1].slab;
    const hueOf = (i) => hueFor(baseHue, i);
    const moving = () => movingAt(prevSlab(), layer(), mt);

    function camTarget() {
      const p = prevSlab();
      return { x: p.cx, z: p.cz, y: stack.length * SLAB_H + SLAB_H / 2 };
    }

    function init() {
      stack = [{ slab: createBase(), hue: hueOf(0), flash: 0, sp: null, perfect: false }];
      state = 'moving'; mt = 0; time = 0; combo = 0; settleT = 0;
      pendingEnd = false; ended = false; destroyed = false; tapped = false;
      debris = []; rings = []; toasts = [];
      cam = camTarget();
      bgHue = hueOf(0) + 180;
      clouds = [];
      for (let i = 0; i < 7; i++) {
        clouds.push({ x: rng() * W, y: rng() * H, r: 26 + rng() * 40, par: 0.12 + rng() * 0.3, vx: (rng() - 0.5) * 8 });
      }
    }

    function spawn() { state = 'moving'; mt = 0; }

    function afterPlace(sec) { state = 'settle'; settleT = sec; }

    async function runQuiz() {
      state = 'quiz';
      try { await ctx.requestQuiz(); } catch (e) { console.error(e); }
      if (destroyed || ended) return;
      if (ctx.energy.value > 0) spawn();
      else afterPlace(0); // 충전이 안 됐으면 update 에서 다시 퀴즈를 연다
    }

    function onTap() {
      if (destroyed || ended || state !== 'moving') return;
      if (mt < TAP_GUARD) return;
      if (!ctx.energy.spend(1)) { afterPlace(0); return; } // 에너지 0: 놓지 않고 퀴즈 흐름
      tapped = true;
      doPlace();
    }

    function doPlace() {
      const cur = moving();
      const L = layer();
      const y = L * SLAB_H;
      const hue = hueOf(L);
      const r = place(prevSlab(), cur.slab, cur.axis, combo);
      combo = r.combo;
      if (r.debris) {
        const dir = Math.sign(r.offset) || 1;
        debris.push({
          slab: r.debris, y, vy: 0, hue, t: 0,
          vx: cur.axis === 'x' ? dir * 70 : 0, vz: cur.axis === 'z' ? dir * 70 : 0,
          dx: 0, dz: 0,
        });
      }
      if (r.kind === 'miss') {
        ctx.sfx.play('hit');
        ctx.hearts.lose();
        if (ctx.hearts.value <= 0) pendingEnd = true;
        afterPlace(pendingEnd ? END_SEC : MISS_SEC);
        return;
      }
      stack.push({ slab: r.slab, hue, flash: r.kind === 'perfect' ? 1 : 0, sp: 0, perfect: r.kind === 'perfect' });
      if (r.kind === 'perfect') {
        ctx.sfx.play('note', combo - 1);
        rings.push({ cx: r.slab.cx, cz: r.slab.cz, y: y + SLAB_H, R: Math.max(r.slab.w, r.slab.d) / 2, t: 0 });
        toasts.push({ text: `PERFECT x${combo}`, t: 0 });
      } else {
        ctx.sfx.play('step');
      }
      afterPlace(SETTLE_SEC);
    }

    function update(dt) {
      if (destroyed) return;
      dt *= timeScale;
      time += dt;
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.t += dt; d.vy += GRAVITY * dt; d.y -= d.vy * dt;
        d.dx += d.vx * dt; d.dz += d.vz * dt;
        if (d.t > DEBRIS_LIFE) debris.splice(i, 1);
      }
      for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > RING_SEC) rings.splice(i, 1); }
      for (let i = toasts.length - 1; i >= 0; i--) { toasts[i].t += dt; if (toasts[i].t > TOAST_SEC) toasts.splice(i, 1); }
      for (const s of stack) {
        if (s.flash > 0) s.flash = Math.max(0, s.flash - dt / 0.4);
        if (s.sp !== null) { s.sp += dt; if (sparkleDone(s.sp, s.perfect)) s.sp = null; }
      }
      for (const c of clouds) { c.x += c.vx * dt; if (c.x < -80) c.x = W + 80; else if (c.x > W + 80) c.x = -80; }
      const tg = camTarget();
      const a = 1 - Math.pow(0.02, dt);
      cam.x += (tg.x - cam.x) * a; cam.z += (tg.z - cam.z) * a; cam.y += (tg.y - cam.y) * a;
      bgHue += ((hueOf(floors()) + 180) - bgHue) * (1 - Math.pow(0.3, dt));

      if (state === 'moving') {
        mt += dt;
      } else if (state === 'review') {
        reviewT += dt;
      } else if (state === 'settle') {
        settleT -= dt;
        if (settleT <= 0) {
          if (pendingEnd) {
            startReview();
          } else if (ctx.energy.value <= 0) {
            runQuiz();
          } else {
            spawn();
          }
        }
      }
    }

    function startReview() {
      state = 'review';
      reviewT = 0;
      const cssW = (ctx.canvas && ctx.canvas.clientWidth) || W;
      const sc = W / cssW; // CSS px -> 논리 단위
      const pad = { top: REVIEW_PAD.top * sc, bottom: REVIEW_PAD.bottom * sc, side: REVIEW_PAD.side * sc };
      const to = fitView(stack.map((e) => e.slab), W, H, pad, K);
      const from = {
        k: K,
        ox: W / 2 - (cam.x - cam.z) * K * ISO_X,
        oy: H * CAM_Y_FRAC - ((cam.x + cam.z) * ISO_Y - cam.y) * K,
      };
      rv = { from, to };
      if (!ended) { ended = true; ctx.endGame(floors(), { review: true, buttonsDelayMs: 1400, unit: '층' }); }
    }

    function reviewView() {
      const p = ease(Math.min(1, reviewT / REVIEW_ZOOM_SEC));
      const a = rv.from, b = rv.to;
      return { k: a.k + (b.k - a.k) * p, ox: a.ox + (b.ox - a.ox) * p, oy: a.oy + (b.oy - a.oy) * p, p };
    }

    // ---------- 그리기 ----------
    const OX = W / 2;
    const OY = H * CAM_Y_FRAC;
    vcam = cam; vox = OX; voy = OY;
    const P = (x, z, y) => project(x, z, y, vk, vcam, vox, voy);

    function poly(pts) {
      g.beginPath();
      g.moveTo(pts[0].sx, pts[0].sy);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].sx, pts[i].sy);
      g.closePath();
    }

    function drawSlab(s, y0, hue, alpha = 1, flash = 0) {
      const x0 = s.cx - s.w / 2, x1 = s.cx + s.w / 2, z0 = s.cz - s.d / 2, z1 = s.cz + s.d / 2;
      const y1 = y0 + SLAB_H;
      if (alpha < 1) g.globalAlpha = Math.max(0, alpha);
      poly([P(x1, z0, y1), P(x1, z1, y1), P(x1, z1, y0), P(x1, z0, y0)]); // 오른쪽 면
      g.fillStyle = `hsl(${hue},70%,52%)`;
      g.fill();
      poly([P(x0, z1, y1), P(x1, z1, y1), P(x1, z1, y0), P(x0, z1, y0)]); // 왼쪽 면
      g.fillStyle = `hsl(${hue},68%,62%)`;
      g.fill();
      poly([P(x0, z0, y1), P(x1, z0, y1), P(x1, z1, y1), P(x0, z1, y1)]); // 윗면
      g.fillStyle = `hsl(${hue},72%,${Math.min(96, 72 + flash * 22)}%)`;
      g.fill();
      if (vk > 0.2) {
        g.strokeStyle = `hsla(${hue},55%,35%,0.28)`;
        g.lineWidth = 1;
        g.stroke();
      }
      if (alpha < 1) g.globalAlpha = 1;
    }

    function drawBackground() {
      const h = ((bgHue % 360) + 360) % 360;
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, `hsl(${h},38%,80%)`);
      gr.addColorStop(1, `hsl(${(h + 28) % 360},42%,93%)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.28)';
      const span = H + 240;
      for (const c of clouds) {
        const y = ((c.y + cam.y * K * c.par) % span + span) % span - 120; // 탑이 오르면 구름이 아래로 흘러 오르는 느낌
        g.beginPath();
        g.ellipse(c.x, y, c.r * 1.5, c.r * 0.7, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    function drawStack() {
      if (state === 'review') return drawReviewStack();
      const lo = Math.max(0, stack.length - MAX_DRAW_LAYERS);
      for (let i = lo; i < stack.length; i++) {
        const e = stack[i];
        const p = P(e.slab.cx, e.slab.cz, i * SLAB_H);
        if (p.sy - e.slab.w * K * 0.5 > H + 40) continue;
        drawSlab(e.slab, i * SLAB_H, e.hue, 1, e.flash);
        if (e.sp !== null) drawShine(e, i);
      }
      for (let i = lo; i < stack.length; i++) if (stack[i].sp !== null) drawStars(stack[i], i);
    }

    // 리뷰: 전체 층을 그리고, 반짝이는 띠가 아래에서 위로 층을 타고 오른다
    function drawReviewStack() {
      const n = stack.length;
      const cycle = n * 0.05 + 2.5;
      for (let i = 0; i < n; i++) {
        const e = stack[i];
        drawSlab(e.slab, i * SLAB_H, e.hue, 1, 0);
        const tt = ((reviewT - 0.6 - i * 0.05) % cycle + cycle) % cycle;
        if (reviewT > 0.6 && tt < 0.5) drawShine({ slab: e.slab, sp: tt, perfect: false }, i);
      }
    }

    // 윗면+옆면 실루엣 안에서 대각선으로 지나가는 광택 띠
    function drawShine(e, i) {
      const { sweep } = sparkleAt(i, e.sp, e.perfect);
      if (sweep === null) return;
      const s = e.slab, y0 = i * SLAB_H, y1 = y0 + SLAB_H;
      const x0 = s.cx - s.w / 2, x1 = s.cx + s.w / 2, z0 = s.cz - s.d / 2, z1 = s.cz + s.d / 2;
      const hex = [P(x0, z0, y1), P(x1, z0, y1), P(x1, z0, y0), P(x1, z1, y0), P(x0, z1, y0), P(x0, z1, y1)];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of hex) { minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx); minY = Math.min(minY, p.sy); maxY = Math.max(maxY, p.sy); }
      const h = maxY - minY, slant = h * 0.8;
      const c = minX - slant * 0.5 - 14 + sweep * (maxX - minX + slant + 28);
      const k = Math.sin(Math.PI * sweep);
      g.save();
      poly(hex);
      g.clip();
      g.fillStyle = '#ffffff';
      const peak = e.perfect ? 0.8 : 0.6;
      for (const [bw, a] of [[24, 0.4], [9, 1]]) {
        g.globalAlpha = k * peak * a;
        g.beginPath();
        g.moveTo(c - bw, maxY);
        g.lineTo(c + bw, maxY);
        g.lineTo(c + bw + slant, minY);
        g.lineTo(c - bw + slant, minY);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    // 윗면 위에서 반짝이는 네 꼭짓점 별
    function drawStars(e, i) {
      const { stars } = sparkleAt(i, e.sp, e.perfect);
      if (!stars.length) return;
      const s = e.slab, y1 = i * SLAB_H + SLAB_H;
      const base = e.perfect ? 13 : 9;
      for (const st of stars) {
        const p = P(s.cx - s.w / 2 + st.u * s.w, s.cz - s.d / 2 + st.v * s.d, y1);
        const r = base * st.scale;
        if (r <= 0.3) continue;
        g.globalAlpha = st.alpha * 0.5;
        g.fillStyle = e.perfect ? '#ffc92e' : '#fff2b0';
        g.beginPath();
        g.arc(p.sx, p.sy, r * 1.3, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = st.alpha;
        g.fillStyle = '#ffffff';
        g.strokeStyle = e.perfect ? '#ffb300' : '#ffcf4d';
        g.lineWidth = 1.5;
        g.beginPath();
        for (let j = 0; j < 8; j++) {
          const a = (j * Math.PI) / 4 - Math.PI / 2;
          const rr2 = j % 2 === 0 ? r : r * 0.28;
          const x = p.sx + Math.cos(a) * rr2, y = p.sy + Math.sin(a) * rr2;
          if (j === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    function drawEffects() {
      for (const d of debris) {
        const s = { cx: d.slab.cx + d.dx, cz: d.slab.cz + d.dz, w: d.slab.w, d: d.slab.d };
        drawSlab(s, d.y, d.hue, 1 - d.t / DEBRIS_LIFE);
      }
      g.lineWidth = 3;
      for (const r of rings) {
        const t = r.t / RING_SEC;
        const R = r.R * (0.7 + t * 0.9);
        const c = P(r.cx, r.cz, r.y);
        g.globalAlpha = 1 - t;
        g.strokeStyle = '#ffffff';
        g.beginPath();
        g.ellipse(c.sx, c.sy, R * K * ISO_X * Math.SQRT2, R * K * ISO_Y * Math.SQRT2, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      if (toasts.length) {
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '900 20px sans-serif';
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(27,19,64,0.8)';
        const p = prevSlab();
        const top = P(p.cx, p.cz, stack.length * SLAB_H);
        for (const t of toasts) {
          const k = t.t / TOAST_SEC;
          g.globalAlpha = Math.max(0, Math.min(1, (1 - k) * 2));
          const y = top.sy - 70 - k * 26;
          g.strokeText(t.text, W / 2, y);
          g.fillStyle = '#ffffff';
          g.fillText(t.text, W / 2, y);
        }
        g.globalAlpha = 1;
      }
    }

    function cssScale() {
      const cssW = (ctx.canvas && ctx.canvas.clientWidth) || W;
      const k = W / cssW;
      g.scale(k, k);
      return { cssW, cssH: H / k };
    }

    function drawOverlay() {
      g.save();
      const { cssW, cssH } = cssScale();
      const text = `${floors()}층`;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.font = '900 28px sans-serif';
      const pw = g.measureText(text).width + 30;
      const ph = 44, px = cssW - 10 - pw, py = 62;
      g.fillStyle = 'rgba(27,19,64,0.88)';
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      rr(g, px, py, pw, ph, 16);
      g.fill();
      g.stroke();
      g.fillStyle = '#ffd23f';
      g.fillText(text, cssW - 10 - 15, py + ph / 2 + 1);
      if (combo > 0) {
        const ct = `x${combo}`;
        g.font = '900 16px sans-serif';
        const cw = g.measureText(ct).width + 20;
        g.fillStyle = 'rgba(255,255,255,0.9)';
        rr(g, cssW - 10 - cw, py + ph + 6, cw, 26, 13);
        g.fill();
        g.fillStyle = '#7a4dff';
        g.fillText(ct, cssW - 10 - 10, py + ph + 6 + 14);
      }
      if (!tapped) {
        g.textAlign = 'center';
        g.font = '900 34px sans-serif';
        g.globalAlpha = 0.35 + 0.25 * Math.sin(time * 5);
        g.fillStyle = '#ffffff';
        g.fillText('TAP!', cssW / 2, cssH - 130);
        g.globalAlpha = 1;
      }
      g.restore();
    }

    function render() {
      if (state === 'review' && rv) { const v = reviewView(); vk = v.k; vcam = ZERO; vox = v.ox; voy = v.oy; } else { vk = K; vcam = cam; vox = OX; voy = OY; }
      drawBackground();
      drawStack();
      if (state === 'moving') drawSlab(moving().slab, layer() * SLAB_H, hueOf(layer()));
      drawEffects();
      if (state !== 'review') drawOverlay();
    }

    init();

    return {
      get debug() {
        return {
          get state() { return state; },
          get floors() { return floors(); },
          get combo() { return combo; },
          get layer() { return layer(); },
          get axis() { return axisFor(layer()); },
          get speed() { return speedFor(layer()); },
          get offset() { return moving().offset; }, // 이동 축 오프셋 (0 = 퍼펙트 정렬)
          get moving() { const m = moving(); return { ...m.slab, axis: m.axis, offset: m.offset }; },
          get prev() { return { ...prevSlab() }; },
          get debrisCount() { return debris.length; },
          get ringCount() { return rings.length; },
          get tapped() { return tapped; },
          get mt() { return mt; },
          get cam() { return { ...cam }; },
          get review() { if (!rv) return null; const v = reviewView(); return { t: reviewT, p: Math.min(1, reviewT / REVIEW_ZOOM_SEC), k: v.k, targetK: rv.to.k }; },
          get timeScale() { return timeScale; },
          set timeScale(v) { timeScale = Math.max(0, Number(v) || 0); },
          get sparkles() { return stack.map((e, i) => (e.sp === null ? null : { layer: i, t: e.sp, perfect: e.perfect, stars: sparkleAt(i, e.sp, e.perfect).stars.length })).filter(Boolean); },
        };
      },
      start() {
        ctx.hud.setScore('');
        if (off) off();
        off = ctx.input.on('jump', onTap);
      },
      update,
      render,
      destroy() {
        destroyed = true;
        if (off) off();
        off = null;
      },
    };
  },
};
