import { createStairs } from './logic.js';
import { getBest } from '../../core/storage.js';
import {
  drawStairsBackground, drawStairBlock, drawClimber, drawTapHint,
} from './render.js';
import { drawBadgePill, drawBannerCard, hudTopY } from '../common/canvas-fx.js';

// Input policy: every tap is applied to the logic IMMEDIATELY (logic is instant,
// so nothing is skipped or double-applied). The hop animation is only visual and
// catches up to the logical position. Taps are ignored only while a quiz is
// pending (busy) or after hearts hit 0 (over).
const STEP_DX = 40;
const STEP_DY = 30;
const BLOCK_W = 56;
const BLOCK_H = 16;
const HOP_SPEED = 9; // stairs per second (visual)
const END_DELAY = 0.7;
const HOP_H = 24;
const PART_LIFE = 0.38;
const MAX_PARTICLES = 60;
const PRESS_PX = 4;
const KICK_PX = 3;
const MILESTONES = new Set([25, 50, 100, 150, 200, 300, 500]);

// damped-spring rebound after landing; t = seconds since landing
function bounce(t) { return t > 1 ? 0 : Math.exp(-9 * t) * Math.cos(32 * t); }

export default {
  id: 'stairs',
  title: '무한의 계단',
  icon: '🏢',
  controls: 'stairs',
  fullscreen: true, // 셸이 캔버스를 화면 전체로 채움
  energyMax: 20, // 에너지 가득 = 20칸
  energyGainMultiplier: 2,
  create(ctx) {
    const g = ctx.g2d;
    const W = ctx.width;
    const H = ctx.height;
    const st = createStairs(ctx.rng);
    let best = 0;
    try { best = getBest('stairs') || 0; } catch { best = 0; }

    const xs = [0]; // world x of each stair
    function wx(i) {
      while (xs.length <= i) {
        const k = xs.length;
        xs.push(xs[k - 1] + (st.steps[k - 1] === 'L' ? -STEP_DX : STEP_DX));
      }
      return xs[i];
    }
    function wy(i) { return -i * STEP_DY; }

    let vi = 0; // visual (float) stair index
    let camX = 0;
    let camY = 0;
    let shake = 0;
    let wrongFlash = 0;
    let time = 0;
    let facing = 1;
    let busy = false;
    let over = false;
    let ended = false;
    let endTimer = 0;
    let offs = [];
    let landT = Infinity; // seconds since last landing
    let landIdx = 0;
    let banner = null;
    const parts = [];

    function posAt(v) {
      const a = Math.floor(v);
      const f = v - a;
      const x = wx(a) + (wx(a + 1) - wx(a)) * f;
      const y = wy(a) + (wy(a + 1) - wy(a)) * f;
      return { x, y: y - Math.sin(Math.PI * f) * HOP_H };
    }

    function pushPart(p) {
      parts.push(p);
      while (parts.length > MAX_PARTICLES) parts.shift();
    }

    function spawnDust(n) {
      const x = wx(n);
      const y = wy(n);
      const cnt = 4 + Math.floor(Math.random() * 3);
      for (let k = 0; k < cnt; k++) {
        const dir = k % 2 ? 1 : -1;
        pushPart({
          kind: k % 3 === 0 ? 'square' : 'circle',
          x: x + dir * (4 + Math.random() * 10),
          y: y + 2,
          vx: dir * (30 + Math.random() * 55),
          vy: -(45 + Math.random() * 65),
          life: PART_LIFE,
          max: PART_LIFE,
          r: 1.6 + Math.random() * 2,
          color: '#fff4e0',
        });
      }
      if (n > 0 && n % 10 === 0) {
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2;
          pushPart({
            kind: 'spark',
            x,
            y: y - 10,
            vx: Math.cos(ang) * 70,
            vy: Math.sin(ang) * 70 - 40,
            life: 0.45,
            max: 0.45,
            r: 3.4,
            color: '#ffd23f',
          });
        }
      }
    }

    function spawnWrongChips(n) {
      const x = wx(n), y = wy(n);
      for (let k = 0; k < 6; k++) {
        const dir = k % 2 ? 1 : -1;
        pushPart({
          kind: 'square',
          x: x + (k - 2.5) * 6,
          y: y - 2,
          vx: dir * (25 + Math.random() * 45),
          vy: -(60 + Math.random() * 70),
          life: 0.42,
          max: 0.42,
          r: 2.5,
          color: '#ff4d6d',
        });
      }
    }

    function applyTap(dir) {
      const r = st.tap(dir);
      if (r.moved) {
        facing = dir === 'L' ? -1 : 1;
        ctx.sfx.play('step');
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* ignore */ }
        if (MILESTONES.has(st.score)) {
          banner = { text: `${st.score}층 돌파!`, sub: '계속 올라가요!', t: 0, dur: 1.8, color: '#ffd23f' };
        }
      } else if (r.wrong) {
        ctx.sfx.play('hit');
        shake = 0.35;
        wrongFlash = 0.45;
        spawnWrongChips(st.pos);
        const left = ctx.hearts.lose();
        if (left <= 0) { over = true; endTimer = END_DELAY; }
      }
    }

    async function onTap(dir) {
      if (over || busy) return;
      if (dir !== st.expected()) { applyTap(dir); return; }
      if (!ctx.energy.spend(1)) {
        busy = true;
        try { await ctx.requestQuiz(); } finally { busy = false; }
        if (over) return;
        if (!ctx.energy.spend(1)) return; // quiz closed without refill: drop input
      }
      applyTap(dir);
    }

    function render() {
      const b = bounce(landT);
      const kick = KICK_PX * b;
      g.save();
      let ox = 0;
      if (shake > 0) ox = Math.sin(time * 70) * 6 * (shake / 0.35);
      g.translate(ox, 0);

      drawStairsBackground(g, W, H, camX, camY, vi, time);

      const ci = Math.floor(vi);
      for (let i = Math.max(0, ci - 14); i <= ci + 26; i++) {
        const sx = W / 2 + wx(i) - camX;
        if (sx < -BLOCK_W || sx > W + BLOCK_W) continue; // off-screen cull
        const press = i === landIdx ? PRESS_PX * Math.max(0, b) : 0;
        const sy = H * 0.68 + wy(i) - camY + kick + press;
        drawStairBlock(g, i, sx, sy, BLOCK_W, BLOCK_H, i === st.pos, i === st.pos ? wrongFlash : 0);
      }

      if (st.pos === 0 && !over) {
        drawTapHint(g, W / 2 + wx(0) - camX, H * 0.68 + wy(0) - camY + kick, st.expected(), time);
      }

      const p = posAt(vi);
      const f = vi - Math.floor(vi);
      const air = Math.sin(Math.PI * f);
      const sq = (1 + 0.16 * air) * (1 - 0.28 * b);
      const scx = (1 - 0.1 * air) * (1 + 0.28 * b);
      const pPress = Math.floor(vi) === landIdx ? PRESS_PX * Math.max(0, b) : 0;
      drawClimber(g, {
        x: W / 2 + p.x - camX,
        y: H * 0.68 + p.y - camY + kick + pPress,
        facing,
        sq,
        scx,
        air,
        time,
        wrong: wrongFlash > 0 || over,
        fast: st.pos - vi > 0.6,
      });

      for (const q of parts) {
        const k = Math.max(0, q.life / q.max);
        g.globalAlpha = k;
        g.fillStyle = q.color;
        const qx = W / 2 + q.x - camX;
        const qy = H * 0.68 + q.y - camY + kick;
        if (q.kind === 'square') {
          g.fillRect(qx - q.r, qy - q.r, q.r * 2, q.r * 2);
        } else if (q.kind === 'spark') {
          const r = q.r * k;
          g.beginPath();
          g.moveTo(qx, qy - r * 1.4); g.lineTo(qx + r * 0.6, qy);
          g.lineTo(qx, qy + r * 1.4); g.lineTo(qx - r * 0.6, qy);
          g.closePath(); g.fill();
        } else {
          g.beginPath(); g.arc(qx, qy, q.r, 0, Math.PI * 2); g.fill();
        }
      }
      g.globalAlpha = 1;
      g.restore();

      // 기록(층수) + 마일스톤 배너: CSS 픽셀 기준으로 일정 크기 유지
      g.save();
      const cssW = (ctx.canvas && ctx.canvas.clientWidth) || W;
      g.scale(W / cssW, W / cssW);
      const topY = hudTopY(ctx.canvas, 66, 10);
      const pillBot = drawBadgePill(g, cssW - 10, topY, `${st.score}층`, `최고 ${Math.max(best, st.score)}층`);
      if (banner) drawBannerCard(g, cssW, pillBot + 14, banner);
      g.restore();
    }

    return {
      // 검증용 읽기 전용 접근(다음 방향 확인)
      get debug() { return { st, get vi() { return vi; } }; },
      start() {
        ctx.hud.setScore('');
        offs.forEach((o) => o && o());
        offs = [ctx.input.on('left', () => onTap('L')), ctx.input.on('right', () => onTap('R'))];
      },
      update(dt) {
        time += dt;
        if (shake > 0) shake = Math.max(0, shake - dt);
        if (wrongFlash > 0) wrongFlash = Math.max(0, wrongFlash - dt);
        if (banner) { banner.t += dt; if (banner.t >= banner.dur) banner = null; }
        // hop toward logical pos (never overshoots, never skips: visual only)
        if (landT < 10) landT += dt;
        if (vi < st.pos) {
          const prev = vi;
          vi = Math.min(st.pos, vi + HOP_SPEED * dt * Math.max(1, st.pos - vi));
          // landing = crossing (or reaching) a stair index; restart the spring each time
          const n = Math.floor(vi + 1e-9);
          if (n > Math.floor(prev + 1e-9)) {
            landT = 0;
            landIdx = n;
            spawnDust(n);
          }
        }
        for (let i = parts.length - 1; i >= 0; i--) {
          const q = parts[i];
          q.life -= dt;
          if (q.life <= 0) { parts.splice(i, 1); continue; }
          q.vy += 500 * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
        }
        const p = posAt(vi);
        const k = 1 - Math.pow(0.002, dt);
        camX += (p.x - camX) * k;
        camY += (p.y - camY) * k;
        if (over && !ended) {
          endTimer -= dt;
          if (endTimer <= 0) { ended = true; ctx.endGame(st.score); } // shell plays 'over'
        }
      },
      render,
      destroy() {
        offs.forEach((o) => o && o());
        offs = [];
      },
    };
  },
};
