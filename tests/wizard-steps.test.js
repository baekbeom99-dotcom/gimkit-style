import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, setUnits, chooseSubject, chooseSet, toggleUnit, toggleAll, isAll, back, canStart, complete, skip,
  subjectsOf, setsOf, takeWizardTurn, resetWizardFlag,
} from '../js/ui/wizard-steps.js';

const INDEX = [
  { id: 'gugudan', title: '구구단', subject: '수학', grade: '초등' },
  { id: 'add', title: '덧셈', subject: '수학', grade: '1학년' },
  { id: 'en3', title: '3학년 영단어', subject: '영어', grade: '3학년' },
  { id: 'en4', title: '4학년 영단어', subject: '영어', grade: '4학년' },
];
const U = ['L1', 'L2', 'L3', 'L4'];

test('subjects and sets of a subject', () => {
  assert.deepEqual(subjectsOf(INDEX), ['수학', '영어']);
  assert.deepEqual(setsOf(INDEX, '영어').map((s) => s.id), ['en3', 'en4']);
});

test('initial state: default 구구단 when nothing saved, saved selection otherwise', () => {
  const a = initialState(INDEX, null);
  assert.equal(a.step, 1); assert.equal(a.subject, '수학'); assert.equal(a.setId, 'gugudan');
  const b = initialState(INDEX, { subject: '영어', setId: 'en4', units: ['L2'], all: false });
  assert.equal(b.subject, '영어'); assert.equal(b.setId, 'en4');
  assert.equal(initialState(INDEX, { setId: 'gone' }).setId, 'gugudan');
});

test('setUnits: all by default, restores saved units for the saved set', () => {
  const a = setUnits(initialState(INDEX, null), U);
  assert.deepEqual(a.selected, U); assert.ok(isAll(a));
  const b = setUnits(initialState(INDEX, { setId: 'en4', units: ['L2', 'L9'], all: false }), U);
  assert.deepEqual(b.selected, ['L2']);
  const c = setUnits(initialState(INDEX, { setId: 'en4', units: ['L2'], all: true }), U);
  assert.deepEqual(c.selected, U);
});

test('choosing a different subject resets set to its first set and advances', () => {
  let s = setUnits(initialState(INDEX, null), U);
  s = chooseSubject(s, INDEX, '영어');
  assert.equal(s.step, 2); assert.equal(s.setId, 'en3'); assert.deepEqual(s.selected, []); assert.deepEqual(s.unitIds, []);
});

test('choosing the same subject keeps set and units', () => {
  let s = setUnits(initialState(INDEX, null), U);
  s = toggleUnit(s, 'L1');
  const t = chooseSubject(s, INDEX, '수학');
  assert.equal(t.step, 2); assert.equal(t.setId, 'gugudan'); assert.deepEqual(t.selected, s.selected);
});

test('choosing a different set resets units; same set keeps them', () => {
  let s = chooseSubject(setUnits(initialState(INDEX, null), U), INDEX, '영어');
  const t = chooseSet(s, 'en4');
  assert.equal(t.step, 3); assert.equal(t.setId, 'en4'); assert.deepEqual(t.selected, []);
  let u = setUnits(t, U); u = toggleUnit(u, 'L1');
  const v = chooseSet({ ...u, step: 2 }, 'en4');
  assert.equal(v.step, 3); assert.deepEqual(v.selected, u.selected);
});

test('start disabled until a unit is selected on step 3', () => {
  let s = chooseSet(chooseSubject(initialState(INDEX, null), INDEX, '영어'), 'en4');
  assert.equal(canStart(s), false);
  s = setUnits(s, U);
  assert.equal(canStart(s), true);
  s = toggleAll(s);
  assert.deepEqual(s.selected, []); assert.equal(canStart(s), false); assert.equal(complete(s), null);
  s = toggleAll(s); assert.ok(isAll(s));
  assert.equal(canStart({ ...s, step: 2 }), false);
});

test('toggleUnit keeps unit order and complete() output shape', () => {
  let s = setUnits(chooseSet(chooseSubject(initialState(INDEX, null), INDEX, '영어'), 'en4'), U);
  s = toggleAll(s);
  s = toggleUnit(toggleUnit(s, 'L3'), 'L2');
  assert.deepEqual(s.selected, ['L2', 'L3']);
  assert.deepEqual(complete(s), { subject: '영어', setId: 'en4', units: ['L2', 'L3'], all: false });
  assert.equal(complete(toggleAll(s)).all, true);
});

test('tapping a unit while 전체 is selected picks only that unit; later taps toggle', () => {
  let s = setUnits(chooseSet(chooseSubject(initialState(INDEX, null), INDEX, '영어'), 'en4'), U);
  s = toggleAll(s); // 전체 선택 상태로 만든다
  s = toggleAll(s) && s;
  const all = { ...s, selected: [...s.unitIds] };
  assert.equal(isAll(all), true);
  const one = toggleUnit(all, 'L2');
  assert.deepEqual(one.selected, ['L2']);
  const two = toggleUnit(one, 'L3');
  assert.deepEqual(two.selected, ['L2', 'L3']);
  const back1 = toggleUnit(two, 'L2');
  assert.deepEqual(back1.selected, ['L3']);
  // 단원이 하나뿐인 세트는 그대로 토글
  const single = { ...all, unitIds: ['L1'], selected: ['L1'] };
  assert.deepEqual(toggleUnit(single, 'L1').selected, []);
});

test('back keeps choices and stops at step 1', () => {
  let s = setUnits(chooseSet(chooseSubject(initialState(INDEX, null), INDEX, '영어'), 'en4'), U);
  s = toggleUnit(s, 'L1');
  const b = back(s);
  assert.equal(b.step, 2); assert.equal(b.setId, 'en4'); assert.deepEqual(b.selected, s.selected);
  const c = back(b);
  assert.equal(c.step, 1); assert.equal(c.subject, '영어');
  assert.equal(back(c).step, 1);
});

test('skip keeps the saved selection (no result)', () => {
  assert.deepEqual(skip(), { done: true, result: null });
});

test('wizard flag is true only once per page load', () => {
  resetWizardFlag();
  assert.equal(takeWizardTurn(), true);
  assert.equal(takeWizardTurn(), false);
  assert.equal(takeWizardTurn(), false);
  resetWizardFlag();
  assert.equal(takeWizardTurn(), true);
});
