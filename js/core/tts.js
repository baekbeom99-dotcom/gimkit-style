// 영어 단어 읽어 주기 (Web Speech API). 어떤 경우에도 예외를 던지지 않는다.
let hookedSynth = null;
let cachedVoices = [];

function synth() {
  try {
    const w = typeof window !== 'undefined' ? window : globalThis;
    return w && w.speechSynthesis ? w.speechSynthesis : null;
  } catch { return null; }
}

export function ttsSupported() {
  try { return !!synth() && typeof SpeechSynthesisUtterance !== 'undefined'; } catch { return false; }
}

function refreshVoices(s) {
  try { const v = s.getVoices && s.getVoices(); if (v && v.length) cachedVoices = Array.from(v); } catch { /* ignore */ }
}

function pickVoice(lang) {
  try {
    const l = String(lang).toLowerCase().replace('_', '-');
    const base = l.split('-')[0];
    const norm = (v) => String(v.lang || '').toLowerCase().replace('_', '-');
    return cachedVoices.find((v) => norm(v) === l) || cachedVoices.find((v) => norm(v).split('-')[0] === base) || null;
  } catch { return null; }
}

export function cancelSpeech() {
  try { const s = synth(); if (s && s.cancel) s.cancel(); } catch { /* ignore */ }
}

export function speak(text, lang = 'en-US', { rate = 0.85 } = {}) {
  try {
    const t = String(text ?? '').trim();
    if (!t || !ttsSupported()) return false;
    const s = synth();
    if (hookedSynth !== s) { // 음성 목록은 늦게 로드될 수 있다: 막지 않고 voiceschanged 로 갱신
      hookedSynth = s;
      try { if (s.addEventListener) s.addEventListener('voiceschanged', () => refreshVoices(s)); } catch { /* ignore */ }
    }
    refreshVoices(s);
    if (s.cancel) s.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = lang;
    u.rate = rate;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    s.speak(u);
    return true;
  } catch { return false; }
}

export default { speak, cancelSpeech, ttsSupported };
