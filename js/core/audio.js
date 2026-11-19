// WebAudio synthesized sfx. Safe if AudioContext is unavailable.
const SOUNDS = {
  jump: [{ f: 360, to: 720, d: 0.14, t: 'square', v: 0.12 }],
  hit: [{ f: 180, to: 60, d: 0.25, t: 'sawtooth', v: 0.16 }],
  step: [{ f: 520, to: 560, d: 0.06, t: 'triangle', v: 0.12 }],
  correct: [{ f: 523, d: 0.09, t: 'triangle', v: 0.15 }, { f: 784, d: 0.16, t: 'triangle', v: 0.15, at: 0.09 }],
  wrong: [{ f: 220, to: 150, d: 0.3, t: 'sawtooth', v: 0.14 }],
  over: [{ f: 392, d: 0.18, t: 'triangle', v: 0.15 }, { f: 330, d: 0.18, t: 'triangle', v: 0.15, at: 0.18 }, { f: 262, d: 0.35, t: 'triangle', v: 0.15, at: 0.36 }],
};

const SCALE = [0, 2, 4, 5, 7, 9, 11, 12]; // 도레미파솔라시도
const C5 = 523.25;
const noteFreq = (semi) => C5 * Math.pow(2, semi / 12);
function noteSeq(arg) {
  const i = ((Math.floor(Number(arg)) || 0) % 8 + 8) % 8;
  const f = noteFreq(SCALE[i]);
  return [{ f, d: 0.16, t: 'square', v: 0.07 }, { f, d: 0.2, t: 'triangle', v: 0.12 }];
}
const MAGIC = [0, 4, 7, 12, 16].map((s, k) => ({ f: noteFreq(s + 12), d: 0.12, t: 'triangle', v: 0.1, at: k * 0.05 }));
const CLEAR = [0, 4, 7, 12].map((s, k) => ({ f: noteFreq(s), d: k === 3 ? 0.4 : 0.14, t: k === 3 ? 'square' : 'triangle', v: 0.12, at: k * 0.12 }));
SOUNDS.magic = MAGIC;
SOUNDS.clear = CLEAR;

export function createSfx() {
  let ac = null;
  function get() {
    if (!ac) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch { return null; }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', get, { once: true, passive: true });
    window.addEventListener('keydown', get, { once: true });
  }
  function play(name, arg) {
    const seq = name === 'note' ? noteSeq(arg) : SOUNDS[name];
    const a = seq && get();
    if (!a) return;
    try {
      const now = a.currentTime;
      for (const n of seq) {
        const t0 = now + (n.at || 0);
        const osc = a.createOscillator();
        const gain = a.createGain();
        osc.type = n.t;
        osc.frequency.setValueAtTime(n.f, t0);
        if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.d);
        gain.gain.setValueAtTime(n.v, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
        osc.connect(gain).connect(a.destination);
        osc.start(t0);
        osc.stop(t0 + n.d + 0.02);
      }
    } catch { /* ignore */ }
  }
  return { play };
}
