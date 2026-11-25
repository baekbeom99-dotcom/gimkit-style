import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createQuizSession } from '../js/core/quiz-engine.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const sets = {};
for (const g of [3, 4, 5, 6]) sets[g] = JSON.parse(read(`data/questions/english-g${g}.json`));

// 업로드된 목록 파싱 + 정리 규칙(4학년 Lesson 6)
function parseFixture() {
  const res = {}; let grade = null, lesson = null;
  for (const raw of read('tests/fixtures/English_words.md').split(/\r?\n/)) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^## (\d)학년/))) { grade = Number(m[1]); res[grade] = {}; continue; }
    if ((m = line.match(/^### Lesson (\d+)/))) { lesson = `L${m[1]}`; res[grade][lesson] = []; continue; }
    if (!line || line.startsWith('#')) continue;
    if (grade === 4 && lesson === 'L6') {
      res[4].L6 = ['clean the park', 'do my homework', 'draw a picture', 'fly a drone', 'help', 'pick up trash', 'read a book', 'sure', 'watch TV'];
    } else res[grade][lesson].push(...line.split(',').map((w) => w.trim()).filter(Boolean));
  }
  return res;
}

test('index lists the four english sets, no sample', () => {
  const idx = JSON.parse(read('data/questions/index.json'));
  const ids = idx.map((e) => e.id);
  for (const g of [3, 4, 5, 6]) assert.ok(ids.includes(`english-g${g}`));
  assert.ok(!ids.includes('english-sample'));
  assert.ok(!fs.existsSync(new URL('data/questions/english-sample.json', ROOT)));
  for (const e of idx) assert.ok(fs.existsSync(new URL(`data/questions/${e.id}.json`, ROOT)), e.id);
});

for (const g of [3, 4, 5, 6]) {
  test(`english-g${g}: shape`, () => {
    const s = sets[g];
    assert.equal(s.id, `english-g${g}`);
    assert.equal(s.subject, '영어');
    assert.equal(s.grade, String(g));
    assert.equal(s.kind, 'word');
    assert.equal(s.tts, 'en-US');
    const unitIds = new Set(s.units.map((u) => u.id));
    assert.equal(unitIds.size, s.units.length);
    const seen = new Set();
    for (const it of s.items) {
      for (const k of ['unit', 'q', 'answer']) assert.ok(typeof it[k] === 'string' && it[k].trim() !== '', `${k} ${JSON.stringify(it)}`);
      assert.ok(unitIds.has(it.unit), `unit ${it.unit}`);
      const key = `${it.unit}|${it.q}`;
      assert.ok(!seen.has(key), `duplicate ${key}`);
      seen.add(key);
    }
  });
  test(`english-g${g}: same lesson never shares a Korean answer for different words`, () => {
    const m = new Map();
    for (const it of sets[g].items) {
      const k = `${it.unit}|${it.answer}`;
      // am/is는 둘 다 '~이다'로 표기하기로 함(사용자 결정). 퀴즈 엔진은 같은 뜻의 보기를 중복해서 보여 주지 않는다.
      const sameWord = m.get(k) === it.q || (it.answer === '~이다' && ['am', 'is'].includes(it.q) && ['am', 'is'].includes(m.get(k)));
      if (m.has(k)) assert.ok(sameWord, `${it.unit}: ${it.q} / ${m.get(k)} -> ${it.answer}`);
      m.set(k, it.q);
    }
  });
  test(`english-g${g}: covers the uploaded word list exactly`, () => {
    const fx = parseFixture()[g];
    const s = sets[g];
    assert.deepEqual(s.units.map((u) => u.id), Object.keys(fx));
    for (const [lesson, words] of Object.entries(fx)) {
      const got = s.items.filter((it) => it.unit === lesson).map((it) => it.q);
      assert.deepEqual([...got].sort(), [...words].sort(), `${g}학년 ${lesson}`);
    }
  });
}

test('fixture sanity: cleanup + keep-as-is words', () => {
  const fx = parseFixture();
  assert.equal(fx[4].L6.length, 9);
  assert.ok(fx[3].L2.includes('pencil case') && fx[3].L8.includes("let's") && fx[4].L7.includes('T-shirt'));
  assert.ok(sets[4].items.some((i) => i.unit === 'L3' && i.q === "o'clock"));
});

test('every english question gets 4 choices, even one-word units', () => {
  for (const g of [3, 4, 5, 6]) {
    const s = sets[g];
    for (const u of s.units) {
      const sess = createQuizSession({ items: s.items, units: [u.id], kind: s.kind, speak: s.tts });
      for (let i = 0; i < 6; i++) {
        const q = sess.next();
        assert.equal(q.choices.length, 4, `${g} ${u.id}`);
        assert.equal(new Set(q.choices).size, 4);
        assert.equal(q.kind, 'word');
        assert.equal(q.speak, 'en-US');
        const item = s.items.find((it) => it.unit === u.id && it.q === q.q);
        assert.equal(q.choices[q.correctIndex], item.answer);
        sess.answer(q.correctIndex);
      }
    }
  }
});
