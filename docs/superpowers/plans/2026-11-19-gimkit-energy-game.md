# 김킷 스타일 에너지 게임 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에너지가 닳고 김킷식 퀴즈로 충전하는 모바일 세로 웹앱 (점프맵, 무한의 계단, 구구단 문제).

**Architecture:** 순수 ES modules + HTML/CSS + Canvas(빌드 없음). 로직 모듈(에너지, 퀴즈 엔진, 저장, 게임 월드)은 DOM과 분리해 `node --test`로 검증하고, 셸(main/router/input/UI)이 게임 인터페이스 `ctx`로 연결한다.

**Tech Stack:** JavaScript ES modules, Canvas 2D, WebAudio, localStorage, `node --test`

**Spec:** `docs/superpowers/specs/2026-11-19-gimkit-energy-game-design.md`

**에이전트 분업:** Task 1~3은 지휘자(소넷)가 순서대로 직접 수행(공통 뼈대). Task 4~7은 서로 파일이 겹치지 않으므로 병렬 에이전트로 실행(4=하이쿠, 5·6·7=소넷). Task 8은 강한 모델(opus)이 검수.

## Global Constraints
- 빌드 도구 없음. 순수 JavaScript ES modules + HTML/CSS + Canvas.
- 세로 화면 전용, 최대 폭 480px 중앙 정렬, `100dvh`, safe-area 대응, 터치 우선(마우스·키보드 보조).
- 효과음은 WebAudio 합성, 외부 음원·이미지 파일 없음.
- 기록은 localStorage, 접근 실패해도 동작.
- 에너지 최대 10 / 하트 3 / 함정 무적 1.5초 / 오답 후 입력 잠금 약 1초, 정답 표시 약 1.2초.
- 충전량 = 올림(2 × 배율): 연속 1~2 → +2, 3~4 → +3, 5 이상 → +4.
- 연속 오답 2번이면 다음 문제에서 오답 보기 1개 제거.
- 점프맵: 점프 1회 -1 에너지(공중 재점프 불가, 소모 없음), 이동만 하면 소모 없음. 계단: 한 칸 -1.
- 하트는 퀴즈로 회복되지 않음. 시간 경과로 에너지가 닳지 않음.
- UI 문구는 한국어, 쉽고 짧게.
- 각 에이전트는 자기 폴더만 수정, 다른 폴더는 읽기만.

## Review Focus
1. 정답 후보가 4개 미만인 문제 세트(보기 풀이 작음): 중복·누락 없이 가능한 만큼 보기를 만들고 죽지 않아야 한다. → Task 1
2. localStorage가 막힌 환경(시크릿 모드): 기록 저장·조회가 예외 없이 동작해야 한다. → Task 1
3. 오답 잠금 중 또는 정답 직후 빠른 연타: 충전이 이중으로 되지 않아야 한다. → Task 1, Task 5
4. 에너지가 가득인데 충전, 0인데 소모: 범위(0~10)를 벗어나지 않아야 한다. → Task 1
5. 하트 0 이후 추가 입력, 게임 오버 `endGame` 중복 호출: 한 번만 종료되어야 한다. → Task 6, Task 7

---

## 파일 구조
```
index.html
css/app.css                      (Task 3 생성, Task 5 확장)
js/main.js                       (Task 3)
js/core/energy.js                (Task 1)
js/core/quiz-engine.js           (Task 1)
js/core/storage.js               (Task 1)
js/core/router.js                (Task 3)
js/core/input.js                 (Task 3)
js/core/audio.js                 (Task 3)
js/data/gugudan.js               (Task 4)
js/data/question-sets.js         (Task 4)
data/questions/index.json        (Task 4)
data/questions/english-sample.json, fraction-sample.json  (Task 4)
js/games/registry.js             (Task 3)
js/games/jump/index.js, world.js     (Task 6)
js/games/stairs/index.js, logic.js   (Task 7)
js/ui/*.js                       (Task 5: select, quiz-screen, result-screen, hud)
tests/*.test.js, package.json    (각 Task)
```

## 공통 인터페이스 (모든 Task의 기준)
```js
// 문제 세트 (spec 형식)
// QuestionSet = { id, title, subject, grade, units:[{id,title}], items:[{unit, q, answer, distractors?}] }
// 게임 모듈 (js/games/<id>/index.js default export)
// { id, title, icon, controls: 'jump'|'stairs', create(ctx) -> Game }
// Game = { start(), update(dtSec), render(), destroy() }
// ctx = {
//   canvas, g2d, width: 360, height: 640,
//   input: { held:{left,right,jump}, on(name:'left'|'right'|'jump', fn) -> off },
//   energy: Energy, hearts: { value:number, lose():number /*남은 하트*/ },
//   requestQuiz(): Promise<void>,  // 퀴즈 표시. 가득 차거나 닫으면 resolve
//   endGame(score:number): void,   // 셸이 중복 호출은 무시
//   hud: { setScore(text:string): void },
//   sfx: { play(name:'jump'|'hit'|'step'|'correct'|'wrong'|'over'): void },
//   rng: () => number
// }
// 게임의 에너지 소모 패턴: if(!ctx.energy.spend(1)){ await ctx.requestQuiz(); ctx.energy.spend(1); }
```

---

### Task 1: 코어 로직 (에너지·퀴즈 엔진·저장) — 지휘자(소넷)

**Files:**
- Create: `package.json` (`{"type":"module","scripts":{"test":"node --test tests/"}}`), `js/core/energy.js`, `js/core/quiz-engine.js`, `js/core/storage.js`
- Test: `tests/energy.test.js`, `tests/quiz-engine.test.js`, `tests/storage.test.js`

**Interfaces:**
- Produces:
  - `createEnergy(max = 10) -> { value, max, spend(n=1): boolean, add(n): number, isFull(): boolean, reset(): void, subscribe(fn: (value)=>void): () => void }`
  - `energyGain(streak: number): number`
  - `buildChoices(item, pool: string[], rng: () => number) -> { choices: string[], correctIndex: number }`
  - `createQuizSession({ items, units?: string[], rng? }) -> { next(): {q, choices, correctIndex, removedIndex: number|null}, answer(choiceIndex): {correct, gain, streak, correctIndex, lockMs}, streak, wrongStreak }`
  - `getBest(gameId): number`, `recordScore(gameId, score): { best: number, isNewRecord: boolean }`

- [ ] **Step 1: 실패하는 테스트 작성.** `energy.test.js`: `spend(1)` at 0 → `false`, 값 변화 없음; `add(99)` → `value === 10`; 가득일 때 `isFull()`; `subscribe`가 변화마다 호출되고 반환된 함수로 해제. `quiz-engine.test.js`: `energyGain(1)=2, (2)=2, (3)=3, (4)=3, (5)=4, (9)=4`; `buildChoices`는 풀에 정답과 같은 값이 있어도 중복 없는 보기이고 `choices[correctIndex] === item.answer`; 풀 크기 2일 때 3개 보기, 예외 없음; `answer()` 정답 → streak 증가·gain 적용, 오답 → streak 0·`lockMs===1000`; 연속 오답 2번 뒤 `next()`의 `removedIndex`가 정답이 아닌 인덱스; 연속 정답 후 `removedIndex === null`; 같은 문제에 `answer()` 두 번 호출 시 두 번째는 gain 0(이중 충전 방지); `units`가 빈 배열이면 전체 문제 사용. `storage.test.js`: `globalThis.localStorage`를 getItem/setItem이 throw 하도록 대체해도 `getBest`는 0, `recordScore`는 예외 없이 `{best:score, isNewRecord:true}`; 정상 저장소에서 더 높은 점수만 신기록.
- [ ] **Step 2: 실행해 실패 확인.** Run: `node --test tests/` → FAIL (모듈 없음)
- [ ] **Step 3: 구현.** 위 시그니처대로. `buildChoices`: 숫자 답은 정답 ±1~10 근처 값을, 문자 답은 `pool`의 다른 값을 오답으로 사용, `item.distractors`가 있으면 우선 사용. `createQuizSession.next()`는 `units` 필터링된 항목을 셔플해 순환 출제. 정답 인덱스는 보기가 섞인 뒤 기준.
- [ ] **Step 4: 통과 확인.** Run: `node --test tests/` → 전부 PASS
- [ ] **Step 5: Commit** (저장소가 아니면 건너뛰고 완료만 표시): `git add -A && git commit -m "feat: core energy, quiz engine, storage"`

### Task 2: 문제 데이터 형식 문서 — 지휘자(소넷)

**Files:** Create: `data/questions/README.md`

**Interfaces:** Produces: spec의 `QuestionSet` 형식을 그대로 설명하는 문서(필드, 단원 연결, `distractors` 선택 사항, 파일 추가 시 `index.json`에 등록하는 방법)

- [ ] **Step 1:** 위 형식 설명과 예시 세트 1개(영단어 3문항)를 작성한다.
- [ ] **Step 2:** 문서의 예시가 `createQuizSession({items: example.items})`로 실제 돌아가는지 `node -e`로 확인한다. 기대: 오류 없이 `next()` 결과 출력.

### Task 3: 셸 — 화면 골격·입력·라우터·오디오·게임 스텁 — 지휘자(소넷)

**Files:**
- Create: `index.html`, `css/app.css`, `js/main.js`, `js/core/router.js`, `js/core/input.js`, `js/core/audio.js`, `js/games/registry.js`, `js/games/jump/index.js`(스텁), `js/games/stairs/index.js`(스텁)

**Interfaces:**
- Consumes: Task 1의 `createEnergy`, `recordScore`, 공통 인터페이스의 `ctx`
- Produces:
  - `router.show(screen: 'select'|'game'|'result', props)`; 화면 모듈은 `{ mount(root, props), unmount() }`
  - `createInput(root) -> { held, on(name, fn), setLayout('jump'|'stairs'|'none'), destroy() }` (`touch-action:none`, 멀티터치로 이동+점프 동시 입력)
  - `createSfx() -> { play(name) }`
  - `registry: GameModule[]` (jump, stairs 정적 import)
  - `main.js`: 게임 루프(`requestAnimationFrame`, dt 상한 0.05초), `ctx` 생성, `requestQuiz()` 시 루프 일시정지 후 `ui/quiz-screen`의 `showQuiz({session, energy, mode})` 호출, `endGame`은 한 번만 처리하고 결과 화면으로 이동

- [ ] **Step 1:** 스텁 게임은 `controls`만 가지고 캔버스에 게임 이름을 그리는 `create(ctx)`만 구현한다.
- [ ] **Step 2:** `index.html`에 viewport(`user-scalable=no`, `viewport-fit=cover`), 세로 레이아웃, 캔버스 논리 해상도 360×640을 CSS로 가로 폭에 맞춰 스케일하는 컨테이너를 만든다. 더블탭 확대·텍스트 선택·길게 누름 메뉴를 막는다.
- [ ] **Step 3:** `js/main.js`가 selecting 화면 스텁(Task 5 전까지는 첫 게임 즉시 시작) → 스텁 게임 → 결과 이동까지 연결한다.
- [ ] **Step 4: 검증.** 브라우저 도구(Claude_Browser, 모바일 375×812)로 `index.html`을 정적 서버(`python -m http.server`)로 열어 스텁 게임이 보이고 콘솔 오류가 없는지 확인. 기대: 오류 0, 캔버스가 폭에 맞게 표시.

### Task 4: 문제 데이터와 구구단 생성기 — 하이쿠 에이전트 (병렬)

**Files:**
- Create: `js/data/gugudan.js`, `js/data/question-sets.js`, `data/questions/index.json`, `data/questions/english-sample.json`, `data/questions/fraction-sample.json`
- Test: `tests/gugudan.test.js`

**Interfaces:**
- Consumes: Task 2의 형식 문서
- Produces: `generateGugudan(dans: number[]): QuestionSet`(id `gugudan`, 단원 = 2~9단, 각 단 `×1~9`, 문항 `q: "7 × 8"`, `answer: "56"`); `loadIndex(): Promise<{id,title,subject,grade}[]>` (구구단은 항상 포함); `loadSet(id: string, opts?: {dans?: number[]}): Promise<QuestionSet>` (id `gugudan`이면 생성기, 아니면 `data/questions/<id>.json` fetch)

- [ ] **Step 1: 테스트.** `generateGugudan([7])`의 항목 9개, 모두 `unit === "7"`, `"7 × 8"`의 `answer === "56"`; `generateGugudan([2,3,4,5,6,7,8,9])`는 72개; 인자 빈 배열 → 전체 8단원 72개.
- [ ] **Step 2:** 실행해 실패 확인 → 구현 → 통과 확인. Run: `node --test tests/gugudan.test.js`
- [ ] **Step 3:** 영단어·분수 샘플 세트 각 6~8문항(형식 검증용), `index.json`에 등록. `question-sets.js`는 브라우저 `fetch`를 쓰되 실패 시 빈 목록 대신 구구단만 반환한다.

### Task 5: UI 화면 — 문제/게임 선택·김킷 퀴즈·결과·HUD — 소넷 에이전트 (병렬)

**Files:**
- Create: `js/ui/select-screen.js`, `js/ui/quiz-screen.js`, `js/ui/result-screen.js`, `js/ui/hud.js`
- Modify: `css/app.css`(UI 부분만, 파일 하단에 `/* ui */` 구역 추가)

**Interfaces:**
- Consumes: `createQuizSession`, `energyGain`, `loadIndex/loadSet`, `registry`, `getBest/recordScore`
- Produces: `showQuiz({ session, energy, mode: 'refill'|'manual', sfx }) -> Promise<void>`(에너지 가득 → "계속하기", 닫기 버튼으로도 resolve); 선택 화면(과목→세트→단원 칩 복수 선택 ≥1 → 게임 카드), 결과 화면(이번/최고 기록, 신기록 표시, "다시 하기/메뉴"), HUD(하트·에너지 게이지·점수 텍스트, `미리 충전` 버튼은 에너지가 가득이 아닐 때만 활성)

- [ ] **Step 1:** 퀴즈 화면: 문제 + 4색 큰 버튼, 정답 즉시 효과·게이지 차오름·연속 배지(`🔥 N연속 ×배율`), 오답 시 정답 1.2초 표시, 입력 잠금 1초 동안 모든 선택 무시(이중 충전 방지), `removedIndex` 보기 비활성/숨김.
- [ ] **Step 2:** 퀴즈 화면의 DOM 동작을 `index.html`에서 수동으로 열어 모바일 크기에서 확인한다(버튼 최소 높이 64px, 글자 28px 이상). 기대: 한 손 터치로 모두 누를 수 있음, 가로 스크롤 없음.
- [ ] **Step 3:** 선택 화면에서 단원이 하나도 선택되지 않으면 시작 버튼 비활성.

### Task 6: 점프맵 — 소넷 에이전트 (병렬)

**Files:**
- Create: `js/games/jump/world.js`, 대체: `js/games/jump/index.js`
- Test: `tests/jump-world.test.js`

**Interfaces:**
- Consumes: 공통 `ctx`, `createEnergy`
- Produces:
  - `generatePlatforms(fromY: number, toY: number, rng): Platform[]` — `{x,y,w,type:'static'|'moving'|'spike'}`, 높이가 오를수록 간격 증가, 일정 높이부터 `moving`/함정
  - `stepPlayer(state, input, dt, platforms) -> { state, events: ('landed'|'fell'|'jumped'|'hit')[] }` — 중력·좌우 이동·착지 판정, 공중에서는 `jumped` 이벤트 없음
  - 게임: `controls: 'jump'`, 최고 높이(m) 점수, 낙하(화면 아래) → `hearts.lose()` 후 마지막 안전 발판에서 부활, 함정 → `hearts.lose()` + 1.5초 무적, 점프 시 에너지 패턴 적용, 하트 0 → `ctx.endGame(maxHeight)` 한 번

- [ ] **Step 1: 테스트.** `generatePlatforms`: 인접 발판 수직 간격이 최대 점프 도달 높이 이하(도달 가능성), 같은 rng 시드는 같은 결과, 높이 0~50에는 `spike` 없음; `stepPlayer`: 땅에서 점프 입력 → `jumped`, 공중 점프 입력 → 이벤트 없음; 발판 위 착지 → `landed`; 화면 아래 한계 이하 → `fell`.
- [ ] **Step 2:** 실행해 실패 → 구현 → 통과. Run: `node --test tests/jump-world.test.js`
- [ ] **Step 3:** `index.js`에서 월드를 Canvas로 그리고(카메라는 위로만 스크롤), 에너지 0에서 점프 시 `await ctx.requestQuiz()` 후 재시도하는 흐름을 연결한다.
- [ ] **Step 4:** 이전 하트 규칙 테스트: 하트 1에서 `fell`이 한 프레임에 여러 번 발생해도 `endGame`은 한 번(가드 플래그).

### Task 7: 무한의 계단 — 소넷 에이전트 (병렬)

**Files:**
- Create: `js/games/stairs/logic.js`, 대체: `js/games/stairs/index.js`
- Test: `tests/stairs-logic.test.js`

**Interfaces:**
- Consumes: 공통 `ctx`
- Produces: `createStairs(rng) -> { steps: ('L'|'R')[], pos: number, tap(dir:'L'|'R'): { moved: boolean, wrong: boolean }, score: number }`; 게임 `controls: 'stairs'`, 빌딩 외벽 배경과 지그재그 블록, 점수 = 오른 계단 수, 올바른 방향이면 에너지 -1, 틀리면 `hearts.lose()`·제자리, 하트 0 → `ctx.endGame(score)` 한 번

- [ ] **Step 1: 테스트.** 올바른 방향 → `{moved:true, wrong:false}`·`score+1`; 반대 방향 → `{moved:false, wrong:true}`·`score` 불변; 같은 방향 연속 블록이 있어도 `steps` 길이가 충분히 생성(무한), 같은 시드 동일 결과.
- [ ] **Step 2:** 실행해 실패 → 구현 → 통과. Run: `node --test tests/stairs-logic.test.js`
- [ ] **Step 3:** `index.js`: 에너지 0에서 올바른 입력이면 퀴즈 후 같은 입력을 다시 적용. 하트 0 이후의 입력은 무시한다(Review Focus 5).

### Task 8: 통합·검수 — opus 에이전트 (읽기 + 수정 요청)

**Files:** 모든 파일 읽기, 수정은 발견한 결함에 한해 최소한

**Interfaces:** Consumes: 전체 앱

- [ ] **Step 1:** `python -m http.server`로 서빙, Claude_Browser로 375×812 모바일 크기에서 전체 플로우 실행: 선택 → 구구단 7단 → 점프맵 → 에너지 0 → 퀴즈 → 계속하기 → 하트 소진 → 결과/신기록 → 다시 하기 → 무한의 계단 동일 흐름. 기대: 콘솔 오류 0.
- [ ] **Step 2:** 수치 점검(에너지 10으로 점프맵 5~10번 점프 가능한지, 퀴즈 3~4문제로 가득 차는지 등)과 가로 스크롤·확대 없음 확인.
- [ ] **Step 3:** `npm test`(= `node --test tests/`) 전체 PASS 확인 후, 결함 목록을 보고한다.

---

## Self-Review 결과
- **스펙 대응:** 에너지·하트·퀴즈·충전량 → Task 1,5 / 점프맵 → Task 6 / 무한의 계단 → Task 7 / 문제 선택과 구구단·추후 업로드 형식 → Task 2,4,5 / 기록 → Task 1,5 / 세로 화면·입력 → Task 3.
- **타입 일관성:** `ctx`, `QuestionSet`, `createQuizSession`, `showQuiz` 이름은 공통 인터페이스 절과 각 Task에서 동일하게 사용.
- **스펙 정정:** 충전량 기본값 1 → 2(스펙 문서도 수정함).
