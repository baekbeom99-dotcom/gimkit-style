// 타이탄 러시 v2: 좌우 웨이브 + 보스전. 한 가지 모드: 아레나를 탭해서 싸우고(탭 1번 = 에너지 1칸), 하단 dock의
// 인라인 퀴즈 패널에서 문제를 풀어 에너지를 채운다(5연속 정답 = 번개 오버드라이브). 모달 퀴즈/모드 선택은 없다.
// 로직은 logic.js(순수), 그리기는 render.js, 이 파일은 입력 / dock(DOM) / 퀴즈 연결만 한다.
import { createTitans, ENERGY_MAX, ENERGY_GAIN_MULT, OVERDRIVE_STREAK } from './logic.js';
import { createFx, fxEvents, fxUpdate, drawTitans, fmtNum } from './render.js';
import { mountQuizPanel } from '../../ui/quiz-panel.js';

const DOCK_FRAC = 0.34;      // dock이 화면 높이에서 차지하는 비율(실제 화면 px 기준)
const DOCK_MIN = 220;        // CSS px(--ui-scale 확대 전)
const DOCK_MAX = 360;
const END_DELAY = 0.9;       // 게임 오버 연출(초) 뒤 결과 화면
const HINT_TAPS = 6;         // 이만큼 때리면 '탭' 안내를 거둔다
const TAP_SFX_GAP = 80;      // 연타 효과음 간격(ms) ~ 12/s
const EMPTY_SFX_GAP = 450;   // 에너지 0 탭 소리 간격(ms)
const EMPTY_SHAKE_GAP = 350; // 에너지 막대 흔들기 간격(ms)

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// dock 높이(CSS px, --ui-scale 확대 전): 확대 후 실제 높이가 화면의 약 1/3이 되도록. 순수 함수.
export function dockHeightFor(viewportH, scale = 1) {
  const vh = Number(viewportH) > 0 ? Number(viewportH) : 700;
  const sc = Number(scale) > 0 ? Number(scale) : 1;
  return Math.min(DOCK_MAX, Math.max(DOCK_MIN, Math.round((DOCK_FRAC * vh) / sc)));
}

export default {
  id: 'titans',
  title: '타이탄 러시',
  icon: '🛡',
  controls: 'arena',
  fullscreen: false,
  layout: 'split',
  hideHearts: false,
  energyMax: ENERGY_MAX,
  energyGainMultiplier: ENERGY_GAIN_MULT,
  create(ctx) {
    const g = ctx.g2d;
    let logic = null, panel = null, destroyed = false;
    let time = 0, endT = -1, endCalled = false;
    let waveTaps = 0, bossTaps = 0, lastStage = 0, dockKey = '', dockEls = null;
    let qStart = now(), lastQ = null, offTap = null, dockH = 0;
    const fx = createFx(ctx.rng);
    const timers = new Set();
    const lastSfx = {};
    const view = { s: null, hints: null };

    const play = (name, gap = 0) => {
      const n = now();
      if (gap && lastSfx[name] && n - lastSfx[name] < gap) return;
      lastSfx[name] = n;
      try { ctx.sfx.play(name); } catch (e) { /* ignore */ }
    };
    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
    };
    const shakeEnergy = () => {
      const n = now();
      if (lastSfx.shake && n - lastSfx.shake < EMPTY_SHAKE_GAP) return;
      lastSfx.shake = n;
      if (ctx.hud && typeof ctx.hud.shakeEnergy === 'function') ctx.hud.shakeEnergy();
    };

    // ---------------------------------------------------------------- dock
    function uiScale() {
      try { return parseFloat(document.documentElement.style.getPropertyValue('--ui-scale')) || 1; } catch (e) { return 1; }
    }
    function applyDockHeight(force) {
      const vh = (typeof window !== 'undefined' && window.innerHeight) || 700;
      const h = dockHeightFor(vh, uiScale());
      if (!force && h === dockH) return;
      dockH = h;
      const d = ctx.dock;
      if (d && d.style) {
        if (typeof d.style.setProperty === 'function') d.style.setProperty('--dock-h', h + 'px');
        else d.style['--dock-h'] = h + 'px';
      }
      if (ctx.resizeStage) ctx.resizeStage();
    }

    function upButton(kind) {
      const b = el('button', 'ti-up ti-' + kind);
      b.type = 'button';
      b.setAttribute('aria-label', kind === 'sword' ? '검 강화' : '동료 강화');
      const t = el('span', 'ti-up-t'), c = el('span', 'ti-up-c');
      b.append(t, c);
      b.addEventListener('click', () => buy(kind, b));
      return { b, t, c };
    }

    function buildDock() {
      const d = ctx.dock;
      if (!d) return;
      d.replaceChildren();
      const root = el('div', 'ti-dock');
      // 왼쪽 칸: 골드 + 연속 정답 점(5개) / 오버드라이브 남은 시간
      const gold = el('div', 'ti-gold');
      const line = el('div', 'ti-gold-l');
      const goldN = el('b', 'ti-gold-n', '0');
      line.append(el('span', 'ti-coin', '🪙'), goldN);
      const streak = el('div', 'ti-streak');
      const pips = [];
      for (let i = 0; i < OVERDRIVE_STREAK; i++) { const p = el('i', 'ti-pip'); pips.push(p); streak.appendChild(p); }
      gold.append(line, streak);
      const sword = upButton('sword'), ally = upButton('ally');
      const row = el('div', 'ti-row');
      row.append(gold, sword.b, ally.b);
      const qwrap = el('div', 'ti-qwrap');
      root.append(row, qwrap);
      dockEls = { root, gold, goldN, streak, pips, sword, ally, qwrap };
      d.appendChild(root);
      applyDockHeight(true);
      dockKey = '';
      refreshDock();
    }

    function refreshDock() {
      if (!dockEls || !logic) return;
      const od = Math.ceil(logic.buffs.overdrive);
      const key = `${logic.gold}|${logic.swordLv}|${logic.allyLv}|${logic.combo}|${od}`;
      if (key === dockKey) return;
      dockKey = key;
      dockEls.goldN.textContent = fmtNum(logic.gold);
      const sc = logic.swordCost(), ac = logic.allyCost();
      dockEls.sword.t.textContent = `⚔ Lv.${logic.swordLv}`;
      dockEls.sword.c.textContent = `🪙${fmtNum(sc)}`;
      dockEls.sword.b.classList.toggle('can', logic.gold >= sc);
      dockEls.ally.t.textContent = logic.allyLv > 0 ? `🛡 동료 Lv.${logic.allyLv}` : '🛡 동료 영입';
      dockEls.ally.c.textContent = `🪙${fmtNum(ac)}`;
      dockEls.ally.b.classList.toggle('can', logic.gold >= ac);
      const on = logic.buffs.overdrive > 0;
      dockEls.gold.classList.toggle('od', on);
      if (on) dockEls.streak.textContent = `⚡ ${od}s`;
      else {
        dockEls.streak.replaceChildren(...dockEls.pips);
        dockEls.pips.forEach((p, i) => p.classList.toggle('on', i < logic.combo));
      }
    }

    function buy(kind, btn) {
      if (!logic || logic.over || destroyed) return;
      const ok = kind === 'sword' ? logic.buySword() : logic.buyAlly();
      if (!ok && btn) {
        btn.classList.add('nope');
        later(() => btn.classList.remove('nope'), 320);
      }
      dockKey = '';
      refreshDock();
    }

    // ---------------------------------------------------------------- setup
    function setup() {
      logic = createTitans({ rng: ctx.rng, energy: ctx.energy, hearts: ctx.hearts });
      view.s = logic;
      const h = ctx.hud;
      if (h) {
        if (h.setEnergyVisible) h.setEnergyVisible(true);
        if (h.setChargeEnabled) h.setChargeEnabled(false); // 에너지는 문제를 풀어서만 채운다(수동 충전/모달 퀴즈 없음)
        if (typeof h.setEnergyCells === 'function') h.setEnergyCells(true);
      }
      buildDock();
      if (dockEls && ctx.session) {
        // lockOnWrong:false => 오답이면 정답을 보여 주며 0.6초 잠겼다가 다음 문제
        panel = mountQuizPanel(dockEls.qwrap, { session: ctx.session, sfx: ctx.sfx, compact: true, lockOnWrong: false, onAnswer });
        lastQ = null;
      }
      updateScore(true);
    }

    function updateScore(force) {
      if (!logic || !ctx.hud || !ctx.hud.setScore) return;
      if (!force && logic.stage === lastStage) return;
      lastStage = logic.stage;
      ctx.hud.setScore(`🏆${logic.stage}`);
    }

    // 정답/오답은 공격이 아니다: 에너지(정답) / 연속 정답 / 적 속도에만 영향을 준다
    function onAnswer(r) {
      if (!logic || destroyed || logic.over) return;
      const ms = Math.min(30000, Math.max(0, now() - qStart));
      logic.answer(r, { ms });
    }

    // ---------------------------------------------------------------- events
    function handleEvents(evs) {
      for (const ev of evs) {
        switch (ev.type) {
          case 'hit':
            if (ev.source === 'tap') {
              if (logic.phase === 'boss') bossTaps++; else waveTaps++;
              play(ev.crit ? 'jump' : 'step', ev.crit ? 120 : TAP_SFX_GAP);
            }
            break;
          case 'kill': play('correct', 140); break;
          case 'projectileTap': bossTaps++; play('step', TAP_SFX_GAP); break;
          case 'projectileRemoved': if (ev.by !== 'hit') play('correct', 90); break;
          case 'projectileFire': play('jump', 120); break;
          case 'shieldDown': play('magic', 200); break;
          case 'bossPhase': play('wrong'); break;
          case 'noEnergy': play('wrong', EMPTY_SFX_GAP); shakeEnergy(); break;
          case 'heroHit': play('hit'); break;
          case 'bossStart': play('wrong'); break;
          case 'stageClear': play('clear'); break;
          case 'overdrive': play('magic'); break;
          case 'upgrade': play('correct'); break;
          case 'gameOver':
            if (endT < 0) endT = 0;
            if (panel) panel.setEnabled(false);
            break;
          default:
        }
      }
    }

    function hints() {
      if (!logic || logic.over) return null;
      if (logic.phase === 'wave' && waveTaps < HINT_TAPS) return 'wave';
      if (logic.phase === 'boss' && bossTaps < HINT_TAPS) return 'boss';
      return null;
    }

    return {
      get debug() {
        return {
          get logic() { return logic; }, get fx() { return fx; }, get panel() { return panel; },
          get dock() { return dockEls; }, get endT() { return endT; }, get dockH() { return dockH; },
          // 검증용: 웨이브를 바로 끝내 보스로 / 골드 지급 / 에너지 비우기·채우기 / 단계 점프
          toBoss() { if (logic && logic.phase === 'wave') logic.wave.killed = logic.wave.target; },
          toWindow() { return !!logic && logic.skipToWindow(); },
          giveGold(n) { if (logic) logic.gold += n; },
          setStage(n) { if (logic) { logic.stage = n; logic.biome = (n - 1) % 2; } },
          drain() { ctx.energy.spend(ctx.energy.value); },
          fill() { ctx.energy.add(ctx.energy.max); },
        };
      },

      start() {
        destroyed = false;
        if (ctx.hud && ctx.hud.setScore) ctx.hud.setScore('');
        offTap = ctx.input.on('tap', (e) => {
          if (!logic || destroyed) return;
          const side = e && e.side;
          logic.tap(side === 'left' || side === 'right' ? side : 'any');
        });
        setup();
      },

      update(dt) {
        if (destroyed || !logic) return;
        time += dt;
        if (panel && panel.question !== lastQ) { lastQ = panel.question; qStart = now(); }
        logic.update(dt);
        const evs = logic.drainEvents();
        if (evs.length) { handleEvents(evs); fxEvents(fx, evs, logic); }
        fxUpdate(fx, dt, logic);
        refreshDock();
        updateScore(false);
        if (endT >= 0 && !endCalled) {
          endT += dt;
          if (endT >= END_DELAY) {
            endCalled = true;
            ctx.endGame(logic.stage);
          }
        }
      },

      render() {
        if (destroyed || !logic) return;
        view.s = logic;
        view.hints = hints();
        drawTitans(g, ctx.width, ctx.height, view, fx, time);
      },

      resize() {
        if (!destroyed && logic) applyDockHeight(false);
      },

      destroy() {
        destroyed = true;
        if (offTap) offTap();
        offTap = null;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        if (panel) panel.destroy();
        panel = null;
        if (ctx.dock && ctx.dock.replaceChildren) ctx.dock.replaceChildren();
        dockEls = null;
      },
    };
  },
};
