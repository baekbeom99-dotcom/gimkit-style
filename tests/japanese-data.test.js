import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createQuizSession } from '../js/core/quiz-engine.js';
import { subjectsOf, setsOf } from '../js/ui/wizard-steps.js';

const ROOT = new URL('../', import.meta.url);
const readJson = (p) => JSON.parse(fs.readFileSync(new URL(p, ROOT), 'utf8'));

const EXPECTED_UNITS = [
  ['a', '아행', 5],
  ['ka', '카행', 5],
  ['sa', '사행', 5],
  ['ta', '타행', 5],
  ['na', '나행', 5],
  ['ha', '하행', 5],
  ['ma', '마행', 5],
  ['ya', '야행', 3],
  ['ra', '라행', 5],
  ['wa', '와행', 3],
];

const SETS = [
  {
    id: 'japanese-hiragana',
    title: '히라가나',
    chars: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん',
  },
  {
    id: 'japanese-katakana',
    title: '가타카나',
    chars: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン',
  },
];

test('index includes 일본어 subject with 히라가나 and 가타카나', () => {
  const idx = readJson('data/questions/index.json');
  assert.ok(subjectsOf(idx).includes('일본어'));
  const jp = setsOf(idx, '일본어');
  assert.deepEqual(
    jp.map((s) => ({ id: s.id, title: s.title, subject: s.subject })),
    [
      { id: 'japanese-hiragana', title: '히라가나', subject: '일본어' },
      { id: 'japanese-katakana', title: '가타카나', subject: '일본어' },
    ],
  );
  for (const e of jp) {
    assert.ok(fs.existsSync(new URL(`data/questions/${e.id}.json`, ROOT)));
  }
});

for (const spec of SETS) {
  test(`${spec.id}: units (각 행), 46 unique kana, unique answers & valid distractors`, () => {
    const s = readJson(`data/questions/${spec.id}.json`);
    assert.equal(s.id, spec.id);
    assert.equal(s.title, spec.title);
    assert.equal(s.subject, '일본어');
    assert.equal(s.kind, 'word');
    assert.equal(s.prompt, '알맞은 발음을 골라요');
    assert.deepEqual(
      s.units,
      EXPECTED_UNITS.map(([id, title]) => ({ id, title })),
    );
    assert.equal(s.items.length, 46);
    assert.equal(s.items.map((it) => it.q).join(''), spec.chars);

    const ansSet = new Set();
    for (const [unitId, , count] of EXPECTED_UNITS) {
      const unitItems = s.items.filter((it) => it.unit === unitId);
      assert.equal(unitItems.length, count, `${spec.id} ${unitId}`);
    }
    for (const it of s.items) {
      assert.ok(typeof it.answer === 'string' && it.answer.trim() !== '');
      assert.ok(!ansSet.has(it.answer), `duplicate answer ${it.answer}`);
      ansSet.add(it.answer);
      assert.ok(Array.isArray(it.distractors) && it.distractors.length >= 4, `${it.q} distractors`);
      assert.equal(new Set(it.distractors).size, it.distractors.length, `${it.q} duplicate distractor`);
      assert.ok(!it.distractors.includes(it.answer), `${it.q} distractor includes answer`);
    }
  });

  test(`${spec.id}: every row unit creates valid 4-choice word questions`, () => {
    const s = readJson(`data/questions/${spec.id}.json`);
    for (const u of s.units) {
      const sess = createQuizSession({ items: s.items, units: [u.id], kind: s.kind, prompt: s.prompt });
      for (let i = 0; i < 6; i++) {
        const q = sess.next();
        assert.equal(q.choices.length, 4, `${spec.id} ${u.id}`);
        assert.equal(new Set(q.choices).size, 4);
        assert.equal(q.kind, 'word');
        assert.equal(q.speak, null);
        assert.equal(q.prompt, '알맞은 발음을 골라요');
        const item = s.items.find((it) => it.unit === u.id && it.q === q.q);
        assert.ok(item);
        assert.equal(q.choices[q.correctIndex], item.answer);
        sess.answer(q.correctIndex);
      }
    }
  });
}
