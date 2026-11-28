// Titan Rush biomes: data only (palettes, parallax props, enemy / boss looks). render.js draws them.
// Append a new entry to BIOMES (and bump BIOME_COUNT in logic.js) to add a biome; reuse existing
// layer kinds / enemy kinds / boss kinds or add a drawer for a new kind in render.js.
//
// Layer kinds (drawn back to front, parallax scroll at `speed` px/s, tiled every PERIOD px):
//   clouds    items { x, y(0..1 of sky), s }
//   hills     items { x, w, h(0..1 of sky) }      color
//   pines     items { x, h(0..1 of sky) }          color / dark / trunk
//   towers    items { x, w, h, cols, rows, wins } color / edge / lit[] ; optional sign
//   lamps     items { x }                          pole / glow
//   stars     items { x, y, p }                    (not scrolled)
// Enemy kinds: 'wolf' | 'mechwolf'.   Boss kinds: 'giant' | 'mech'.
// Boss fight look (per biome): proj { small:{kind,...}, big:{kind,...}, trail, glow } with kinds 'leaf' | 'thorn' | 'orb' | 'rocket';
//   shield (bubble colour), aura [phase1, phase2, phase3] glow colours (phase 1 only glows while charging a volley).

export const PERIOD = 480;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const span = (r, a, b) => a + (b - a) * r();

// n items spread over one period with jitter
function scatter(seed, n, make) {
  const r = mulberry(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push(make(((i + r() * 0.7) / n) * PERIOD, r, i));
  return out;
}

function towerItems(seed, n, wMin, wMax, hMin, hMax, litProb, litColors, signs) {
  return scatter(seed, n, (x, r, i) => {
    const w = Math.round(span(r, wMin, wMax));
    const cols = Math.max(2, Math.floor(w / 11));
    const rows = 6 + Math.floor(r() * 4);
    const wins = [];
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k < rows; k++) if (r() < litProb) wins.push([c, k, Math.floor(r() * litColors.length)]);
    }
    return { x, w, h: span(r, hMin, hMax), cols, rows, wins, sign: signs && i % 3 === 1 ? signs[i % signs.length] : null, roof: Math.floor(r() * 3) };
  });
}

export const BIOMES = [
  {
    id: 'forest',
    name: '초록 숲',
    icon: '🌲',
    sky: ['#6fcdfa', '#8fdcfc', '#b0e8fd', '#d2f3fe', '#eefcff'],
    sun: { x: 0.8, y: 0.2, r: 20, color: '#fff3a0', halo: '#ffffff' },
    ground: { top: '#52c24a', topLight: '#9aee6a', dirt: '#8a5a2b', dirtDark: '#6b4220', dirtLight: '#a4733c', edge: '#1c3a14', tuft: '#3a9a38', pattern: 'grass' },
    layers: [
      { kind: 'clouds', speed: 5, color: '#ffffff', shade: '#c6e8ff', items: scatter(11, 5, (x, r) => ({ x, y: span(r, 0.08, 0.42), s: span(r, 0.7, 1.3) })) },
      { kind: 'hills', speed: 8, color: '#8fd9b2', items: scatter(12, 4, (x, r) => ({ x, w: span(r, 150, 210), h: span(r, 0.2, 0.32) })) },
      { kind: 'hills', speed: 14, color: '#6cc690', items: scatter(13, 5, (x, r) => ({ x, w: span(r, 110, 170), h: span(r, 0.14, 0.24) })) },
      { kind: 'pines', speed: 22, color: '#3aa35d', dark: '#2b8449', trunk: '#6b4220', items: scatter(14, 12, (x, r) => ({ x, h: span(r, 0.24, 0.36) })) },
      { kind: 'pines', speed: 40, color: '#27804a', dark: '#1a6038', trunk: '#4f3216', items: scatter(15, 6, (x, r) => ({ x, h: span(r, 0.36, 0.5) })) },
    ],
    enemy: { kind: 'wolf', name: '숲 늑대', body: '#8a909e', dark: '#4a4f5e', belly: '#cdd2de', eye: '#ffd23f', accent: '#e0a040' },
    boss: { kind: 'giant', name: '고대 숲 거인', bark: '#7e4e26', barkDark: '#4f2e14', barkLight: '#aa713b', leaf: '#3aa35d', leafLight: '#7be27a', leafDark: '#1f6e3a', eye: '#ffe14d', moss: '#52c24a' },
    proj: {
      small: { kind: 'leaf', body: '#6ee26a', dark: '#1f7a3a', vein: '#d8ffc0' },
      big: { kind: 'thorn', body: '#8a5a2b', dark: '#3a2010', spike: '#f0c868' },
      trail: '#9bff6a', glow: '#ffe14d',
    },
    shield: '#b8ff8a',
    aura: ['#ffe27a', '#ffa030', '#ff3a3a'],
  },
  {
    id: 'neon',
    name: '네온 시티',
    icon: '🏙',
    sky: ['#170f45', '#2d1670', '#6a2490', '#c43c8e', '#ff7a7a', '#ffb878'],
    sun: { x: 0.2, y: 0.22, r: 15, color: '#ffe9c2', halo: '#ff9ad0' },
    ground: { top: '#3a3f6e', topLight: '#6a70b0', dirt: '#23264a', dirtDark: '#171a36', dirtLight: '#2f3360', edge: '#07041a', tuft: '#ffd23f', pattern: 'road', neon: '#ff4d9a' },
    layers: [
      { kind: 'stars', speed: 0, items: scatter(21, 26, (x, r) => ({ x, y: span(r, 0.02, 0.5), p: r() * 6.28 })) },
      { kind: 'towers', speed: 8, color: '#2c2078', edge: '#150e45', lit: ['#5a48c0', '#7a68e0'], items: towerItems(22, 9, 34, 56, 0.28, 0.5, 0.28, [0, 1]) },
      { kind: 'towers', speed: 17, color: '#1a1455', edge: '#080426', lit: ['#ffd23f', '#3ad6ff', '#ff6bd6'], items: towerItems(23, 7, 46, 72, 0.36, 0.62, 0.42, [0, 1, 2], ['#ff4d9a', '#3ad6ff', '#b8ff4d']) },
      { kind: 'lamps', speed: 36, pole: '#0b0620', glow: '#ffe27a', items: scatter(24, 4, (x) => ({ x })) },
    ],
    enemy: { kind: 'mechwolf', name: '로켓 늑대', body: '#4c5392', dark: '#1d2150', plate: '#8590dc', glow: '#3ad6ff', accent: '#ff4d9a', flame: '#ff9d1f' },
    boss: { kind: 'mech', name: '메카 울프', body: '#454c8a', dark: '#1a1d4a', plate: '#8c97e6', glow: '#ff4dd2', glow2: '#3ad6ff', accent: '#ff4d9a', flame: '#ff9d1f' },
    proj: {
      small: { kind: 'orb', body: '#ff4dd2', core: '#ffffff', ring: '#3ad6ff' },
      big: { kind: 'rocket', body: '#aab4f5', dark: '#3a3f8a', nose: '#ff4d9a', flame: '#ff9d1f' },
      trail: '#ff4dd2', glow: '#3ad6ff',
    },
    shield: '#7cf0ff',
    aura: ['#3ad6ff', '#ff9d1f', '#ff2a8a'],
  },
];

export const biomeAt = (i) => BIOMES[(((Number(i) || 0) % BIOMES.length) + BIOMES.length) % BIOMES.length];
