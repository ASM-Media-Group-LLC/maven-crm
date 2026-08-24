import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Polyfill scrollIntoView for jsdom
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// Node 22 expone un `localStorage` global experimental (roto sin
// --localstorage-file) que le gana al de jsdom: `clear`/`setItem` tiran. Se
// instala un mock in-memory para poder testear el autoguardado de borradores.
class LocalStorageMock {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  key(i: number) {
    return [...this.store.keys()][i] ?? null;
  }
}
const ls = new LocalStorageMock();
Object.defineProperty(globalThis, "localStorage", { value: ls, writable: true, configurable: true });
Object.defineProperty(window, "localStorage", { value: ls, writable: true, configurable: true });
