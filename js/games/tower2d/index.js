// 2D 탑쌓기 (Tricky Towers 느낌, 1인용). 물리는 world.js(Matter), 순수 규칙은 logic.js.
import { loadMatter } from '../../vendor/load-matter.js';
import { createWorld, GROOVE, PLATFORM_H } from './world.js';
import {
  SHAPES, createBag, createMagicSchedule, stageLinePx, stageLineM, fallSpeed, EFFECT_LABEL,
  PX_PER_M, cellsSize, trembleStrength, trembleOffset, TREMBLE, concreteGrants, CONCRETE_MAX,
} from './logic.js';

const COLORS = {
  I: '#45d4ff', O: '#ffd43b', T: '#c38bff', S: '#5ee38a', Z: '#ff6b8b', J: '#5b8cff', L: '#ffa24a',
};
const OUTLINE = '#2a1f4a';
const PLATFORM_W = 160;
const HOLD_SEC = 2; // 결승선 위 유지 시간
const BANNER_SEC = 2.4;
const END_DELAY = 0.9;
const MAX_PARTS = 90;

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function lerp(a, b, t) { return a + (b - a) * t; }
function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function mix(c1, c2, t) {
  const a = hex(c1);
  const b = hex(c2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
// 고도(m)에 따른 하늘 색: 낮 -> 노을 -> 저녁 -> 우주
const SKY = [
  { m: 0, top: '#7cc8ff', bot: '#e3f6ff' },
  { m: 15, top: '#5fa0ff', bot: '#ffe0f0' },
  { m: 30, top: '#4a4fb8', bot: '#ffb98a' },
  { m: 45, top: '#1c1d5c', bot: '#6c4bb0' },
  { m: 70, top: '#070a26', bot: '#25205e' },
];
function skyAt(m) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const a = SKY[i];
    const b = SKY[i + 1];
    if (m <= b.m) {
      const t = Math.max(0, (m - a.m) / (b.m - a.m));
      return { top: mix(a.top, b.top, t), bot: mix(a.bot, b.bot, t), night: i >= 2 ? (i - 2 + t) / 2 : 0 };
    }
  }
  const l = SKY[SKY.length - 1];
  return { top: l.top, bot: l.bot, night: 1 };
}

export default {
  id: 'tower2d',
  title: '2D 탑쌓기',
  icon: '🧱',
  controls: 'tower',
  fullscreen: true,
  energyMax: 12,
  energyGainMultiplier: 2,
  create(ctx) {
    const g = ctx.g2d;
    const W = ctx.width;
    const H = ctx.height;
    const rng = ctx.rng || Math.random;
    const PT = 0; // 받침대 윗면(월드 y)
    const bag = createBag(rng);
    const magicSched = createMagicSchedule(rng);

    let world = null;
    let ready = false;
    let loadError = false;
    let destroyed = false;
    let offs = [];
    let camY = PT - Math.round(H * 0.8); // 화면 y = 월드 y - camY
    let time = 0;
    let shake = 0;
    let stage = 1;
    let hold = 0;
    let maxH = 0; // px
    let spawned = 0;
    let spawning = false;
    let autoSpawn = true; // 검증용으로만 끔(debug.autoSpawn)
    let over = false;
    let ended = false;
    let endTimer = 0;
    let banner = null;
    let inventory = 1; // 콘크리트 아이템 보유 수
    let granted = 0; // 10m마다 받은 횟수
    let itemBusy = false;
    let itemKey = '';
    let lastTremble = null; // 검증용
    const parts = [];
    const toasts = [];
    const lostLog = [];
    const clouds = [];
    for (let i = 0; i < 9; i++) clouds.push({ x: rng() * W, y: rng() * 1400, s: 0.6 + rng() * 0.8, v: 4 + rng() * 8 });
    const stars = [];
    for (let i = 0; i < 40; i++) stars.push({ x: rng() * W, y: rng() * 1000, r: rng() < 0.2 ? 2 : 1 });

    const spawnY = () => camY + Math.round(H * 0.15) + 20;

    function addToast(text, x, y, color = '#ffffff') {
      toasts.push({ text, x, y, t: 0, color });
      if (toasts.length > 4) toasts.shift();
    }
    function burst(x, y, n, colors, speed = 120, life = 0.7) {
      for (let k = 0; k < n; k++) {
        const a = rng() * Math.PI * 2;
        const v = speed * (0.4 + rng() * 0.8);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life, max: life, r: 2 + rng() * 2.5, c: colors[k % colors.length], grav: 160 });
      }
      while (parts.length > MAX_PARTS) parts.shift();
    }
    function dust(x, y, w) {
      for (let k = 0; k < 7; k++) {
        const dir = k % 2 ? 1 : -1;
        parts.push({
          x: x + dir * (w / 2) * rng(), y, vx: dir * (30 + rng() * 60), vy: -(20 + rng() * 50),
          life: 0.45, max: 0.45, r: 2 + rng() * 2.5, c: 'rgba(255,248,235,0.95)', grav: 120,
        });
      }
      while (parts.length > MAX_PARTS) parts.shift();
    }

    function onContact(brick, other, wasCtl, impact = 0) {
      // 처음 닿는 순간 살짝 떨림(그림만, 물리 바디는 그대로)
      const heavy = brick.tint === 'steel' || !!brick.concrete;
      brick.tremble = { t: 0, k: trembleStrength(impact, heavy) };
      lastTremble = brick.tremble;
      if (!wasCtl) return;
      const b = brick.body.bounds;
      dust((b.min.x + b.max.x) / 2, b.max.y, b.max.x - b.min.x);
      if (brick.body.speed > 4) shake = Math.max(shake, 0.18);
    }
    function onSettled(brick) {
      ctx.sfx.play('step');
      void brick;
    }
    function onLost(brick, info) {
      lostLog.push({ shape: brick.shape, x: Math.round(brick.body.position.x), byUndo: !!info.byUndo, touched: brick.touched, state: brick.state, t: Math.round(time * 10) / 10 });
      if (lostLog.length > 20) lostLog.shift();
      if (info.byUndo) {
        const p = brick.body.position;
        burst(p.x, p.y, 10, ['#ffffff', '#ffe066'], 90, 0.5);
        return;
      }
      if (over) return;
      ctx.sfx.play('hit');
      shake = 0.35;
      const p = brick.body.position;
      addToast('💔 -1', Math.min(W - 40, Math.max(40, p.x)), camY + H * 0.62, '#ff8fa3');
      const left = ctx.hearts.lose();
      if (left <= 0) { over = true; endTimer = END_DELAY; }
    }
    function onMagic(brick, effect) {
      ctx.sfx.play('magic');
      const p = brick.body.position;
      const light = !brick.magic || brick.magic.kind === 'light';
      burst(p.x, p.y, 14, light ? ['#ffe066', '#ffffff', '#ffb703'] : ['#b06bff', '#3b1460', '#e0c3ff'], 130, 0.7);
      addToast(EFFECT_LABEL[effect] || effect, Math.min(W - 60, Math.max(60, p.x)), p.y - 40, light ? '#fff3b0' : '#e5ccff');
    }

    async function trySpawn() {
      if (spawning || over || !ready) return;
      spawning = true;
      try {
        if (!ctx.energy.spend(1)) {
          await ctx.requestQuiz();
          if (over || destroyed) return;
          if (!ctx.energy.spend(1)) return; // 충전이 안 됐으면 다음 프레임에 다시
        }
        if (over || destroyed) return;
        doSpawn(bag.next(), magicSched.next(stage));
      } finally { spawning = false; }
    }
    function doSpawn(shape, magic) {
      world.setFallSpeed(fallSpeed(spawned, stage));
      spawned++;
      return world.spawn(shape, magic, { x: W / 2, y: spawnY() });
    }

    // 콘크리트 아이템: 버튼 -> 문제 3개(item 모드) -> 조종 중인 벽돌을 콘크리트로
    function itemUsable() {
      const c = ready && world.controlled;
      return !!(c && inventory > 0 && !c.concrete && !over && !itemBusy && !spawning);
    }
    function syncItemButton() {
      const en = itemUsable();
      const key = inventory + ':' + en;
      if (key === itemKey) return;
      itemKey = key;
      if (ctx.input.setItem) ctx.input.setItem({ count: inventory, enabled: en });
    }
    async function useItem() {
      if (!itemUsable()) return false;
      const target = world.controlled;
      itemBusy = true;
      syncItemButton();
      let ok = false;
      try { ok = await ctx.requestQuiz({ mode: 'item', need: 3 }); } finally { itemBusy = false; }
      if (ok !== true || over || destroyed || target.lost || target.concrete) return false;
      inventory--;
      world.makeConcrete(target);
      ctx.sfx.play('magic');
      const p = target.body.position;
      burst(p.x, p.y, 16, ['#4b4e53', '#9aa0a6', '#ffffff'], 120, 0.7);
      addToast('🧱 콘크리트 적용!', Math.min(W - 80, Math.max(80, p.x)), p.y - 40, '#e9ecef');
      return true;
    }
    function checkGrants() {
      const add = concreteGrants(maxH / PX_PER_M, granted);
      if (add <= 0) return;
      granted += add;
      const before = inventory;
      inventory = Math.min(CONCRETE_MAX, inventory + add);
      if (inventory > before) {
        ctx.sfx.play('magic');
        addToast('🧱 콘크리트 +1', W - 90, camY + H * 0.3, '#ffe066');
      }
    }

    function stageClear() {
      ctx.sfx.play('clear');
      banner = { text: `🏁 스테이지 ${stage} 클리어!`, t: 0 };
      ctx.hearts.add(1);
      stage++;
      hold = 0;
      magicSched.guaranteeLight();
      burst(W / 2, PT - stageLinePx(stage - 1), 24, ['#ffd43b', '#ff6b8b', '#45d4ff', '#5ee38a'], 180, 1);
    }

    // ---------- rendering ----------
    function drawSky() {
      const m = Math.max(0, (PT - Math.round(H * 0.8) - camY) / PX_PER_M);
      const s = skyAt(m);
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, s.top);
      gr.addColorStop(1, s.bot);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      if (s.night > 0.05) {
        g.globalAlpha = Math.min(1, s.night);
        g.fillStyle = '#fffbe6';
        g.beginPath();
        for (const st of stars) {
          const y = ((st.y - camY * 0.15) % 1000 + 1000) % 1000 - 100;
          if (y < -5 || y > H) continue;
          g.rect(st.x, y, st.r, st.r);
        }
        g.fill();
        g.globalAlpha = 1;
      }
      g.fillStyle = `rgba(255,255,255,${0.85 - 0.55 * s.night})`;
      g.beginPath();
      for (const c of clouds) {
        const x = ((c.x + time * c.v) % (W + 160)) - 80;
        const y = ((c.y - camY * 0.35) % 1400 + 1400) % 1400 - 200;
        if (y < -60 || y > H + 60) continue;
        const r = 16 * c.s;
        g.moveTo(x + r * 2.2, y);
        g.arc(x, y, r * 1.2, 0, Math.PI * 2);
        g.moveTo(x + r * 2.4, y + 4);
        g.arc(x + r * 1.3, y + 4, r, 0, Math.PI * 2);
        g.moveTo(x - r * 0.4, y + 6);
        g.arc(x - r * 1.3, y + 6, r * 0.9, 0, Math.PI * 2);
      }
      g.fill();
    }

    function drawGround() {
      const top = PT;
      const PH = PLATFORM_H; // 56 = 홈 깊이 48 + 바닥판 8
      const gd = GROOVE.depth;
      const bottom = camY + H + 40;
      if (top - camY > H + 40) return;
      // 낭떠러지(아래로 어두워짐)
      const vg = g.createLinearGradient(0, top + PH, 0, top + PH + 120);
      vg.addColorStop(0, 'rgba(40,26,90,0.25)');
      vg.addColorStop(1, 'rgba(14,9,36,0.95)');
      g.fillStyle = vg;
      g.fillRect(0, top + PH, W, Math.max(0, bottom - top - PH));
      // 받침대 아래 매달린 바위(받침대 바닥에서 아래로 좁아짐)
      const x0 = W / 2 - PLATFORM_W / 2;
      g.fillStyle = '#5b4a7a';
      g.beginPath();
      g.moveTo(x0 + 10, top + PH - 2);
      g.lineTo(x0 + PLATFORM_W - 10, top + PH - 2);
      g.lineTo(W / 2 + 24, top + PH + 150);
      g.lineTo(W / 2 - 28, top + PH + 150);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(W / 2 - 18, top + PH, 8, 110);
      // 받침대 몸통: 돌(전체 56px)
      const segs = (world && world.grooves) || [{ x0, x1: x0 + PLATFORM_W, groove: false }];
      const sg2 = g.createLinearGradient(0, top, 0, top + PH);
      sg2.addColorStop(0, '#9a7a58');
      sg2.addColorStop(1, '#6e5238');
      g.fillStyle = sg2;
      rr(g, x0, top, PLATFORM_W, PH, 5);
      g.fill();
      // 돌 결: 줄눈(가로) + 엇갈린 세로 줄눈 + 작은 금
      g.fillStyle = 'rgba(40,25,15,0.28)';
      g.beginPath();
      for (let y = top + 14; y < top + PH - 4; y += 14) g.rect(x0 + 2, y, PLATFORM_W - 4, 1.5);
      for (let r = 0, y = top + 5; y < top + PH - 4; y += 14, r++) {
        for (let x = x0 + (r % 2 ? 12 : 24); x < x0 + PLATFORM_W - 6; x += 30) g.rect(x, y, 1.5, 9);
      }
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.beginPath();
      for (let y = top + 15.5; y < top + PH - 4; y += 14) g.rect(x0 + 2, y, PLATFORM_W - 4, 1);
      g.fill();
      // 홈: 깊고 어두운 구멍(벽돌 2칸) + 벽 음영 + 바닥(바닥판)
      g.fillStyle = '#1c130e';
      g.beginPath();
      for (const s of segs) if (s.groove) g.rect(s.x0, top - 1, s.x1 - s.x0, gd + 1);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.45)'; // 왼쪽 벽 그림자 + 윗부분 어둠
      g.beginPath();
      for (const s of segs) if (s.groove) { g.rect(s.x0, top, 4, gd); g.rect(s.x0, top, s.x1 - s.x0, 6); }
      g.fill();
      g.fillStyle = 'rgba(255,220,180,0.10)'; // 오른쪽 벽 반사광
      g.beginPath();
      for (const s of segs) if (s.groove) g.rect(s.x1 - 3, top + 4, 3, gd - 4);
      g.fill();
      g.fillStyle = '#4a3527'; // 홈 바닥(바닥판 윗면)
      g.beginPath();
      for (const s of segs) if (s.groove) g.rect(s.x0, top + gd - 3, s.x1 - s.x0, 3);
      g.fill();
      // 솟은 면: 잔디
      g.fillStyle = '#6bd36b';
      g.beginPath();
      for (const s of segs) if (!s.groove) g.rect(s.x0, top, s.x1 - s.x0, 5);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      for (const s of segs) if (!s.groove) g.rect(s.x0 + 2, top + 1, s.x1 - s.x0 - 4, 1.5);
      g.fill();
      // 리벳(받침대 아래 띠)
      g.fillStyle = '#c9b79c';
      g.beginPath();
      for (let x = x0 + 8; x < x0 + PLATFORM_W - 4; x += 24) g.rect(x, top + PH - 6, 3, 3);
      g.fill();
      g.strokeStyle = OUTLINE;
      g.lineWidth = 2;
      g.beginPath(); // 윤곽: 홈을 따라가는 윗선 + 아래
      g.moveTo(x0, top + PH);
      g.lineTo(x0, top);
      for (const s of segs) {
        if (s.groove) { g.lineTo(s.x0, top + gd); g.lineTo(s.x1, top + gd); g.lineTo(s.x1, top); } else g.lineTo(s.x1, top);
      }
      g.lineTo(x0 + PLATFORM_W, top + PH);
      g.closePath();
      g.stroke();
    }

    function drawFinishLine() {
      const y = PT - stageLinePx(stage);
      const sy = y - camY;
      if (sy < -30 || sy > H + 30) return;
      g.save();
      g.strokeStyle = hold > 0 ? '#ffd43b' : '#ffffff';
      g.lineWidth = 3;
      g.setLineDash([12, 8]);
      g.lineDashOffset = -time * 20;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
      g.setLineDash([]);
      const label = `결승선 ${stageLineM(stage)}m`;
      g.font = '900 14px sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      const tw = g.measureText(label).width + 18;
      // 화면 위쪽(NEXT/기록 상자 근처)에서는 이름표를 선 아래에 둔다
      const below = sy < H * 0.25;
      const ly = below ? y + 6 : y - 26;
      g.fillStyle = 'rgba(27,19,64,0.85)';
      rr(g, 8, ly, tw, 22, 11);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillText(label, 17, ly + 11);
      if (hold > 0) { // 유지 진행 막대
        const by = below ? ly + 25 : y + 5;
        g.fillStyle = 'rgba(27,19,64,0.6)';
        g.fillRect(8, by, tw, 5);
        g.fillStyle = '#ffd43b';
        g.fillRect(8, by, tw * Math.min(1, hold / HOLD_SEC), 5);
      }
      g.restore();
    }

    function cellsPath(local, cell, inset) {
      const s = cell - 1 - inset * 2;
      g.beginPath();
      for (const [x, y] of local) g.rect(x - s / 2, y - s / 2, s, s);
    }

    function drawBrick(b) {
      const body = b.body;
      const bb = body.bounds;
      if (bb.max.y < camY - 10 || bb.min.y > camY + H + 10) return;
      const cell = b.cell;
      const half = (cell - 1) / 2;
      g.save();
      let tx = 0;
      let ty = 0;
      let tr = 0;
      if (b.tremble) { const o = trembleOffset(b.tremble.t, b.tremble.k); tx = o.dx; ty = o.dy; tr = o.rot; }
      g.translate(body.position.x + tx, body.position.y + ty);
      g.rotate(body.angle + tr);
      if (b.concrete) { drawConcrete(b); g.restore(); return; }
      const magic = b.magic;
      if (magic) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 6);
        if (magic.kind === 'light') {
          g.strokeStyle = `rgba(255,215,64,${0.45 + 0.4 * pulse})`;
          g.lineWidth = 8 + 3 * pulse;
        } else {
          g.strokeStyle = `rgba(${Math.round(90 + 70 * pulse)},30,${Math.round(150 + 60 * pulse)},${0.55 + 0.35 * pulse})`;
          g.lineWidth = 8 + 4 * pulse;
        }
        g.lineJoin = 'round';
        cellsPath(b.local, cell, 0);
        g.stroke();
      }
      let fill = COLORS[b.shape] || '#ccc';
      if (b.tint === 'steel') fill = '#7f8ea3';
      else if (b.tint === 'ice') fill = '#c8f0ff';
      g.fillStyle = fill;
      cellsPath(b.local, cell, 0);
      g.fill();
      // 그림자(아래쪽) + 하이라이트(위쪽)
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.beginPath();
      for (const [x, y] of b.local) g.rect(x - half, y + half - 5, cell - 1, 5);
      g.fill();
      g.fillStyle = b.tint === 'ice' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)';
      g.beginPath();
      for (const [x, y] of b.local) { g.rect(x - half + 3, y - half + 3, cell - 9, 4); g.rect(x - half + 3, y - half + 7, 4, 5); }
      g.fill();
      if (b.tint === 'steel') { // 리벳
        g.fillStyle = '#c9d3df';
        g.beginPath();
        for (const [x, y] of b.local) g.rect(x - 2, y - 2, 4, 4);
        g.fill();
      }
      g.strokeStyle = magic && magic.kind === 'dark' ? '#1a0b2e' : OUTLINE;
      g.lineWidth = 2;
      cellsPath(b.local, cell, 0);
      g.stroke();
      g.restore();
    }

    // 콘크리트: 짙은 회색 + 결정적 반점/골재/잔금 + 모서리 음영(칸마다, 경로 몇 개로 묶어 그림)
    function hash(a, b2) {
      let h = (a * 374761393 + b2 * 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    function drawConcrete(b) {
      const cell = b.cell;
      const s = cell - 1;
      const half = s / 2;
      g.fillStyle = '#4b4e53';
      cellsPath(b.local, cell, 0);
      g.fill();
      // 골재 얼룩(옅은 큰 점)
      g.fillStyle = 'rgba(120,124,130,0.35)';
      g.beginPath();
      b.local.forEach(([x, y], i) => {
        for (let k = 0; k < 2; k++) {
          const px = x - half + 4 + hash(b.id * 31 + i, k) * (s - 8);
          const py = y - half + 4 + hash(b.id * 17 + i, k + 7) * (s - 8);
          const r = 2.5 + hash(i, b.id + k) * 2.5;
          g.moveTo(px + r, py);
          g.arc(px, py, r, 0, Math.PI * 2);
        }
      });
      g.fill();
      // 반점: 밝은 점 / 어두운 점
      for (const [col, seed] of [['rgba(190,194,200,0.75)', 3], ['rgba(20,22,25,0.6)', 11]]) {
        g.fillStyle = col;
        g.beginPath();
        b.local.forEach(([x, y], i) => {
          for (let k = 0; k < 7; k++) {
            const px = x - half + 2 + hash(b.id * 7 + i * 13 + seed, k) * (s - 5);
            const py = y - half + 2 + hash(b.id * 5 + i * 11 + seed, k + 19) * (s - 5);
            g.rect(px, py, 1.5, 1.5);
          }
        });
        g.fill();
      }
      // 잔금(가는 금)
      g.strokeStyle = 'rgba(25,26,29,0.7)';
      g.lineWidth = 0.8;
      g.beginPath();
      b.local.forEach(([x, y], i) => {
        if (hash(b.id, i * 3) < 0.55) {
          const sx = x - half + 3 + hash(b.id + i, 5) * (s - 6);
          const sy = y - half + 3;
          g.moveTo(sx, sy);
          g.lineTo(sx + (hash(i, 9) - 0.5) * 8, sy + s * 0.35);
          g.lineTo(sx + (hash(i, 4) - 0.5) * 10, sy + s * 0.6);
        }
      });
      g.stroke();
      // 음영: 왼쪽 위 밝은 경사면, 오른쪽 아래 안쪽 그림자
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.beginPath();
      for (const [x, y] of b.local) { g.rect(x - half, y - half, s, 3); g.rect(x - half, y - half + 3, 3, s - 3); }
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.38)';
      g.beginPath();
      for (const [x, y] of b.local) { g.rect(x - half, y + half - 3, s, 3); g.rect(x + half - 3, y - half, 3, s - 3); }
      g.fill();
      g.strokeStyle = '#1e2023';
      g.lineWidth = 2;
      cellsPath(b.local, cell, 0);
      g.stroke();
    }

    function drawGuide(b) {
      const bb = b.body.bounds;
      g.fillStyle = 'rgba(255,255,255,0.16)';
      const top = bb.max.y;
      const bottom = Math.min(camY + H, PT + 200);
      if (bottom > top) g.fillRect(bb.min.x, top, bb.max.x - bb.min.x, bottom - top);
    }

    function drawVines() {
      if (!world.vines.length) return;
      const C = world.Matter.Constraint;
      g.strokeStyle = '#2f9e44';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      const leaves = [];
      for (const v of world.vines) {
        const pa = C.pointAWorld(v.c);
        const A = v.a.body.position;
        const B = v.b.body.position;
        g.moveTo(A.x, A.y);
        g.quadraticCurveTo(pa.x + 6, pa.y - 6, B.x, B.y);
        leaves.push(pa);
      }
      g.stroke();
      g.fillStyle = '#69db7c';
      g.beginPath();
      for (const p of leaves) { g.moveTo(p.x + 5, p.y); g.ellipse(p.x, p.y, 5, 3, 0.6, 0, Math.PI * 2); }
      g.fill();
    }

    function drawParticles() {
      for (const q of parts) {
        g.globalAlpha = Math.max(0, q.life / q.max);
        g.fillStyle = q.c;
        g.fillRect(q.x - q.r, q.y - q.r, q.r * 2, q.r * 2);
      }
      g.globalAlpha = 1;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '900 20px sans-serif';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(27,19,64,0.85)';
      for (const t of toasts) {
        g.globalAlpha = Math.max(0, Math.min(1, (1.4 - t.t) / 0.4));
        const y = t.y - t.t * 30;
        g.strokeText(t.text, t.x, y);
        g.fillStyle = t.color;
        g.fillText(t.text, t.x, y);
      }
      g.globalAlpha = 1;
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
      // 기록: 우측 상단(HUD 버튼 아래)
      {
        const cur = `${(maxH / PX_PER_M).toFixed(1)}m`;
        const sub = `STAGE ${stage}`;
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.font = '900 30px sans-serif';
        const w1 = g.measureText(cur).width;
        g.font = 'bold 15px sans-serif';
        const w2 = g.measureText(sub).width;
        const pw = Math.max(w1, w2) + 28;
        const ph = 62;
        const px = cssW - 10 - pw;
        const py = 62;
        g.fillStyle = 'rgba(27,19,64,0.88)';
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3;
        rr(g, px, py, pw, ph, 18);
        g.fill();
        g.stroke();
        g.fillStyle = '#ffd23f';
        g.font = '900 30px sans-serif';
        g.fillText(cur, cssW - 10 - 14, py + 24);
        g.fillStyle = '#ffffff';
        g.font = 'bold 15px sans-serif';
        g.fillText(sub, cssW - 10 - 14, py + 49);
      }
      // NEXT 미리보기: 좌측 상단(HUD 아래)
      if (ready) {
        const next = bag.peek(1)[0];
        const cells = SHAPES[next];
        const { w, h } = cellsSize(cells);
        const c = 12;
        const bw = 68;
        const bh = 62;
        const bx = 10;
        const by = 62;
        g.fillStyle = 'rgba(27,19,64,0.8)';
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        rr(g, bx, by, bw, bh, 14);
        g.fill();
        g.stroke();
        g.fillStyle = '#ffffff';
        g.font = 'bold 11px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillText('NEXT', bx + bw / 2, by + 5);
        const ox = bx + bw / 2 - (w * c) / 2;
        const oy = by + 20 + (36 - h * c) / 2;
        g.fillStyle = COLORS[next];
        g.beginPath();
        for (const [x, y] of cells) g.rect(ox + x * c, oy + y * c, c - 1, c - 1);
        g.fill();
        g.strokeStyle = OUTLINE;
        g.lineWidth = 1.5;
        g.stroke();
      }
      if (banner) {
        const a = banner.t < 0.2 ? banner.t / 0.2 : banner.t > BANNER_SEC - 0.4 ? (BANNER_SEC - banner.t) / 0.4 : 1;
        g.globalAlpha = Math.max(0, Math.min(1, a));
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '900 22px sans-serif';
        const bw = g.measureText(banner.text).width + 40;
        const by = 150 - 10 * (1 - Math.min(1, banner.t / 0.2));
        g.fillStyle = 'rgba(27,19,64,0.92)';
        g.strokeStyle = '#ffd23f';
        g.lineWidth = 3;
        rr(g, cssW / 2 - bw / 2, by, bw, 46, 23);
        g.fill();
        g.stroke();
        g.fillStyle = '#ffffff';
        g.fillText(banner.text, cssW / 2, by + 24);
        g.globalAlpha = 1;
      }
      if (!ready) {
        g.fillStyle = '#ffffff';
        g.strokeStyle = 'rgba(27,19,64,0.85)';
        g.lineWidth = 5;
        g.font = '900 24px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const t = loadError ? '물리 엔진을 불러오지 못했어요' : '불러오는 중…';
        g.strokeText(t, cssW / 2, cssH * 0.45);
        g.fillText(t, cssW / 2, cssH * 0.45);
      }
      g.restore();
    }

    function render() {
      drawSky();
      g.save();
      let ox = 0;
      let oy = 0;
      if (shake > 0) { ox = Math.sin(time * 71) * 5 * (shake / 0.35); oy = Math.cos(time * 53) * 3 * (shake / 0.35); }
      g.translate(ox, -camY + oy);
      drawGround();
      if (ready) {
        drawFinishLine();
        if (world.controlled) drawGuide(world.controlled);
        for (const b of world.bricks) drawBrick(b);
        drawVines();
      }
      drawParticles();
      g.restore();
      drawOverlay();
    }

    function update(dt) {
      time += dt;
      if (shake > 0) shake = Math.max(0, shake - dt);
      if (banner) { banner.t += dt; if (banner.t >= BANNER_SEC) banner = null; }
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.life -= dt;
        if (q.life <= 0) { parts.splice(i, 1); continue; }
        q.vy += q.grav * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
      for (let i = toasts.length - 1; i >= 0; i--) { toasts[i].t += dt; if (toasts[i].t > 1.4) toasts.splice(i, 1); }
      if (!ready) return;
      for (const b of world.bricks) {
        if (b.tremble) { b.tremble.t += dt; if (b.tremble.t >= TREMBLE.sec) b.tremble = null; }
      }
      const held = ctx.input.held;
      world.step(dt, over ? null : { left: held.left, right: held.right, down: held.down });
      const h = world.heightPx();
      if (!over) {
        maxH = Math.max(maxH, h);
        checkGrants();
        if (h >= stageLinePx(stage)) { hold += dt; if (hold >= HOLD_SEC) stageClear(); } else hold = 0;
        if (autoSpawn && !world.controlled && !world.busy() && !spawning) trySpawn();
      }
      syncItemButton();
      // 카메라: 탑 꼭대기가 화면 위쪽 40%를 넘으면 따라 올라감(내려가지 않음)
      const target = Math.min(camY, PT - h - H * 0.4);
      camY += (target - camY) * (1 - Math.pow(0.04, dt));
      if (over && !ended) {
        endTimer -= dt;
        if (endTimer <= 0) { ended = true; ctx.endGame(Math.floor(maxH / PX_PER_M)); }
      }
    }

    return {
      get debug() {
        return {
          get world() { return world; },
          get ready() { return ready; },
          get stage() { return stage; },
          get maxHeightM() { return maxH / PX_PER_M; },
          get hold() { return hold; },
          get camY() { return camY; },
          get over() { return over; },
          get spawned() { return spawned; },
          lostLog,
          get inventory() { return inventory; },
          get granted() { return granted; },
          get itemUsable() { return itemUsable(); },
          get lastTremble() { return lastTremble && { ...lastTremble, ...trembleOffset(lastTremble.t, lastTremble.k) }; },
          // 검증용: 최고 높이를 직접 넣어 10m 보상 확인
          setMaxHeightM(m) { maxH = Math.max(maxH, m * PX_PER_M); },
          useItem,
          get autoSpawn() { return autoSpawn; },
          set autoSpawn(v) { autoSpawn = !!v; },
          // 검증용: 조종 중인 벽돌을 (벌칙 없이) 지우고 지정 벽돌을 바로 내린다
          spawn(shape = 'O', magic = null) {
            if (!ready) return null;
            if (world.controlled) world.removeBrick(world.controlled, true);
            return doSpawn(shape, magic);
          },
          // 검증용: 받침대 위에 O 벽돌 기둥을 바로 세운다(스테이지 클리어 확인)
          buildColumn(n = 6) {
            if (!ready) return;
            const top = world.settledTop();
            const base = top === Infinity ? PT : top;
            for (let i = 0; i < n; i++) world.place('O', W / 2, base - 23.5 - i * 47.2);
          },
        };
      },
      start() {
        ctx.hud.setScore('');
        offs.forEach((o) => o && o());
        offs = [
          ctx.input.on('jump', () => { if (ready && !over) world.rotate(); }),
          ctx.input.on('item', () => { useItem(); }),
        ];
        if (ctx.input.setItem) ctx.input.setItem({ count: inventory, enabled: false });
        loadMatter().then((M) => {
          if (destroyed) return;
          world = createWorld(M, { width: W, platformTop: PT, platformW: PLATFORM_W, platformH: PLATFORM_H, onContact, onSettled, onLost, onMagic });
          ready = true;
        }).catch((e) => { console.error(e); loadError = true; });
      },
      update,
      render,
      destroy() {
        destroyed = true;
        offs.forEach((o) => o && o());
        offs = [];
      },
    };
  },
};
