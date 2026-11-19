// Energy gauge: 0..max, clamped.
export function createEnergy(max = 10) {
  let value = 0;
  const subs = new Set();
  const notify = () => { for (const fn of [...subs]) fn(value); };
  return {
    get value() { return value; },
    max,
    spend(n = 1) {
      if (!(n > 0) || value < n) return false;
      value -= n;
      notify();
      return true;
    },
    add(n) {
      const before = value;
      value = Math.min(max, Math.max(0, value + (Number(n) || 0)));
      if (value !== before) notify();
      return value;
    },
    isFull() { return value >= max; },
    reset() {
      if (value !== 0) { value = 0; notify(); }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
