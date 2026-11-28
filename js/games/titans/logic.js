// Titan Rush (id 'titans') -- pure game logic. No DOM, no canvas, no timers.
//
// v2 rules: ONE mode. The player taps the arena (left / right side = attack direction) while answering
// quiz questions in an always-visible inline panel. Energy is a 20-cell bar owned by the shell.
//   - every tap that swings costs 1 cell; at 0 cells a tap is a WEAK attack (WEAK_DMG_MULT, no crit, free)
//   - a correct answer adds `result.gain` cells (cap = energy.max); answers never attack
//   - 5 correct answers in a row => STREAK OVERDRIVE (lightning on everything + damage buff), counter resets
//   - an enemy reaching the hero: energy >= 1 => lose min(HIT_ENERGY_COST, value) cells, NO heart;
//     energy 0 => lose a heart (3 hearts, game over at 0, score = stage)
//   - enemy approach speed follows recent ANSWER times (fast solver = 1x, slow / idle = down to SPEED_MIN)
//
// API
//   const g = createTitans({ rng, energy, hearts });
//     rng     () => [0,1)                  (default Math.random)
//     energy  { value, max, spend(n), add(n) }   owned by the shell (default: internal 20-cell bar, starts full)
//     hearts  { value, lose() }            lose() on a heart loss; value 0 => gameOver {stage}
//                                          (default: internal 3-heart counter)
//   State (read-only for the shell):
//     stage, biome (= (stage-1) % BIOME_COUNT), phase 'wave'|'boss', over, score (= stage), gold, swordLv, allyLv,
//     combo (0..OVERDRIVE_STREAK-1 correct answers in a row), buffs { overdrive: secondsLeft },
//     speedMult (enemy approach multiplier SPEED_MIN..SPEED_MAX), energyMax, energyValue, hearts,
//     enemies [{ id, side:'left'|'right', x:0..1, hp, maxHp, kind }],
//     boss {hp,maxHp,timeLeft,x, phaseIdx:0..2, shielded, cycle}|null,   (v3, see BOSS FIGHT below)
//       cycle { state:'telegraph'|'volley'|'window', t, dur, windowLeft, windowTotal, preview:{n,left,right,big}, ... }
//     projectiles [{ id, side:'left'|'right', x:0..1, speed (x/s), hp, maxHp, big, age }]   (boss phase only, else [])
//     hero { x, hitCooldown, invincible, facing, swing }, wave { target, spawned, killed }, lockMs.
//   Methods:
//     update(dt)            advance simulation (dt seconds; big dt is sub-stepped)
//     tap(dir)              'left'|'right' in the wave, any of left/right/'any' on the boss.
//                           returns { type: 'hit'|'miss'|'ignored', weak?, ... }, or on the shielded boss
//                           { type: 'projectile', removed, id, side, weak } (a tap removes the nearest projectile of
//                           that side; 'any' = nearest of either side; no projectile there => 'miss', boss untouched)
//     answer(result, {ms})  result = quiz-engine { correct, gain, streak, lockMs }; ms = time spent on the question
//     buySword() / buyAlly()            -> boolean
//     swordCost() allyCost() tapDmg() weakDmg() allyDps() critChance() mobHp() bossHp()
//     drainEvents()         returns and clears the event list (also readable as `events`)
//   Events (objects with `type`): stageStart{stage,biome,target} hit{id|boss,dmg,crit,weak,source} crit{dmg}
//     kill{id,gold} goldGain{amount,source} miss whiff noEnergy{} energyGain{amount,value} wrong{} combo{value}
//     overdrive{dmg} energyHit{cost,value} heroHit{reason} bossStart{stage} bossClear{stage} bossTimeout{hp}
//     stageClear{stage} upgrade{kind,level} gameOver{stage}
//     boss fight: bossTelegraph{phase} projectileFire{id,side,x,big} projectileTap{id,side,x,big,removed} (every tap that lands on a shot) projectileRemoved{id,side,x,big,by:'tap'|'overdrive'|'hit'}
//     projectileHit{id,side,x,big,heart} shieldDown{} (damage window opens) shieldUp{} bossPhase{n:2|3}
//
// BOSS FIGHT (v3). The boss cycles  telegraph -> volley -> (shielded while a shot is queued or alive) -> DAMAGE WINDOW
// -> telegraph ... Taps only reach the boss body inside the window; the window opens in the same call in which the last
// projectile is removed (tap, overdrive lightning, or a hit on the hero). Three phases by boss HP (>2/3, >1/3, below):
// the pattern table BOSS_PATTERNS[phase] loops (start index from rng), stage N shortens travel / windows and unlocks
// bigger patterns, with floors so a shot always takes >= ~1.15 s from muzzle to hero. Projectile hit on the hero:
// same rule as an enemy (energy >= 1: lose min(4, energy) cells, else a heart), 0.8 s invincibility (a shot that arrives
// meanwhile waits at the edge of the hit zone). Allies and overdrive damage the boss only inside the window.

// ---------------------------------------------------------------- constants
export const BIOME_COUNT = 2;            // forest, neon city (more can be added later)
export const ENERGY_MAX = 20;            // cells
export const ENERGY_GAIN_MULT = 3;       // module energyGainMultiplier: energyGain(streak) 2/3/4 x 3 = 6/9/12 cells
export const START_HEARTS = 3;
export const HIT_ENERGY_COST = 4;        // cells lost when an enemy reaches the hero (while energy >= 1)
export const WEAK_DMG_MULT = 0.25;       // tap damage with 0 energy

// damage / growth
export const SWORD_BASE = 5;
export const SWORD_GROWTH = 1.22;
export const CRIT_UNLOCK_LV = 3;
export const CRIT_BASE = 0.12;
export const CRIT_PER_LV = 0.01;
export const CRIT_MAX = 0.30;
export const CRIT_MULT = 2;
export const ALLY_BASE = 4;
export const ALLY_GROWTH = 1.26;
export const ALLY_HIT_INTERVAL = 1.4;    // wave: support hit period (damage = dps * interval)

// enemies / economy
export const MOB_HP_BASE = 12;
export const MOB_HP_GROWTH = 1.40;
export const BOSS_HP_MULT = 10;
export const GOLD_BASE = 4;
export const GOLD_GROWTH = 1.22;
export const BOSS_GOLD_MULT = 6;
export const SWORD_COST_BASE = 10;
export const SWORD_COST_GROWTH = 1.4;
export const ALLY_COST_BASE = 18;
export const ALLY_COST_GROWTH = 1.44;

// wave
export const HIT_DIST = 0.08;            // |x-0.5| <= this => enemy hits the hero
export const SPAWN_DIST = 0.5;
export const REACH = 0.45;               // tap strike reach (distance from hero)
export const TAP_TRAVEL_START = 4.4;     // seconds edge -> hero at stage 1 (full speed)
export const TAP_TRAVEL_MIN = 1.3;
export const TAP_TRAVEL_STEP = 0.15;     // seconds faster per stage
export const SPAWN_RATIO = 0.35;         // spawn gap = travel time * ratio
export const SPAWN_MIN_GAP = 0.5;
export const MAX_ALIVE = 6;
export const SIMUL_PROB_PER_STAGE = 0.05;
export const SIMUL_PROB_MAX = 0.5;
export const MISS_COOLDOWN = 0.16;
export const HERO_HIT_INVINCIBLE = 0.8;
export const KNOCK_HIT = 0.12;           // tap hit knockback
export const KNOCK_ALL = 0.3;            // all enemies when the hero is hit
export const SWING_TIME = 0.15;

// boss
export const BOSS_TIME = 45;
export const BOSS_X = 0.78;
export const HERO_BOSS_X = 0.3;

// boss fight: phases, projectiles, damage windows
export const BOSS_PHASE_AT = [2 / 3, 1 / 3];       // hp ratio thresholds -> phase 2, phase 3
export const BOSS_INTRO = 0.9;                      // extra delay before the very first telegraph
export const TELEGRAPH = [0.5, 0.5, 0.35];          // seconds per phase
export const WINDOW_BASE = [6.0, 4.5, 3.5];         // damage window seconds per phase at stage 1
export const WINDOW_MIN = [4.5, 3.4, 2.6];
export const WINDOW_STEP = 0.05;                    // seconds shorter per stage
export const TRAVEL_BASE = [2.8, 2.2, 1.7];         // seconds muzzle -> hero per phase at stage 1
export const TRAVEL_MIN = [1.6, 1.3, 1.15];         // floor: a human must always be able to react
export const TRAVEL_STEP = 0.06;
export const BIG_HP = 2;
export const BIG_TRAVEL_MULT = 1.15;
export const PROJ_HIT_DIST = 0.04;                  // |x - hero.x| <= this => hits the hero
export const PROJ_SPAWN_R = 0.62;                   // x where the boss muzzle is
export const PROJ_SPAWN_L = 0.02;                   // x of the echo summon on the left edge
const S = (side, t, big = false) => ({ side, t, big });
const R = (t) => S('right', t), L = (t) => S('left', t), BR = (t) => S('right', t, true), BL = (t) => S('left', t, true);
// shots: { side, t (seconds after the volley starts), big }. minStage / maxStage limit a pattern to a stage range.
export const BOSS_PATTERNS = [
  [ // phase 1: single slow shots from the boss
    { minStage: 1, shots: [R(0)] },
    { minStage: 1, shots: [R(0)] },
    { minStage: 3, shots: [R(0), R(1.1)] },
  ],
  [ // phase 2: bursts of 3 (0.25 s apart), sometimes an echo from the left (stages 1-2 start with bursts of 2)
    { minStage: 1, maxStage: 2, shots: [R(0), R(0.25)] },
    { minStage: 1, maxStage: 2, shots: [R(0), R(0.25), L(0.4)] },
    { minStage: 3, shots: [R(0), R(0.25), R(0.5)] },
    { minStage: 3, shots: [R(0), R(0.25), R(0.5), L(0.4)] },
    { minStage: 3, shots: [R(0), R(0.25), R(0.5)] },
    { minStage: 5, shots: [R(0), R(0.25), R(0.5), R(0.75), L(0.4)] },
  ],
  [ // phase 3 (enrage): fans from both sides, big 2-HP shots (stages 1-2: smaller fans)
    { minStage: 1, maxStage: 2, shots: [R(0), L(0.2)] },
    { minStage: 1, maxStage: 2, shots: [BR(0), L(0.5)] },
    { minStage: 1, maxStage: 2, shots: [R(0), L(0.1), R(0.3)] },
    { minStage: 3, shots: [R(0), L(0.1), R(0.3)] },
    { minStage: 3, shots: [R(0), L(0), R(0.3), L(0.3)] },
    { minStage: 3, shots: [BR(0), L(0.5)] },
    { minStage: 3, shots: [R(0), L(0.15), R(0.3), L(0.45)] },
    { minStage: 5, shots: [BR(0), BL(0.6), R(1.0)] },
  ],
];

// streak overdrive
export const OVERDRIVE_STREAK = 5;       // correct answers in a row
export const OVERDRIVE_DMG_MULT = 2.5;   // lightning = tapDmg * this, to every enemy / the boss
export const OVERDRIVE_BUFF_SECONDS = 5;
export const OVERDRIVE_BUFF_MULT = 1.5;

// adaptive approach speed (multiplier of the stage's travel speed), driven by recent ANSWER times
export const SPEED_MAX = 1;              // fast solvers
export const SPEED_MIN = 0.6;            // slow solvers / not answering
export const ANSWER_FAST_MS = 3000;      // avg answer time <= this => SPEED_MAX
export const ANSWER_SLOW_MS = 9000;      // avg answer time >= this => SPEED_MIN
export const ANSWER_WINDOW = 5;          // last N answer durations
export const IDLE_OK_S = 8;              // no answer for this long => speed starts to drop
export const IDLE_SLOW_S = 24;           // ... reaching SPEED_MIN here

// ---------------------------------------------------------------- formulas
export const biomeOf = (stage) => ((stage - 1) % BIOME_COUNT + BIOME_COUNT) % BIOME_COUNT;
export const tapDmgAt = (lv) => Math.round(SWORD_BASE * Math.pow(SWORD_GROWTH, lv - 1));
export const weakDmgAt = (lv) => Math.max(1, Math.round(tapDmgAt(lv) * WEAK_DMG_MULT));
export const critChanceAt = (lv) => (lv >= CRIT_UNLOCK_LV ? Math.min(CRIT_MAX, CRIT_BASE + CRIT_PER_LV * (lv - CRIT_UNLOCK_LV)) : 0);
export const allyDpsAt = (lv) => (lv <= 0 ? 0 : Math.round(ALLY_BASE * Math.pow(ALLY_GROWTH, lv - 1)));
export const mobHpAt = (stage) => Math.round(MOB_HP_BASE * Math.pow(MOB_HP_GROWTH, stage - 1));
export const bossHpAt = (stage) => Math.round(mobHpAt(stage) * BOSS_HP_MULT);
export const mobGoldAt = (stage) => Math.round(GOLD_BASE * Math.pow(GOLD_GROWTH, stage - 1));
export const bossGoldAt = (stage) => mobGoldAt(stage) * BOSS_GOLD_MULT;
export const swordCostAt = (lv) => Math.round(SWORD_COST_BASE * Math.pow(SWORD_COST_GROWTH, lv - 1));
export const allyCostAt = (lv) => Math.round(ALLY_COST_BASE * Math.pow(ALLY_COST_GROWTH, lv));
export const waveTargetAt = (stage) => 4 + Math.min(8, Math.floor(stage / 2));
export const tapTravelAt = (stage) => Math.max(TAP_TRAVEL_MIN, TAP_TRAVEL_START - TAP_TRAVEL_STEP * (stage - 1));

export const phaseOfRatio = (r) => (r > BOSS_PHASE_AT[0] ? 0 : r > BOSS_PHASE_AT[1] ? 1 : 2);
export const projTravelAt = (phaseIdx, stage, big = false) =>
  Math.max(TRAVEL_MIN[phaseIdx], TRAVEL_BASE[phaseIdx] - TRAVEL_STEP * (stage - 1)) * (big ? BIG_TRAVEL_MULT : 1);
export const windowAt = (phaseIdx, stage) => Math.max(WINDOW_MIN[phaseIdx], WINDOW_BASE[phaseIdx] - WINDOW_STEP * (stage - 1));
export const patternsAt = (phaseIdx, stage) => BOSS_PATTERNS[phaseIdx].filter((p) => stage >= p.minStage && stage <= (p.maxStage || Infinity));

const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

// Approach speed multiplier from recent answer durations (ms) and seconds since the last answer. Pure.
export function answerSpeedMult(durations = [], idleSec = 0) {
  const d = durations.filter((v) => Number.isFinite(v) && v >= 0).slice(-ANSWER_WINDOW);
  const byIdle = lerp(SPEED_MAX, SPEED_MIN, (idleSec - IDLE_OK_S) / (IDLE_SLOW_S - IDLE_OK_S));
  if (!d.length) return byIdle;
  const avg = d.reduce((a, b) => a + b, 0) / d.length;
  const byAvg = lerp(SPEED_MAX, SPEED_MIN, (avg - ANSWER_FAST_MS) / (ANSWER_SLOW_MS - ANSWER_FAST_MS));
  return Math.min(byAvg, byIdle);
}

// ---------------------------------------------------------------- game
export function createTitans({ rng = Math.random, energy = null, hearts = null } = {}) {
  const hp = hearts || { value: START_HEARTS, lose() { this.value = Math.max(0, this.value - 1); } };
  const en = energy || {
    value: ENERGY_MAX, max: ENERGY_MAX,
    spend(n) { if (!(n > 0) || this.value < n) return false; this.value -= n; return true; },
    add(n) { this.value = Math.min(this.max, Math.max(0, this.value + n)); return this.value; },
  };
  const enMax = () => (Number.isFinite(en.max) ? en.max : ENERGY_MAX);
  const events = [];
  const emit = (type, data = {}) => events.push({ type, ...data });
  let nextId = 1;
  let spawnSide = rng() < 0.5 ? 'left' : 'right';
  let spawnTimer = 0.6;
  let allyTimer = 0;
  let idleSec = 0;
  const answerMs = [];

  const g = {
    events,
    stage: 1, biome: biomeOf(1), phase: 'wave', over: false,
    gold: 0, swordLv: 1, allyLv: 0, combo: 0, buffs: { overdrive: 0 },
    speedMult: SPEED_MAX, lockMs: 0,
    enemies: [], projectiles: [], boss: null,
    hero: { x: 0.5, hitCooldown: 0, invincible: 0, facing: 'right', swing: 0 },
    wave: { target: 0, spawned: 0, killed: 0 },
    get score() { return g.stage; },
    get hearts() { return hp.value; },
    get energyMax() { return enMax(); },
    get energyValue() { return en.value; },
  };

  // --- getters
  const dmgMult = () => (g.buffs.overdrive > 0 ? OVERDRIVE_BUFF_MULT : 1);
  g.tapDmg = () => tapDmgAt(g.swordLv);
  g.weakDmg = () => weakDmgAt(g.swordLv);
  g.allyDps = () => allyDpsAt(g.allyLv);
  g.critChance = () => critChanceAt(g.swordLv);
  g.swordCost = () => swordCostAt(g.swordLv);
  g.allyCost = () => allyCostAt(g.allyLv);
  g.mobHp = () => mobHpAt(g.stage);
  g.bossHp = () => bossHpAt(g.stage);

  const gainGold = (amount, source) => {
    g.gold += amount;
    emit('goldGain', { amount, source });
  };

  // --- phases
  function startPhase(p) {
    g.phase = p;
    g.enemies.length = 0;
    g.projectiles.length = 0;
    if (p === 'wave') {
      g.boss = null;
      g.hero.x = 0.5;
      g.wave = { target: waveTargetAt(g.stage), spawned: 0, killed: 0 };
      spawnTimer = 0.6;
      allyTimer = 0.5;
      emit('stageStart', { stage: g.stage, biome: g.biome, target: g.wave.target });
    } else {
      const maxHp = bossHpAt(g.stage);
      g.boss = { hp: maxHp, maxHp, timeLeft: BOSS_TIME, x: BOSS_X };
      g.hero.x = HERO_BOSS_X;
      g.hero.facing = 'right';
      allyTimer = 0;
      emit('bossStart', { stage: g.stage });
      ensureBoss(g.boss, true);
    }
  }

  function loseHeart(reason) {
    hp.lose();
    emit('heroHit', { reason, heart: true });
    g.hero.invincible = HERO_HIT_INVINCIBLE;
    if (hp.value <= 0 && !g.over) {
      g.over = true;
      emit('gameOver', { stage: g.stage });
    }
  }

  // an enemy / projectile reached the hero: energy pays first, a heart only at 0 energy. Returns true if a heart went.
  function heroStruck(reason) {
    if (en.value >= 1) {
      const cost = Math.min(HIT_ENERGY_COST, en.value);
      en.spend(cost);
      emit('energyHit', { cost, value: en.value });
      emit('heroHit', { reason, heart: false });
      g.hero.invincible = HERO_HIT_INVINCIBLE;
      return false;
    }
    loseHeart(reason);
    return true;
  }

  // --- damage
  function rollHit(base, source, weak = false) {
    const crit = !weak && rng() < g.critChance();
    const dmg = Math.max(1, Math.round(base * (crit ? CRIT_MULT : 1) * dmgMult()));
    return { dmg, crit, weak, source };
  }
  function killEnemy(e) {
    g.enemies.splice(g.enemies.indexOf(e), 1);
    g.wave.killed += 1;
    const gold = mobGoldAt(g.stage);
    emit('kill', { id: e.id, gold, x: e.x });
    gainGold(gold, 'kill');
  }
  function hitEnemy(e, base, source, knock = 0, weak = false) {
    const h = rollHit(base, source, weak);
    e.hp -= h.dmg;
    emit('hit', { id: e.id, dmg: h.dmg, crit: h.crit, weak, source, x: e.x });
    if (h.crit) emit('crit', { dmg: h.dmg });
    if (e.hp <= 0) killEnemy(e);
    else if (knock) pushEnemy(e, knock);
    return h;
  }
  function hitBoss(base, source, weak = false) {
    const h = rollHit(base, source, weak);
    g.boss.hp = Math.max(0, g.boss.hp - h.dmg);
    emit('hit', { boss: true, dmg: h.dmg, crit: h.crit, weak, source });
    if (h.crit) emit('crit', { dmg: h.dmg });
    checkBossDead();
    return h;
  }
  function checkBossDead() {
    if (g.phase !== 'boss' || !g.boss) return;
    if (g.boss.hp > 0) { checkPhase(); return; }
    emit('bossClear', { stage: g.stage });
    gainGold(bossGoldAt(g.stage), 'boss');
    emit('stageClear', { stage: g.stage });
    g.stage += 1;
    g.biome = biomeOf(g.stage);
    g.boss = null;
    startPhase('wave');
  }
  const dist = (e) => Math.abs(e.x - 0.5);
  function pushEnemy(e, amt) {
    const d = Math.min(SPAWN_DIST, dist(e) + amt);
    e.x = 0.5 + (e.side === 'left' ? -d : d);
  }
  const nearest = (side) => {
    let best = null;
    for (const e of g.enemies) if ((!side || e.side === side) && (!best || dist(e) < dist(best))) best = e;
    return best;
  };
  const alive = () => g.enemies.length;

  // --- spawning / movement
  const travelTime = () => tapTravelAt(g.stage) / g.speedMult;
  const speed = () => (SPAWN_DIST - HIT_DIST) / travelTime();
  function spawnOne(side) {
    const maxHp = mobHpAt(g.stage);
    g.enemies.push({ id: nextId++, side, x: side === 'left' ? 0 : 1, hp: maxHp, maxHp, kind: 'mob' });
    g.wave.spawned += 1;
  }
  function trySpawn(dt) {
    const w = g.wave;
    if (w.spawned >= w.target || alive() >= MAX_ALIVE) return;
    if (alive() === 0) spawnTimer = Math.min(spawnTimer, 0.6);
    spawnTimer -= dt;
    if (spawnTimer > 0) return;
    const simulP = Math.min(SIMUL_PROB_MAX, SIMUL_PROB_PER_STAGE * g.stage);
    if (g.stage >= 3 && rng() < simulP && w.spawned + 2 <= w.target && alive() + 2 <= MAX_ALIVE) {
      spawnOne('left'); spawnOne('right');
    } else {
      if (g.stage >= 3 && rng() < 0.3) spawnSide = spawnSide === 'left' ? 'right' : 'left'; // flip => repeats a side
      spawnOne(spawnSide);
      spawnSide = spawnSide === 'left' ? 'right' : 'left';
    }
    spawnTimer = Math.max(SPAWN_MIN_GAP, travelTime() * SPAWN_RATIO);
  }
  function resolveCollisions() {
    if (g.phase !== 'wave' || g.over) return;
    let hit = false;
    for (const e of g.enemies) {
      if (dist(e) <= HIT_DIST + 1e-6) {
        if (g.hero.invincible > 0) pushEnemy(e, 0); // hold at the edge of the hit zone
        else hit = true;
      }
    }
    if (!hit) return;
    for (const e of g.enemies) pushEnemy(e, KNOCK_ALL);
    heroStruck('wave');
  }

  // --- boss fight (projectiles / phases / damage window)
  function pickCursor(b) { // loop start varies with the seeded rng; consumed only on boss / phase starts
    const n = patternsAt(b.phaseIdx, g.stage).length;
    return n > 1 ? Math.floor(rng() * n) % n : 0;
  }
  // what the coming volley looks like (the renderer warns about the sides before the shots appear)
  function computePreview(b) {
    const c = b.cycle, pats = patternsAt(b.phaseIdx, g.stage), pat = pats[c.cursor % pats.length];
    c.preview = { n: pat.shots.length, left: pat.shots.some((x) => x.side === 'left'), right: pat.shots.some((x) => x.side === 'right'), big: pat.shots.some((x) => x.big) };
  }
  function beginTelegraph(b, extra = 0) {
    const c = b.cycle;
    c.state = 'telegraph'; c.t = 0; c.dur = TELEGRAPH[b.phaseIdx] + extra;
    c.queue = []; c.windowLeft = 0; c.windowTotal = 0;
    computePreview(b);
    b.shielded = true;
    emit('bossTelegraph', { phase: b.phaseIdx + 1 });
  }
  // boss objects assigned from outside (tests) are completed lazily
  function ensureBoss(b, fresh = false) {
    if (b.cycle) return b;
    b.phaseIdx = fresh ? 0 : phaseOfRatio(b.hp / b.maxHp);
    b.cycle = { state: 'telegraph', t: 0, dur: 0, cursor: 0, queue: [], windowLeft: 0, windowTotal: 0, count: 0 };
    b.cycle.cursor = pickCursor(b);
    beginTelegraph(b, fresh ? BOSS_INTRO : 0);
    if (fresh) emit('shieldUp', {});
    return b;
  }
  function checkPhase() {
    const b = g.boss;
    if (!b || !b.cycle) return;
    const want = phaseOfRatio(b.hp / b.maxHp);
    while (b.phaseIdx < want) {
      b.phaseIdx += 1;
      b.cycle.cursor = pickCursor(b);
      if (b.cycle.state === 'telegraph') computePreview(b);
      emit('bossPhase', { n: b.phaseIdx + 1, stage: g.stage });
    }
  }
  function startVolley(b) {
    const c = b.cycle, pats = patternsAt(b.phaseIdx, g.stage);
    const pat = pats[c.cursor % pats.length];
    c.cursor += 1; c.count += 1;
    c.state = 'volley'; c.t = 0;
    c.queue = pat.shots.map((sh) => ({ ...sh })).sort((a, z) => a.t - z.t);
  }
  function fireShot(b, sh) {
    const hx = g.hero.x, x = sh.side === 'right' ? PROJ_SPAWN_R : PROJ_SPAWN_L;
    const speed = (Math.abs(x - hx) - PROJ_HIT_DIST) / projTravelAt(b.phaseIdx, g.stage, sh.big);
    const hpN = sh.big ? BIG_HP : 1;
    const p = { id: nextId++, side: sh.side, x, speed, hp: hpN, maxHp: hpN, big: !!sh.big, age: 0 };
    g.projectiles.push(p);
    emit('projectileFire', { id: p.id, side: p.side, x: p.x, big: p.big });
  }
  function openWindow(b) {
    const c = b.cycle;
    c.state = 'window'; c.t = 0;
    c.windowTotal = c.windowLeft = windowAt(b.phaseIdx, g.stage);
    b.shielded = false;
    emit('shieldDown', {});
  }
  // the window opens in the very call that removes the last shot (nothing left to fire, nothing alive)
  function checkWindowOpen() {
    const b = g.boss;
    if (!b || g.phase !== 'boss' || !b.cycle || b.cycle.state !== 'volley') return;
    if (b.cycle.queue.length === 0 && g.projectiles.length === 0) openWindow(b);
  }
  function removeProjectile(p, by) {
    const i = g.projectiles.indexOf(p);
    if (i >= 0) g.projectiles.splice(i, 1);
    emit('projectileRemoved', { id: p.id, side: p.side, x: p.x, big: p.big, by });
    checkWindowOpen();
  }
  const nearestProj = (side) => {
    let best = null;
    const hx = g.hero.x;
    for (const p of g.projectiles) {
      if (side && side !== 'any' && p.side !== side) continue;
      if (!best || Math.abs(p.x - hx) < Math.abs(best.x - hx)) best = p;
    }
    return best;
  };
  function moveProjectiles(dt) {
    const hx = g.hero.x;
    for (const p of g.projectiles.slice()) {
      const dir = p.side === 'right' ? -1 : 1;
      p.x += dir * p.speed * dt;
      p.age += dt;
      if ((hx - p.x) * dir > PROJ_HIT_DIST) continue; // still on its way
      // reached the hero
      p.x = hx - dir * PROJ_HIT_DIST;
      if (g.hero.invincible > 0) continue; // waits at the edge of the hit zone
      const heart = heroStruck('projectile');
      emit('projectileHit', { id: p.id, side: p.side, x: p.x, big: p.big, heart });
      removeProjectile(p, 'hit');
      if (g.over) return;
    }
  }
  function stepBoss(dt) {
    const b = ensureBoss(g.boss), c = b.cycle;
    checkPhase();
    if (g.allyLv > 0 && !b.shielded) {
      b.hp = Math.max(0, b.hp - g.allyDps() * dmgMult() * dt);
      checkBossDead();
      if (g.phase !== 'boss') return;
    }
    b.timeLeft -= dt;
    if (b.timeLeft <= 0) {
      emit('bossTimeout', { hp: b.hp });
      b.timeLeft = BOSS_TIME; // HP retained, retry from a fresh telegraph
      g.projectiles.length = 0;
      beginTelegraph(b);
      loseHeart('boss');
      return;
    }
    if (c.state === 'telegraph') {
      c.t += dt;
      if (c.t >= c.dur) startVolley(b);
    }
    if (c.state === 'volley') {
      c.t += dt;
      while (c.queue.length && c.queue[0].t <= c.t + 1e-9) fireShot(b, c.queue.shift());
      moveProjectiles(dt);
      if (g.over) return;
      checkWindowOpen();
    } else if (c.state === 'window') {
      c.windowLeft -= dt;
      if (c.windowLeft <= 0) { emit('shieldUp', {}); beginTelegraph(b); }
    }
  }

  // --- update
  function step(dt) {
    const h = g.hero;
    h.hitCooldown = Math.max(0, h.hitCooldown - dt);
    h.invincible = Math.max(0, h.invincible - dt);
    h.swing = Math.max(0, h.swing - dt);
    g.buffs.overdrive = Math.max(0, g.buffs.overdrive - dt);
    idleSec += dt;
    g.speedMult = answerSpeedMult(answerMs, idleSec);
    if (g.phase === 'wave') {
      if (g.allyLv > 0) {
        allyTimer -= dt;
        if (allyTimer <= 0) {
          const t = nearest();
          if (t) { allyTimer += ALLY_HIT_INTERVAL; hitEnemy(t, g.allyDps() * ALLY_HIT_INTERVAL, 'ally'); }
          else allyTimer = 0.3;
        }
      }
      if (!g.over) trySpawn(dt);
      const v = speed() * dt;
      for (const e of g.enemies) {
        const d = Math.max(HIT_DIST, dist(e) - v);
        e.x = 0.5 + (e.side === 'left' ? -d : d);
      }
      if (!g.over) resolveCollisions();
      if (!g.over && g.phase === 'wave' && g.wave.killed >= g.wave.target) startPhase('boss');
    } else if (g.phase === 'boss') {
      stepBoss(dt);
    }
  }
  g.update = (dt) => {
    if (g.over) return;
    let left = dt;
    while (left > 1e-9 && !g.over) {
      const s = Math.min(0.05, left);
      step(s);
      left -= s;
    }
  };

  // --- input: tap
  g.tap = (dir = 'any') => {
    if (g.over) return { type: 'ignored' };
    const h = g.hero;
    const boss = g.phase === 'boss';
    if (!boss && dir !== 'left' && dir !== 'right') return { type: 'ignored' };
    if (h.hitCooldown > 0) return { type: 'ignored' };
    // every swing costs one cell; at zero it is a weak, free swing and the shell gets a nudge
    let weak = false;
    if (en.value >= 1) en.spend(1);
    else { weak = true; emit('noEnergy', {}); }
    h.swing = SWING_TIME;
    if (boss) {
      const b = ensureBoss(g.boss);
      if (!b.shielded) {
        h.facing = 'right';
        const r = hitBoss(weak ? g.weakDmg() : g.tapDmg(), 'tap', weak);
        return { type: 'hit', ...r };
      }
      // shielded: the tap goes to the nearest projectile on that side; the body is untouchable
      if (dir === 'left' || dir === 'right') h.facing = dir;
      const p = nearestProj(dir);
      if (!p) {
        h.hitCooldown = MISS_COOLDOWN;
        emit('miss', { dir });
        return { type: 'miss', weak };
      }
      p.hp -= 1; // a weak (0 energy) tap still removes a shot
      const removed = p.hp <= 0;
      emit('projectileTap', { id: p.id, side: p.side, x: p.x, big: p.big, removed });
      if (removed) removeProjectile(p, 'tap');
      return { type: 'projectile', removed, id: p.id, side: p.side, weak };
    }
    h.facing = dir;
    const t = nearest(dir);
    if (!t || dist(t) > REACH) {
      h.hitCooldown = MISS_COOLDOWN;
      emit('miss', { dir });
      return { type: 'miss', weak };
    }
    const r = hitEnemy(t, weak ? g.weakDmg() : g.tapDmg(), 'tap', KNOCK_HIT, weak);
    return { type: 'hit', ...r };
  };

  // --- input: answers feed energy, streak and approach speed (they never attack)
  function overdrive() {
    g.combo = 0;
    g.buffs.overdrive = OVERDRIVE_BUFF_SECONDS;
    const dmg = Math.round(g.tapDmg() * OVERDRIVE_DMG_MULT);
    emit('overdrive', { dmg });
    if (g.phase === 'wave') {
      for (const e of g.enemies.slice()) {
        e.hp -= dmg;
        emit('hit', { id: e.id, dmg, crit: false, weak: false, source: 'overdrive', x: e.x });
        if (e.hp <= 0) killEnemy(e);
      }
    } else if (g.phase === 'boss' && g.boss) {
      ensureBoss(g.boss);
      if (g.boss.shielded) { // the shield blocks the body: lightning wipes the projectiles instead
        for (const p of g.projectiles.slice()) removeProjectile(p, 'overdrive');
      } else {
        g.boss.hp = Math.max(0, g.boss.hp - dmg);
        emit('hit', { boss: true, dmg, crit: false, weak: false, source: 'overdrive' });
        checkBossDead();
      }
    }
    emit('combo', { value: 0 });
  }
  g.answer = (result, opts = {}) => {
    if (g.over || !result) return { type: 'ignored' };
    idleSec = 0;
    if (Number.isFinite(opts.ms)) {
      answerMs.push(Math.max(0, opts.ms));
      if (answerMs.length > ANSWER_WINDOW) answerMs.shift();
    }
    g.speedMult = answerSpeedMult(answerMs, 0);
    if (!result.correct) {
      g.combo = 0;
      g.lockMs = result.lockMs || 0;
      emit('wrong', {});
      emit('combo', { value: 0 });
      return { type: 'wrong' };
    }
    g.lockMs = 0;
    const before = en.value;
    const gain = Math.max(0, Number(result.gain) || 0);
    if (gain > 0) en.add(gain);
    const amount = Math.max(0, en.value - before);
    emit('energyGain', { amount, raw: gain, value: en.value });
    g.combo += 1;
    if (g.combo >= OVERDRIVE_STREAK) overdrive();
    else emit('combo', { value: g.combo });
    return { type: 'correct', amount };
  };

  // --- upgrades
  g.buySword = () => {
    const c = g.swordCost();
    if (g.gold < c || g.over) return false;
    g.gold -= c; g.swordLv += 1;
    emit('upgrade', { kind: 'sword', level: g.swordLv });
    return true;
  };
  g.buyAlly = () => {
    const c = g.allyCost();
    if (g.gold < c || g.over) return false;
    g.gold -= c; g.allyLv += 1;
    emit('upgrade', { kind: 'ally', level: g.allyLv });
    return true;
  };

  // debug / test helper: clear the volley and open the damage window right now (no-op outside the boss fight)
  g.skipToWindow = () => {
    const b = g.boss;
    if (g.phase !== 'boss' || !b) return false;
    ensureBoss(b);
    g.projectiles.length = 0;
    b.cycle.queue = [];
    if (b.cycle.state !== 'window') openWindow(b);
    return true;
  };

  g.drainEvents = () => events.splice(0, events.length);

  startPhase('wave');
  return g;
}
