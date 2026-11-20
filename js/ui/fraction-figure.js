// 분수 그림: 도형을 n등분하고 일부를 색칠한 SVG. 순수 함수 + 얇은 DOM 도우미.
// 좌표계는 100x100 viewBox. 모든 분할은 넓이가 같다(테스트로 검증).
//
// desc = { shape, n, shaded: number[], variant?: number }

export const SHAPES = ['circle', 'square', 'triangle', 'pentagon', 'hexagon', 'octagon'];

export const ALLOWED = {
  circle: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  square: [2, 3, 4, 5, 6, 8, 9, 10, 12],
  triangle: [2, 3, 4, 6, 9],
  pentagon: [5, 10],
  hexagon: [2, 3, 6, 12],
  octagon: [2, 4, 8],
};

export const COLORS = { fill: '#ff9f43', empty: '#fffaf0', line: '#3d3a52' };

const SIDES = { pentagon: 5, hexagon: 6, octagon: 8 };
const C = 50, R = 44;
const ARC_STEPS = 24;

const SQUARE_LAYOUTS = {
  2: [[2, 1], [1, 2]],
  3: [[3, 1], [1, 3]],
  4: [[2, 2], [4, 1], [1, 4]],
  5: [[5, 1], [1, 5]],
  6: [[3, 2], [2, 3], [6, 1]],
  8: [[4, 2], [2, 4]],
  9: [[3, 3]],
  10: [[5, 2], [2, 5]],
  12: [[4, 3], [3, 4]],
};

const f = (v) => Math.round(v * 100) / 100;
const pt = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const polyPart = (points) => ({ points, d: 'M' + points.map((p) => `${f(p[0])} ${f(p[1])}`).join('L') + 'Z' });

function circle(n, variant) {
  const start = -90 + (variant % 3) * (360 / n) / 3;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a0 = start + (360 / n) * i, a1 = a0 + 360 / n;
    const p0 = pt(C, C, R, a0), p1 = pt(C, C, R, a1);
    const points = [[C, C]];
    for (let s = 0; s <= ARC_STEPS; s++) points.push(pt(C, C, R, a0 + ((a1 - a0) * s) / ARC_STEPS));
    const large = 360 / n > 180 ? 1 : 0;
    parts.push({ points, d: `M${C} ${C}L${f(p0[0])} ${f(p0[1])}A${R} ${R} 0 ${large} 1 ${f(p1[0])} ${f(p1[1])}Z` });
  }
  return { parts, outline: `<circle cx="${C}" cy="${C}" r="${R}"/>` };
}

function regular(shape, n, variant) {
  const k = SIDES[shape];
  const rr = shape === 'pentagon' ? 42 : R;
  const cy = C;
  const rot = -90 + (variant % 3) * (360 / k) / 3;
  const v = [];
  for (let i = 0; i <= k; i++) v.push(pt(C, cy, rr, rot + (360 / k) * i));
  const c = [C, cy];
  const parts = [];
  if (n <= k) {
    const g = k / n;
    for (let i = 0; i < n; i++) parts.push(polyPart([c, ...v.slice(i * g, i * g + g + 1)]));
  } else { // n === 2k : 각 삼각형을 이등분
    for (let i = 0; i < k; i++) {
      const m = mid(v[i], v[i + 1]);
      parts.push(polyPart([c, v[i], m]), polyPart([c, m, v[i + 1]]));
    }
  }
  return { parts, outline: `<path d="${polyPart(v.slice(0, k)).d}"/>` };
}

function square(n, variant) {
  const lay = SQUARE_LAYOUTS[n];
  const [cols, rows] = lay[variant % lay.length];
  const x0 = 10, y0 = 10, S = 80;
  const parts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const xa = x0 + (S * c) / cols, xb = x0 + (S * (c + 1)) / cols;
      const ya = y0 + (S * r) / rows, yb = y0 + (S * (r + 1)) / rows;
      parts.push(polyPart([[xa, ya], [xb, ya], [xb, yb], [xa, yb]]));
    }
  }
  return { parts, outline: `<rect x="${x0}" y="${y0}" width="${S}" height="${S}"/>` };
}

function triangle(n, variant) {
  const base = [[50, 10], [8, 82.7], [92, 82.7]];
  const rot = variant % 3;
  const V = [base[rot], base[(rot + 1) % 3], base[(rot + 2) % 3]];
  const [a, b, c] = V;
  const M01 = mid(a, b), M12 = mid(b, c), M20 = mid(c, a);
  const G = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
  let tris;
  if (n === 2) tris = [[a, b, M12], [a, M12, c]];
  else if (n === 3) tris = [[G, a, b], [G, b, c], [G, c, a]];
  else if (n === 4) tris = [[a, M01, M20], [M01, b, M12], [M20, M12, c], [M01, M12, M20]];
  else if (n === 6) tris = [[G, a, M01], [G, M01, b], [G, b, M12], [G, M12, c], [G, c, M20], [G, M20, a]];
  else { // 9 : 3x3 삼각 격자. 위에서 아래, 왼쪽에서 오른쪽
    const P = (i, j) => [a[0] + ((b[0] - a[0]) * i) / 3 + ((c[0] - b[0]) * j) / 3,
      a[1] + ((b[1] - a[1]) * i) / 3 + ((c[1] - b[1]) * j) / 3];
    tris = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j <= i; j++) {
        tris.push([P(i, j), P(i + 1, j), P(i + 1, j + 1)]);
        if (j < i) tris.push([P(i, j), P(i + 1, j + 1), P(i, j + 1)]);
      }
    }
  }
  return { parts: tris.map(polyPart), outline: `<path d="${polyPart(V).d}"/>` };
}

function build(desc) {
  const { shape, n } = desc || {};
  const variant = Math.abs(Math.trunc(Number(desc.variant) || 0));
  if (!ALLOWED[shape] || !ALLOWED[shape].includes(n)) throw new Error(`unsupported figure: ${shape} ${n}`);
  if (shape === 'circle') return circle(n, variant);
  if (shape === 'square') return square(n, variant);
  if (shape === 'triangle') return triangle(n, variant);
  return regular(shape, n, variant);
}

/** 같은 넓이로 나눈 n개의 조각. 각 조각 { points:[[x,y]...], d:'SVG path' } */
export function figureParts(desc) { return build(desc).parts; }

/** 같은 도형 안에서 고를 수 있는 variant 가짓수(그 이상은 반복) */
export function variantCount(shape, n) {
  return shape === 'square' ? SQUARE_LAYOUTS[n].length * 3 : 3;
}

export function figureSvg(desc, opts = {}) {
  const size = opts.size ?? 180;
  const { parts, outline } = build(desc);
  const on = new Set((desc.shaded || []).filter((i) => Number.isInteger(i) && i >= 0 && i < parts.length));
  const label = `${desc.n}등분한 도형 중 ${on.size}칸 색칠`;
  const body = parts.map((p, i) => {
    const shaded = on.has(i);
    return `<path class="fp${shaded ? ' on' : ''}" d="${p.d}" fill="${shaded ? COLORS.fill : COLORS.empty}" stroke="${COLORS.line}" stroke-width="1.1" stroke-linejoin="round"/>`;
  }).join('');
  return `<svg class="fraction-figure" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label}">`
    + body
    + `<g fill="none" stroke="${COLORS.line}" stroke-width="2.4" stroke-linejoin="round">${outline}</g></svg>`;
}

export function renderFigure(el, desc, opts = {}) {
  el.innerHTML = figureSvg(desc, opts);
  return el;
}
