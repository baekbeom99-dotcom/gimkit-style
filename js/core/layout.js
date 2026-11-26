// 화면 크기 계산(순수 함수). 앱은 세로 기둥(column) 하나: 휴대폰은 화면 폭 전체,
// 세로로 든 태블릿도 화면 폭 전체를 쓴다(여백 없음). 가로 화면(PC·가로 태블릿)은 높이에 맞춰 480~640px 기둥을 가운데 정렬한다. node에서 테스트한다.

export const APP_MIN = 480;   // 넓은 화면에서도 최소 이만큼(기존 고정 폭)
export const APP_MAX = 640;   // 기둥 최대 폭
export const APP_RATIO = 0.62; // 폭 ≈ 높이 × 0.62 (약 9:14.5 ~ 9:16 느낌)
export const SCALE_BASE = 440; // 이 폭까지는 UI 배율 1
export const SCALE_MAX = 1.9;  // 세로 태블릿(768~1024px 폭)에서도 글자·버튼이 같은 비율로 커진다
export const PHONE_LANDSCAPE_MAX_H = 500;

// CSS의 #app width: min(100vw, max(480px, min(62dvh, 640px))) 와 같은 규칙.
export function appWidth(vw, vh) {
  if (!(vw > 0) || !(vh > 0)) return 0;
  if (vh >= vw) return vw; // 세로(또는 정사각) 화면: 휴대폰·태블릿 모두 폭 전체
  return Math.min(vw, Math.max(APP_MIN, Math.min(vh * APP_RATIO, APP_MAX)));
}

// 글자/버튼 배율: 휴대폰(≤440px)은 1, 넓은 기둥은 비례해서 최대 1.45.
export function uiScale(colW) {
  if (!(colW > 0)) return 1;
  const s = Math.min(SCALE_MAX, Math.max(1, colW / SCALE_BASE));
  return Math.round(s * 100) / 100;
}

// 가로로 눕힌 휴대폰(게임은 세로 전용이라 '돌려 주세요' 안내를 띄운다). 큰 가로 화면(태블릿/PC)은 제외.
export function isLandscapePhone(vw, vh) {
  return vw > vh && vh < PHONE_LANDSCAPE_MAX_H;
}

// fullscreen 게임의 논리 높이(논리 폭 W 고정). 시작할 때 한 번 정하고 게임 중에는 바꾸지 않는다.
export function logicalHeight(stageW, stageH, W = 360, min = 440, max = 1000) {
  if (!(stageW > 0) || !(stageH > 0)) return 640;
  return Math.min(max, Math.max(min, Math.round(W * stageH / stageW)));
}

// 가로 휴대폰에서 게임을 시작하면 세로로 돌렸을 때의 무대 크기로 논리 높이를 정한다.
export function portraitStage(vw, vh) {
  const short = Math.min(vw, vh), long = Math.max(vw, vh);
  return { w: appWidth(short, long), h: long };
}

// 캔버스를 무대에 맞추는 방법. 비율이 2% 안이면 꽉 채우고(fill), 아니면 비율을 지켜 가운데에 맞춘다(contain).
export function canvasFit(stageW, stageH, W, H, tol = 0.02) {
  if (!(stageW > 0) || !(stageH > 0) || !(W > 0) || !(H > 0)) return { mode: 'fill', width: stageW || 0, height: stageH || 0 };
  const err = Math.abs((stageW / stageH) / (W / H) - 1);
  if (err <= tol) return { mode: 'fill', width: stageW, height: stageH };
  const k = Math.min(stageW / W, stageH / H);
  return { mode: 'contain', width: Math.floor(W * k), height: Math.floor(H * k) };
}

// 캔버스 해상도 배율(너무 큰 값은 3으로 제한)
export function canvasDpr(devicePixelRatio) {
  const d = Number(devicePixelRatio);
  return Math.min(d > 0 ? d : 1, 3);
}

// 캔버스 실제 해상도 배율: 화면 배율(dpr)에 '논리 폭 -> 화면 폭' 확대 비율을 곱한다. 태블릿에서 360px짜리 그림을
// 늘려 보여 줄 때 흐려지지 않게 한다(그림·글씨 비율은 그대로, 선명도만 올림). 최대 4.
export function backingScale(devicePixelRatio, stageW, W = 360) {
  const d = canvasDpr(devicePixelRatio);
  const k = stageW > W ? stageW / W : 1;
  return Math.min(4, Math.round(d * k * 100) / 100);
}
