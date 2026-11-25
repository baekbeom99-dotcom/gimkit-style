import {
  PX_PER_M, WORLD_W, PLAYER_HALF_W, PLAYER_H, SPIKE_H, SPRING_PAD_HALF, ENERGY_ITEM_GAIN, ITEM_R, CRUMBLE_SEC,
  generatePlatforms, generateItems, generateWindZones, itemTouches, gapAt, createPlayer, stepPlayer, pickRespawnPlatform,
} from './world.js';
import { drawBackground } from './themes.js';
import { getBest } from '../../core/storage.js';
import {
  drawCharacter, drawPlatformPro, drawPickupPro, drawBadgePill, drawBannerCard, createParticlePool,
} from '../common/canvas-fx.js';

const FOLLOW = 340;       // player stays ~340px above the bottom edge (touch pads cover the lowest part)
const START_CAM = -220;   // ground sits above the pads at the start
const RESPAWN_INVINCIBLE = 1.0;
const RING_SEC = 0.4;     // double-jump ring/puff cue lifetime
const SPRING_ANIM = 0.3;  // spring pad squash time after a bounce
const BANNER_SEC = 1.6;
const FLOAT_SEC = 1.0;

export default {
  id: 'jump',
  title: '점프맵',
  icon: '🦘',
  controls: 'jump',
  energyMax: 15, // 에너지 가득 = 15회 점프
  fullscreen: true, // 셸이 캔버스를 화면 전체로 채우고 HUD를 위에 겹침
  create(ctx) {
    const { g2d: g, width: W, height: H } = ctx;
    let platforms, player, camY, maxY, lastSafe, topY, topX, over, destroyed, quizBusy, jumpPress, time, shownText, best;
    let items, platCarry, itemCarry, seed, floats, banner, pendingLand, zeroFlash, winds;
    let offJump = null;
    let rings = [];
    let squash = 0;
    let moveAmt = 0, movePhase = 0;
    const particles = createParticlePool(80);

    const toScreenY = (wy) => H - (wy - camY);
    const heightM = () => Math.max(0, Math.floor(maxY / PX_PER_M));

    function extend() {
      while (topY < camY + H + 500) {
        const nextY = topY + gapAt(topY);
        const chunk = generatePlatforms(nextY, nextY + 700, ctx.rng, { startX: topX, carry: platCarry, seed });
        items.push(...generateItems(chunk, nextY, nextY + 700, ctx.rng, itemCarry));
        const solids = chunk.filter((p) => p.type !== 'spike');
        const last = solids[solids.length - 1];
        platforms.push(...chunk);
        topY = last.y;
        topX = last.x + last.w / 2;
      }
    }

    function reset() {
      platforms = [{ x: 0, y: 0, w: WORLD_W, type: 'static', surface: 'normal' }];
      seed = Math.floor(ctx.rng() * 0x7fffffff); // per-game seed: the section order differs every run
      platCarry = {}; itemCarry = {}; items = []; floats = []; banner = null; pendingLand = false; zeroFlash = 0; winds = [];
      topY = 0; topX = WORLD_W / 2;
      extend();
      player = createPlayer(WORLD_W / 2, 0);
      player.onGround = true; player.ground = platforms[0];
      camY = START_CAM; maxY = 0; lastSafe = platforms[0];
      over = false; quizBusy = false; jumpPress = false; time = 0; shownText = ''; rings = []; squash = 0; moveAmt = 0; movePhase = 0; particles.clear();
    }

    function updateHud(force) {
      // 기록은 캔버스 우측 상단 알약에 그리므로 상단 표시줄 글씨는 비움(중복 제거)
      if (force || shownText !== '') { shownText = ''; ctx.hud.setScore(''); }
    }

    function respawn() {
      const p = pickRespawnPlatform(platforms, lastSafe, camY); // stays above the touch pads
      player.x = p.x + p.w / 2;
      player.y = p.y; player.vy = 0;
      player.onGround = true; player.ground = p;
      player.invincible = RESPAWN_INVINCIBLE;
      player.airJumped = false;
      pendingLand = true; // standing again after the respawn: the landing-quiz check applies here too
    }

    function loseHeart() {
      if (over) return false;
      ctx.sfx.play('hit');
      const left = ctx.hearts.lose();
      if (left <= 0) {
        over = true;
        ctx.endGame(maxY > 0 ? heightM() : 0);
        return false;
      }
      return true;
    }

    // One quiz at a time. retry: after a ground jump press was blocked, jump once the energy is back.
    async function runQuiz(opts, retry) {
      if (quizBusy || over || destroyed) return;
      quizBusy = true;
      try { await (opts ? ctx.requestQuiz(opts) : ctx.requestQuiz()); } catch (e) { console.error(e); }
      quizBusy = false;
      if (retry && !over && !destroyed && ctx.energy.value > 0) jumpPress = true;
    }

    function addFloat(text, x, y, color) { floats.push({ text, x, y, t: 0, color }); }

    function handle(events) {
      for (const ev of events) {
        if (over) return;
        if (ev === 'jumped') { ctx.energy.spend(1); ctx.sfx.play('jump'); }
        else if (ev === 'doubleJumped') {
          ctx.energy.spend(1); ctx.sfx.play('jump');
          rings.push({ x: player.x, y: player.y, t: 0 });
          particles.emitSparks(player.x, player.y, '#fff6c2', 6);
        }
        else if (ev === 'blocked') {
          // a jump wanted without energy: on the ground it opens the quiz, in the air nothing happens
          if (player.onGround) runQuiz(null, true);
          else if (zeroFlash <= 0) { zeroFlash = 0.6; addFloat('⚡ 0', player.x, player.y + PLAYER_H + 8, '#ff6b6b'); }
        }
        else if (ev === 'landed') {
          pendingLand = true;
          squash = 1;
          particles.emitDust(player.x, player.y, 5);
          const gnd = player.landedOn;
          if (gnd && gnd.type !== 'spike' && gnd.surface !== 'crumble') lastSafe = gnd;
        }
        else if (ev === 'sprang') {
          ctx.sfx.play('jump');
          if (player.landedOn) player.landedOn.springT = SPRING_ANIM;
          rings.push({ x: player.x, y: player.y, t: 0 });
          particles.emitSparks(player.x, player.y, '#ffd23f', 8);
        }
        else if (ev === 'crumbled') {
          ctx.sfx.play('step');
          particles.emitChips(player.x, player.y, '#b37148', 5);
        }
        else if (ev === 'hit') loseHeart();
        else if (ev === 'fell') { if (loseHeart()) respawn(); }
      }
    }

    function collect() {
      for (const it of items) {
        if (it.taken || !itemTouches(player, it)) continue;
        if (it.type === 'energy') {
          it.taken = true;
          ctx.energy.add(ENERGY_ITEM_GAIN);
          ctx.sfx.play('correct');
          particles.emitSparks(it.x, it.y, '#ffd23f', 8);
          addFloat(`+${ENERGY_ITEM_GAIN}⚡`, it.x, it.y + 10, '#ffd23f');
        } else if (!quizBusy && !over) {
          it.taken = true;
          ctx.sfx.play('correct');
          particles.emitSparks(it.x, it.y, '#c4a6ff', 8);
          runQuiz({ mode: 'manual' }, false);
        }
      }
    }

    function touchCheckpoint() {
      const gd = player.onGround ? player.ground : null;
      if (!gd || gd.feature !== 'checkpoint' || gd.reached) return;
      gd.reached = true;
      if (ctx.hearts.add) ctx.hearts.add(1);
      ctx.sfx.play('correct');
      particles.emitSparks(gd.x + gd.w / 2, gd.y + 34, '#3ccf5a', 10);
      banner = { text: `${gd.cp ?? Math.round(gd.y / PX_PER_M)}m 체크포인트!`, t: 0, dur: BANNER_SEC };
    }

    // verification helper only: jump the world forward to height wy (px) and stand on the platform there
    function teleport(wy) {
      camY = Math.max(camY, wy - FOLLOW);
      extend();
      let p = null;
      for (const q of platforms) if (q.type !== 'spike' && !q.gone && q.y >= wy && (!p || q.y < p.y)) p = q;
      player.x = p.x + p.w / 2; player.y = p.y; player.vy = 0; player.onGround = true; player.ground = p;
      maxY = Math.max(maxY, p.y); lastSafe = p; camY = Math.max(camY, p.y - FOLLOW);
      extend();
      winds = generateWindZones(camY - 100, camY + H + 100, seed);
      return p;
    }

    // ---- drawing helpers (world x == screen x, world y goes up) ----
    const PLAT_OPTS = { spikeH: SPIKE_H, springPadHalf: SPRING_PAD_HALF, springAnim: SPRING_ANIM, crumbleSec: CRUMBLE_SEC, worldW: WORLD_W, viewH: H };
    function drawPlatform(p, sy) { drawPlatformPro(g, p, sy, time, PLAT_OPTS); }
    function drawItem(it, sy) { drawPickupPro(g, it, sy, time, ITEM_R); }

    function drawWind(z) {
      const top = toScreenY(z.y1), bot = toScreenY(z.y0);
      if (bot < 0 || top > H) return;
      const t0 = Math.max(0, top), t1 = Math.min(H, bot), h = z.y1 - z.y0, dirn = Math.sign(z.vx);
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(0, t0, W, t1 - t0);
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 2;
      g.lineCap = 'round';
      for (let k = 0; k < 16; k++) {
        const x = (((k * 97 + time * z.vx * 2.4 + k * k * 11) % (W + 60)) + W + 60) % (W + 60) - 30;
        const y = toScreenY(z.y0 + ((k * 53 + k * k * 17) % h));
        if (y < t0 || y > t1) continue;
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x - dirn * 28, y);
        g.stroke();
      }
      // arrow at the edge the wind blows towards
      const ay = (t0 + t1) / 2, ax = dirn > 0 ? W - 16 : 16;
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.strokeStyle = 'rgba(27,19,64,0.7)';
      g.lineWidth = 2;
      for (let k = 0; k < 2; k++) {
        const bx = ax - dirn * k * 11;
        g.beginPath();
        g.moveTo(bx - dirn * 7, ay - 9); g.lineTo(bx + dirn * 7, ay); g.lineTo(bx - dirn * 7, ay + 9);
        g.closePath();
        g.stroke(); g.fill();
      }
      g.restore();
    }

    return {
      get debug() { return { player, platforms, items, teleport, get camY() { return camY; }, get banner() { return banner; }, get winds() { return winds; } }; },
      start() {
        destroyed = false;
        try { best = getBest('jump') || 0; } catch { best = 0; }
        reset();
        ctx.energy.add(ctx.energy.max);
        offJump = ctx.input.on('jump', () => { jumpPress = true; });
        updateHud(true);
      },

      update(dt) {
        if (over || destroyed) return;
        time += dt;
        if (squash > 0) squash = Math.max(0, squash - dt * 4);
        particles.step(dt);
        for (const r of rings) r.t += dt;
        rings = rings.filter((r) => r.t < RING_SEC);
        for (const p of platforms) {
          if (p.springT > 0) p.springT = Math.max(0, p.springT - dt);
          if (p.type !== 'moving') continue;
          const nx = p.baseX + Math.sin(time * p.speed + p.phase) * p.range;
          p.dx = nx - p.x;
          p.x = nx;
        }
        for (const f of floats) f.t += dt;
        floats = floats.filter((f) => f.t < FLOAT_SEC);
        if (banner) { banner.t += dt; if (banner.t > BANNER_SEC) banner = null; }
        if (zeroFlash > 0) zeroFlash -= dt;
        winds = generateWindZones(camY - 100, camY + H + 100, seed);
        player.fallLimit = camY - 20;
        const held = ctx.input.held;
        const press = jumpPress; jumpPress = false;
        const res = stepPlayer(player, { left: held.left, right: held.right, jump: press, canJump: ctx.energy.value > 0 }, dt, platforms, { wind: winds });
        const moving = (!!held.left !== !!held.right) || Math.abs(player.vx || 0) > 18;
        moveAmt += ((moving ? 1 : 0) - moveAmt) * Math.min(1, dt * 14);
        if (moveAmt > 0.02) {
          const prevScoot = Math.floor(movePhase / Math.PI);
          movePhase += dt * (player.onGround ? 16 : 8);
          if (player.onGround && moving && Math.floor(movePhase / Math.PI) !== prevScoot) {
            particles.emitDust(player.x - player.facing * 8, player.y, 2);
          }
        }
        maxY = Math.max(maxY, player.y);
        camY = Math.max(camY, player.y - FOLLOW);
        handle(res.events);
        collect();
        touchCheckpoint();
        // energy ran out: the jump in progress is finished; the quiz comes as soon as the character lands
        if (pendingLand) {
          pendingLand = false;
          // 스프링 점프대에 착지하면 바로 튀어 올라 onGround가 아니므로, 착지 이벤트가 있었으면 조건 없이 퀴즈
          if (ctx.energy.value <= 0 && !quizBusy && !over) runQuiz(null, false);
        }
        extend();
        // drop platforms far below
        if (platforms.length > 120) {
          platforms = platforms.filter((p) => p.y > camY - 300 || p === player.ground || p === lastSafe);
          items = items.filter((it) => !it.taken && it.y > camY - 300);
        }
        updateHud(false);
      },

      render() {
        drawBackground(g, W, H, camY, time); // altitude themes (themes.js)

        // 10m height lines
        g.font = 'bold 12px sans-serif';
        g.textAlign = 'left';
        const m0 = Math.max(10, Math.ceil(camY / PX_PER_M / 10) * 10);
        for (let mm = m0; toScreenY(mm * PX_PER_M) > -10; mm += 10) {
          const sy = toScreenY(mm * PX_PER_M);
          g.strokeStyle = 'rgba(255,255,255,0.45)';
          g.setLineDash([6, 6]);
          g.beginPath(); g.moveTo(0, sy); g.lineTo(W, sy); g.stroke();
          g.setLineDash([]);
          g.fillStyle = 'rgba(255,255,255,0.8)';
          g.fillText(mm + 'm', 6, sy - 4);
        }

        // wind zones (behind the platforms)
        for (const z of winds) drawWind(z);

        // platforms
        for (const p of platforms) {
          if (p.gone) continue;
          const sy = toScreenY(p.y);
          if (sy < -60 || sy > H + 60) continue;
          drawPlatform(p, sy);
        }

        // pickups
        for (const it of items) {
          if (it.taken) continue;
          const sy = toScreenY(it.y);
          if (sy < -30 || sy > H + 30) continue;
          drawItem(it, sy);
        }

        // double-jump cue: expanding ring + puff dots under the character's feet
        for (const r of rings) {
          const k = r.t / RING_SEC, sy = toScreenY(r.y);
          g.save();
          g.globalAlpha = 1 - k;
          g.strokeStyle = '#ffffff';
          g.lineWidth = 4 * (1 - k) + 1;
          g.beginPath(); g.ellipse(r.x, sy, 10 + 26 * k, 4 + 8 * k, 0, 0, Math.PI * 2); g.stroke();
          g.fillStyle = '#fff6c2';
          for (let n = 0; n < 6; n++) {
            const a = (n / 6) * Math.PI * 2;
            g.beginPath(); g.arc(r.x + Math.cos(a) * (8 + 30 * k), sy + Math.sin(a) * (3 + 10 * k) + 6 * k, 3 * (1 - k) + 1, 0, Math.PI * 2); g.fill();
          }
          g.restore();
        }

        // player (blinks while invincible)
        drawCharacter(g, {
          x: player.x,
          y: toScreenY(player.y),
          halfW: PLAYER_HALF_W,
          height: PLAYER_H,
          facing: player.facing,
          vy: player.vy,
          onGround: player.onGround,
          invincible: player.invincible,
          squash,
          move: moveAmt,
          movePhase,
          time,
        });

        particles.draw(g, toScreenY);

        // floating texts (+3⚡ ...), world-space
        g.save();
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '900 18px sans-serif';
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(27,19,64,0.85)';
        for (const f of floats) {
          const k = f.t / FLOAT_SEC, sy = toScreenY(f.y) - 36 * k;
          g.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
          g.strokeText(f.text, f.x, sy);
          g.fillStyle = f.color;
          g.fillText(f.text, f.x, sy);
        }
        g.restore();

        // checkpoint banner + 기록 알약: CSS-pixel scaled so text/badge size is constant on any screen
        {
          const cur = `${heightM()}m`;
          const top = `최고 ${Math.max(best, heightM())}m`;
          g.save();
          const cssW = (ctx.canvas && ctx.canvas.clientWidth) || W;
          const k = W / cssW;
          g.scale(k, k);
          if (banner) drawBannerCard(g, cssW, 146, banner);
          drawBadgePill(g, cssW - 10, 62, cur, top);
          g.restore();
        }
      },

      destroy() {
        destroyed = true;
        if (offJump) offJump();
        offJump = null;
      },
    };
  },
};
