// Dev helper (not a test): renders every obby section pattern (+ the solver's fastest path) as SVG.
// usage: node tests/obby-render-svg.mjs <outDir> [idPrefix] [robust]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SECTIONS, SECTION_H, sectionPlatforms } from '../js/games/obby/sections.js';
import { solveSection, solveSectionRobust } from '../js/games/obby/solver.js';

const out = process.argv[2];
if (!out) { console.error('usage: node tests/obby-render-svg.mjs <outDir> [idPrefix] [robust]'); process.exit(1); }
mkdirSync(out, { recursive: true });
const only = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : '';
const robust = process.argv[4] === 'robust';
const PAD = 20, W = 360, H = SECTION_H + 40;
const Y = (y) => PAD + H - 20 - y;
const fill = (p) => p.type === 'spike' ? '#e8384f' : p.type === 'moving' ? '#8e6bd8' : p.surface === 'ice' ? '#8fd8ff'
  : p.surface === 'crumble' ? '#c9935a' : p.surface === 'conveyor' ? '#6c7a89' : '#5cb85c';
for (const s of SECTIONS) {
  if (only && !s.id.startsWith(only)) continue;
  const plats = sectionPlatforms(s);
  const r = robust ? solveSectionRobust(s, { jitter: { timingMs: s.tier === 3 ? 50 : 80, xPx: s.tier === 3 ? 5 : 8 } }) : solveSection(s);
  const el = [];
  el.push(`<rect x="0" y="0" width="${W + 2 * PAD}" height="${H + 2 * PAD}" fill="#1d2b44"/>`);
  el.push(`<rect x="${PAD}" y="${PAD}" width="${W}" height="${H}" fill="#2b3f63"/>`);
  for (let y = 0; y <= SECTION_H; y += 40) el.push(`<line x1="${PAD}" x2="${PAD + W}" y1="${Y(y)}" y2="${Y(y)}" stroke="#ffffff22"/><text x="2" y="${Y(y) + 3}" font-size="8" fill="#fff8">${y}</text>`);
  plats.forEach((p, i) => {
    if (p.type === 'spike') {
      el.push(`<rect x="${PAD + p.x}" y="${Y(p.y + 16)}" width="${p.w}" height="16" fill="${fill(p)}" opacity="0.9"/>`);
      return;
    }
    if (p.type === 'moving') el.push(`<rect x="${PAD + p.baseX - p.range}" y="${Y(p.y) - 1}" width="${p.w + 2 * p.range}" height="8" fill="none" stroke="#8e6bd8" stroke-dasharray="3 2"/>`);
    el.push(`<rect x="${PAD + p.x}" y="${Y(p.y)}" width="${p.w}" height="8" fill="${fill(p)}"/>`);
    if (p.feature === 'spring') el.push(`<rect x="${PAD + p.x + p.w / 2 - 20}" y="${Y(p.y) - 5}" width="40" height="5" fill="#ffd23f"/>`);
    if (p.belt) el.push(`<text x="${PAD + p.x + p.w / 2}" y="${Y(p.y) + 7}" font-size="8" text-anchor="middle" fill="#fff">${p.belt > 0 ? '>>>' : '<<<'}</text>`);
    el.push(`<text x="${PAD + p.x}" y="${Y(p.y) + 16}" font-size="7" fill="#fffa">${i}</text>`);
  });
  // path: landing points
  let px = 180, py = 0;
  for (const st of r.path || []) {
    const nx = st.land.x, ny = st.land.y;
    el.push(`<line x1="${PAD + px}" y1="${Y(py) - 4}" x2="${PAD + nx}" y2="${Y(ny) - 4}" stroke="#ffd23f" stroke-width="1.2" ${st.action === 'jump' || st.action === 'springAir' ? '' : 'stroke-dasharray="2 2"'}/>`);
    if (st.macro && st.macro.dj != null) el.push(`<circle cx="${PAD + nx}" cy="${Y(ny) - 4}" r="2.5" fill="#ff8c00"/>`);
    px = nx; py = ny;
  }
  el.push(`<text x="${PAD}" y="12" font-size="11" fill="#fff">${s.id} ${s.name} (tier ${s.tier}) ${r.solvable ? r.fastestSec + 's' : 'UNSOLVED'} ${robust ? 'robust' : ''}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(W + 2 * PAD) * 1.5}" height="${(H + 2 * PAD) * 1.5}" viewBox="0 0 ${W + 2 * PAD} ${H + 2 * PAD}">${el.join('')}</svg>`;
  writeFileSync(join(out, `${s.id}.svg`), svg);
  console.log(s.id, s.name, r.solvable ? r.fastestSec : 'UNSOLVED', 'steps', (r.path || []).length);
}
