// Gimkit-style quiz overlay. showQuiz({session, energy, mode, need, sfx}) -> Promise<void>
// (mode 'item' -> Promise<boolean>: true = need개 정답 완료, false = ✕로 닫음)
const SHAPES = ['▲', '◆', '●', '■'];
const COLORS = ['red', 'blue', 'yellow', 'green'];
const FEEDBACK_OK_MS = 700;
const SHOW_CORRECT_MS = 1200;
const FULL_RETURN_MS = 450;
const ITEM_DONE_MS = 450;

// 'item' 모드: 정답을 need개 맞혀야 완료(오답은 벌칙 없이 다음 문제). 순수 함수라 node에서 테스트한다.
export function createNeedCounter(need = 3) {
  const n = Math.max(1, Math.floor(need) || 1);
  let got = 0;
  return {
    get need() { return n; },
    get got() { return got; },
    get done() { return got >= n; },
    correct() { if (got < n) got++; return got >= n; },
    wrong() { return false; },
    label() { return `🧱 ${got}/${n} ` + '●'.repeat(got) + '○'.repeat(n - got); },
  };
}

export function showQuiz({ session, energy, mode = 'refill', need = 3, sfx }) {
  return new Promise((resolve) => {
    const host = document.getElementById('screen') || document.body;
    const el = document.createElement('div');
    el.className = 'ui-screen ui-quiz';
    el.innerHTML = `
      <div class="ui-quiz-top">
        <div class="ui-quiz-gauge"><i class="ui-quiz-fill"></i><b class="ui-quiz-num"></b></div>
        <span class="ui-quiz-streak"></span>
        <button type="button" class="ui-quiz-close" aria-label="닫기">✕</button>
      </div>
      <div class="ui-quiz-title"></div>
      <div class="ui-quiz-q"></div>
      <div class="ui-quiz-fb"></div>
      <div class="ui-quiz-choices"></div>`;
    const $ = (s) => el.querySelector(s);
    const fill = $('.ui-quiz-fill'), num = $('.ui-quiz-num'), streakEl = $('.ui-quiz-streak');
    const qEl = $('.ui-quiz-q'), fb = $('.ui-quiz-fb'), choicesEl = $('.ui-quiz-choices');
    const closeBtn = $('.ui-quiz-close'), title = $('.ui-quiz-title');
    title.textContent = mode === 'manual' ? '미리 충전하기' : '에너지가 없어요! 문제를 풀어요';
    const item = mode === 'item' ? createNeedCounter(need) : null;
    if (item) title.textContent = `콘크리트 아이템! 문제 ${item.need}개를 맞혀요`;

    let done = false, locked = false, q = null, timer = 0;

    const drawGauge = () => {
      fill.style.width = (energy.value / energy.max * 100) + '%';
      num.textContent = `⚡${energy.value}/${energy.max}`;
    };
    const off = energy.subscribe(drawGauge);
    const drawStreak = () => {
      if (item) { streakEl.textContent = item.label(); streakEl.classList.add('on'); return; }
      const s = session.streak;
      if (s >= 2) {
        const mult = s >= 5 ? 2 : s >= 3 ? 1.5 : 1;
        streakEl.textContent = `🔥 ${s}연속 ×${mult}`;
        streakEl.classList.add('on');
      } else {
        streakEl.textContent = '';
        streakEl.classList.remove('on');
      }
    };

    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      off();
      el.remove();
      if (item) resolve(result === true);
      else resolve();
    }

    function nextQuestion() {
      if (done) return;
      q = session.next();
      qEl.textContent = q.q;
      fb.textContent = '';
      fb.className = 'ui-quiz-fb';
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
      drawStreak();
      locked = false;
    }

    choicesEl.addEventListener('click', (e) => {
      const b = e.target.closest('.ui-choice');
      if (!b || locked || done || b.disabled) return;
      locked = true; // set synchronously: all further taps ignored
      const r = session.answer(Number(b.dataset.i));
      const btns = [...choicesEl.children];
      btns.forEach((x) => { x.disabled = true; });
      if (r.correct && item) { // 아이템 모드: 에너지 없음, 정답 개수만 센다
        b.classList.add('right');
        sfx && sfx.play('correct');
        const complete = item.correct();
        drawStreak();
        if (complete) {
          fb.textContent = '🎉 콘크리트 완성!';
          fb.className = 'ui-quiz-fb ok';
          sfx && sfx.play('clear');
          timer = setTimeout(() => finish(true), ITEM_DONE_MS);
        } else {
          fb.textContent = `정답! ${item.got}/${item.need}`;
          fb.className = 'ui-quiz-fb ok';
          timer = setTimeout(nextQuestion, FEEDBACK_OK_MS);
        }
      } else if (r.correct) {
        b.classList.add('right');
        sfx && sfx.play('correct');
        energy.add(r.gain);
        fb.textContent = `정답! ⚡+${r.gain}`;
        fb.className = 'ui-quiz-fb ok';
        drawStreak();
        if (energy.isFull()) { timer = setTimeout(finish, FULL_RETURN_MS); } // 가득 차면 자동으로 게임 복귀
        else timer = setTimeout(nextQuestion, FEEDBACK_OK_MS);
      } else {
        b.classList.add('wrong');
        const c = btns[r.correctIndex];
        if (c) c.classList.add('right');
        btns.forEach((x) => { if (x !== c && x !== b) x.classList.add('dim'); });
        sfx && sfx.play('wrong');
        fb.textContent = '아쉬워요! 정답은 이거예요';
        fb.className = 'ui-quiz-fb bad';
        drawStreak();
        timer = setTimeout(nextQuestion, Math.max(SHOW_CORRECT_MS, r.lockMs || 0));
      }
    });
    closeBtn.addEventListener('click', item ? () => finish(false) : finish);

    host.appendChild(el);
    drawGauge();
    if (item) nextQuestion();
    else if (energy.isFull()) finish(); else nextQuestion();
  });
}

export default { showQuiz };
