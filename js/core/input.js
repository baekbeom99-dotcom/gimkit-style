import { arenaSide } from './layout.js';
export { arenaSide };

const LAYOUTS = {
  jump: [], // 화면 반분할: 왼쪽 = 다이나믹 조이스틱(buildJoystick), 오른쪽 = 점프(buildJumpZone)
  stairs: [['left', '◀', 'ctl-left'], ['right', '▶', 'ctl-right']],
  tower: [], // 2D 탑쌓기: 왼쪽 = 조이스틱(좌/우/아래), 오른쪽 = 탭(회전 = 'jump' 이벤트)
  tap: [], // 3D 쌓기: 전체 화면 탭 = 'jump' 이벤트(블록 놓기)
  arena: [], // 타이탄 러시: 무대 전체가 터치 영역. 왼쪽 절반 = 'left', 오른쪽 절반 = 'right'(멀티터치 연타, 'tap' {side}도 발생)
  none: [],
};

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ' ': 'jump', a: 'left', d: 'right', w: 'jump', ArrowDown: 'down', s: 'down', c: 'item', C: 'item' };

export function createInput(root) {
  const held = { left: false, right: false, jump: false, down: false, item: false };
  const listeners = { left: new Set(), right: new Set(), jump: new Set(), down: new Set(), item: new Set(), tap: new Set() };
  let itemBtn = null; // 'tower' 레이아웃의 아이템(콘크리트) 버튼
  const pointers = new Map(); // pointerId -> name
  let layout = 'none';

  function fire(name, arg) { for (const fn of [...listeners[name]]) fn(arg); }
  function press(name) { held[name] = true; fire(name); }
  function release(name) {
    for (const n of pointers.values()) if (n === name) return;
    for (const k of keyDown) if (KEYS[k] === name) return;
    held[name] = false;
  }

  function setLayout(l) {
    layout = LAYOUTS[l] ? l : 'none';
    pointers.clear();
    held.left = held.right = held.jump = held.down = held.item = false;
    itemBtn = null;
    root.replaceChildren();
    root.className = 'layout-' + layout;
    if (layout === 'jump') { buildJoystick(); buildJumpZone(); }
    else if (layout === 'tower') { buildJoystick({ down: true }); buildTapZone('half'); buildItemButton(); }
    else if (layout === 'tap') buildTapZone('full');
    else if (layout === 'arena') buildArenaZone();
    for (const [name, label, cls] of LAYOUTS[layout]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ctl-btn ' + cls;
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        pointers.set(e.pointerId, name);
        b.classList.add('down');
        press(name);
      });
      const up = (e) => {
        if (pointers.get(e.pointerId) !== name) return;
        pointers.delete(e.pointerId);
        b.classList.remove('down');
        release(name);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      root.appendChild(b);
    }
  }

  // 다이나믹 조이스틱: 왼쪽 영역 어디든 누르면 그 자리에 생기고, 좌우로 끌면 이동.
  // 손가락이 반경을 넘으면 조이스틱 중심이 따라와서 엄지를 되돌리기 쉽다.
  function buildJoystick(opts = {}) {
    const R = 48; // 조이스틱 반경(px)
    const DEAD = 14; // 데드존(px)
    const DOWN = 22; // 아래로 끌었을 때 down 판정(px)
    const zone = document.createElement('div');
    zone.className = 'ctl-zone';
    const base = document.createElement('div');
    base.className = 'joy-base';
    const knob = document.createElement('div');
    knob.className = 'joy-knob';
    base.appendChild(knob);
    zone.appendChild(base);
    root.appendChild(zone);

    let id = null;
    let cx = 0; // 조이스틱 중심(zone 기준)
    let cy = 0;
    let dir = null;
    let downOn = false;

    function setDown(on) {
      if (on === downOn) return;
      downOn = on;
      if (on) press('down'); else release('down');
    }
    function setDir(next) {
      if (next === dir) return;
      const prev = dir;
      dir = next;
      if (id !== null) pointers.set(id, next || 'joy');
      if (prev) release(prev);
      if (next) press(next);
    }
    function place() { base.style.left = cx + 'px'; base.style.top = cy + 'px'; }

    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      id = e.pointerId;
      pointers.set(id, 'joy');
      const r = zone.getBoundingClientRect();
      cx = Math.min(Math.max(e.clientX - r.left, R), Math.max(R, r.width - R));
      cy = Math.min(Math.max(e.clientY - r.top, R), Math.max(R, r.height - R));
      place();
      knob.style.transform = 'translate(0,0)';
      base.classList.add('on');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const r = zone.getBoundingClientRect();
      let dx = e.clientX - r.left - cx;
      let dy = e.clientY - r.top - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > R) { // 중심이 손가락을 따라옴
        const over = (dist - R) / dist;
        cx += dx * over;
        cy += dy * over;
        cx = Math.min(Math.max(cx, R), Math.max(R, r.width - R));
        cy = Math.min(Math.max(cy, R), Math.max(R, r.height - R));
        place();
        dx = e.clientX - r.left - cx;
        dy = e.clientY - r.top - cy;
      }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      setDir(dx < -DEAD ? 'left' : dx > DEAD ? 'right' : null);
      if (opts.down) setDown(dy > DOWN);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      setDir(null);
      setDown(false);
      pointers.delete(id);
      id = null;
      base.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // 오른쪽 절반 어디를 눌러도 점프. 점프 버튼은 제자리에 보이고,
  // 버튼이 아닌 곳을 누르면 버튼이 그 자리로 잠시 날아왔다가 손을 뗀 뒤 돌아간다.
  function buildJumpZone() {
    const zone = document.createElement('div');
    zone.className = 'ctl-jumpzone';
    const home = document.createElement('div');
    home.className = 'jump-home';
    const btn = document.createElement('div');
    btn.className = 'ctl-btn ctl-jump';
    btn.textContent = '점프';
    home.appendChild(btn);
    zone.appendChild(home);
    root.appendChild(zone);

    let id = null;
    let backTimer = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      id = e.pointerId;
      pointers.set(id, 'jump');
      clearTimeout(backTimer);
      const hr = home.getBoundingClientRect();
      const onBtn = e.clientX >= hr.left - 8 && e.clientX <= hr.right + 8 && e.clientY >= hr.top - 8 && e.clientY <= hr.bottom + 8;
      if (onBtn) {
        btn.style.transition = '';
        btn.style.transform = '';
      } else {
        const dx = e.clientX - (hr.left + hr.width / 2);
        const dy = e.clientY - (hr.top + hr.height / 2);
        btn.style.transition = 'transform .09s ease-out';
        btn.style.transform = `translate(${dx}px,${dy}px)`;
      }
      btn.classList.add('down');
      press('jump');
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      pointers.delete(id);
      id = null;
      btn.classList.remove('down');
      release('jump');
      backTimer = setTimeout(() => { // 잠깐 머문 뒤 제자리로
        btn.style.transition = 'transform .28s ease-in-out';
        btn.style.transform = '';
      }, 120);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // 탭 영역: 누르는 순간 'jump' 이벤트(회전/놓기). 눈에 띄는 버튼 없이 옅은 힌트만.
  function buildTapZone(kind) {
    const zone = document.createElement('div');
    zone.className = 'ctl-tapzone ' + (kind === 'full' ? 'full' : 'half');
    root.appendChild(zone);
    let id = null;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (id === null) id = e.pointerId;
      pointers.set(e.pointerId, 'jump');
      press('jump');
    });
    const end = (e) => {
      if (pointers.get(e.pointerId) !== 'jump') return;
      pointers.delete(e.pointerId);
      if (e.pointerId === id) id = null;
      release('jump');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // 아레나: 무대 전체가 터치 영역. 손가락 하나마다 pointerdown 한 번 = 이벤트 한 번(디바운스·중복 제거 없음, 멀티터치 연타).
  function buildArenaZone() {
    const zone = document.createElement('div');
    zone.className = 'ctl-arena';
    root.appendChild(zone);
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = zone.getBoundingClientRect();
      const side = arenaSide(e.clientX, r.left, r.width);
      pointers.set(e.pointerId, side);
      press(side);
      fire('tap', { side });
    });
    const end = (e) => {
      const side = pointers.get(e.pointerId);
      if (!side) return;
      pointers.delete(e.pointerId);
      release(side);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // 아이템 버튼: 오른쪽 회전 영역 위에 떠 있고, 눌러도 회전(jump)은 일어나지 않는다.
  function buildItemButton() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctl-item off';
    b.setAttribute('aria-label', '콘크리트 아이템');
    b.innerHTML = '<i class="ctl-item-icon"></i><b class="ctl-item-count">×0</b>';
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    b.addEventListener('pointerdown', (e) => {
      stop(e);
      if (b.classList.contains('off')) return;
      b.classList.add('down');
      setTimeout(() => b.classList.remove('down'), 160); // 퀴즈 창이 떠서 pointerup을 못 받아도 눌림 표시가 남지 않게
      fire('item');
    });
    const up = (e) => { stop(e); b.classList.remove('down'); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('click', stop);
    b.addEventListener('contextmenu', stop);
    root.appendChild(b);
    itemBtn = b;
  }
  function setItem({ count = 0, enabled = false } = {}) {
    if (!itemBtn) return;
    itemBtn.classList.toggle('off', !enabled);
    itemBtn.disabled = false; // 비활성 상태에서도 포인터를 삼켜 회전이 일어나지 않게 함
    itemBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    const c = itemBtn.querySelector('.ctl-item-count');
    const t = '×' + count;
    if (c.textContent !== t) c.textContent = t;
  }

  const keyDown = new Set();
  function onKeyDown(e) {
    const name = KEYS[e.key];
    if (!name || layout === 'none') return;
    if (name === 'item' && layout !== 'tower') return; // 아이템 키는 2D 탑쌓기에서만
    e.preventDefault();
    if (e.repeat || keyDown.has(e.key)) return;
    keyDown.add(e.key);
    press(name);
    if (layout === 'arena' && name !== 'down') fire('tap', { side: name === 'left' || name === 'right' ? name : 'center' });
  }
  function onKeyUp(e) {
    const name = KEYS[e.key];
    if (!name) return;
    keyDown.delete(e.key);
    release(name);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  const blockMenu = (e) => e.preventDefault();
  document.addEventListener('contextmenu', blockMenu);

  function on(name, fn) {
    if (!listeners[name]) throw new Error('unknown input: ' + name);
    listeners[name].add(fn);
    return () => listeners[name].delete(fn);
  }
  function destroy() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('contextmenu', blockMenu);
    root.replaceChildren();
  }
  return { held, on, setLayout, setItem, destroy };
}
