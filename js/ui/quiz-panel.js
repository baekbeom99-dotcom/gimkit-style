// 인라인 퀴즈 패널(항상 보이는 문제 + 보기 4개, 2x2). 하단 dock 등에 붙인다.
// 모달(quiz-screen.js)과 같은 그리기 함수(drawQuestion/buildChoices/markResult)를 공유한다.
import { speak, cancelSpeech } from '../core/tts.js';
import { renderFigure } from './fraction-figure.js';

export const SHAPES = ['▲', '◆', '●', '■'];
export const COLORS = ['red', 'blue', 'yellow', 'green'];
export const SHOW_CORRECT_MS = 1200; // 오답 때 정답을 보여 주는 최소 시간
export const CORRECT_MS = 400;       // 패널: 정답 뒤 다음 문제까지
export const WRONG_QUICK_MS = 600;   // 패널(lockOnWrong:false): 오답 뒤 다음 문제까지

// 식 문제(구구단·덧셈·뺄셈): '47 + 8' -> '47 + 8 = ?' (이미 '='나 '?'가 있으면 그대로)
export function equationText(t) { return /[=?]/.test(t) ? t : `${t} = ?`; }

// 문제 영역(qEl)을 그린다. 영단어: 큰 단어 + 🔊 + 안내 글(새 문제마다 onSpeak 한 번 자동 호출),
// 분수 읽기: 안내 글 + 도형 그림, 그 밖: 식. opts: { onSpeak(text, lang), canSpeak(), figureSize }
export function drawQuestion(qEl, q, opts = {}) {
  qEl.classList.remove('word', 'figure');
  if (q.kind === 'word') {
    qEl.classList.add('word');
    const row = document.createElement('div');
    row.className = 'ui-q-row';
    const w = document.createElement('span');
    w.className = 'ui-q-word';
    w.textContent = q.q;
    w.style.fontSize = q.q.length > 18 ? '26px' : q.q.length > 11 ? '34px' : '';
    row.appendChild(w);
    const text = q.q, lang = q.speak;
    if (lang) {
      const sp = document.createElement('button');
      sp.type = 'button';
      sp.className = 'ui-speak';
      sp.setAttribute('aria-label', '다시 듣기');
      sp.textContent = '🔊';
      sp.addEventListener('click', () => { if (!opts.canSpeak || opts.canSpeak()) (opts.onSpeak || speak)(text, lang); });
      row.appendChild(sp);
      (opts.onSpeak || speak)(text, lang);
    }
    const cap = document.createElement('div');
    cap.className = 'ui-q-cap';
    cap.textContent = q.prompt || '뜻을 골라요';
    qEl.replaceChildren(row, cap);
  } else if (q.kind === 'figure' && q.figure) {
    // q.q는 내부 키라서 화면에 쓰지 않는다
    qEl.classList.add('figure');
    const cap = document.createElement('div');
    cap.className = 'ui-q-cap ui-q-prompt';
    cap.textContent = q.prompt || '색칠한 부분은 전체의 얼마일까요?';
    const fig = document.createElement('div');
    fig.className = 'ui-q-figure';
    renderFigure(fig, q.figure, { size: opts.figureSize || 160 });
    qEl.replaceChildren(cap, fig);
  } else {
    qEl.textContent = equationText(q.q);
  }
}

// 보기 버튼 4개를 만든다(choicesEl을 비우고 다시 채움).
export function buildChoices(choicesEl, q) {
  choicesEl.classList.toggle('fig', q.kind === 'figure');
  choicesEl.replaceChildren();
  q.choices.forEach((text, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ui-choice ui-${COLORS[i % 4]}`;
    b.dataset.i = String(i);
    const shape = document.createElement('span');
    shape.className = 'ui-shape';
    shape.textContent = SHAPES[i % 4];
    const label = document.createElement('span');
    label.className = 'ui-label';
    label.textContent = text;
    b.append(shape, label);
    if (i === q.removedIndex) { b.disabled = true; b.classList.add('removed'); }
    choicesEl.appendChild(b);
  });
}

// 정답/오답 표시(모든 버튼 잠금). 누른 버튼 b, 결과 r. 정답 버튼을 돌려준다.
export function markResult(choicesEl, b, r) {
  const btns = [...choicesEl.children];
  btns.forEach((x) => { x.disabled = true; });
  if (r.correct) { b.classList.add('right'); return b; }
  b.classList.add('wrong');
  const c = btns[r.correctIndex];
  if (c) c.classList.add('right');
  btns.forEach((x) => { if (x !== c && x !== b) x.classList.add('dim'); });
  return c;
}

// container 안에 퀴즈 패널을 붙인다. 첫 탭에 잠기고 onAnswer(result, question)를 부른 뒤,
// 정답이면 CORRECT_MS, 오답이면 정답을 보여 주며 max(1200, lockMs)(lockOnWrong:false면 WRONG_QUICK_MS) 뒤 자동으로 다음 문제.
// 반환: { next(), destroy(), setEnabled(bool), get question }
export function mountQuizPanel(container, { session, onAnswer, sfx, lockOnWrong = true, compact = false } = {}) {
  const el = document.createElement('div');
  el.className = 'ui-qp' + (compact ? ' compact' : '');
  const qEl = document.createElement('div');
  qEl.className = 'ui-qp-q';
  const choicesEl = document.createElement('div');
  choicesEl.className = 'ui-quiz-choices ui-qp-choices';
  el.append(qEl, choicesEl);
  container.appendChild(el);

  let q = null, locked = false, enabled = true, destroyed = false, timer = 0, spoke = false;
  const say = (text, lang) => { spoke = true; speak(text, lang); };

  function syncDisabled() {
    el.classList.toggle('off', !enabled);
    for (const b of choicesEl.children) {
      if (b.classList.contains('removed')) continue;
      b.disabled = locked || !enabled;
    }
  }

  function next() {
    if (destroyed) return;
    clearTimeout(timer);
    q = session.next();
    drawQuestion(qEl, q, { onSpeak: say, canSpeak: () => !destroyed, figureSize: compact ? 76 : 96 });
    buildChoices(choicesEl, q);
    locked = false;
    syncDisabled();
  }

  choicesEl.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.ui-choice');
    if (!b || locked || !enabled || destroyed || b.disabled || !q) return;
    locked = true; // 동기적으로 잠근다: 이후 탭은 모두 무시
    const asked = q;
    const r = session.answer(Number(b.dataset.i));
    markResult(choicesEl, b, r);
    if (sfx) sfx.play(r.correct ? 'correct' : 'wrong');
    if (onAnswer) { try { onAnswer(r, asked); } catch (err) { console.error(err); } }
    if (destroyed || q !== asked) return; // onAnswer 안에서 next()/destroy()를 불렀다
    const wait = r.correct ? CORRECT_MS : lockOnWrong ? Math.max(SHOW_CORRECT_MS, r.lockMs || 0) : WRONG_QUICK_MS;
    timer = setTimeout(next, wait);
  });

  next();
  return {
    next,
    setEnabled(v) { enabled = !!v; syncDisabled(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(timer);
      if (spoke) cancelSpeech();
      el.remove();
    },
    get question() { return q; },
  };
}

export default { mountQuizPanel };
