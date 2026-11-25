import test from 'node:test';
import assert from 'node:assert/strict';
import { speak, cancelSpeech, ttsSupported } from '../js/core/tts.js';

function install(synth) {
  globalThis.window = { speechSynthesis: synth };
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
}
function uninstall() { delete globalThis.window; delete globalThis.SpeechSynthesisUtterance; }

test('speak: cancel first, then speak with text/lang/rate and en voice', () => {
  const calls = [];
  install({
    getVoices: () => [{ lang: 'ko-KR', name: 'k' }, { lang: 'en-GB', name: 'g' }, { lang: 'en-US', name: 'u' }],
    cancel: () => calls.push('cancel'),
    speak: (u) => calls.push(['speak', u.text, u.lang, u.rate, u.voice && u.voice.name]),
    addEventListener() {},
  });
  assert.equal(ttsSupported(), true);
  assert.equal(speak('hello'), true);
  assert.deepEqual(calls, ['cancel', ['speak', 'hello', 'en-US', 0.85, 'u']]);
  uninstall();
});
test('speak: custom lang/rate, falls back to same-language voice', () => {
  const calls = [];
  install({ getVoices: () => [{ lang: 'en-AU', name: 'a' }], cancel() {}, speak: (u) => calls.push([u.lang, u.rate, u.voice.name]) });
  speak('hi', 'en-US', { rate: 1 });
  assert.deepEqual(calls[0], ['en-US', 1, 'a']);
  uninstall();
});
test('speak: empty text does nothing', () => {
  const calls = [];
  install({ getVoices: () => [], cancel: () => calls.push('c'), speak: () => calls.push('s') });
  assert.equal(speak(''), false);
  assert.equal(speak('   '), false);
  assert.equal(speak(null), false);
  assert.deepEqual(calls, []);
  uninstall();
});
test('unsupported: nothing throws', () => {
  uninstall();
  assert.equal(ttsSupported(), false);
  assert.equal(speak('hello'), false);
  assert.doesNotThrow(() => cancelSpeech());
  globalThis.window = {};
  assert.equal(speak('hello'), false);
  uninstall();
});
test('exceptions in speechSynthesis are swallowed', () => {
  install({ getVoices() { throw new Error('x'); }, cancel() { throw new Error('y'); }, speak() { throw new Error('z'); } });
  assert.doesNotThrow(() => speak('hello'));
  assert.doesNotThrow(() => cancelSpeech());
  uninstall();
});
test('cancelSpeech calls cancel', () => {
  let n = 0;
  install({ cancel: () => n++ });
  cancelSpeech();
  assert.equal(n, 1);
  uninstall();
});
