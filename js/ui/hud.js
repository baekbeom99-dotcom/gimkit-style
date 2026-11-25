// HUD: hearts, energy gauge, score text, manual refill button.
export function createHud(root, { energy, hearts, hideHearts, onManualQuiz, onExit }) {
  root.innerHTML = `
    <div class="ui-hud">
      ${hideHearts ? '' : '<span class="ui-hud-hearts" aria-label="하트"></span>'}
      <span class="ui-hud-energy" aria-label="에너지"><i class="ui-hud-fill"></i><b class="ui-hud-num"></b></span>
      <span class="ui-hud-score"></span>
      <button type="button" class="ui-hud-icon ui-hud-charge" aria-label="미리 충전">⚡+</button>
      <button type="button" class="ui-hud-icon ui-hud-fs" aria-label="전체화면" hidden>⛶</button>
      <button type="button" class="ui-hud-icon ui-hud-exit" aria-label="나가기">✕</button>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const heartsEl = $('.ui-hud-hearts'), fill = $('.ui-hud-fill'), num = $('.ui-hud-num');
  const scoreEl = $('.ui-hud-score'), btn = $('.ui-hud-charge');
  const fsBtn = $('.ui-hud-fs'), exitBtn = $('.ui-hud-exit');
  let destroyed = false;

  function draw() {
    if (destroyed) return;
    const h = Math.max(0, hearts.value);
    if (heartsEl) heartsEl.textContent = '❤'.repeat(h) + '♡'.repeat(Math.max(0, 3 - h));
    fill.style.width = (energy.value / energy.max * 100) + '%';
    num.textContent = `⚡${energy.value}/${energy.max}`;
    btn.disabled = energy.isFull();
  }
  const off = energy.subscribe(draw);
  btn.addEventListener('click', () => {
    if (destroyed || energy.isFull()) return;
    if (onManualQuiz) onManualQuiz();
  });
  exitBtn.addEventListener('click', () => { if (!destroyed && onExit) onExit(); });

  // fullscreen toggle (hidden when the API is unavailable, e.g. iOS Safari)
  const de = document.documentElement;
  const canFs = !!(de.requestFullscreen || de.webkitRequestFullscreen);
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const drawFs = () => {
    const on = !!fsEl();
    fsBtn.textContent = on ? '⤡' : '⛶';
    fsBtn.setAttribute('aria-label', on ? '전체화면 끄기' : '전체화면');
  };
  const onFsChange = () => drawFs();
  if (canFs) {
    fsBtn.hidden = false;
    fsBtn.addEventListener('click', () => {
      try {
        let p;
        if (fsEl()) p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else p = (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* ignore */ }
    });
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    drawFs();
  }
  draw();
  return {
    setScore(text) { scoreEl.textContent = String(text ?? ''); },
    refresh: draw,
    destroy() { destroyed = true; off();
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange); root.replaceChildren(); },
  };
}
