// screens: { name: module | () => Promise<module> }, module = { mount(root, props), unmount() }
export function createRouter(root, screens) {
  let current = null;
  let currentName = null;
  let token = 0;
  async function show(name, props = {}) {
    const my = ++token;
    if (current) { try { current.unmount && current.unmount(); } catch (e) { console.error(e); } current = null; }
    root.replaceChildren();
    currentName = name;
    if (name === 'game' || !screens[name]) return null;
    let mod = screens[name];
    if (typeof mod === 'function') mod = await mod();
    if (my !== token || !mod) return null;
    if (mod.default && typeof mod.default.mount === 'function') mod = mod.default;
    current = mod;
    mod.mount(root, props);
    return mod;
  }
  return { show, get current() { return currentName; } };
}
