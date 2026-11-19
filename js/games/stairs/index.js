import { createStairs } from './logic.js';

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
const DUST_LIFE = 0.35;
const MAX_PARTICLES = 60;
const PRESS_PX = 4;
const KICK_PX = 3;
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
    let time = 0;
    let facing = 1;
    let busy = false;
    let over = false;
    let ended = false;
    let endTimer = 0;
    let offs = [];
    let landT = Infinity; // seconds since last landing
    let landIdx = 0;
    const parts = [];

    function posAt(v) {
      const a = Math.floor(v);
      const f = v - a;
      const x = wx(a) + (wx(a + 1) - wx(a)) * f;
      const y = wy(a) + (wy(a + 1) - wy(a)) * f;
      return { x, y: y - Math.sin(Math.PI * f) * HOP_H };
    }

    function applyTap(dir) {
      const r = st.tap(dir);
      if (r.moved) {
        facing = dir === 'L' ? -1 : 1;
        ctx.sfx.play('step');
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* ignore */ }
        // 기록은 캔버스 우측 상단 박스에 표시하므로 상단 표시줄 글씨는 비움(중복 제거)
      } else if (r.wrong) {
        ctx.sfx.play('hit');
        shake = 0.35;
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

    function drawBackground() {
      g.fillStyle = '#f3e9de';
      g.fillRect(0, 0, W, H);
      // brick wall bands (parallax 0.5)
      const py = camY * 0.5;
      const rowH = 64;
      const colW = 72;
      const off = ((py % rowH) + rowH) % rowH;
      const offX = (((-camX * 0.5) % colW) + colW) % colW;
      for (let r = -1; r < H / rowH + 2; r++) {
        const y = r * rowH + off;
        const idx = Math.round((y - py) / rowH);
        g.fillStyle = idx % 2 ? '#eddfd1' : '#f1e5d8';
        g.fillRect(0, y, W, rowH - 4);
        for (let c = -1; c < W / colW + 2; c++) {
          const x = c * colW + offX + 14;
          const lit = ((idx * 7 + Math.round((x - offX) / colW) * 3) & 3) === 0;
          g.fillStyle = '#cdbdad';
          g.fillRect(x - 3, y + 7, 40, 38);
          g.fillStyle = lit ? '#f7efcf' : '#dce8ee';
          g.fillRect(x, y + 10, 34, 32);
          g.fillStyle = 'rgba(255,255,255,0.4)';
          g.fillRect(x + 3, y + 13, 10, 10);
          g.fillStyle = '#cdbdad';
          g.fillRect(x + 16, y + 10, 2, 32);
        }
      }
      // soft light haze
      g.fillStyle = 'rgba(255,250,244,0.28)';
      g.fillRect(0, 0, W, H);
    }

    function drawBlock(i, sx, sy, current) {
      const colors = ['#ff6b6b', '#4dabf7', '#51cf66', '#ffd43b', '#b197fc'];
      const c = colors[i % colors.length];
      g.fillStyle = 'rgba(40,30,20,0.35)';
      g.fillRect(sx - BLOCK_W / 2 + 3, sy + 4, BLOCK_W, BLOCK_H);
      g.fillStyle = c;
      g.fillRect(sx - BLOCK_W / 2, sy, BLOCK_W, BLOCK_H);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(sx - BLOCK_W / 2, sy, BLOCK_W, 4);
      g.strokeStyle = 'rgba(40,25,15,0.75)';
      g.lineWidth = 2;
      g.strokeRect(sx - BLOCK_W / 2, sy, BLOCK_W, BLOCK_H);
      if (current) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.strokeRect(sx - BLOCK_W / 2 + 2, sy + 2, BLOCK_W - 4, BLOCK_H - 4);
      }
    }

    function spawnDust(n) {
      const x = wx(n);
      const y = wy(n);
      const cnt = 4 + Math.floor(Math.random() * 3);
      for (let k = 0; k < cnt; k++) {
        const dir = k % 2 ? 1 : -1;
        parts.push({
          x: x + dir * (4 + Math.random() * 10),
          y: y + 2,
          vx: dir * (30 + Math.random() * 60),
          vy: -(40 + Math.random() * 70),
          life: DUST_LIFE,
          r: 1.5 + Math.random() * 2,
          sq: k % 3 === 0,
        });
      }
      while (parts.length > MAX_PARTICLES) parts.shift();
    }

    function drawPlayer(sx, sy, sq, scx = 1) {
      // feet at (sx, sy)
      g.save();
      g.translate(sx, sy);
      g.scale(scx, sq);
      // dark rim so the character reads against the wall
      g.fillStyle = '#1b1b2a';
      g.fillRect(-11, -20, 22, 18);
      g.fillRect(-11, -7, 22, 7);
      g.beginPath();
      g.arc(0, -27, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3b5bdb';
      g.fillRect(-9, -18, 18, 14); // body
      g.fillStyle = '#343a40';
      g.fillRect(-9, -5, 7, 5);
      g.fillRect(2, -5, 7, 5); // feet
      g.fillStyle = '#ffe0bd';
      g.beginPath();
      g.arc(0, -27, 10, 0, Math.PI * 2);
      g.fill(); // head
      g.fillStyle = '#e8590c';
      g.beginPath();
      g.arc(0, -30, 10, Math.PI, 0);
      g.fill(); // hair
      g.fillStyle = '#222';
      g.fillRect(facing * 4 - 1.5, -28, 3, 4); // eye
      g.restore();
    }

    function render() {
      const b = bounce(landT);
      const kick = KICK_PX * b;
      g.save();
      let ox = 0;
      if (shake > 0) ox = Math.sin(time * 70) * 6 * (shake / 0.35);
      g.translate(ox, 0);
      drawBackground();
      const ci = Math.floor(vi);
      for (let i = Math.max(0, ci - 14); i <= ci + 26; i++) {
        const sx = W / 2 + wx(i) - camX;
        if (sx < -BLOCK_W || sx > W + BLOCK_W) continue; // off-screen cull
        const press = i === landIdx ? PRESS_PX * Math.max(0, b) : 0;
        const sy = H * 0.68 + wy(i) - camY + kick + press;
        drawBlock(i, sx, sy, i === st.pos);
      }
      const p = posAt(vi);
      const f = vi - Math.floor(vi);
      const air = Math.sin(Math.PI * f);
      const sq = (1 + 0.18 * air) * (1 - 0.3 * b);
      const scx = (1 - 0.1 * air) * (1 + 0.3 * b);
      const pPress = Math.floor(vi) === landIdx ? PRESS_PX * Math.max(0, b) : 0;
      drawPlayer(W / 2 + p.x - camX, H * 0.68 + p.y - camY + kick + pPress, sq, scx);
      for (const q of parts) {
        g.globalAlpha = Math.max(0, q.life / DUST_LIFE);
        g.fillStyle = '#fff4e0';
        const qx = W / 2 + q.x - camX;
        const qy = H * 0.68 + q.y - camY + kick;
        if (q.sq) g.fillRect(qx - q.r, qy - q.r, q.r * 2, q.r * 2);
        else { g.beginPath(); g.arc(qx, qy, q.r, 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1;
      g.restore();

      // 기록(층수): 우측 상단, 어두운 알약 배경 + 노란 글씨로 연한 벽 위에서도 잘 보이게
      const label = `${st.score}층`;
      g.save();
      // 화면 폭에 따라 캔버스가 늘어나도 박스 크기가 일정하도록 CSS 픽셀 기준으로 그린다
      const cssW = (ctx.canvas && ctx.canvas.clientWidth) || W;
      g.scale(W / cssW, W / cssW);
      g.font = '900 30px sans-serif';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      const tw = g.measureText(label).width;
      const pw = tw + 28;
      const ph = 44;
      const px = cssW - 12 - pw;
      const py = 62;
      g.fillStyle = 'rgba(27,19,64,0.88)';
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(px + ph / 2, py);
      g.arcTo(px + pw, py, px + pw, py + ph, ph / 2);
      g.arcTo(px + pw, py + ph, px, py + ph, ph / 2);
      g.arcTo(px, py + ph, px, py, ph / 2);
      g.arcTo(px, py, px + pw, py, ph / 2);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#ffd23f';
      g.fillText(label, cssW - 12 - 14, py + ph / 2 + 1);
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
