// 못깨는 타워 (2D tower obby): 8 sections + goal, attempts = energy, practice / hard (1 mutator) modes.
import { createPlayer, stepPlayer } from '../jump/world.js';
import { drawBackground } from '../jump/themes.js';
import { recordScore } from '../../core/storage.js';
import { buildTower } from './tower.js';
import { createMutatorRuntime, pickMutator, preparePlatforms, mutatorBanner, MUTATOR_BY_KIND } from './mutators.js';
import {
  FAIL_SEC, createAttempts, beginAttempt, track, failAttempt, tickFail, isCleared, clearRun,
  metersAt, formatTime, saveBestTime,
} from './attempt.js';
import {
  SPRING_ANIM, drawPlatform, drawPlayer, drawSectionLabel, drawWater, drawWaterWarning, drawWindStreaks,
  drawWindArrow, makeConfetti, stepConfetti, drawConfetti, drawBanner, drawPill, drawChip, drawProgress,
} from './render.js';

const SECTION_COUNT = 8;
const FOLLOW = 340;       // player stays ~340px above the bottom edge (touch pads cover the lowest part)
const START_CAM = -220;   // the spawn platform sits above the pads
const STEP = 1 / 60;      // physics sub-step (same as the solver)
const RING_SEC = 0.4;
const CLEAR_END_DELAY = 0.6; // confetti first, then the review overlay
const FAIL_BANNER_SEC = 1.7;
const INFO_BANNER_SEC = 2.6;
const WATER_SINK = 6;     // feet this far under the surface = fail

const MODE_OPTIONS = [
  { id: 'practice', label: '연습', emoji: '🚩', desc: '체크포인트 있음 · 변형 없음' },
  { id: 'hard', label: '못깨는', emoji: '🔥', desc: '체크포인트 없음 · 변형 효과 1개' },
];
const FAIL_TEXT = { spike: '가시에 닿았어요!', fall: '떨어졌어요!', water: '물에 빠졌어요!' };

export default {
  id: 'obby',
  title: '못깨는 타워',
  icon: '🗼',
  controls: 'jump',
  fullscreen: true,
  hideHearts: true,
  energyMax: 15,          // 점프맵과 같음: 점프 1번(이단 점프 포함) = ⚡1, 떨어지거나 가시에 닿아도 ⚡1
  energyGainMultiplier: 1,
  create(ctx) {
    const { g2d: g, width: W, height: H } = ctx;
    let mode = null, kind = 'none', tower = null, base = null, platforms = [], player = null, att = null, rt = null;
    let camY = START_CAM, simT = 0, time = 0, jumpPress = false, quizBusy = false, destroyed = false;
    let banner = null, info = null, rings = [], confetti = [], clearT = 0, endCalled = false, clearInfo = null;
    let offJump = null;

    const toScreenY = (wy) => H - (wy - camY);
    const cssScale = () => { const cssW = (ctx.canvas && ctx.canvas.clientWidth) || W; return W / cssW; };

    function setup(modeId, kindOverride) {
      mode = modeId === 'hard' ? 'hard' : 'practice';
      kind = mode === 'hard' ? (MUTATOR_BY_KIND.has(kindOverride) ? kindOverride : pickMutator(ctx.rng)) : 'none';
      tower = buildTower(ctx.rng, { mode, sectionCount: SECTION_COUNT, mutator: kind === 'none' ? undefined : kind });
      base = preparePlatforms(kind, tower.platforms);
      rt = createMutatorRuntime(kind, ctx.rng);
      att = createAttempts({ mode, tower });
      banner = null; info = null; confetti = []; endCalled = false; clearInfo = null;
      nextAttempt();
    }

    function nextAttempt() {
      if (destroyed || !att || att.phase === 'cleared') return;
      const r = beginAttempt(att, ctx.energy.value);
      if (r === 'quiz') runQuiz();
      else if (r === 'start') startAttempt();
    }

    // the loop is paused by the shell while the quiz is open. Between attempts (needsQuiz) the next attempt
    // starts afterwards; mid-attempt (energy ran out on landing / a blocked ground jump) play just resumes.
    async function runQuiz(retryJump) {
      if (quizBusy || destroyed) return;
      quizBusy = true;
      try { await ctx.requestQuiz(); } catch (e) { console.error(e); }
      quizBusy = false;
      if (destroyed || !att) return;
      if (att.phase === 'needsQuiz' && ctx.energy.value >= 1) nextAttempt();
      else if (retryJump && att.phase === 'playing' && ctx.energy.value > 0) jumpPress = true;
    }

    function moveMovers() {
      for (const p of platforms) {
        if (p.type !== 'moving') continue;
        const nx = p.baseX + Math.sin(simT * p.speed + p.phase) * p.range;
        p.dx = nx - p.x;
        p.x = nx;
      }
    }

    function startAttempt() {
      platforms = base.map((p) => ({ ...p }));
      tower.checkpoints.forEach((cp, i) => { if (i <= att.checkpoint) platforms[cp.platformIndex].reached = true; });
      simT = 0;
      rt.reset();
      moveMovers();
      for (const p of platforms) p.dx = 0;
      const sp = att.respawn;
      const gp = platforms[sp.platformIndex] || platforms[0];
      player = createPlayer(gp.x + gp.w / 2, sp.y);
      player.onGround = true; player.ground = gp;
      camY = sp.y + START_CAM;
      jumpPress = false; rings = [];
      const mb = mutatorBanner(kind);
      if (mb) info = { text: mb.title, sub: mb.sub, t: 0, dur: INFO_BANNER_SEC };
      else if (att.attempts === 1) info = { text: '🚩 연습 모드', sub: '2구간마다 체크포인트! 거기서 다시 시작해요', t: 0, dur: INFO_BANNER_SEC };
      else info = { text: `🚩 ${sp.section}구간부터 다시!`, t: 0, dur: INFO_BANNER_SEC - 0.8 };
    }

    function saveProgress() {
      if (!att) return;
      try { recordScore('obby', metersAt(att.runMaxY)); } catch (e) { console.warn(e); }
    }

    function fail(reason) {
      const r = failAttempt(att, reason);
      ctx.energy.spend(1); // 떨어져도 에너지 차감
      ctx.sfx.play('hit');
      saveProgress();
      banner = { text: `이번 도전 ${r.section}구간 · 최고 ${r.best}구간`, sub: FAIL_TEXT[reason] || '', t: 0, dur: FAIL_BANNER_SEC, color: '#ff6b6b' };
      info = null;
      player.onGround = false; player.ground = null;
      if (reason === 'water') player.vy = Math.min(player.vy, -40);
    }

    function clear() {
      if (!clearRun(att)) return;
      ctx.sfx.play('correct');
      saveProgress();
      const bt = saveBestTime(mode, att.runTime);
      clearInfo = { time: att.runTime, attempts: att.attempts, best: bt };
      confetti = makeConfetti(ctx.rng, W, H);
      banner = { text: '🎉 클리어!', sub: `걸린 시간 ${formatTime(att.runTime)}`, t: 0, dur: 3, color: '#4ccf5a' };
      info = null;
      clearT = 0;
    }

    function callEnd() {
      endCalled = true;
      const lines = [`걸린 시간 ${formatTime(clearInfo.time)} · 도전 ${clearInfo.attempts}번`];
      lines.push(clearInfo.best.isNew ? '🏆 최단 기록!' : `최단 기록 ${formatTime(clearInfo.best.best)}`);
      ctx.endGame(metersAt(tower.height), {
        review: true, heading: '🎉 클리어!', label: '도달 높이', unit: 'm', lines, buttonsDelayMs: 1200,
      });
    }

    function stepOnce(h) {
      simT += h;
      rt.update(h);
      moveMovers();
      for (const p of platforms) if (p.springT > 0) p.springT = Math.max(0, p.springT - h);
      player.fallLimit = camY - 20;
      const held = ctx.input.held;
      const press = jumpPress; jumpPress = false;
      // rest platforms are a shelter: no wind / drift while standing on one (fair breather between sections)
      const sheltered = player.onGround && player.ground && player.ground.rest;
      const env = sheltered && (kind === 'wind' || kind === 'shake') ? {} : rt.env();
      let landed = false;
      const res = stepPlayer(player, { left: held.left, right: held.right, jump: press, canJump: ctx.energy.value > 0 }, h, platforms, env);
      camY = Math.max(camY, player.y - FOLLOW);
      for (const ev of res.events) {
        if (ev === 'jumped') { ctx.energy.spend(1); ctx.sfx.play('jump'); }
        else if (ev === 'blocked') { if (player.onGround) runQuiz(true); }
        else if (ev === 'landed') landed = true;
        else if (ev === 'doubleJumped') { ctx.energy.spend(1); ctx.sfx.play('jump'); rings.push({ x: player.x, y: player.y, t: 0 }); }
        else if (ev === 'sprang') { ctx.sfx.play('jump'); if (player.landedOn) player.landedOn.springT = SPRING_ANIM; rings.push({ x: player.x, y: player.y, t: 0 }); }
        else if (ev === 'crumbled') ctx.sfx.play('step');
      }
      if (isCleared(player, tower)) { track(att, player, 0); clear(); return; }
      if (landed && ctx.energy.value <= 0 && !quizBusy && !res.events.includes('hit') && !res.events.includes('fell')) runQuiz(false);
      if (res.events.includes('hit')) return fail('spike');
      if (res.events.includes('fell')) return fail('fall');
      if (kind === 'water' && player.y + WATER_SINK < rt.waterY(tower.spawn.y)) return fail('water');
      for (const ev of track(att, player, h)) {
        if (ev !== 'checkpoint') continue;
        const cp = tower.checkpoints[att.checkpoint];
        if (platforms[cp.platformIndex]) platforms[cp.platformIndex].reached = true;
        ctx.sfx.play('correct');
        banner = { text: '🚩 체크포인트!', sub: `다음 도전은 ${cp.section + 1}구간부터`, t: 0, dur: 1.8, color: '#4ccf5a' };
      }
    }

    // ---- debug helpers (verification only) ----
    function standOn(p) {
      player.x = p.x + p.w / 2; player.y = p.y; player.vy = 0; player.vx = 0;
      player.onGround = true; player.ground = p; player.airJumped = false;
      camY = p.y + START_CAM;
      return p;
    }
    function teleport(wy) {
      let p = null;
      for (const q of platforms) if (q.type !== 'spike' && !q.gone && q.y >= wy && (!p || q.y < p.y)) p = q;
      return p ? standOn(p) : null;
    }

    function drawOverlayCss() {
      const k = cssScale();
      const cssW = W / k, cssH = H / k;
      g.save();
      g.scale(k, k);
      const n = tower.sections.length;
      let y = drawPill(g, cssW, `구간 ${att.attemptSection}/${n}`, `도전 ${att.attempts} · ⚡${ctx.energy.value}`) + 6;
      if (rt.meta) {
        if (kind === 'jumppower') {
          const j = rt.jumpInfo();
          const pct = Math.round(j.scale * 100);
          const arrow = j.scale > 1 ? '▲' : j.scale < 1 ? '▼' : '●';
          const col = j.scale > 1 ? '#7dff8a' : j.scale < 1 ? '#ff9a9a' : '#ffffff';
          y = drawChip(g, cssW, y, `⏱ 점프 ${arrow}${pct}%`, col) + 4;
          const rem = Math.ceil(j.remaining);
          y = drawChip(g, cssW, y, `${rem}초 뒤 ${Math.round(j.next * 100)}%`, rem <= 3 ? '#ffd23f' : '#ffffff') + 4;
        } else {
          y = drawChip(g, cssW, y, `${rt.meta.emoji} ${rt.meta.label}`) + 4;
        }
      }
      const top = 140, bottom = Math.max(top + 120, cssH * 0.52);
      const frac = Math.max(0, player.y) / tower.height, best = att.runMaxY / tower.height;
      drawProgress(g, top, bottom, frac, best, n, tower.checkpoints.map((c) => c.y / tower.height));
      // banners go under the pill / chips so they never cover the counters
      const by = Math.max(140, y + 8);
      if (banner) drawBanner(g, cssW, banner, by);
      if (info) drawBanner(g, cssW, info, banner ? by + (banner.sub ? 80 : 56) : by);
      g.restore();
    }

    return {
      get debug() {
        return {
          get player() { return player; }, get tower() { return tower; }, get platforms() { return platforms; },
          get att() { return att; }, get mode() { return mode; }, get kind() { return kind; }, get rt() { return rt; },
          get camY() { return camY; }, get banner() { return banner; }, get info() { return info; },
          setup, setMutator: (k) => setup('hard', k), teleport,
          advance(sec) { // stand on the rest platform on top of section `sec` (1-based)
            const p = platforms.find((q) => q.rest && q.section === sec - 1);
            return p ? standOn(p) : null;
          },
          forceClear() { const p = platforms.find((q) => q.feature === 'goal'); return p ? standOn(p) : null; },
          forceFail(reason = 'fall') { if (att && att.phase === 'playing') fail(reason); },
        };
      },

      start() {
        destroyed = false;
        ctx.energy.add(ctx.energy.max);
        offJump = ctx.input.on('jump', () => { jumpPress = true; });
        if (ctx.hud && ctx.hud.setScore) ctx.hud.setScore('');
        (async () => {
          let id = 'practice';
          try {
            if (typeof ctx.choose === 'function') {
              id = await ctx.choose({ title: '🗼 못깨는 타워', subtitle: '어떤 모드로 도전할까요?', options: MODE_OPTIONS });
            }
          } catch (e) { console.warn(e); }
          if (destroyed || att) return; // a debug setup() may have run already
          setup(id === 'hard' ? 'hard' : 'practice');
        })();
      },

      update(dt) {
        if (destroyed) return;
        time += dt;
        for (const r of rings) r.t += dt;
        rings = rings.filter((r) => r.t < RING_SEC);
        if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }
        if (info) { info.t += dt; if (info.t > info.dur) info = null; }
        if (confetti.length) stepConfetti(confetti, dt, H);
        if (!att) return;
        if (att.phase === 'needsQuiz') { if (!quizBusy) runQuiz(); return; }
        if (att.phase === 'failed') {
          // short fail beat: the character tumbles out of the picture
          player.vy -= 1400 * dt; player.y += player.vy * dt;
          if (tickFail(att, dt)) nextAttempt();
          return;
        }
        if (att.phase === 'cleared') {
          clearT += dt; simT += dt; moveMovers();
          if (!endCalled && clearT >= CLEAR_END_DELAY) callEnd();
          return;
        }
        if (att.phase !== 'playing') return;
        let rem = Math.min(dt, 0.1);
        while (rem > 1e-6 && att.phase === 'playing') {
          const h = Math.min(STEP, rem);
          rem -= h;
          stepOnce(h);
        }
      },

      render() {
        drawBackground(g, W, H, camY, time);
        if (!att || !player) return;
        g.save();
        const off = rt.cameraOffset();
        if (off.x || off.y) g.translate(off.x, off.y);

        for (const s of tower.sections) {
          const sy = toScreenY((s.y0 + s.y1) / 2);
          if (sy > -60 && sy < H + 60) drawSectionLabel(g, W, s, sy);
        }
        if (kind === 'wind') drawWindStreaks(g, W, H, rt.windDir * 45, time, true);
        else if (kind === 'shake') drawWindStreaks(g, W, H, rt.shake.vx, time, false);

        for (const p of platforms) {
          if (p.gone) continue;
          const sy = toScreenY(p.y);
          if (sy < -70 || sy > H + 40) continue;
          drawPlatform(g, p, sy, time);
        }

        for (const r of rings) {
          const kk = r.t / RING_SEC, sy = toScreenY(r.y);
          g.save();
          g.globalAlpha = 1 - kk;
          g.strokeStyle = '#ffffff';
          g.lineWidth = 4 * (1 - kk) + 1;
          g.beginPath(); g.ellipse(r.x, sy, 10 + 26 * kk, 4 + 8 * kk, 0, 0, Math.PI * 2); g.stroke();
          g.restore();
        }
        drawPlayer(g, player, toScreenY(player.y), att.phase === 'failed');

        if (kind === 'water') {
          const wy = toScreenY(rt.waterY(tower.spawn.y));
          drawWater(g, W, H, wy, time);
          // warning just above the waterline (or at the bottom edge, between the pads, while still below)
          if (att.phase === 'playing' && wy > H - 300 && wy < H + 240) drawWaterWarning(g, W, Math.min(wy - 24, H - 26), time);
        }
        g.restore();

        if (kind === 'wind') drawWindArrow(g, W, H * 0.42, rt.windDir);
        if (confetti.length) drawConfetti(g, confetti);
        if (!endCalled) drawOverlayCss(); // the shell's review banner takes over the top of the screen
      },

      destroy() {
        if (!destroyed && att && att.phase === 'playing') saveProgress();
        destroyed = true;
        if (offJump) offJump();
        offJump = null;
      },
    };
  },
};
