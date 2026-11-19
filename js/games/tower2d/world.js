// 2D 탑쌓기 물리 래퍼(Matter.js). 렌더링/ctx와 무관해서 node 테스트에서 그대로 돌린다.
import { SHAPES, CELL, cellOffsets, rotateCells, settleStep, approach, isLost, LOST_DEPTH } from './logic.js';

export const PHYS = {
  gravityY: 1,
  gravityScale: 0.001, // 1000 px/s²
  friction: 0.99, // 0.9에서 +10%
  frictionStatic: 1.1, // 1.0에서 +10%
  heavyFriction: 1.1, // 단단 마법 벽돌
  restitution: 0,
  density: 0.002,
  frictionAir: 0.01,
  positionIterations: 10,
  velocityIterations: 8,
  tick: 1 / 60,
  substeps: 2,
  maxDt: 0.05,
  moveMax: 170, // px/s
  moveAccel: 900, // px/s² (가속)
  moveBrake: 2400, // px/s² (손을 떼거나 반대로 누를 때 감속: 정확히 멈추기 쉽게)
  fastFall: 340, // px/s
  chamferQuality: 1, // 모서리를 한 번만 비스듬히 깎음(둥근 호는 세운 벽돌을 넘어뜨렸다)
  chamfer: 0, // 칸 모서리 깎기(px). 깎으면 세운 I 벽돌이 저절로 넘어져서 끔(걸림은 착지 속도 제한으로 충분)
  sleeping: true, // 쌓인 벽돌의 미세한 미끄러짐(creep)을 멈춘다
};

// 받침대 윗면의 홈 2개: 얇은 바닥판(전체 폭) + 솟은 블록 3개. 너비 합 = 160
export const GROOVE = {
  depth: 2 * CELL, // 홈 깊이 = 벽돌 2칸(48px) = 솟은 블록 높이
  base: 8, // 바닥판 두께
  segments: [41, 26, 26, 26, 41], // 솟음 | 홈 | 솟음 | 홈 | 솟음
  // 받침대 쪽은 모서리를 깎지 않는다: 깎은(chamfer) 정적 블록 위에서는 세운 I 벽돌이 저절로 넘어졌다.
  // 걸림 방지는 조종이 끝날 때의 낙하 속도 제한이 맡는다.
  chamfer: 0,
};
export const PLATFORM_H = GROOVE.depth + GROOVE.base; // 56: 받침대 전체 두께(윗면 = platformTop)
// 받침대 윗면 기준 x 범위 목록: { x0, x1, groove }
export function grooveLayout(cx, width = 160, segs = GROOVE.segments) {
  const total = segs.reduce((a, b) => a + b, 0);
  const k = width / total;
  let x = cx - width / 2;
  return segs.map((w, i) => { const r = { x0: x, x1: x + w * k, groove: i % 2 === 1 }; x += w * k; return r; });
}

export function createWorld(Matter, opts = {}) {
  const { Engine, Bodies, Body, Composite, Events, Query, Constraint } = Matter;
  const P = { ...PHYS, ...(opts.phys || {}) };
  const W = opts.width ?? 360;
  const platformTop = opts.platformTop ?? 0;
  const platformW = opts.platformW ?? 160;
  const platformH = opts.platformH ?? PLATFORM_H;
  const cellBase = opts.cell ?? CELL;
  const lostDepth = opts.lostDepth ?? LOST_DEPTH;
  const cb = {
    onContact: opts.onContact || null, // (brick, other) 조종 끝
    onSettled: opts.onSettled || null, // (brick)
    onLost: opts.onLost || null, // (brick, { byUndo })
    onMagic: opts.onMagic || null, // (brick, effect)
  };

  const engine = Engine.create({
    gravity: { x: 0, y: P.gravityY, scale: P.gravityScale },
    positionIterations: P.positionIterations,
    velocityIterations: P.velocityIterations,
    enableSleeping: P.sleeping,
  });
  // 받침대: 홈 2개가 파인 정적 복합 바디(윗면 = platformTop, 두께 = platformH)
  const pmat = { friction: P.friction, frictionStatic: P.frictionStatic, restitution: 0 };
  const grooves = grooveLayout(W / 2, platformW);
  const baseH = platformH - GROOVE.depth;
  const pparts = [Bodies.rectangle(W / 2, platformTop + GROOVE.depth + baseH / 2, platformW, baseH, pmat)];
  for (const s of grooves) {
    if (s.groove) continue;
    pparts.push(Bodies.rectangle((s.x0 + s.x1) / 2, platformTop + GROOVE.depth / 2 + 0.5, s.x1 - s.x0, GROOVE.depth + 1,
      GROOVE.chamfer ? { ...pmat, chamfer: { radius: GROOVE.chamfer } } : pmat));
  }
  const platform = Body.create({ parts: pparts, isStatic: true, label: 'platform', ...pmat });
  Composite.add(engine.world, platform);

  let nextId = 1;
  const bricks = []; // 살아 있는 벽돌
  const placed = []; // 안착 순서
  const vines = []; // { c, a, b }
  let controlled = null;
  let fallV = 55; // px/s
  let vx = 0; // 조종 중 가로 속도 px/s
  let acc = 0;
  let ticks = 0;
  const byBody = new Map();

  function brickOf(part) {
    const b = part && (part.parent || part);
    return byBody.get(b.id) || null;
  }

  function makeBody(shape, rot, x, y, cell, mat) {
    const cells = rotateCells(SHAPES[shape], rot);
    const offs = cellOffsets(cells, cell);
    const parts = offs.map(([ox, oy]) => Bodies.rectangle(x + ox, y + oy, cell - 1, cell - 1, { ...mat, chamfer: P.chamfer ? { radius: P.chamfer, quality: P.chamferQuality } : undefined }));
    const body = Body.create({ parts, ...mat });
    return { body, cells, offs };
  }

  function material(extra = {}) {
    return {
      friction: P.friction, frictionStatic: P.frictionStatic, restitution: P.restitution,
      density: P.density, frictionAir: P.frictionAir, slop: 0.05, ...extra,
    };
  }

  function addBrick(shape, x, y, { magic = null, controlled: ctl = false, rot = 0 } = {}) {
    let cell = cellBase;
    const mat = material();
    let tint = null;
    if (magic && magic.kind === 'dark' && magic.effect === 'giant') cell = Math.round(cellBase * 1.5);
    if (magic && magic.kind === 'dark' && magic.effect === 'ice') { mat.friction = 0; mat.frictionStatic = 0; tint = 'ice'; }
    const { body, cells, offs } = makeBody(shape, rot, x, y, cell, mat);
    Body.setAngle(body, 0);
    // 지역 좌표(바디 위치 기준) 셀 중심. 렌더링에서 translate+rotate 후 사각형으로 그린다.
    const local = body.parts.slice(1).map((p) => [p.position.x - body.position.x, p.position.y - body.position.y]);
    const brick = {
      id: nextId++, shape, body, cell, cells, offs, local, magic, tint,
      state: ctl ? 'controlled' : 'falling', settle: { age: 0, still: 0 }, touched: false, lost: false,
      spawnTick: ticks,
    };
    byBody.set(body.id, brick);
    bricks.push(brick);
    Composite.add(engine.world, body);
    if (ctl) { controlled = brick; vx = 0; Body.setVelocity(body, { x: 0, y: fallV / 60 }); }
    if (magic && magic.kind === 'dark') cb.onMagic && cb.onMagic(brick, magic.effect);
    return brick;
  }

  // 조종용 벽돌 생성(마법 'dark'는 여기서 바로 적용)
  function spawn(shape, magic = null, at = {}) {
    if (controlled) release(controlled);
    return addBrick(shape, at.x ?? W / 2, at.y ?? platformTop - 400, { magic, controlled: true, rot: at.rot || 0 });
  }
  // 테스트/디버그용: 조종 없이 바로 물리 벽돌로 놓기
  function place(shape, x, y, o = {}) { return addBrick(shape, x, y, { ...o, controlled: false }); }

  function release(brick) {
    if (!brick || brick.state !== 'controlled') return;
    brick.state = 'falling';
    brick.settle = { age: 0, still: 0 };
    // 빠른 낙하로 닿았을 때 탑을 세게 치지 않도록 아래 방향 속도를 기본 낙하 속도로 줄인다
    const v = brick.body.velocity;
    const cap = fallV / 60;
    if (v.y > cap) Body.setVelocity(brick.body, { x: v.x * 0.5, y: cap });
    if (controlled === brick) controlled = null;
  }

  function solids(except) {
    const out = [platform];
    for (const b of bricks) if (b !== except) out.push(b.body);
    return out;
  }
  function overlapDepth(brick) {
    let d = 0;
    const others = solids(brick);
    for (const part of brick.body.parts.slice(1)) {
      for (const c of Query.collides(part, others)) d = Math.max(d, c.depth || 0);
    }
    return d;
  }

  // 시계 방향 90° 회전. 겹치면 몇 px씩 위로 밀어 보고, 그래도 겹치면 되돌린다.
  function rotate() {
    const b = controlled;
    if (!b) return false;
    const body = b.body;
    const a0 = body.angle;
    const p0 = { x: body.position.x, y: body.position.y };
    Body.setAngle(body, a0 + Math.PI / 2);
    let ok = overlapDepth(b) < 0.5;
    for (let i = 0; !ok && i < 6; i++) {
      Body.setPosition(body, { x: body.position.x, y: body.position.y - 4 });
      ok = overlapDepth(b) < 0.5;
    }
    if (!ok) { Body.setAngle(body, a0); Body.setPosition(body, p0); return false; }
    clampX(b);
    Body.setVelocity(body, { x: vx / 60, y: fallV / 60 });
    Body.setAngularVelocity(body, 0);
    return true;
  }

  function clampX(b) {
    const body = b.body;
    const bw = body.bounds.max.x - body.bounds.min.x;
    const half = bw / 2;
    const cx = (body.bounds.max.x + body.bounds.min.x) / 2;
    const ncx = Math.min(W - half, Math.max(half, cx));
    if (ncx !== cx) Body.setPosition(body, { x: body.position.x + (ncx - cx), y: body.position.y });
  }

  Events.on(engine, 'collisionStart', (ev) => {
    for (const pair of ev.pairs) {
      const a = brickOf(pair.bodyA);
      const b = brickOf(pair.bodyB);
      for (const [me, other] of [[a, b], [b, a]]) {
        if (!me) continue;
        if (!me.touched) {
          me.touched = true;
          const wasCtl = me.state === 'controlled';
          const impact = me.body.speed; // 속도 제한 전의 충돌 속도(px per 1/60s)
          if (wasCtl) release(me);
          cb.onContact && cb.onContact(me, other || platform, wasCtl, impact);
        }
      }
    }
  });

  function removeBrick(brick, byUndo = false) {
    if (!brick || brick.lost) return;
    brick.lost = true;
    if (controlled === brick) controlled = null;
    for (let i = vines.length - 1; i >= 0; i--) {
      const v = vines[i];
      if (v.a === brick || v.b === brick) { Composite.remove(engine.world, v.c); vines.splice(i, 1); }
    }
    Composite.remove(engine.world, brick.body);
    byBody.delete(brick.body.id);
    const i = bricks.indexOf(brick);
    if (i >= 0) bricks.splice(i, 1);
    const j = placed.indexOf(brick);
    if (j >= 0) placed.splice(j, 1);
    for (const b of bricks) if (b.body.isSleeping) Matter.Sleeping.set(b.body, false);
    cb.onLost && cb.onLost(brick, { byUndo });
  }

  function touchingBricks(brick) {
    const out = new Map(); // other -> [support points]
    for (const pair of engine.pairs.list) {
      if (!pair.isActive) continue;
      const a = brickOf(pair.bodyA);
      const b = brickOf(pair.bodyB);
      let other = null;
      if (a === brick && b && b !== brick) other = b;
      else if (b === brick && a && a !== brick) other = a;
      if (!other) continue;
      const sup = (pair.collision && pair.collision.supports) || [];
      const list = out.get(other) || [];
      for (const s of sup) if (s) list.push({ x: s.x, y: s.y });
      out.set(other, list);
    }
    return out;
  }

  function addVine(a, b, pt) {
    const c = Constraint.create({
      bodyA: a.body, bodyB: b.body,
      pointA: { x: pt.x - a.body.position.x, y: pt.y - a.body.position.y },
      pointB: { x: pt.x - b.body.position.x, y: pt.y - b.body.position.y },
      length: 0, stiffness: 0.9, damping: 0.1,
    });
    Composite.add(engine.world, c);
    vines.push({ c, a, b });
    return c;
  }

  // 밝은 마법(안착 시)
  function applyLight(brick, effect) {
    const body = brick.body;
    if (effect === 'heavy') {
      Body.setDensity(body, P.density * 4);
      body.friction = P.heavyFriction;
      for (const p of body.parts) p.friction = P.heavyFriction;
      brick.tint = 'steel';
    } else if (effect === 'vine') {
      for (const [other, pts] of touchingBricks(brick)) {
        if (!pts.length) continue;
        // 접점 2개(양 끝)로 이어서 회전도 잡아 준다
        let p1 = pts[0];
        let p2 = pts[0];
        for (const p of pts) {
          if (p.x + p.y < p1.x + p1.y) p1 = p;
          if (p.x + p.y > p2.x + p2.y) p2 = p;
        }
        addVine(brick, other, p1);
        if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 4) addVine(brick, other, p2);
      }
    } else if (effect === 'undo') {
      const idx = placed.indexOf(brick);
      const prev = idx > 0 ? placed[idx - 1] : placed.filter((b) => b !== brick).pop();
      if (prev) removeBrick(prev, true);
    }
    cb.onMagic && cb.onMagic(brick, effect);
  }

  function setFallSpeed(v) { fallV = v; }

  // 콘크리트 아이템: 조종 중인 벽돌에 걸고, 안착하면 그 자리에 고정(static)
  function makeConcrete(brick) {
    if (!brick || brick.lost || brick.concrete) return false;
    brick.concrete = true;
    if (brick.state === 'settled') fixInPlace(brick);
    return true;
  }
  function fixInPlace(brick) {
    const body = brick.body;
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);
    if (body.isSleeping) Matter.Sleeping.set(body, false);
    Body.setStatic(body, true);
    brick.fixed = true;
    for (const b of bricks) if (b !== brick && b.body.isSleeping) Matter.Sleeping.set(b.body, false);
  }

  function tick(input) {
    const h = (1000 * P.tick) / P.substeps;
    const c = controlled;
    if (c) {
      const target = (input && input.left ? -P.moveMax : 0) + (input && input.right ? P.moveMax : 0);
      const braking = target === 0 || Math.sign(target) !== Math.sign(vx);
      vx = approach(vx, target, braking && vx !== 0 ? P.moveBrake : P.moveAccel, P.tick);
      const bx = c.body.bounds;
      if ((bx.min.x <= 0.5 && vx < 0) || (bx.max.x >= W - 0.5 && vx > 0)) vx = 0;
    }
    for (let s = 0; s < P.substeps; s++) {
      if (controlled) {
        if (controlled.body.isSleeping) Matter.Sleeping.set(controlled.body, false);
        const vy = input && input.down ? P.fastFall : fallV;
        Body.setVelocity(controlled.body, { x: vx / 60, y: vy / 60 });
        Body.setAngularVelocity(controlled.body, 0);
      }
      Engine.update(engine, h);
      if (controlled) clampX(controlled);
    }
    ticks++;
    // 낙하/안착 판정
    for (const b of bricks.slice()) {
      if (isLost(b.body.position.y, platformTop, lostDepth)) { removeBrick(b, false); continue; }
      if (b.state === 'falling') {
        if (settleStep(b.settle, b.body.speed, b.body.angularSpeed, P.tick)) {
          b.state = 'settled';
          placed.push(b);
          if (b.concrete) fixInPlace(b);
          cb.onSettled && cb.onSettled(b);
          if (b.magic && b.magic.kind === 'light' && !b.lost) applyLight(b, b.magic.effect);
        }
      }
    }
  }

  // 가변 dt를 누적해 고정 1/60초 간격으로만 진행
  function step(dt, input) {
    acc += Math.min(Math.max(0, dt || 0), P.maxDt);
    let n = 0;
    while (acc >= P.tick - 1e-9) { acc -= P.tick; tick(input); n++; }
    return n;
  }

  function settledTop() {
    let top = Infinity;
    for (const b of bricks) if (b.state === 'settled') top = Math.min(top, b.body.bounds.min.y);
    return top;
  }
  function heightPx() {
    const t = settledTop();
    return t === Infinity ? 0 : Math.max(0, platformTop - t);
  }
  // 아직 안착하지 않은(조종 중 또는 떨어지는 중) 벽돌이 있는가
  function busy() { return bricks.some((b) => b.state !== 'settled'); }

  return {
    Matter, engine, platform, bricks, placed, vines, P,
    width: W, platformTop, platformW, platformH, grooves,
    get controlled() { return controlled; },
    get fallSpeed() { return fallV; },
    get ticks() { return ticks; },
    spawn, place, rotate, release, step, tick, setFallSpeed, removeBrick, applyLight, makeConcrete,
    settledTop, heightPx, busy, overlapDepth,
  };
}
