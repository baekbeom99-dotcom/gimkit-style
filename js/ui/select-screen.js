// Pixel-art start screen: current-selection panel (과목/문제/단원 via popups) + big square game tiles.
import { loadIndex, loadSet } from '../data/question-sets.js';
import { createIcon, gameIconName } from './pixel-icons.js';

const LS_KEY = 'gk.select.v2';

let el = null;
let alive = false;
let cleanup = [];

function lsGet() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') || null; } catch { return null; }
}
function lsSet(v) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export async function mount(root, props) {
  const { registry, onStart, getBest } = props;
  alive = true;
  cleanup = [];
  el = h('div', 'ui-screen ui-select px-screen');
  el.innerHTML = `
    <header class="px-logo">
      <span class="px-logo-ico"></span>
      <h1 class="px-title"><span>사부작</span><span>스쿨</span></h1>
    </header>
    <section class="px-panel" aria-label="현재 선택">
      <button type="button" class="px-sel" data-k="subject"><span class="px-sel-ico"></span><span class="px-sel-lab">과목</span><span class="px-sel-val"></span></button>
      <button type="button" class="px-sel" data-k="set"><span class="px-sel-ico"></span><span class="px-sel-lab">문제</span><span class="px-sel-val"></span></button>
      <button type="button" class="px-sel" data-k="unit"><span class="px-sel-ico"></span><span class="px-sel-lab">단원</span><span class="px-sel-val"></span></button>
    </section>
    <div class="px-tiles"></div>
    <div class="px-toast" role="status" aria-live="polite"></div>`;
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  $('.px-logo-ico').appendChild(createIcon('bolt'));
  const selBtns = { subject: $('[data-k=subject]'), set: $('[data-k=set]'), unit: $('[data-k=unit]') };
  selBtns.subject.querySelector('.px-sel-ico').appendChild(createIcon('subject'));
  selBtns.set.querySelector('.px-sel-ico').appendChild(createIcon('quiz'));
  selBtns.unit.querySelector('.px-sel-ico').appendChild(createIcon('unit'));
  const tilesEl = $('.px-tiles');
  const toastEl = $('.px-toast');

  let index = [];
  try { index = await loadIndex(); } catch { index = []; }
  if (!alive) return;
  if (!index.length) index = [{ id: 'gugudan', title: '구구단', subject: '수학', grade: '초등' }];
  const subjOf = (s) => s.subject || '기타';
  const subjects = [...new Set(index.map(subjOf))];

  const st = { subject: subjects[0], setId: null, units: [], selected: new Set() };
  let loadToken = 0;
  let toastTimer = 0;
  let modal = null;

  // initial: saved selection if still valid, else 구구단
  const saved = lsGet();
  const savedSet = saved && index.find((s) => s.id === saved.setId);
  const initSet = savedSet || index.find((s) => s.id === 'gugudan') || index[0];
  st.subject = subjOf(initSet);

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1800);
  }
  cleanup.push(() => clearTimeout(toastTimer));

  const curSet = () => index.find((s) => s.id === st.setId);
  const valid = () => st.selected.size >= 1;
  const unitLabel = (u) => (st.setId === 'gugudan' ? `${u.title.replace(/단$/, '')}단` : u.title);

  function unitSummary() {
    if (!st.units.length) return '불러오는 중...';
    if (!st.selected.size) return '선택 없음';
    if (st.selected.size === st.units.length) return '전체';
    const names = st.units.filter((u) => st.selected.has(u.id)).map(unitLabel);
    return names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}`;
  }

  function save() {
    lsSet({ subject: st.subject, setId: st.setId, units: [...st.selected], all: st.units.length > 0 && st.selected.size === st.units.length });
  }

  function drawPanel() {
    selBtns.subject.querySelector('.px-sel-val').textContent = st.subject;
    const s = curSet();
    selBtns.set.querySelector('.px-sel-val').textContent = s ? s.title : '';
    const uv = selBtns.unit.querySelector('.px-sel-val');
    uv.textContent = unitSummary();
    selBtns.unit.classList.toggle('warn', st.units.length > 0 && !valid());
  }

  function drawTiles() {
    tilesEl.replaceChildren();
    const ok = valid();
    registry.forEach((g) => {
      const t = h('button', 'px-tile');
      t.type = 'button';
      t.setAttribute('aria-disabled', ok ? 'false' : 'true');
      t.classList.toggle('off', !ok);
      let best = 0;
      try { best = getBest(g.id) || 0; } catch { best = 0; }
      const art = h('span', 'px-tile-art');
      art.appendChild(createIcon(gameIconName(g.id)));
      t.appendChild(art);
      t.appendChild(h('b', 'px-tile-name', g.title));
      const sc = h('span', 'px-tile-best');
      sc.appendChild(createIcon('trophy'));
      sc.appendChild(h('span', '', String(best)));
      t.appendChild(sc);
      t.addEventListener('click', () => {
        if (!valid()) { toast('단원을 먼저 골라요!'); openUnit(); return; }
        if (t.dataset.busy) return;
        t.dataset.busy = '1';
        onStart({ gameId: g.id, setId: st.setId, units: st.units.map((u) => u.id).filter((id) => st.selected.has(id)) });
      });
      tilesEl.appendChild(t);
    });
  }

  function refresh() { drawPanel(); drawTiles(); save(); }

  async function pickSet(id, restore) {
    st.setId = id;
    const my = ++loadToken;
    st.units = []; st.selected = new Set();
    drawPanel(); drawTiles();
    let units = [];
    try {
      const set = await loadSet(id, {});
      units = (set.units && set.units.length)
        ? set.units.map((u) => ({ id: String(u.id), title: String(u.title ?? u.id) }))
        : [...new Set((set.items || []).map((i) => String(i.unit)))].map((u) => ({ id: u, title: u }));
    } catch { units = []; }
    if (!alive || my !== loadToken) return;
    st.units = units;
    let sel = units.map((u) => u.id);
    if (restore && restore.setId === id && !restore.all && Array.isArray(restore.units)) {
      const r = restore.units.filter((x) => units.some((u) => u.id === x));
      if (r.length) sel = r;
    }
    st.selected = new Set(sel);
    refresh();
  }

  // ---------- popup ----------
  function closeModal() {
    if (!modal) return;
    modal.back.remove();
    el.classList.remove('px-lock');
    document.removeEventListener('keydown', modal.onKey, true);
    const f = modal.returnFocus;
    modal = null;
    if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch { /* ignore */ } }
  }
  cleanup.push(closeModal);

  function openModal(title, iconName, build, returnFocus) {
    closeModal();
    const back = h('div', 'px-modal-back');
    const box = h('div', 'px-modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const bar = h('div', 'px-modal-bar');
    const ttl = h('div', 'px-modal-title');
    ttl.appendChild(createIcon(iconName));
    ttl.appendChild(h('span', '', title));
    const x = h('button', 'px-x');
    x.type = 'button';
    x.setAttribute('aria-label', '닫기');
    x.appendChild(createIcon('close'));
    x.addEventListener('click', closeModal);
    bar.append(ttl, x);
    const body = h('div', 'px-modal-body');
    box.append(bar, body);
    back.appendChild(box);
    back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); return; }
      if (e.key === 'Tab') { // simple focus trap
        const f = [...box.querySelectorAll('button:not(:disabled)')];
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    modal = { back, onKey, returnFocus };
    el.classList.add('px-lock');
    el.appendChild(back);
    build(body);
    const first = body.querySelector('.on') || body.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  function row(text, sub, on, onClick) {
    const b = h('button', `px-row${on ? ' on' : ''}`);
    b.type = 'button';
    const t = h('span', 'px-row-t', text);
    b.appendChild(t);
    if (sub) b.appendChild(h('span', 'px-tag', sub));
    const ck = h('span', 'px-row-ck');
    if (on) ck.appendChild(createIcon('check'));
    b.appendChild(ck);
    b.addEventListener('click', onClick);
    return b;
  }

  function openSubject() {
    openModal('과목 선택', 'subject', (body) => {
      const list = h('div', 'px-list');
      subjects.forEach((s) => {
        list.appendChild(row(s, '', s === st.subject, () => {
          if (s !== st.subject) {
            st.subject = s;
            const first = index.find((x) => subjOf(x) === s);
            if (first) pickSet(first.id);
          }
          closeModal();
        }));
      });
      body.appendChild(list);
    }, selBtns.subject);
  }

  function openSet() {
    openModal('문제 선택', 'quiz', (body) => {
      const list = h('div', 'px-list');
      index.filter((s) => subjOf(s) === st.subject).forEach((s) => {
        list.appendChild(row(s.title, s.grade, s.id === st.setId, () => {
          if (s.id !== st.setId) pickSet(s.id);
          closeModal();
        }));
      });
      body.appendChild(list);
    }, selBtns.set);
  }

  function openUnit() {
    if (!st.units.length) { toast('단원을 불러오는 중이에요'); return; }
    openModal('단원 선택', 'unit', (body) => {
      const draft = new Set(st.selected);
      const grid = h('div', 'px-chips');
      const okBtn = h('button', 'px-btn px-btn-go', '확인');
      okBtn.type = 'button';
      const note = h('div', 'px-note');
      const all = h('button', 'px-chip all');
      all.type = 'button';
      const chips = [];
      function sync() {
        const full = draft.size === st.units.length;
        all.classList.toggle('on', full);
        all.textContent = full ? '✔ 전체' : '전체';
        chips.forEach(([u, c]) => c.classList.toggle('on', draft.has(u.id)));
        okBtn.disabled = draft.size < 1;
        note.textContent = draft.size < 1 ? '하나 이상 골라야 해요' : `${draft.size}개 선택`;
      }
      all.addEventListener('click', () => {
        if (draft.size === st.units.length) draft.clear(); else st.units.forEach((u) => draft.add(u.id));
        sync();
      });
      grid.appendChild(all);
      st.units.forEach((u) => {
        const c = h('button', 'px-chip', unitLabel(u));
        c.type = 'button';
        c.addEventListener('click', () => { if (draft.has(u.id)) draft.delete(u.id); else draft.add(u.id); sync(); });
        chips.push([u, c]);
        grid.appendChild(c);
      });
      okBtn.addEventListener('click', () => {
        if (draft.size < 1) return;
        st.selected = draft;
        closeModal();
        refresh();
      });
      body.append(grid, note, okBtn);
      sync();
    }, selBtns.unit);
  }

  selBtns.subject.addEventListener('click', openSubject);
  selBtns.set.addEventListener('click', openSet);
  selBtns.unit.addEventListener('click', openUnit);

  drawPanel();
  drawTiles();
  await pickSet(initSet.id, saved);
}

export function unmount() {
  alive = false;
  cleanup.forEach((f) => { try { f(); } catch { /* ignore */ } });
  cleanup = [];
  if (el) el.remove();
  el = null;
}

export default { mount, unmount };
