# Canvas Visual Polish Design (Phase 1: Jump & Obby + Shared FX)

**Date:** 2026-11-25  
**Scope:** Phase 1 covers `jump` (점프맵) and `obby` (3학년은 못깨는 타워), establishing a shared canvas visual helper (`js/games/common/canvas-fx.js`) so Phase 2 (`stairs`, `tower2d`, `stack3d`) can reuse the same polished UI badges, vector icons, and particle utilities.  
**Art Direction:** Keep the current smooth casual/vector aesthetic while significantly upgrading character personality, surface textures, lighting/depth, particle feedback, and in-canvas HUD/banner polish.

---

## 1. Architecture & Module Boundaries

### 1.1 New Shared Module: `js/games/common/canvas-fx.js`
A pure Canvas 2D drawing utility module with zero DOM/physics dependencies:
- **`rr(g, x, y, w, h, r)`**: Safe rounded-rectangle path helper (`roundRect` fallback to `rect`).
- **`safeRadialGlow(g, x, y, r, rgbaCenter, rgbaEdge)`**: Soft radial glow that safely falls back when `createRadialGradient` is absent/mocked (matching existing `themes.js` test-proxy pattern).
- **`drawBadgePill(g, rightX, topY, bigText, smallText, opts)`**: Unified glossy dark-indigo score/status pill (`rgba(22,16,56,0.92)`), subtle top sheen, crisp rim border, and soft drop shadow.
- **`drawBannerCard(g, cssW, y, banner)`**: Unified pop-in/fade-out announcement banner with border accent, top highlight, and optional subtitle.
- **`drawCharacter(g, opts)`**: Upgraded casual-vector mascot character preserving the exact `PLAYER_HALF_W`/`PLAYER_H` collision footprint, adding:
  - Vertical gradient body + top specular highlight + crisp dark outline (`#3b1c08`).
  - Subtle headband/tuft accent and rosy cheeks.
  - Dynamic facial expressions (`normal`, `up` when rising, `fall` when falling fast, `dead`/`hurt` with `X` or `>_<` eyes).
  - Ground contact shadow ellipse when `onGround`.
- **Custom Vector Icons** (eliminating cross-OS emoji inconsistencies inside `<canvas>`):
  - `drawBoltIcon(g, cx, cy, size, fill, stroke)`
  - `drawQuestionIcon(g, cx, cy, size, fill)`
  - `drawFlagIcon(g, cx, cy, size, color, reached)`
  - `drawTrophyIcon(g, cx, cy, size, time)`
- **`createParticlePool(maxCount)`**: Lightweight pooled particles (`circle`, `square`, `spark`) supporting dust puffs, crumble chips, and pickup sparkles with gravity, drag, and alpha fade.

### 1.2 Modified Files (Phase 1)
1. `js/games/common/canvas-fx.js` (new)
2. `js/games/jump/themes.js` (multi-lobe cloud shading + subtle atmospheric depth while preserving `THEMES`, `themeAt`, and `drawBackground` invariants)
3. `js/games/jump/index.js` (upgraded character, platforms, pickups, landing/spring/pickup particles, and unified badge/banner)
4. `js/games/obby/render.js` (upgraded character, platforms, spikes, rest/checkpoint/goal visuals, section labels, left progress bar, and unified badge/banner/chip)
5. `js/games/obby/index.js` (landing dust / checkpoint sparkle hooks + passing `ctx` state cleanly to `render.js`)

---

## 2. Detailed Visual Upgrades

### 2.1 Character & Motion Feedback (`jump` & `obby`)
- Replace the flat orange rounded rectangle with `drawCharacter`:
  - Gradient fill (`#ffc44d` → `#ff8a00`), subtle top rim highlight, and `#3b1c08` 2px outline.
  - Small scarf/headband or top tuft that tilts subtly with `vx`/`vy`.
  - Eye pupils track `facing`, widen on jump (`vy > 120`), show surprised `O` mouth on fast fall (`vy < -280`), and show `X` eyes when failed (`obby`).
  - Soft elliptical contact shadow on the platform beneath the feet when `onGround`.
- **Particles:**
  - Landing on a platform emits 5–7 soft dust puffs spreading horizontally.
  - Double-jump / spring bounce emits an expanding ring plus star/sparkle dots.
  - Stepping on a crumbling platform emits small rock/crumb chips as it shakes.

### 2.2 Platforms & Hazards (`jump` & `obby`)
- **Normal / Grass**: Layered rounded earth with pebble specks, richer green turf cap with small grass-notch details, subtle bottom shade, and crisp dark outline.
- **Ice**: Cool cyan-white gradient, diagonal specular glass streaks, 2–3 tiny icicle tips underneath, and periodic glint.
- **Conveyor**: Brushed-metal housing, recessed track with animated golden chevrons, and spinning side rollers with cross-spokes.
- **Crumble**: Warm stone body with bevel highlight and progressive crack lines + shake intensity as `crumbleT` approaches `CRUMBLE_SEC`.
- **Moving**: Glowing cyan platform with rounded bevels, side thruster dots, and crisp vector directional chevrons instead of text glyphs.
- **Spring**: Golden base plate, outlined steel zig-zag coil, glossy red spring cap with highlight bar.
- **Spikes**: Beveled metallic-red teeth (left bright facet, right dark facet) over a dark base strip for stronger 3D readability.
- **Checkpoint & Goal**: Waving curved pennant flag on a metallic pole with finial sphere; `obby` goal features a gleaming vector trophy with floating bob and star sparkles.

### 2.3 Pickups, Backgrounds & In-Canvas UI
- **Pickups (`jump`)**: Energy orb with soft golden halo, crisp white rim, and vector lightning bolt; Mystery cube with bevels, violet glow, and vector `?`.
- **Background (`jump/themes.js`)**: Multi-lobe clouds with soft bottom tinting (`cloudColor` shaded downward) and cleaner sun/moon rim contrast; all `THEMES` thresholds and `themeAt` continuity remain unchanged.
- **In-Canvas Overlays (`jump` & `obby`)**:
  - Top-right status pill uses `drawBadgePill` (consistent rounded-bevel card, top sheen, shadow).
  - Banners use `drawBannerCard` with pop-scale entrance.
  - `obby` left progress bar replaces the emoji `🚩` markers with `drawFlagIcon` and adds a soft glow around the player position dot.
  - `obby` `drawSectionLabel` adjusts stroke/alpha subtly so text stays legible against both bright daytime sky and deep space themes.

---

## 3. Compatibility & Verification Plan
- **Test-Proxy Safety**: All new Canvas 2D code must balance `save()`/`restore()` and guard optional methods (`createRadialGradient`, `roundRect`, `ellipse`) so headless Node tests with `Proxy` `g2d` mocks pass without errors.
- **Automated Tests**: Run full `node --test` suite plus add unit tests for `canvas-fx.js` (particle lifecycle/cap, proxy-mock rendering safety for `drawCharacter`, `drawBadgePill`, `drawBannerCard`, and vector icons).
- **Live Visual Verification**: Start a local static server and verify both `jump` and `obby` visually in the browser (`browser` subagent / live screenshot inspection).
