// 못깨는 타워: tower assembly + mutator envs (pure, no DOM).
// buildTower stacks `sectionCount` hand-authored section patterns (sections.js) bottom-up, SECTION_H apart,
// in absolute world coordinates (y up, 360px wide, ground top at y = 0).
import { SECTIONS, SECTION_H, WORLD_W, REST_X, REST_W, mirrorPattern, isCompatible } from './sections.js';
import { WIND_SPEED } from '../jump/world.js';

export const GROUND_W = 200;

// Mutator kinds that map to a stepPlayer env (the solver proves patterns against each of these).
export const ENV_KINDS = ['none', 'lowgravity', 'jumppower-low', 'jumppower-high', 'wind-left', 'wind-right'];

// HUD metadata. `envKinds` = the compatibility kinds the mutator is proven against (stepPlayer envs from
// ENV_KINDS, plus 'crumbleall' for 🧱; empty: handled by stage 2 outside physics, nothing to prove).
//   water      - time based: the water line rises from below (touch = fail); no env
//   shake      - visual / input jitter only; no env
//   lowgravity - envFor('lowgravity') = gravityScale 0.85 (floaty; lower gravity would let jumps skip whole floors)
//   jumppower  - jump scale 0.8 / 1.0 / 1.1 every 10 s (envFor('jumppower-low') = 0.8, 'jumppower-high' = 1.1)
//   crumbleAll - no physics env: stage 2 runs the tower platforms through applyCrumbleAll() (below);
//                its compatibility kind is 'crumbleall' (pattern flag incompatible:['crumbleall'],
//                buildTower({mutator:'crumbleAll'}) skips flagged patterns; envFor('crumbleall') -> {})
//   wind       - envFor('wind-left') or envFor('wind-right') (one direction per run)
export const MUTATORS = Object.freeze([
  { kind: 'water', label: '물 차오름', emoji: '🌊', description: '아래에서 물이 천천히 차올라요. 물에 닿으면 실패!', envKinds: [] },
  { kind: 'shake', label: '손 떨림', emoji: '🤝', description: '화면과 조작이 살짝 떨려요.', envKinds: [] },
  { kind: 'lowgravity', label: '무중력', emoji: '🪶', description: '중력이 약해져서 높이, 오래 떠올라요.', envKinds: ['lowgravity'] },
  { kind: 'jumppower', label: '점프력 변화', emoji: '⏱', description: '10초마다 점프 높이가 낮아졌다 높아졌다 해요.', envKinds: ['jumppower-low', 'jumppower-high'] },
  { kind: 'crumbleAll', label: '무너짐', emoji: '🧱', description: '모든 발판이 밟으면 곧 부서져요.', envKinds: ['crumbleall'] },
  { kind: 'wind', label: '바람', emoji: '💨', description: '옆으로 바람이 계속 불어요.', envKinds: ['wind-left', 'wind-right'] },
]);

// stepPlayer env for a mutator env kind (fresh object each call; unknown / non-physics kinds -> {}).
export function envFor(kind) {
  switch (kind) {
    case 'lowgravity': return { gravityScale: 0.85 };
    case 'jumppower-low': return { jumpScale: 0.8 };
    case 'jumppower-high': return { jumpScale: 1.1 };
    case 'wind-left': return { wind: [{ y0: -Infinity, y1: Infinity, vx: -WIND_SPEED }] };
    case 'wind-right': return { wind: [{ y0: -Infinity, y1: Infinity, vx: WIND_SPEED }] };
    default: return {};
  }
}

// 🧱 crumbleAll: returns copies of `platforms` where every static, normal-surface platform without a feature
// becomes 'crumble' - except rest platforms ({rest:true}) and walkways wider than CRUMBLE_ALL_MAX_W (a
// 300px walkway cannot be crossed within CRUMBLE_SEC). Proven clearable for every pattern in the tests.
export const CRUMBLE_ALL_MAX_W = 160;
export function applyCrumbleAll(platforms) {
  return platforms.map((p) => (p.type === 'static' && (p.surface || 'normal') === 'normal' && !p.feature && !p.rest && p.w <= CRUMBLE_ALL_MAX_W
    ? { ...p, surface: 'crumble' } : p));
}

// Tier of a 0-based slot: for 8 sections -> 1,1,2,2,2,3,3,'final' (the last slot is the final gate).
export function slotTier(index, sectionCount = 8) {
  if (index === sectionCount - 1) return 'final';
  if (index < sectionCount * 0.25) return 1;
  if (index < sectionCount * 0.625) return 2;
  return 3;
}

// Env kinds a mutator (MUTATORS kind or an ENV_KINDS entry) is checked against.
function mutatorEnvKinds(mutator) {
  if (!mutator || mutator === 'none') return [];
  const m = MUTATORS.find((q) => q.kind === mutator);
  return m ? m.envKinds : [mutator];
}

function pick(rng, list) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

// buildTower(rng, { mode:'practice'|'hard', sectionCount:8, mutator? }) ->
//   { platforms, sections:[{index,id,tier,name,y0,y1,mirrored}], goal:{x,y}, spawn:{x,y},
//     checkpoints:[{section,y,platformIndex}], height }   (sections[].family = the pattern's skeleton family)
// - platforms: absolute coords; [0] = the ground (y 0, w GROUND_W); each section adds its pattern platforms
//   (incl. spikes) and then its exit rest platform ({rest:true}); every platform carries `section` (0-based,
//   -1 for the ground). The last rest platform is the goal (feature 'goal').
// - Slots: tier by slotTier(); never the same pattern twice and never the same skeleton family as the previous
//   section (family drawn first, then a pattern of it); tier-3 slots use non-final-gate patterns and
//   the last slot a finalGate pattern (falls back to any unused tier-3 one). Each pattern is mirrored with
//   probability 1/2. Deterministic for a given rng sequence.
// - practice mode: the rest platforms after sections 2, 4, 6 (every 2nd, not the goal) get feature
//   'checkpoint' and are listed in `checkpoints` ({section: sections cleared when standing there,
//   y, platformIndex}). hard mode: no checkpoints.
// - optional `mutator` (a MUTATORS kind or env kind): patterns flagged incompatible with it are skipped.
export function buildTower(rng, { mode = 'practice', sectionCount = 8, mutator } = {}) {
  const envKinds = mutatorEnvKinds(mutator);
  const ok = (p) => envKinds.every((k) => isCompatible(p, k));
  const used = new Set();
  const platforms = [];
  const sections = [];
  const checkpoints = [];
  platforms.push({ x: (WORLD_W - GROUND_W) / 2, y: 0, w: GROUND_W, type: 'static', surface: 'normal', rest: true, ground: true, section: -1 });
  for (let i = 0; i < sectionCount; i++) {
    const tier = slotTier(i, sectionCount);
    const free = SECTIONS.filter((p) => !used.has(p.id) && ok(p));
    let cands;
    if (tier === 'final') {
      cands = free.filter((p) => p.finalGate);
      if (!cands.length) cands = free.filter((p) => p.tier === 3);
    } else {
      cands = free.filter((p) => p.tier === tier && !(tier === 3 && p.finalGate));
      if (!cands.length) cands = free.filter((p) => p.tier === tier);
    }
    if (!cands.length) cands = free;
    if (!cands.length) throw new Error('buildTower: not enough section patterns');
    // skeleton mixing: never the same family as the section below (when another one is available), and the
    // family is drawn before the pattern so a family with many patterns (the 9 switchbacks) does not dominate
    const prev = sections.length ? sections[sections.length - 1].family : null;
    let pool = cands.filter((p) => p.family !== prev);
    if (!pool.length) pool = cands;
    const fam = pick(rng, [...new Set(pool.map((p) => p.family))]);
    const base = pick(rng, pool.filter((p) => p.family === fam));
    used.add(base.id);
    const mirrored = rng() < 0.5;
    const pat = mirrored ? mirrorPattern(base) : base;
    const y0 = i * SECTION_H, y1 = y0 + SECTION_H;
    for (const q of pat.platforms) {
      const p = { ...q, y: q.y + y0, section: i };
      if (p.type !== 'spike' && !p.surface) p.surface = 'normal';
      platforms.push(p);
    }
    const last = i === sectionCount - 1;
    const rest = { x: REST_X, y: y1, w: REST_W, type: 'static', surface: 'normal', rest: true, section: i };
    if (last) rest.feature = 'goal';
    else if (mode === 'practice' && (i + 1) % 2 === 0) rest.feature = 'checkpoint';
    platforms.push(rest);
    if (rest.feature === 'checkpoint') checkpoints.push({ section: i + 1, y: y1, platformIndex: platforms.length - 1 });
    sections.push({ index: i, id: base.id, tier: base.tier, family: base.family, name: base.name, y0, y1, mirrored, finalGate: !!base.finalGate });
  }
  const height = sectionCount * SECTION_H;
  return {
    platforms, sections, checkpoints, height,
    goal: { x: REST_X + REST_W / 2, y: height },
    spawn: { x: WORLD_W / 2, y: 0 },
  };
}

// The platforms of one assembled section, shifted back to relative coords (y0 -> 0) and ordered like
// sectionPlatforms(): [entry rest (or the ground), exit rest, ...section platforms]. For solver checks.
export function towerSectionPlatforms(tower, index) {
  const s = tower.sections[index];
  const rel = (p) => ({ ...p, y: p.y - s.y0 });
  const entry = index === 0 ? tower.platforms[0] : tower.platforms.find((p) => p.rest && p.section === index - 1);
  const exit = tower.platforms.find((p) => p.rest && p.section === index);
  const body = tower.platforms.filter((p) => p.section === index && !p.rest);
  return [rel(entry), rel(exit), ...body.map(rel)];
}
