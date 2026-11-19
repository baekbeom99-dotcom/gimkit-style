// Result screen: { mount(root, props), unmount() }
let el = null;

export function mount(root, props) {
  const { title, icon, score, best, isNewRecord, onRetry, onMenu } = props;
  el = document.createElement('div');
  el.className = 'ui-screen ui-result';
  el.innerHTML = `
    <div class="ui-result-icon"></div>
    <div class="ui-result-title"></div>
    <div class="ui-result-badge">🎉 신기록!</div>
    <div class="ui-result-score"><small>이번 기록</small><b></b></div>
    <div class="ui-result-best">최고 기록 <b></b></div>
    <div class="ui-result-btns">
      <button type="button" class="ui-btn ui-btn-primary" data-act="retry">다시 하기</button>
      <button type="button" class="ui-btn" data-act="menu">메뉴</button>
    </div>`;
  el.querySelector('.ui-result-icon').textContent = icon || '🎮';
  el.querySelector('.ui-result-title').textContent = `${title || ''} 끝!`;
  el.querySelector('.ui-result-score b').textContent = String(score);
  el.querySelector('.ui-result-best b').textContent = String(best);
  if (!isNewRecord) el.querySelector('.ui-result-badge').remove();
  let used = false;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b || used) return;
    used = true;
    (b.dataset.act === 'retry' ? onRetry : onMenu)?.();
  });
  root.appendChild(el);
}

export function unmount() {
  if (el) el.remove();
  el = null;
}

export default { mount, unmount };
