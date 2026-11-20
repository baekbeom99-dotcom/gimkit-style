// 2D 탑쌓기: Matter와 무관한 순수 논리(모양, 회전, 7개 묶음, 마법 일정, 높이/속도/낙하 판정).
export const CELL = 24; // px per cell
export const PX_PER_M = 40; // 40px = 1m
export const STAGE_M = 6; // 결승선 간격(m)
export const LOST_DEPTH = 140; // 받침대 윗면보다 이만큼 아래로 내려가면 잃은 벽돌

// 셀 좌표 [x, y] (y는 아래로 증가)
export const SHAPES = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]], // 돌기가 위(평평한 면이 아래)
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
export const SHAPE_KEYS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// 셀 목록을 왼쪽 위 (0,0) 기준으로 정규화
export function normalizeCells(cells) {
  let mx = Infinity;
  let my = Infinity;
  for (const [x, y] of cells) { mx = Math.min(mx, x); my = Math.min(my, y); }
  return cells.map(([x, y]) => [x - mx, y - my]);
}

// 시계 방향 90° × times (화면 좌표: (x, y) -> (-y, x))
export function rotateCells(cells, times = 1) {
  let out = cells.map((c) => [c[0], c[1]]);
  const n = ((times % 4) + 4) % 4;
  for (let i = 0; i < n; i++) out = out.map(([x, y]) => [-y, x]);
  return normalizeCells(out);
}

export function cellsSize(cells) {
  let w = 0;
  let h = 0;
  for (const [x, y] of cells) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); }
  return { w, h };
}

// 셀 중심 좌표(px)를 무게중심 기준으로 (Matter 복합 바디의 위치 = 넓이 가중 중심)
export function cellOffsets(cells, cell = CELL) {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of cells) { cx += x + 0.5; cy += y + 0.5; }
  cx /= cells.length;
  cy /= cells.length;
  return cells.map(([x, y]) => [(x + 0.5 - cx) * cell, (y + 0.5 - cy) * cell]);
}

// 7개 묶음 섞기. 같은 모양이 3번 연속 나오지 않게 보장(묶음 경계 포함).
export function createBag(rng = Math.random) {
  const queue = [];
  const history = [];
  function refill() {
    const bag = SHAPE_KEYS.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // 묶음 하나에는 모양이 한 번씩이라 원래 3연속은 나올 수 없지만, 경계에서 2연속도 줄인다.
    const last = queue.length ? queue[queue.length - 1] : history[history.length - 1];
    if (last && bag[0] === last) { const t = bag[0]; bag[0] = bag[1]; bag[1] = t; }
    queue.push(...bag);
  }
  function ensure(n) { while (queue.length < n) refill(); }
  return {
    next() {
      ensure(1);
      const s = queue.shift();
      history.push(s);
      if (history.length > 8) history.shift();
      return s;
    },
    peek(n = 1) { ensure(n); return queue.slice(0, n); },
  };
}

export const LIGHT_EFFECTS = ['heavy', 'vine', 'undo'];
export const DARK_EFFECTS = ['ice', 'giant'];
export const EFFECT_LABEL = {
  heavy: '✨ 단단!', vine: '🌿 덩굴!', undo: '↩ 되돌리기!', ice: '🧊 얼음!', giant: '🦣 거대!',
};

// 특수 벽돌이 나타날 때(조종 시작) 화면 위쪽에 잠깐 띄우는 설명. '제목 — 설명' 형식(좁으면 두 줄로 나눔)
export const MAGIC_INFO = {
  heavy: '⚙ 단단 벽돌 — 아주 무겁고 잘 안 밀려요',
  vine: '🌿 덩굴 벽돌 — 닿은 벽돌과 엮여서 함께 움직여요',
  undo: '↩ 되돌리기 벽돌 — 놓으면 직전 벽돌이 사라져요',
  ice: '🧊 얼음 벽돌 — 미끄러우니 조심하세요',
  giant: '🦣 거대 벽돌 — 크기가 1.5배예요',
  concrete: '🧱 콘크리트 — 놓으면 그 자리에 고정돼요',
};
export const INFO_SEC = 2.2; // 설명 배너 표시 시간(페이드 인/아웃 포함)
// 배너 줄 나누기: ' — ' 앞은 제목, 뒤는 설명
export function splitInfo(text) {
  const i = text.indexOf(' — ');
  return i < 0 ? [text] : [text.slice(0, i), text.slice(i + 3)];
}
// t초에서 배너 불투명도(0.25초 페이드 인, 0.4초 페이드 아웃)
export function infoAlpha(t, sec = INFO_SEC) {
  if (!(t >= 0) || t >= sec) return 0;
  return Math.max(0, Math.min(1, t / 0.25, (sec - t) / 0.4));
}

function randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }

// 마법 일정: 밝은 마법 4~6개 간격, 어두운 마법은 스테이지 3부터 7~9개 간격.
// next(stage) -> null | { kind: 'light'|'dark', effect }
export function createMagicSchedule(rng = Math.random) {
  let lightIn = randInt(rng, 4, 6); // 이 벽돌 수만큼 지나면 밝은 마법
  let darkIn = null; // 스테이지 3 이전에는 null
  let forceLight = false;
  return {
    guaranteeLight() { forceLight = true; },
    get pending() { return { lightIn, darkIn, forceLight }; },
    next(stage = 1) {
      if (stage >= 3 && darkIn === null) darkIn = randInt(rng, 7, 9);
      lightIn--;
      if (darkIn !== null) darkIn--;
      if (forceLight) {
        forceLight = false;
        lightIn = randInt(rng, 4, 6);
        if (darkIn !== null && darkIn <= 0) darkIn = 1; // 다음 벽돌로 미룸
        return { kind: 'light', effect: LIGHT_EFFECTS[Math.floor(rng() * LIGHT_EFFECTS.length)] };
      }
      if (darkIn !== null && darkIn <= 0) {
        darkIn = randInt(rng, 7, 9);
        if (lightIn <= 0) lightIn = 1;
        return { kind: 'dark', effect: DARK_EFFECTS[Math.floor(rng() * DARK_EFFECTS.length)] };
      }
      if (lightIn <= 0) {
        lightIn = randInt(rng, 4, 6);
        return { kind: 'light', effect: LIGHT_EFFECTS[Math.floor(rng() * LIGHT_EFFECTS.length)] };
      }
      return null;
    },
  };
}

// 스테이지 n의 결승선 높이(받침대 윗면 기준, px)
export function stageLinePx(stage) { return stage * STAGE_M * PX_PER_M; }
export function stageLineM(stage) { return stage * STAGE_M; }

// 안착한 벽돌들 중 가장 높은 꼭대기의 높이(px). items: [{ minY }] (월드 y, 아래로 증가)
export function towerHeightPx(items, platformTop) {
  let h = 0;
  for (const it of items) h = Math.max(h, platformTop - it.minY);
  return h;
}
export function pxToM(px) { return px / PX_PER_M; }

// 조종 중 낙하 속도(px/s): 기본 55, 벽돌마다 +3%(최대 110), 스테이지마다 ×1.1(최대 180)
export function fallSpeed(brickCount, stage = 1) {
  const base = Math.min(110, 55 * (1 + 0.03 * Math.max(0, brickCount)));
  return Math.min(180, base * Math.pow(1.1, Math.max(0, stage - 1)));
}

export function isLost(y, platformTop, depth = LOST_DEPTH) { return y > platformTop + depth; }

// 안착 판정 상태 갱신(1/60초 한 번마다 호출)
export const SETTLE_SPEED = 0.12; // px per 1/60s
export const SETTLE_ANG = 0.004; // rad per 1/60s
export const SETTLE_STEPS = 40;
export const SETTLE_TIMEOUT = 3.5; // s
export function settleStep(st, speed, angSpeed, dt = 1 / 60) {
  st.age = (st.age || 0) + dt;
  st.still = speed < SETTLE_SPEED && Math.abs(angSpeed) < SETTLE_ANG ? (st.still || 0) + 1 : 0;
  return st.still >= SETTLE_STEPS || st.age >= SETTLE_TIMEOUT;
}

// 부드러운 가로 이동: 목표 속도로 가속도 a 만큼 접근
export function approach(v, target, a, dt) {
  if (v < target) return Math.min(target, v + a * dt);
  if (v > target) return Math.max(target, v - a * dt);
  return v;
}

// 착지 떨림(시각 효과 전용). impact = 충돌 속도(px per 1/60s), heavy = 단단/콘크리트 벽돌
// 착지 진동(시각 효과 전용): 벽돌 하나가 아니라 게임 화면 전체가 아주 짧고 작게 진동한다.
// (벽돌별 떨림은 "튕김"처럼 보여서 제거했다.) impact = 충돌 속도(px per 1/60s).
export const VIBRATION = { sec: 0.24, ampX: 1.6, ampY: 1.2, decay: 13, maxK: 1 };
// 단단/콘크리트 벽돌은 더 무거우니 조금 더 세게 울린다(상한 maxK)
export function trembleStrength(impact, heavy = false) {
  const k = Math.min(VIBRATION.maxK, 0.3 + Math.max(0, impact) / 5);
  return heavy ? Math.min(VIBRATION.maxK, k * 1.25) : k;
}
// t초 뒤 화면 진동 { dx, dy }(px). 결정적(같은 t, k면 같은 값), 지수 감쇠, sec 이후 0.
export function vibrationOffset(t, k) {
  if (!(t >= 0) || t >= VIBRATION.sec || !(k > 0)) return { dx: 0, dy: 0 };
  const e = Math.exp(-VIBRATION.decay * t) * k;
  const w = Math.PI * 2;
  return {
    dx: VIBRATION.ampX * e * Math.sin(w * 28 * t),
    dy: VIBRATION.ampY * e * Math.sin(w * 23 * t + 1.0),
  };
}
// 지금 진행 중인 진동의 남은 세기(새 충돌과 겹칠 때 더 센 쪽만 남기기 위함)
export function vibrationRemaining(t, k) {
  if (!(t >= 0) || t >= VIBRATION.sec || !(k > 0)) return 0;
  return Math.exp(-VIBRATION.decay * t) * k;
}

// 콘크리트 아이템: 최고 높이가 10m의 배수에 처음 닿을 때마다 +1 (최대 보유 9)
export const CONCRETE_STEP_M = 10;
export const CONCRETE_MAX = 9;
export function concreteGrants(maxHeightM, grantedSoFar) {
  const reached = Math.floor(Math.max(0, maxHeightM) / CONCRETE_STEP_M + 1e-9);
  return Math.max(0, reached - grantedSoFar);
}
