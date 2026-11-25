// 못깨는 타워 (2D tower obby): 8 sections + goal, attempts = energy, practice / hard (1 mutator) modes.
import { createPlayer, stepPlayer } from '../jump/world.js';
import { drawBackground } from '../jump/themes.js';
import { recordScore } from '../../core/storage.js';
import { buildTower } from './tower.js';
import { updateHazards, hitReason } from './hazards.js';
import { createMutatorRuntime, pickMutator, preparePlatforms, mutatorBanner, MUTATOR_BY_KIND } from './mutators.js';
import {
  FAIL_SEC, createAttempts, beginAttempt, track, failAttempt, tickFail, isCleared, clearRun,
  metersAt, formatTime, saveBestTime,
} from './attempt.js';
import {
  SPRING_ANIM, drawPlatform, drawPlayer, drawJumpPowerFx, drawSectionLabel, drawWater, drawWaterWarning, drawWindStreaks,
  drawWindArrow, makeConfetti, stepConfetti, drawConfetti, drawBanner, drawPill, drawMutatorCard, drawProgress,
} from './render.js';
import { createParticlePool, hudTopY } from '../common/canvas-fx.js';

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
// 대부분의 칸은 '점프 + 공중 점프' 2번이 필요하다: 땅에서 출발하려면 ⚡2 이상 있어야 하고, 모자라면 착지했을 때 퀴즈가 뜬다
// (⚡1로 출발했다가 공중 점프를 못 써서 떨어지는 일을 막는다).
const GROUND_JUMP_MIN = 2;
const FAIL_TEXT = {
  spike: '가시에 닿았어요!', fall: '떨어졌어요!', water: '물에 빠졌어요!',
  lava: '용암에 빠졌어요! 🔥', laser: '레이저에 닿았어요! ⚡', saw: '톱날에 베였어요! 🪚', crusher: '쾅! 쇠뭉치에 눌렸어요! 🔨',
};
// the shell only has six synthesized sounds: heavy hazards use the low 'wrong' buzz, the rest the usual 'hit'
const FAIL_SFX = { lava: 'wrong', laser: 'wrong' };

export default {
  id: 'obby',
  title: '3학년은 못깨는 타워',
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
    let offJump = null, jumpFx = null, lastJumpScale = 1, squash = 0, moveAmt = 0, movePhase = 0;
    const particles = createParticlePool(80);

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
      updateHazards(platforms, simT);   // lasers on/off, patrolling saws, dropping crushers (pure functions of simT)
    }

    function startAttempt() {
      platforms = base.map((p) => ({ ...p }));
      tower.checkpoints.forEach((cp, i) => { if (i <= att.checkpoint) platforms[cp.platformIndex].reached = true; });
      simT = 0;
      rt.reset();
      jumpFx = null; lastJumpScale = 1;
      moveMovers();
      for (const p of platforms) p.dx = 0;
      const sp = att.respawn;
      const gp = platforms[sp.platformIndex] || platforms[0];
      player = createPlayer(gp.x + gp.w / 2, sp.y);
      player.onGround = true; player.ground = gp;
      camY = sp.y + START_CAM;
      jumpPress = false; rings = []; squash = 0; moveAmt = 0; movePhase = 0; particles.clear();
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
      ctx.sfx.play(FAIL_SFX[reason] || 'hit');
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
      if (kind === 'jumppower') {
        const sc = rt.jumpInfo().scale;
        if (sc !== lastJumpScale) {
          jumpFx = { t: 0, dur: 1.4, scale: sc };
          const down = sc < 1, up = sc > 1;
          banner = { text: down ? '⬇ 점프력 감소!' : up ? '⬆ 점프력 증가!' : '● 점프력 원래대로', sub: `점프 ${Math.round(sc * 100)}%`, t: 0, dur: 1.6, color: down ? '#ff6b6b' : up ? '#7dff8a' : '#ffffff' };
          ctx.sfx.play(down ? 'wrong' : 'correct');
          lastJumpScale = sc;
        }
      }
      moveMovers();
      for (const p of platforms) if (p.springT > 0) p.springT = Math.max(0, p.springT - h);
      player.fallLimit = camY - 20;
      const held = ctx.input.held;
      const press = jumpPress; jumpPress = false;
      // rest platforms are a shelter: no wind / drift while standing on one (fair breather between sections)
      const sheltered = player.onGround && player.ground && player.ground.rest;
      const env = sheltered && (kind === 'wind' || kind === 'shake') ? {} : rt.env();
      let landed = false;
      const res = stepPlayer(player, { left: held.left, right: held.right, jump: press, canJump: ctx.energy.value >= ((player.onGround || player.coyote > 0) ? GROUND_JUMP_MIN : 1) }, h, platforms, env);
      camY = Math.max(camY, player.y - FOLLOW);
      for (const ev of res.events) {
        if (ev === 'jumped') { ctx.energy.spend(1); ctx.sfx.play('jump'); }
        else if (ev === 'blocked') { if (player.onGround) runQuiz(true); }
        else if (ev === 'landed') { landed = true; squash = 1; particles.emitDust(player.x, player.y, 5); }
        else if (ev === 'doubleJumped') { ctx.energy.spend(1); ctx.sfx.play('jump'); rings.push({ x: player.x, y: player.y, t: 0 }); particles.emitSparks(player.x, player.y, '#fff6c2', 6); }
        else if (ev === 'sprang') { ctx.sfx.play('jump'); if (player.landedOn) player.landedOn.springT = SPRING_ANIM; rings.push({ x: player.x, y: player.y, t: 0 }); particles.emitSparks(player.x, player.y, '#ffd23f', 8); }
        else if (ev === 'crumbled') { ctx.sfx.play('step'); particles.emitChips(player.x, player.y, '#b37148', 5); }
      }
      if (isCleared(player, tower)) { track(att, player, 0); clear(); return; }
      if (landed && ctx.energy.value < GROUND_JUMP_MIN && !quizBusy && !res.events.includes('hit') && !res.events.includes('fell')) runQuiz(false);
      if (res.events.includes('hit')) return fail(hitReason(player, platforms));
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

    function mutatorDisplay() {
      if (!rt.meta) return null;
      switch (kind) {
        case 'water':
          return { title: '🌊 물 차오름', desc: '물이 차올라요! 위로 피하세요', accent: '#38bdf8' };
        case 'shake':
          return { title: '🤝 손 떨림', desc: '화면과 조작이 살짝 흔들려요', accent: '#fb923c' };
        case 'lowgravity':
          return { title: '🪶 무중력', desc: '점프가 높이·오래 떠올라요', accent: '#c084fc' };
        case 'crumbleAll':
          return { title: '🧱 발판 무너짐', desc: '밟은 발판이 곧 부서져요!', accent: '#f87171' };
        case 'wind': {
          const right = rt.windDir > 0;
          return {
            title: `💨 강풍 (${right ? '→ 오른쪽' : '← 왼쪽'})`,
            desc: `${right ? '오른쪽' : '왼쪽'}으로 계속 밀려나요`,
            accent: '#60a5fa',
          };
        }
        case 'jumppower': {
          const j = rt.jumpInfo();
          const pct = Math.round(j.scale * 100);
          const arrow = j.scale > 1 ? '▲' : j.scale < 1 ? '▼' : '●';
          const accent = j.scale > 1 ? '#4ade80' : j.scale < 1 ? '#f87171' : '#ffd23f';
          const rem = Math.ceil(j.remaining);
          return {
            title: `⏱ 점프력 ${pct}% ${arrow}`,
            desc: `${rem}초 뒤 ${Math.round(j.next * 100)}%로 변경`,
            accent,
            progress: Math.max(0, Math.min(1, j.remaining / 10)),
          };
        }
        default:
          return { title: `${rt.meta.emoji} ${rt.meta.label}`, desc: rt.meta.description, accent: '#ffd23f' };
      }
    }

    function drawOverlayCss() {
      const k = cssScale();
      const cssW = W / k, cssH = H / k;
      g.save();
      g.scale(k, k);
      const n = tower.sections.length;
      const topY = hudTopY(ctx.canvas, 66, 10);
      const pillBot = drawPill(g, cssW, `구간 ${att.attemptSection}/${n}`, `도전 ${att.attempts} · ⚡${ctx.energy.value}`, topY);
      const mInfo = mutatorDisplay();
      const mutBot = mInfo ? drawMutatorCard(g, cssW, topY, mInfo) : pillBot;
      const top = pillBot + 14;
      const bottom = Math.max(top + 120, cssH * 0.54);
      const frac = Math.max(0, player.y) / tower.height, best = att.runMaxY / tower.height;
      drawProgress(g, top, bottom, frac, best, n, tower.checkpoints.map((c) => c.y / tower.height));
      // banners sit cleanly below both top boxes
      const by = Math.max(pillBot, mutBot) + 14;
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
              id = await ctx.choose({ title: '🗼 3학년은 못깨는 타워', subtitle: '어떤 모드로 도전할까요?', options: MODE_OPTIONS });
            }
          } catch (e) { console.warn(e); }
          if (destroyed || att) return; // a debug setup() may have run already
          setup(id === 'hard' ? 'hard' : 'practice');
        })();
      },

      update(dt) {
        if (destroyed) return;
        time += dt;
        if (squash > 0) squash = Math.max(0, squash - dt * 4);
        particles.step(dt);
        if (jumpFx) { jumpFx.t += dt; if (jumpFx.t > jumpFx.dur) jumpFx = null; }
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
        const held = ctx.input.held;
        const moving = (!!held.left !== !!held.right) || Math.abs(player.vx || 0) > 18;
        moveAmt += ((moving ? 1 : 0) - moveAmt) * Math.min(1, dt * 14);
        if (moveAmt > 0.02) {
          const prevScoot = Math.floor(movePhase / Math.PI);
          movePhase += dt * (player.onGround ? 16 : 8);
          if (player.onGround && moving && Math.floor(movePhase / Math.PI) !== prevScoot) {
            particles.emitDust(player.x - player.facing * 8, player.y, 2);
          }
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
        drawPlayer(g, player, toScreenY(player.y), att.phase === 'failed', time, squash, moveAmt, movePhase);
        particles.draw(g, toScreenY);
        if (kind === 'jumppower' && att.phase === 'playing') drawJumpPowerFx(g, W, H, player, toScreenY(player.y), rt.jumpInfo(), jumpFx, time);

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
