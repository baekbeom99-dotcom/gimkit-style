// Pure stairs logic. steps[i] = direction to press while standing on stair i.
const AHEAD = 26;
const SWITCH_P = 0.2; // chance to turn after each step (once the min run is met)
const MIN_RUN = 2;
const MAX_RUN = 9;

export function createStairs(rng = Math.random) {
  const steps = [];
  let run = 0; // length of the current same-direction run
  function fill() {
    while (steps.length < state.pos + AHEAD) {
      const prev = steps[steps.length - 1];
      if (!prev) { steps.push(rng() < 0.5 ? 'L' : 'R'); run = 1; continue; }
      // long same-direction runs: turn rarely, never before MIN_RUN, always at MAX_RUN
      const flip = run >= MAX_RUN || (run >= MIN_RUN && rng() < SWITCH_P);
      if (flip) { steps.push(prev === 'L' ? 'R' : 'L'); run = 1; } else { steps.push(prev); run += 1; }
    }
  }
  const state = {
    steps,
    pos: 0,
    score: 0,
    expected() { return steps[state.pos]; },
    tap(dir) {
      if (dir !== steps[state.pos]) return { moved: false, wrong: true };
      state.pos += 1;
      state.score += 1;
      fill();
      return { moved: true, wrong: false };
    },
  };
  fill();
  return state;
}
