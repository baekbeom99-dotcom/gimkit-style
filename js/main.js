import { createEnergy } from './core/energy.js';
import { createQuizSession } from './core/quiz-engine.js';
import { recordScore, getBest, createItemStats } from './core/storage.js';
import { createRouter } from './core/router.js';
import { createInput } from './core/input.js';
import { createSfx } from './core/audio.js';
import { registry } from './games/registry.js';

const W = 360, MAX_HEARTS = 3;
let H = 640; // 논리 높이. fullscreen 게임은 화면 비율에 맞춰 늘어남(폭 360 고정)

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g2d = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 3);
canvas.width = W * dpr;
canvas.height = H * dpr;

// fullscreen 게임: 캔버스를 화면 전체에 채우고(HUD는 위에 겹침) 논리 높이를 화면 비율에 맞춘다.
function fitCanvas(full) {
  $('app').classList.toggle('full', !!full);
  canvas.classList.toggle('fill', !!full);
  let h = 640;
  if (full) {
    const r = $('stage').getBoundingClientRect();
    if (r.width > 0 && r.height > 0) h = Math.min(1000, Math.max(520, Math.round(W * r.height / r.width)));
  }
  H = h;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
}

// Optional UI modules (Task 5). Missing modules => fallbacks so the shell works alone.
const tryImport = (p) => import(p).catch(() => null);
const ui = { select: null, quiz: null, result: null, hud: null };
async function loadUi() {
  [ui.select, ui.quiz, ui.result, ui.hud] = await Promise.all([
    tryImport('./ui/select-screen.js'),
    tryImport('./ui/quiz-screen.js'),
    tryImport('./ui/result-screen.js'),
    tryImport('./ui/hud.js'),
  ]);
}

const sfx = createSfx();
const input = createInput($('controls'));
const router = createRouter($('screen'), {
  select: () => ui.select,
  result: () => ui.result,
});

// ---- fallback HUD ----
function createBasicHud(root, { energy, hearts }) {
  root.innerHTML = '<div class="hud-basic"><span class="h"></span><span class="bar"><i></i></span><span class="s"></span></div>';
  const h = root.querySelector('.h'), bar = root.querySelector('.bar i'), s = root.querySelector('.s');
  const draw = () => {
    h.textContent = '❤'.repeat(Math.max(0, hearts.value));
    bar.style.width = (energy.value / energy.max * 100) + '%';
  };
  const off = energy.subscribe(draw);
  draw();
  return { setScore: (t) => { s.textContent = t; }, refresh: draw, destroy() { off(); root.replaceChildren(); } };
}

// ---- game session state ----
let active = null; // { game, raf, paused, ended, ... }

async function buildSession(sel, mod) {
  const extra = () => ({ gainMultiplier: (mod && mod.energyGainMultiplier) || 1, stats: createItemStats(sel.setId || 'gugudan') });
  try {
    const { loadSet } = await import('./data/question-sets.js');
    const set = await loadSet(sel.setId || 'gugudan', { dans: (sel.units || []).map(Number).filter(Number.isFinite), units: sel.units || [] });
    const units = sel.units && sel.units.length ? sel.units.map(String) : undefined;
    return createQuizSession({ items: set.items, units, kind: set.kind, speak: set.tts, rng: Math.random, ...extra() });
  } catch (e) {
    console.warn('question set fallback', e);
    const items = [];
    for (let a = 2; a <= 9; a++) for (let b = 1; b <= 9; b++) items.push({ unit: String(a), q: `${a} × ${b}`, answer: String(a * b) });
    return createQuizSession({ items, rng: Math.random, ...extra() });
  }
}

async function startGame(sel) {
  stopGame();
  const mod = registry.find((g) => g.id === sel.gameId) || registry[0];
  const session = await buildSession(sel, mod);
  const energy = createEnergy((mod && mod.energyMax) || 10);
  energy.add(energy.max); // spec: 게임 시작 시 에너지 가득
  const hearts = {
    value: MAX_HEARTS,
    lose() { this.value = Math.max(0, this.value - 1); hud.refresh && hud.refresh(); return this.value; },
    add(n = 1) { this.value = Math.min(MAX_HEARTS, this.value + n); hud.refresh && hud.refresh(); return this.value; },
  };
  const hudRoot = $('hud');
  let hud;
  try {
    hud = ui.hud && ui.hud.createHud ? ui.hud.createHud(hudRoot, { energy, hearts, session, sfx, onManualQuiz: () => ctx.requestQuiz({ mode: 'manual' }), onExit: () => askExit(state) }) : null;
  } catch (e) { console.warn('hud fallback', e); hud = null; }
  if (!hud) hud = createBasicHud(hudRoot, { energy, hearts });

  const state = { mod, energy, hearts, hud, session, paused: false, ended: false, raf: 0, last: 0, quizP: null, dialog: null };
  active = state;

  // 결과: true = 끝까지 완료, false = 닫음('item' 모드에서 ✕). 결과를 쓰지 않는 기존 호출은 그대로 동작.
  async function requestQuiz(opts = {}) {
    if (state.ended || state.reviewing) return false;
    if (state.quizP) return state.quizP;
    state.paused = true;
    state.quizP = (async () => {
      let result = true;
      try {
        if (ui.quiz && ui.quiz.showQuiz) {
          const r = await ui.quiz.showQuiz({ session, energy, mode: opts.mode || 'refill', need: opts.need, sfx });
          result = r !== false;
        } else if (opts.mode !== 'item') {
          energy.add(energy.max); // fallback: instant refill
        }
      } catch (e) { console.error(e); if (opts.mode === 'item') result = false; else energy.add(energy.max); }
      finally { state.paused = false; state.quizP = null; state.last = 0; }
      return result;
    })();
    return state.quizP;
  }

  // opts.review: 점수만 저장하고 루프는 계속(게임이 리뷰 장면을 그림). 잠시 뒤 다시 하기/나가기 오버레이.
  function endReview(score, opts) {
    if (state.reviewing) return;
    state.reviewing = true;
    sfx.play('over');
    const s = Math.max(0, Math.floor(Number(score) || 0));
    let result = { best: s, isNewRecord: false };
    try { result = recordScore(mod.id, s); } catch (e) { console.warn(e); }
    input.setLayout('none');
    $('hud').classList.add('hidden');
    state.reviewTimer = setTimeout(() => {
      state.reviewTimer = 0;
      if (state.ended || active !== state) return;
      const el = document.createElement('div');
      el.className = 'review-overlay';
      el.innerHTML = '<div class="review-banner"><div class="review-over">게임 종료</div><div class="review-score"></div><div class="review-best"></div></div>'
        + '<div class="review-btns"><button type="button" class="review-btn review-retry">다시 하기</button><button type="button" class="review-btn review-exit">나가기</button></div>';
      el.querySelector('.review-score').textContent = '쌓은 ' + s + (opts.unit || '');
      el.querySelector('.review-best').textContent = '최고 기록 ' + result.best;
      if (result.isNewRecord) {
        const b = document.createElement('div');
        b.className = 'review-badge';
        b.textContent = '🏆 신기록!';
        el.querySelector('.review-banner').appendChild(b);
      }
      el.querySelector('.review-retry').addEventListener('click', () => startGame(sel));
      el.querySelector('.review-exit').addEventListener('click', () => showSelect());
      state.overlay = el;
      $('app').appendChild(el);
      el.querySelector('.review-retry').focus();
    }, Math.max(0, Number(opts.buttonsDelayMs) || 0));
    return result;
  }

  function endGame(score, opts) {
    if (opts && opts.review) return endReview(score, opts);
    if (state.ended || state.reviewing) return;
    state.ended = true;
    cancelAnimationFrame(state.raf);
    sfx.play('over');
    const s = Math.max(0, Math.floor(Number(score) || 0));
    let result = { best: s, isNewRecord: false };
    try { result = recordScore(mod.id, s); } catch (e) { console.warn(e); }
    teardown(state);
    if (active === state) active = null;
    showResult({ gameId: mod.id, title: mod.title, icon: mod.icon, score: s, best: result.best, isNewRecord: result.isNewRecord, selection: sel });
    return result;
  }

  fitCanvas(!!mod.fullscreen);
  const ctx = {
    canvas, g2d, width: W, height: H,
    // taps while a quiz is open (e.g. keyboard during 미리 충전) must not reach the paused game
    input: {
      held: input.held,
      on: (n, fn) => input.on(n, () => { if (!state.paused && !state.ended && !state.reviewing) fn(); }),
      setItem: (s) => input.setItem && input.setItem(s), // 2D 탑쌓기 아이템 버튼(개수/사용 가능)
    },
    energy, hearts, requestQuiz, endGame, sfx, rng: Math.random,
    hud: { setScore: (t) => hud.setScore(t) },
  };
  state.ctx = ctx;

  input.setLayout(mod.controls || 'none');
  await router.show('game');
  $('hud').classList.remove('hidden');
  state.game = mod.create(ctx);
  state.game.start();

  const frame = (now) => {
    if (state.ended) return;
    state.raf = requestAnimationFrame(frame);
    if (state.paused) { state.last = 0; return; }
    const dt = state.last ? Math.min((now - state.last) / 1000, 0.05) : 0;
    state.last = now;
    g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    try {
      state.game.update(dt);
      if (!state.ended) { g2d.setTransform(dpr, 0, 0, dpr, 0, 0); state.game.render(); }
    } catch (e) { console.error(e); }
  };
  state.raf = requestAnimationFrame(frame);
}

// ---- exit confirm ----
function askExit(state) {
  if (state.ended || state.dialog || state.paused || active !== state) return;
  state.paused = true;
  const el = document.createElement('div');
  el.className = 'ui-confirm';
  el.innerHTML = '<div class="ui-confirm-box"><div class="ui-confirm-title">그만할까요?</div><div class="ui-confirm-btns"><button type="button" class="ui-confirm-go">계속하기</button><button type="button" class="ui-confirm-out">나가기</button></div></div>';
  state.dialog = el;
  const close = () => { el.remove(); state.dialog = null; };
  el.querySelector('.ui-confirm-go').addEventListener('click', () => {
    if (state.dialog !== el) return;
    close();
    state.paused = false; state.last = 0;
  });
  el.querySelector('.ui-confirm-out').addEventListener('click', () => {
    if (state.dialog !== el) return;
    close();
    showSelect(); // stopGame() -> no score recorded
  });
  $('screen').appendChild(el);
}

function teardown(state) {
  if (state.dialog) { state.dialog.remove(); state.dialog = null; }
  if (state.reviewTimer) { clearTimeout(state.reviewTimer); state.reviewTimer = 0; }
  if (state.overlay) { state.overlay.remove(); state.overlay = null; }
  $('hud').classList.remove('hidden');
  cancelAnimationFrame(state.raf);
  try { state.game && state.game.destroy(); } catch (e) { console.error(e); }
  try { state.hud && state.hud.destroy && state.hud.destroy(); } catch (e) { console.error(e); }
  $('hud').replaceChildren();
  input.setLayout('none');
  fitCanvas(false);
}

function stopGame() {
  if (!active) return;
  active.ended = true;
  teardown(active);
  active = null;
}

// ---- screens ----
async function showSelect() {
  stopGame();
  await loadUiOnce();
  if (!ui.select) { // fallback: start first registry game directly
    return startGame({ gameId: registry[0].id, setId: 'gugudan', units: [] });
  }
  await router.show('select', { registry, onStart: startGame, getBest });
}

async function showResult(props) {
  await loadUiOnce();
  if (!ui.result) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#1b1340;font-size:24px;font-weight:800';
    el.innerHTML = `<div>점수 ${props.score}</div><div>최고 ${props.best}${props.isNewRecord ? ' 🎉 신기록!' : ''}</div>`;
    for (const [label, fn] of [['다시 하기', () => startGame(props.selection)], ['메뉴', showSelect]]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'font-size:24px;padding:14px 32px;border-radius:16px;border:0;font-weight:800';
      b.onclick = fn;
      el.appendChild(b);
    }
    $('screen').replaceChildren(el);
    return;
  }
  await router.show('result', { ...props, onRetry: () => startGame(props.selection), onMenu: showSelect });
}

let uiLoaded = null;
function loadUiOnce() { return (uiLoaded ||= loadUi()); }

showSelect();

// debug/test hook
window.__game = { get active() { return active; }, startGame, showSelect };
