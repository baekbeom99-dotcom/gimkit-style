import {
  PX_PER_M, WORLD_W, PLAYER_HALF_W, PLAYER_H, SPIKE_H, SPRING_PAD_HALF, ENERGY_ITEM_GAIN, ITEM_R, CRUMBLE_SEC,
  generatePlatforms, generateItems, generateWindZones, itemTouches, gapAt, createPlayer, stepPlayer, pickRespawnPlatform,
} from './world.js';
import { drawBackground } from './themes.js';
import { getBest } from '../../core/storage.js';

const FOLLOW = 340;       // player stays ~340px above the bottom edge (touch pads cover the lowest part)
const START_CAM = -220;   // ground sits above the pads at the start
const RESPAWN_INVINCIBLE = 1.0;
const RING_SEC = 0.4;     // double-jump ring/puff cue lifetime
const SPRING_ANIM = 0.3;  // spring pad squash time after a bounce
const BANNER_SEC = 1.6;
const FLOAT_SEC = 1.0;

function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}

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
      over = false; quizBusy = false; jumpPress = false; time = 0; shownText = ''; rings = [];
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
        }
        else if (ev === 'blocked') {
          // a jump wanted without energy: on the ground it opens the quiz, in the air nothing happens
          if (player.onGround) runQuiz(null, true);
          else if (zeroFlash <= 0) { zeroFlash = 0.6; addFloat('⚡ 0', player.x, player.y + PLAYER_H + 8, '#ff6b6b'); }
        }
        else if (ev === 'landed') {
          pendingLand = true;
          const gnd = player.landedOn;
          if (gnd && gnd.type !== 'spike' && gnd.surface !== 'crumble') lastSafe = gnd;
        }
        else if (ev === 'sprang') {
          ctx.sfx.play('jump');
          if (player.landedOn) player.landedOn.springT = SPRING_ANIM;
          rings.push({ x: player.x, y: player.y, t: 0 });
        }
        else if (ev === 'crumbled') ctx.sfx.play('step');
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
          addFloat(`+${ENERGY_ITEM_GAIN}⚡`, it.x, it.y + 10, '#ffd23f');
        } else if (!quizBusy && !over) {
          it.taken = true;
          ctx.sfx.play('correct');
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
      banner = { text: `🚩 ${gd.cp ?? Math.round(gd.y / PX_PER_M)}m 체크포인트!`, t: 0 };
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
    function drawPlatform(p, sy) {
      if (p.type === 'spike') {
        g.fillStyle = '#e8384f';
        const n = Math.max(2, Math.round(p.w / 12));
        const tw = p.w / n;
        for (let s = 0; s < n; s++) {
          g.beginPath();
          g.moveTo(p.x + s * tw, sy);
          g.lineTo(p.x + s * tw + tw / 2, sy - SPIKE_H - 2);
          g.lineTo(p.x + (s + 1) * tw, sy);
          g.closePath();
          g.fill();
        }
        g.fillStyle = '#7a1730';
        g.fillRect(p.x, sy, p.w, 5);
        return;
      }
      if (p.type === 'moving') {
        g.fillStyle = '#2d9cdb';
        rr(g, p.x, sy, p.w, 16, 8); g.fill();
        g.fillStyle = '#9be0ff';
        rr(g, p.x + 2, sy + 1, p.w - 4, 6, 3); g.fill();
        g.fillStyle = '#fff';
        g.font = 'bold 12px sans-serif';
        g.textAlign = 'center';
        g.fillText('◀ ▶', p.x + p.w / 2, sy + 13);
        return;
      }
      if (p.w >= WORLD_W) {
        g.fillStyle = '#8a5a2b';
        g.fillRect(p.x, sy, p.w, H);
        g.fillStyle = '#4ccf5a';
        g.fillRect(p.x, sy, p.w, 10);
        return;
      }
      const cx = p.x + p.w / 2;
      if (p.surface === 'ice') {
        g.fillStyle = '#8fd0f2';
        rr(g, p.x, sy, p.w, 16, 8); g.fill();
        g.fillStyle = '#e4f6ff';
        rr(g, p.x, sy, p.w, 9, 5); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.lineWidth = 2;
        for (let x = p.x + 10; x < p.x + p.w - 8; x += 22) {
          g.beginPath(); g.moveTo(x, sy + 7); g.lineTo(x + 6, sy + 2); g.stroke();
        }
        g.strokeStyle = '#5db3e0';
        g.lineWidth = 1.5;
        rr(g, p.x, sy, p.w, 16, 8); g.stroke();
      } else if (p.surface === 'conveyor') {
        g.fillStyle = '#454b57';
        rr(g, p.x, sy, p.w, 16, 8); g.fill();
        g.fillStyle = '#626b7a';
        rr(g, p.x + 2, sy + 1, p.w - 4, 5, 3); g.fill();
        g.save();
        rr(g, p.x + 6, sy + 2, p.w - 12, 12, 4); g.clip();
        const dirn = p.belt >= 0 ? 1 : -1;
        const off = ((time * 26 * dirn) % 14 + 14) % 14;
        g.strokeStyle = '#ffd23f';
        g.lineWidth = 2.5;
        for (let x = p.x - 14 + off; x < p.x + p.w + 14; x += 14) {
          g.beginPath();
          g.moveTo(x - 3 * dirn, sy + 3); g.lineTo(x + 3 * dirn, sy + 8); g.lineTo(x - 3 * dirn, sy + 13);
          g.stroke();
        }
        g.restore();
        g.fillStyle = '#2b2f38';
        g.beginPath(); g.arc(p.x + 6, sy + 8, 5, 0, Math.PI * 2); g.arc(p.x + p.w - 6, sy + 8, 5, 0, Math.PI * 2); g.fill();
      } else if (p.surface === 'crumble') {
        const t = p.crumbleT || 0;
        const sh = t > 0 ? Math.min(3, 1 + (t / CRUMBLE_SEC) * 3) : 0;
        g.save();
        if (sh) g.translate(Math.sin(time * 70) * sh, Math.cos(time * 55) * sh * 0.6);
        g.fillStyle = t > 0.25 ? '#8a4b2a' : '#a67b52';
        rr(g, p.x, sy, p.w, 16, 6); g.fill();
        g.fillStyle = '#c9a373';
        rr(g, p.x, sy, p.w, 8, 4); g.fill();
        g.strokeStyle = '#4e2d17';
        g.lineWidth = 1.8;
        for (let x = p.x + 12; x < p.x + p.w - 8; x += 24) {
          g.beginPath();
          g.moveTo(x, sy + 1); g.lineTo(x + 4, sy + 6); g.lineTo(x - 2, sy + 10); g.lineTo(x + 3, sy + 15);
          g.stroke();
        }
        g.restore();
      } else {
        g.fillStyle = '#8a5a2b';
        rr(g, p.x, sy, p.w, 16, 8); g.fill();
        g.fillStyle = p.feature === 'checkpoint' ? '#ffd23f' : '#4ccf5a';
        rr(g, p.x, sy, p.w, 9, 5); g.fill();
      }
      if (p.feature === 'spring') {
        const sq = p.springT > 0 ? p.springT / SPRING_ANIM : 0; // squashed right after a bounce
        const h = 16 - 9 * sq;
        g.fillStyle = '#ffd23f';
        rr(g, cx - SPRING_PAD_HALF, sy - 3, SPRING_PAD_HALF * 2, 5, 2); g.fill();
        g.strokeStyle = '#d5dae3';
        g.lineWidth = 3;
        g.beginPath();
        const top = sy - 3 - h;
        g.moveTo(cx - 9, sy - 3);
        for (let k = 0; k < 4; k++) {
          const y0 = sy - 3 - (h * k) / 4, y1 = sy - 3 - (h * (k + 1)) / 4;
          g.lineTo(cx + (k % 2 ? -9 : 9), y0 - (y0 - y1) * 0.5);
          g.lineTo(cx + (k % 2 ? 9 : -9), y1);
        }
        g.stroke();
        g.fillStyle = '#ff4d4d';
        rr(g, cx - 14, top - 6, 28, 7, 3); g.fill();
        g.fillStyle = '#ff9a9a';
        rr(g, cx - 11, top - 5, 14, 2.5, 1); g.fill();
      } else if (p.feature === 'checkpoint') {
        const got = !!p.reached;
        const px = cx;
        g.fillStyle = got ? '#c99a1c' : '#c9ced6';
        g.fillRect(px - 1.5, sy - 52, 3, 54);
        g.fillStyle = got ? '#ffd23f' : '#8e95a3';
        g.beginPath(); g.arc(px, sy - 54, 4, 0, Math.PI * 2); g.fill();
        const wave = Math.sin(time * 5) * 2;
        g.fillStyle = got ? '#3ccf5a' : '#9aa0aa';
        g.beginPath();
        g.moveTo(px + 1.5, sy - 50);
        g.lineTo(px + 26, sy - 41 + wave);
        g.lineTo(px + 1.5, sy - 30);
        g.closePath();
        g.fill();
        if (got) {
          g.fillStyle = '#ffd23f';
          g.beginPath(); g.arc(px + 10, sy - 40, 3.2, 0, Math.PI * 2); g.fill();
        }
      }
    }

    function drawItem(it, sy) {
      const y = sy + Math.sin(time * 3 + it.x * 0.1) * 4;
      g.save();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (it.type === 'energy') {
        g.shadowColor = 'rgba(255,210,63,0.9)';
        g.shadowBlur = 10;
        g.fillStyle = '#ffd23f';
        g.beginPath(); g.arc(it.x, y, ITEM_R, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = '#7a4a00';
        g.font = 'bold 17px sans-serif';
        g.fillText('⚡', it.x, y + 1);
      } else {
        g.shadowColor = 'rgba(139,92,246,0.9)';
        g.shadowBlur = 10;
        g.fillStyle = '#8b5cf6';
        rr(g, it.x - ITEM_R, y - ITEM_R, ITEM_R * 2, ITEM_R * 2, 7); g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = '#ffffff';
        g.font = 'bold 17px sans-serif';
        g.fillText('❓', it.x, y + 1);
      }
      g.restore();
    }

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
        if (!(player.invincible > 0 && Math.floor(player.invincible * 10) % 2 === 0)) {
          const sx = player.x, sy = toScreenY(player.y);
          const stretch = player.onGround ? 1 : 1 + Math.min(0.12, Math.abs(player.vy) / 5000);
          g.save();
          g.translate(sx, sy);
          g.scale(1 / stretch, stretch);
          g.fillStyle = '#ffb02e';
          rr(g, -PLAYER_HALF_W - 2, -PLAYER_H, PLAYER_HALF_W * 2 + 4, PLAYER_H, 9); g.fill();
          g.fillStyle = '#ff8a00';
          rr(g, -PLAYER_HALF_W - 2, -10, PLAYER_HALF_W * 2 + 4, 10, 5); g.fill();
          g.fillStyle = '#fff';
          g.beginPath(); g.arc(-5, -20, 5, 0, Math.PI * 2); g.arc(6, -20, 5, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#222';
          g.beginPath(); g.arc(-5 + player.facing * 1.5, -20, 2.4, 0, Math.PI * 2); g.arc(6 + player.facing * 1.5, -20, 2.4, 0, Math.PI * 2); g.fill();
          g.restore();
        }

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

        // checkpoint banner: CSS-pixel scaled so the text size is constant on any screen
        if (banner) {
          g.save();
          const cssW = (ctx.canvas && ctx.canvas.clientWidth) || W;
          const k = W / cssW;
          g.scale(k, k);
          const a = banner.t < 0.2 ? banner.t / 0.2 : banner.t > BANNER_SEC - 0.4 ? (BANNER_SEC - banner.t) / 0.4 : 1;
          g.globalAlpha = Math.max(0, Math.min(1, a));
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = '900 22px sans-serif';
          const bw = g.measureText(banner.text).width + 40;
          const by = 150 - 10 * (1 - Math.min(1, banner.t / 0.2));
          g.fillStyle = 'rgba(27,19,64,0.9)';
          g.strokeStyle = '#ffd23f';
          g.lineWidth = 3;
          rr(g, cssW / 2 - bw / 2, by, bw, 46, 23);
          g.fill(); g.stroke();
          g.fillStyle = '#ffffff';
          g.fillText(banner.text, cssW / 2, by + 24);
          g.restore();
        }

        // 기록: 우측 상단, 나가기 버튼 바로 아래. 어두운 알약 + 노란 글씨로 하늘 배경 위에서도 잘 보임
        {
          const cur = `${heightM()}m`;
          const top = `최고 ${Math.max(best, heightM())}m`;
          g.save();
          // 캔버스는 화면 폭에 맞춰 늘어나므로, 논리 좌표를 CSS 픽셀 기준으로 되돌려
          // 글씨 크기·박스 위치(HUD 아래)가 화면 크기와 상관없이 일정하게 유지되게 한다.
          const cssW = (ctx.canvas && ctx.canvas.clientWidth) || W;
          const k = W / cssW; // 논리 px / CSS px
          g.scale(k, k);
          const viewW = cssW; // CSS px 단위의 가로 폭
          g.textAlign = 'right';
          g.textBaseline = 'middle';
          g.font = '900 30px sans-serif';
          const w1 = g.measureText(cur).width;
          g.font = 'bold 15px sans-serif';
          const w2 = g.measureText(top).width;
          const pw = Math.max(w1, w2) + 28;
          const ph = 62;
          const px = viewW - 10 - pw;
          const py = 62;
          g.fillStyle = 'rgba(27,19,64,0.88)';
          g.strokeStyle = '#ffffff';
          g.lineWidth = 3;
          rr(g, px, py, pw, ph, 18);
          g.fill();
          g.stroke();
          g.fillStyle = '#ffd23f';
          g.font = '900 30px sans-serif';
          g.fillText(cur, viewW - 10 - 14, py + 24);
          g.fillStyle = '#ffffff';
          g.font = 'bold 15px sans-serif';
          g.fillText(top, viewW - 10 - 14, py + 49);
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
