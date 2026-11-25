// Pixel-art icons drawn in code: string bitmaps + palette -> crisp <canvas>.
// '.' = transparent. Each row is one string; rows may differ in length from the
// widest row (missing cells are transparent).

const ICONS = {
  // 16x16 jump map: sky, clouds, character jumping between platforms
  jump: {
    pal: { b: '#4cc3ff', c: '#a6e4ff', w: '#ffffff', g: '#3fd04a', d: '#8a5a2b', G: '#1f8a2a',
      r: '#ff4d6d', s: '#ffd9a8', k: '#1b1340', y: '#ffd23f' },
    rows: [
      'bbbbbbbbbbbbbbby',
      'bwwwbbbbbbbwwwbb',
      'wwwwwbbbbbwwwwwb',
      'bbbbbbbrrrrbbbbb',
      'bbbbbbbrsskbbbbb',
      'bbbbbbbssssbbbbb',
      'bbbbbbrrrrrrbbbb',
      'bbbbbbbrkkrbbbbb',
      'bbbbbbbkbbkbbbbb',
      'bbbbbbbbbbbbbbbb',
      'bbbbbbbbbbbbbggg',
      'gggggbbbbbbbGddd',
      'GdddGbbbbbbbbbbb',
      'bbbbbbbbbbbbbbbb',
      'bbbbggggggbbbbbb',
      'GGGGGGGGGGGGGGGG',
    ],
  },
  // 16x16 stairs: building facade with zigzag stairs and climbing character
  stairs: {
    pal: { n: '#2b2f6e', m: '#3a3f8f', y: '#ffd23f', r: '#ff4d6d', s: '#ffd9a8', k: '#1b1340',
      g: '#c8c3e6', d: '#8a85b8', w: '#ffffff', e: '#6a55d6' },
    rows: [
      'nnnnnnnnnnnnnnnn',
      'nyynnyynnyynnyyn',
      'nyynnyynnyynnyyn',
      'nnnnnnnnnnnnnnnn',
      'nyynnyynnnnnnrrn',
      'nyynnyynnnnnnrsn',
      'nnnnnnnnnnngggsn',
      'nnnnnnnnnnngrrnn',
      'nnnnnnnnngggkknn',
      'nnnnnnnnnndnnnnn',
      'nnnnnggggggnnnnn',
      'nnnnnddddddnnnnn',
      'ngggggnnnnnnnnnn',
      'nddddddnnnnnnnnn',
      'eeeeeeeeeeeeeeee',
      'mmmmmmmmmmmmmmmm',
    ],
  },
  // 16x16 2D tower: tetromino bricks stacked on a narrow platform over a void, finish flag on top
  tower2d: {
    pal: { n: '#1f1850', v: '#120c30', r: '#ff4d6d', R: '#b8203f', y: '#ffd23f', Y: '#d89e00', c: '#3ad6ff',
      C: '#1792c4', g: '#c8c3e6', d: '#8a85b8', w: '#ffffff', f: '#ff9d1f', k: '#1b1340' },
    rows: [
      'nnnnnnnnnnnnnnnn',
      'nnnnnnnnnnkwwwwn',
      'nnnnnnnnnnkwfffn',
      'nnnnnnnnnnkwwwwn',
      'nnnnnnnnnnknnnnn',
      'nnnnnnnnnnknnnnn',
      'nnnnnyyyyynnnnnn',
      'nnnnnyYYYYnnnnnn',
      'nnnnnrrrrccnnnnn',
      'nnnnnrRRRrCCnnnn',
      'nnnnnrrrrccnnnnn',
      'nnnnnRRRRCCnnnnn',
      'nnnnggggggggnnnn',
      'nnnnddddddddnnnn',
      'vvvvvvvvvvvvvvvv',
      'vvvvvvvvvvvvvvvv',
    ],
  },
  // 16x16 3D stack: isometric pastel slabs getting narrower, a small slice falling
  stack3d: {
    pal: { s: '#2b2f6e', p: '#ff8fc8', P: '#c25a98', q: '#ffb3e2', y: '#ffe27a', Y: '#c9a93a', Z: '#fff0a8',
      m: '#7be0a4', M: '#3fa872', N: '#a9f5cb', b: '#6ec6ff', B: '#3a8ed0', Q: '#a6e0ff', w: '#ffffff' },
    rows: [
      'ssssssssssssssss',
      'sssssssssssswsss',
      'sssssssQQQQsssss',
      'sssssssBbbbQssss',
      'ssssssssBBBbsss.',
      'ssssssNNNNNNssss',
      'ssssssMmmmmmNsss',
      'sssssssMMMMMMsss',
      'sssswwsZZZZZZZss',
      'sssssssYyyyyyyZs',
      'ssssssssYYYYYYYs',
      'ssqqqqqqqqqqqqqs',
      'sspppppppppppppq',
      'sssPPPPPPPPPPPPp',
      'ssssssssssssssss',
      'ssssssssssssssss',
    ],
  },
  // 12x12 small icons
  bolt: {
    pal: { y: '#ffd23f', o: '#ff9d1f', k: '#0b0620' },
    rows: [
      '......kkk...',
      '.....kyyk...',
      '....kyyk....',
      '...kyyyk....',
      '..kyyyykkk..',
      '.kyyyyyyyyk.',
      '.kkkkyyykk..',
      '....kyyk....',
      '...kyyk.....',
      '...kyk......',
      '..kyk.......',
      '..kk........',
    ],
  },
  subject: { // book
    pal: { r: '#ff4d6d', w: '#ffffff', k: '#0b0620', d: '#b8203f' },
    rows: [
      '............',
      '.kkkkkkkkkk.',
      '.krrrrrrrrk.',
      '.krwwwwwwrk.',
      '.krrrrrrrrk.',
      '.krwwwwrrrk.',
      '.krrrrrrrrk.',
      '.kddddddddk.',
      '.kkkkkkkkkk.',
      '.kwwwwwwwwk.',
      '..kkkkkkkk..',
      '............',
    ],
  },
  quiz: { // question mark block
    pal: { y: '#ffd23f', o: '#d89e00', k: '#0b0620', w: '#ffffff' },
    rows: [
      'kkkkkkkkkkkk',
      'kyyyyyyyyyyk',
      'kyyykkkkyyok',
      'kyykyyyykyok',
      'kyyyyyyykyok',
      'kyyyyykkyyok',
      'kyyyykyyyyok',
      'kyyyykyyyyok',
      'kyyyyyyyyyok',
      'kyyyykyyyyok',
      'kooooooooook',
      'kkkkkkkkkkkk',
    ],
  },
  unit: { // 2x2 grid
    pal: { b: '#3aa0ff', d: '#1368ce', k: '#0b0620' },
    rows: [
      '............',
      '.kkkkk.kkkkk',
      '.kbbbk.kbbbk',
      '.kbbdk.kbbdk',
      '.kkkkk.kkkkk',
      '............',
      '.kkkkk.kkkkk',
      '.kbbbk.kbbbk',
      '.kbbdk.kbbdk',
      '.kkkkk.kkkkk',
      '............',
      '............',
    ],
  },
  close: {
    pal: { w: '#ffffff' },
    rows: [
      '............',
      '.ww......ww.',
      '..ww....ww..',
      '...ww..ww...',
      '....wwww....',
      '.....ww.....',
      '.....ww.....',
      '....wwww....',
      '...ww..ww...',
      '..ww....ww..',
      '.ww......ww.',
      '............',
    ],
  },
  check: {
    pal: { g: '#3fd04a', k: '#0b0620' },
    rows: [
      '............',
      '..........gg',
      '.........ggg',
      '........ggg.',
      '.......ggg..',
      'gg....ggg...',
      'ggg..ggg....',
      '.gggggg.....',
      '..gggg......',
      '...gg.......',
      '............',
      '............',
    ],
  },
  trophy: {
    pal: { y: '#ffd23f', o: '#d89e00', k: '#0b0620' },
    rows: [
      '............',
      '.yyyyyyyyyy.',
      'yyyyyyyyyyyy',
      'y.yyyyyyyy.y',
      'y.yyyyyyyy.y',
      '.yyyyyyyyyy.',
      '..yyyyyyyy..',
      '....yyyy....',
      '.....yy.....',
      '....oooo....',
      '...oooooo...',
      '............',
    ],
  },
  star: {
    pal: { y: '#ffd23f' },
    rows: [
      '.....yy.....',
      '.....yy.....',
      '....yyyy....',
      'yyyyyyyyyyyy',
      '.yyyyyyyyyy.',
      '..yyyyyyyy..',
      '...yyyyyy...',
      '..yyyyyyyy..',
      '.yyyy..yyyy.',
      '.yy......yy.',
      '............',
      '............',
    ],
  },
  gamepad: {
    pal: { b: '#8a85b8', d: '#4a4580', k: '#0b0620', r: '#ff4d6d', w: '#ffffff' },
    rows: [
      '............',
      '............',
      '.kkkkkkkkkk.',
      'kbbbbbbbbbbk',
      'kbwbbbbbrbbk',
      'kwwwbbbrbrbk',
      'kbwbbbbbrbbk',
      'kbbbbbbbbbbk',
      'kbbkkbbkkbbk',
      '.kk.kkkk.kk.',
      '............',
      '............',
    ],
  },
};

// ---------------------------------------------------------------------------
// Procedural pixel painter for the fine game-tile art (64x48 art pixels).
// ---------------------------------------------------------------------------
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const bay = (x, y) => (BAYER[y & 3][x & 3] + 0.5) / 16;
const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997 / 997;

function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
}

class Painter {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
  get(x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.d[y * this.w + x] : null; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, c);
      }
    }
  }
  poly(pts, c) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + (yc - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i] - 0.5); x < xs[i + 1] - 0.5 + 0.0001; x++) this.set(x, y, c);
      }
    }
  }
  // vertical gradient with ordered dithering between ramp colours
  gradient(y0, y1, ramp) {
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0 - 1) * (ramp.length - 1);
      const i = Math.min(ramp.length - 2, Math.floor(t)), f = t - i;
      for (let x = 0; x < this.w; x++) this.set(x, y, bay(x, y) < f ? ramp[i + 1] : ramp[i]);
    }
  }
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
    }
    add.forEach(([x, y]) => this.set(x, y, c));
  }
  blit(o) { for (let i = 0; i < o.d.length; i++) if (o.d[i]) this.d[i] = o.d[i]; }
  sprite() { return new Painter(this.w, this.h); }
}

function cloud(p, cx, cy, s) {
  const t = p.sprite();
  [[-7, 2, 5], [0, -1, 7], [8, 2, 5], [-1, 3, 6]].forEach(([dx, dy, r]) => t.ellipse(cx + dx * s, cy + dy * s, r * s, r * s * 0.8, '#ffffff'));
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    if (!t.get(x, y)) continue;
    if (!t.get(x, y + 2)) t.set(x, y, '#c6e2ff');
    else if (!t.get(x, y + 1)) t.set(x, y, bay(x, y) < 0.5 ? '#c6e2ff' : '#ffffff');
  }
  p.blit(t);
}

function grassPlatform(p, x, y, w, h) {
  const t = p.sprite();
  t.rect(x, y + 3, w, h - 3, '#9a5b2c');
  t.rect(x, y + h - 2, w, 2, '#6e3d1c');
  for (let j = y + 4; j < y + h - 2; j++) for (let i = x; i < x + w; i++) {
    const r = hash(i, j);
    if (r < 0.08) t.set(i, j, '#c08450'); else if (r > 0.94) t.set(i, j, '#5a3016');
  }
  t.rect(x, y, w, 4, '#4fd24a');
  t.rect(x, y, w, 1, '#a6f56e');
  for (let i = x; i < x + w; i++) {
    if ((i - x) % 3 === 0) t.set(i, y + 4, '#2f9e36');
    t.set(i, y + 3, '#2f9e36');
    if (hash(i, y) > 0.8) t.set(i, y + 1, '#7cea58');
  }
  t.outline('#1f1238');
  p.blit(t);
}

function spring(p, x, y) { // y = platform top
  const t = p.sprite();
  t.rect(x, y - 2, 9, 2, '#8a8fb0');
  for (let i = 0; i < 5; i++) t.line(x + 1 + (i % 2) * 6, y - 3 - i * 1, x + 7 - (i % 2) * 6, y - 3 - i * 1 - 1, '#dfe3ff');
  t.rect(x - 1, y - 9, 11, 3, '#ff4d6d');
  t.rect(x - 1, y - 9, 11, 1, '#ff9fb0');
  t.rect(x - 1, y - 7, 11, 1, '#b8203f');
  t.outline('#1f1238');
  p.blit(t);
}

function orangeBlob(p, cx, cy) {
  const t = p.sprite();
  t.rect(cx - 8, cy + 6, 5, 3, '#d9651a'); t.rect(cx + 3, cy + 7, 5, 3, '#d9651a');
  t.line(cx - 8, cy, cx - 12, cy - 6, '#e8741a'); t.line(cx + 8, cy, cx + 12, cy - 6, '#e8741a');
  t.ellipse(cx, cy, 9, 8.5, '#ff9a2e');
  for (let y = cy - 9; y <= cy + 9; y++) for (let x = cx - 9; x <= cx + 9; x++) {
    if (t.get(x, y) !== '#ff9a2e') continue;
    const d = (x - cx) + (y - cy);
    if (d > 9) t.set(x, y, '#c85a10'); else if (d > 4) t.set(x, y, bay(x, y) < 0.5 ? '#e8741a' : '#ff9a2e'); else if (d > 2) t.set(x, y, '#e8741a');
  }
  t.ellipse(cx - 4, cy - 5, 2.6, 1.6, '#ffd08a');
  [[-3.5, -1], [3.5, -1]].forEach(([dx, dy]) => {
    t.ellipse(cx + dx, cy + dy, 2.2, 2.8, '#ffffff');
    t.rect(cx + dx - 0.5, cy + dy, 2, 2, '#1b1340');
    t.set(cx + dx - 0.5, cy + dy, '#ffffff');
  });
  t.rect(cx - 1, cy + 4, 3, 1, '#7a2e08');
  t.outline('#4a1a06');
  p.blit(t);
}

function paintJump() {
  const p = new Painter(64, 48);
  p.gradient(0, 48, ['#3f93ff', '#62b2ff', '#8fd0ff', '#c2eaff']);
  cloud(p, 12, 9, 1); cloud(p, 52, 15, 0.8);
  grassPlatform(p, 2, 31, 22, 7);
  grassPlatform(p, 40, 25, 22, 7);
  grassPlatform(p, 0, 42, 64, 6);
  spring(p, 10, 31);
  orangeBlob(p, 36, 12);
  [[30, 4], [44, 6], [24, 20]].forEach(([x, y]) => p.set(x, y, '#ffffff'));
  return p;
}

function stairBlock(p, x, y, w, h, hue) {
  const t = p.sprite();
  t.rect(x, y, w, h, hsl(hue, 75, 60));
  t.rect(x, y, w, 2, hsl(hue, 80, 78));
  t.rect(x, y + h - 1, w, 1, hsl(hue + 10, 70, 38));
  t.rect(x + w - 2, y + 2, 2, h - 3, hsl(hue + 10, 70, 46));
  t.rect(x, y + 2, 1, h - 3, hsl(hue, 80, 72));
  t.outline('#2b1a4a');
  p.blit(t);
}

function windowAt(p, x, y, lit) {
  p.rect(x - 1, y - 1, 12, 13, '#a58bc9');
  p.rect(x, y, 10, 11, '#7f65a8');
  for (let j = 0; j < 10; j++) for (let i = 0; i < 8; i++) {
    const c = lit ? (j < 5 ? '#ffe685' : '#ffd24a') : (j < 5 ? '#9ad4ff' : '#5ea6e8');
    p.set(x + 1 + i, y + 1 + j, lit && i > 2 && i < 6 && j > 2 && j < 7 ? '#fff6c8' : c);
  }
  if (!lit) { p.set(x + 2, y + 2, '#e6f6ff'); p.set(x + 3, y + 2, '#e6f6ff'); p.set(x + 2, y + 3, '#e6f6ff'); }
  p.rect(x + 4, y + 1, 1, 10, '#7f65a8');
  p.rect(x - 2, y + 12, 14, 2, '#c9b6e6');
  p.rect(x - 2, y + 14, 14, 1, '#7f65a8');
}

function climber(p, x, y) { // x centre, y feet
  const t = p.sprite();
  t.rect(x - 3, y - 5, 3, 5, '#3a4a9a'); t.rect(x + 1, y - 5, 3, 5, '#3a4a9a');
  t.rect(x - 4, y - 1, 4, 2, '#5a2a1a'); t.rect(x + 1, y - 1, 4, 2, '#5a2a1a');
  t.rect(x - 4, y - 11, 9, 7, '#3fa0ff'); t.rect(x - 4, y - 11, 9, 1, '#8ccbff'); t.rect(x + 2, y - 10, 3, 6, '#2a78cc');
  t.rect(x + 4, y - 14, 2, 4, '#ffd9a8'); t.rect(x - 6, y - 10, 2, 3, '#ffd9a8');
  t.ellipse(x, y - 15, 5, 5, '#ffd9a8');
  t.rect(x - 5, y - 19, 10, 4, '#e8203f'); t.rect(x - 5, y - 17, 2, 5, '#e8203f'); t.rect(x + 3, y - 17, 2, 3, '#b8142e');
  t.rect(x - 3, y - 19, 4, 1, '#ff6a80');
  t.rect(x - 2, y - 15, 1, 2, '#1b1340'); t.rect(x + 2, y - 15, 1, 2, '#1b1340');
  t.outline('#2b1a4a');
  p.blit(t);
}

function paintStairs() {
  const p = new Painter(64, 48);
  p.rect(0, 0, 64, 48, '#f2d4bb');
  for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) {
    if (y % 8 === 7) p.set(x, y, '#e6c3a6');
    if (x > 55) p.set(x, y, bay(x, y) < (x - 55) / 9 ? '#dcae90' : '#e6c3a6');
    if (x < 3 && bay(x, y) < 0.35) p.set(x, y, '#fae6d4');
  }
  p.rect(0, 0, 64, 2, '#c9a07f');
  [4, 26, 48].forEach((x, i) => { windowAt(p, x, 4, i === 1); windowAt(p, x, 24, false); });
  p.rect(0, 44, 64, 4, '#6b5a86'); p.rect(0, 44, 64, 1, '#9a88b8');
  const hues = [350, 25, 50, 130, 200];
  hues.forEach((hh, k) => stairBlock(p, k % 2 === 0 ? 4 : 40, 40 - k * 7, 20, 5, hh));
  climber(p, 50, 33);
  return p;
}

function brick(p, x, y, size, ramp, speck) {
  p.rect(x, y, size, size, ramp[1]);
  p.rect(x, y, size, 1, ramp[0]); p.rect(x, y, 1, size, ramp[0]);
  p.rect(x, y + size - 1, size, 1, ramp[2]); p.rect(x + size - 1, y, 1, size, ramp[2]);
  p.set(x + 1, y + 1, ramp[3] || ramp[0]);
  if (speck) for (let j = 1; j < size - 1; j++) for (let i = 1; i < size - 1; i++) {
    const r = hash(x + i, y + j);
    if (r < 0.14) p.set(x + i, y + j, ramp[0]); else if (r > 0.86) p.set(x + i, y + j, ramp[2]);
  }
}

function piece(p, ox, base, cell, cells, ramp, speck) {
  const t = p.sprite();
  cells.forEach(([c, r]) => brick(t, ox + c * cell, base - (r + 1) * cell, cell, ramp, speck));
  t.outline('#0b0620');
  p.blit(t);
}

function paintTower2d() {
  const p = new Painter(64, 48);
  p.gradient(0, 48, ['#120a30', '#1c1250', '#2b1d6a']);
  [[5, 6], [18, 3], [47, 9], [58, 4], [30, 14], [10, 22], [60, 28]].forEach(([x, y], i) => {
    p.set(x, y, i % 2 ? '#ffffff' : '#ffd23f');
    if (i % 3 === 0) { p.set(x - 1, y, '#8a7ad0'); p.set(x + 1, y, '#8a7ad0'); p.set(x, y - 1, '#8a7ad0'); p.set(x, y + 1, '#8a7ad0'); }
  });
  // stone platform
  const s = p.sprite();
  s.rect(8, 40, 48, 8, '#8f96b2');
  s.rect(8, 40, 48, 2, '#c6cbe0');
  s.rect(8, 46, 48, 2, '#5f6684');
  for (let j = 42; j < 46; j++) for (let i = 8; i < 56; i++) if (hash(i, j) < 0.1) s.set(i, j, '#aab0ca'); else if (hash(i, j) > 0.92) s.set(i, j, '#717896');
  [20, 42].forEach((gx) => { s.rect(gx, 41, 3, 6, '#2b2f45'); s.rect(gx, 41, 1, 6, '#171a2b'); });
  s.outline('#0b0620');
  p.blit(s);
  // dithered void below
  for (let x = 8; x < 56; x++) { p.set(x, 47, '#0b0620'); }
  const ox = 10, cell = 6, base = 40;
  piece(p, ox, base, cell, [[1, 0], [2, 0], [3, 0], [4, 0]], ['#ffc0e0', '#ff8fc4', '#d9569a'], false);
  piece(p, ox, base, cell, [[1, 1], [2, 1], [1, 2], [2, 2]], ['#8a8f9c', '#5c616e', '#3a3e48'], true);
  piece(p, ox, base, cell, [[3, 1], [4, 1], [3, 2], [3, 3]], ['#b6f2c8', '#6ddc9a', '#34a86a'], false);
  piece(p, ox, base, cell, [[1, 3], [2, 3], [2, 4], [2, 5]], ['#fff3a8', '#ffd84a', '#d9a312'], false);
  // finish flag
  const f = p.sprite();
  f.rect(52, 18, 1, 22, '#e8e8f4');
  for (let j = 0; j < 5; j++) for (let i = 0; i < 8; i++) f.set(53 + i, 18 + j, (i + j) % 2 ? '#1b1340' : '#ffffff');
  f.set(52, 17, '#ffd23f'); f.set(51, 17, '#ffd23f'); f.set(53, 17, '#ffd23f'); f.set(52, 16, '#ffd23f');
  f.outline('#0b0620');
  p.blit(f);
  return p;
}

function slab(p, cx, cy, hw, hd, t, hue, scale = 1) {
  const q = p.sprite();
  const top = hsl(hue, 70, 78), left = hsl(hue + 12, 62, 60), right = hsl(hue + 24, 58, 44);
  q.poly([[cx, cy + hd], [cx - hw, cy], [cx - hw, cy + t], [cx, cy + hd + t]], left);
  q.poly([[cx, cy + hd], [cx + hw, cy], [cx + hw, cy + t], [cx, cy + hd + t]], right);
  q.poly([[cx, cy - hd], [cx + hw, cy], [cx, cy + hd], [cx - hw, cy]], top);
  // highlights: top edges & dithered face shading
  q.line(cx - hw + 1, cy, cx, cy - hd + 1, hsl(hue, 80, 90));
  q.line(cx, cy - hd + 1, cx + hw - 1, cy, hsl(hue, 75, 84));
  for (let j = 1; j < t; j++) {
    for (let i = 1; i < hw; i += 2) if (bay(i, j) < 0.3) { q.set(cx - i, cy + j + Math.round(i * hd / hw), hsl(hue + 12, 62, 66)); }
  }
  q.outline('#2a1650');
  p.blit(q);
  void scale;
}

function paintStack3d() {
  const p = new Painter(64, 48);
  p.gradient(0, 48, ['#2a1a66', '#4d2f96', '#8a4fb8', '#e08fc0']);
  [[6, 5], [58, 8], [14, 16], [60, 22], [4, 28]].forEach(([x, y]) => p.set(x, y, bay(x, y) < 0.5 ? '#ffffff' : '#ffd23f'));
  const offs = [0, 2, -2, 1, -1];
  for (let i = 0; i < 5; i++) slab(p, 27 + offs[i], 33 - i * 5, 17 - (i > 2 ? 1 : 0), 7, 5, 190 + i * 32);
  // falling cut slice with motion trail
  for (let k = 0; k < 3; k++) for (let y = 10; y < 28; y += 2) if (bay(k * 4, y) < 0.5) p.set(47 + k * 5, y + (k % 2), '#c9a8ff');
  slab(p, 53, 38, 8, 4, 3, 190 + 4 * 32);
  // sparkle
  const sx = 27 - 1, sy = 3;
  [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, 1], [0, -1], [0, 2], [0, -2]].forEach(([dx, dy]) => p.set(sx + dx, sy + dy, '#fff6c8'));
  p.set(sx, sy, '#ffffff'); p.set(sx + 1, sy + 1, '#ffd23f'); p.set(sx - 1, sy - 1, '#ffd23f');
  return p;
}

function darker(c) {
  const n = (i) => Math.round(parseInt(c.slice(i, i + 2), 16) * 0.7).toString(16).padStart(2, '0');
  return '#' + n(1) + n(3) + n(5);
}

function stripedSlab(p, x, y, w, c1, c2) {
  const t = p.sprite();
  t.rect(x, y, w, 5, c1);
  for (let i = 0; i < w; i += 6) t.rect(x + i, y, 3, 5, c2);
  for (let i = 0; i < w; i++) t.set(x + i, y + 4, darker(t.get(x + i, y + 4)));
  t.rect(x, y, w, 1, '#ffffff');
  t.outline('#1f1238');
  p.blit(t);
}

// 64x48 2D tower obby: striped platforms stacked up a tower, spikes, spring pad, flag on top, orange climber mid-jump
function paintObby() {
  const p = new Painter(64, 48);
  p.gradient(0, 48, ['#a6b8ff', '#c4c2ff', '#ffc9e6', '#ffe6c2']);
  cloud(p, 10, 8, 0.8); cloud(p, 54, 30, 0.7);
  [[22, 5], [40, 4], [8, 24], [58, 12]].forEach(([x, y]) => p.set(x, y, '#ffffff'));
  const tw = p.sprite();
  tw.rect(23, 14, 18, 34, '#5a4ab8');
  for (let j = 14; j < 48; j++) for (let i = 23; i < 41; i++) if ((i + j) % 8 === 0 && hash(i, j) > 0.3) tw.set(i, j, '#6b5ccc');
  tw.rect(23, 14, 2, 34, '#7a6cdc'); tw.rect(39, 14, 2, 34, '#3f3290');
  tw.outline('#1f1238');
  p.blit(tw);
  [[4, 39, 36, '#ff6b8b', '#ffd23f'], [24, 32, 36, '#3ad6ff', '#ffffff'], [6, 25, 30, '#7be0a4', '#2fb36a'], [26, 19, 30, '#ffd23f', '#ff9d1f'], [18, 13, 28, '#b890ff', '#ffffff']]
    .forEach(([x, y, w, a, b]) => stripedSlab(p, x, y, w, a, b));
  p.rect(0, 45, 64, 3, '#4fd24a'); p.rect(0, 45, 64, 1, '#a6f56e');
  const sp = p.sprite();
  for (let k = 0; k < 3; k++) { const bx = 44 + k * 4; sp.poly([[bx, 32], [bx + 4, 32], [bx + 2, 27]], '#e8ecff'); sp.set(bx + 2, 28, '#ffffff'); }
  sp.outline('#1f1238');
  p.blit(sp);
  const spr = p.sprite();
  spr.rect(8, 36, 9, 3, '#ff4d6d'); spr.rect(8, 36, 9, 1, '#ff9fb0');
  spr.line(9, 38, 15, 36, '#dfe3ff');
  spr.outline('#1f1238');
  p.blit(spr);
  const f = p.sprite();
  f.rect(31, 3, 1, 10, '#e8e8f4');
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) f.set(32 + i, 3 + j, (i + j) % 2 ? '#1b1340' : '#ffffff');
  f.set(31, 2, '#ffd23f');
  f.outline('#0b0620');
  p.blit(f);
  const c = p.sprite();
  const cx = 13, cy = 24;
  c.ellipse(cx, cy, 5, 4.6, '#ff9a2e');
  c.ellipse(cx - 2, cy - 2, 1.8, 1.2, '#ffd08a');
  c.set(cx + 3, cy + 2, '#c85a10'); c.set(cx + 2, cy + 3, '#c85a10'); c.set(cx + 1, cy + 3, '#c85a10');
  c.rect(cx - 2, cy - 1, 2, 2, '#ffffff'); c.rect(cx + 1, cy - 1, 2, 2, '#ffffff');
  c.set(cx - 1, cy, '#1b1340'); c.set(cx + 2, cy, '#1b1340');
  c.line(cx - 5, cy - 1, cx - 7, cy - 4, '#e8741a'); c.line(cx + 5, cy - 1, cx + 7, cy - 4, '#e8741a');
  c.set(cx - 2, cy + 5, '#d9651a'); c.set(cx + 2, cy + 5, '#d9651a');
  c.outline('#4a1a06');
  p.blit(c);
  return p;
}

const ART = { jump: paintJump, stairs: paintStairs, tower2d: paintTower2d, stack3d: paintStack3d, obby: paintObby };

function paintToCanvas(p, name, opts) {
  const cv = document.createElement('canvas');
  cv.width = p.w; cv.height = p.h;
  cv.className = `px-icon px-icon-${name} px-art${opts.className ? ' ' + opts.className : ''}`;
  cv.setAttribute('aria-hidden', 'true');
  if (opts.size) { cv.style.width = `${opts.size}px`; cv.style.height = `${Math.round(opts.size * p.h / p.w)}px`; }
  const ctx = cv.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(p.w, p.h);
    for (let i = 0; i < p.d.length; i++) {
      const c = p.d[i];
      if (!c) continue;
      img.data[i * 4] = parseInt(c.slice(1, 3), 16);
      img.data[i * 4 + 1] = parseInt(c.slice(3, 5), 16);
      img.data[i * 4 + 2] = parseInt(c.slice(5, 7), 16);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  return cv;
}

export function iconNames() { return [...new Set([...Object.keys(ICONS), ...Object.keys(ART)])]; }

// Returns a <canvas> sized to the bitmap; CSS scales it with pixelated rendering.
export function createIcon(name, opts = {}) {
  if (ART[name]) return paintToCanvas(ART[name](), name, opts);
  const def = ICONS[name] || ICONS.gamepad;
  const rows = def.rows;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.className = `px-icon px-icon-${name}${opts.className ? ' ' + opts.className : ''}`;
  cv.setAttribute('aria-hidden', 'true');
  if (opts.size) { cv.style.width = `${opts.size}px`; cv.style.height = `${Math.round(opts.size * h / w)}px`; }
  const ctx = cv.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const c = def.pal[rows[y][x]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return cv;
}

// Map a game id to an icon name (falls back to gamepad).
export function gameIconName(gameId) {
  return (ICONS[gameId] || ART[gameId]) ? gameId : 'gamepad';
}

export default { createIcon, gameIconName, iconNames };
