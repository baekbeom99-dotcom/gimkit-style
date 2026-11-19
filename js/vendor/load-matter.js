// Lazy loader for the vendored matter.js (UMD build sets window.Matter).
let pending = null;

export function loadMatter() {
  if (typeof window !== 'undefined' && window.Matter) return Promise.resolve(window.Matter);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('matter.js: no DOM available')); return; }
    const src = new URL('./matter.min.js', import.meta.url).href;
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => (window.Matter ? resolve(window.Matter) : reject(new Error('matter.js loaded but window.Matter is missing')));
    s.onerror = () => { s.remove(); pending = null; reject(new Error('matter.js failed to load: ' + src)); };
    document.head.appendChild(s);
  });
  return pending;
}

export default loadMatter;
