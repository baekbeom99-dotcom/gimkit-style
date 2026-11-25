// Pure step logic for the start-up wizard (과목 -> 문제 -> 단원). No DOM; states are plain objects and every
// transition returns a new state. `index` = [{ id, title, subject, grade }], `saved` = localStorage selection.

export const STEPS = 3;

const subjOf = (s) => s.subject || '기타';
export const subjectsOf = (index) => [...new Set(index.map(subjOf))];
export const setsOf = (index, subject) => index.filter((s) => subjOf(s) === subject);

/** Initial state from the saved selection (falls back to 구구단, then the first set). */
export function initialState(index, saved) {
  const savedSet = saved && index.find((s) => s.id === saved.setId);
  const set = savedSet || index.find((s) => s.id === 'gugudan') || index[0];
  return {
    step: 1,
    subject: subjOf(set),
    setId: set.id,
    unitIds: [],            // units of the current set (filled by setUnits once loaded)
    selected: [],           // chosen unit ids
    restore: savedSet && !saved.all && Array.isArray(saved.units) ? saved.units.map(String) : null, // unit ids to re-select for the saved set
    restoreSetId: savedSet ? savedSet.id : null,
  };
}

/** Supply the loaded unit ids of the current set: re-select the saved ones if they apply, else all. */
export function setUnits(state, unitIds) {
  const ids = unitIds.map(String);
  let sel = ids;
  if (state.restore && state.restoreSetId === state.setId) {
    const r = state.restore.filter((x) => ids.includes(x));
    if (r.length) sel = r;
  }
  return { ...state, unitIds: ids, selected: sel };
}

/** Step 1 option tapped: a different subject resets the set to that subject's first set; always advances. */
export function chooseSubject(state, index, subject) {
  if (subject === state.subject) return { ...state, step: 2 };
  const first = setsOf(index, subject)[0];
  return { ...state, step: 2, subject, setId: first ? first.id : null, unitIds: [], selected: [], restore: null };
}

/** Step 2 option tapped: a different set resets the units (to 전체 once loaded); always advances. */
export function chooseSet(state, setId) {
  if (setId === state.setId) return { ...state, step: 3 };
  return { ...state, step: 3, setId, unitIds: [], selected: [], restore: null };
}

// 시작 설정에서는 '전체'가 기본 선택이라, 그 상태에서 단원을 처음 누르면 "그 단원만" 고르는 뜻으로 본다
// (단원이 둘 이상일 때). 이후에는 누를 때마다 선택/해제를 토글한다.
export function toggleUnit(state, id) {
  if (state.unitIds.length > 1 && isAll(state) && state.unitIds.includes(id)) return { ...state, selected: [id] };
  const selected = state.selected.includes(id) ? state.selected.filter((x) => x !== id) : [...state.selected, id];
  return { ...state, selected: state.unitIds.filter((u) => selected.includes(u)) };
}

export function isAll(state) { return state.unitIds.length > 0 && state.selected.length === state.unitIds.length; }

/** '전체' toggle: all selected -> none, otherwise -> all. */
export function toggleAll(state) {
  return { ...state, selected: isAll(state) ? [] : [...state.unitIds] };
}

export function back(state) { return state.step > 1 ? { ...state, step: state.step - 1 } : state; }

/** '시작하기' is allowed on the last step with at least one unit selected. */
export function canStart(state) { return state.step === STEPS && state.selected.length >= 1; }

/** Output saved to localStorage (same shape as the start screen's selection) or null when not allowed yet. */
export function complete(state) {
  if (!canStart(state)) return null;
  return { subject: state.subject, setId: state.setId, units: [...state.selected], all: isAll(state) };
}

/** '건너뛰기': leave the wizard keeping whatever selection was saved (null result = change nothing). */
export function skip() { return { done: true, result: null }; }

// ---- "show only once per page load" flag (module state resets on reload) ----
let pending = true;
/** True exactly once per page load: the first start screen consumes it. */
export function takeWizardTurn() { const p = pending; pending = false; return p; }
export function resetWizardFlag() { pending = true; }
