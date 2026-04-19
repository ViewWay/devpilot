import "@testing-library/jest-dom/vitest";

// Ensure localStorage is available in jsdom test environment.
// Some jsdom versions may not fully implement the Storage interface.
if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage.getItem !== "function") {
  const store: Record<string, string> = {};
  const storageMock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", { value: storageMock, writable: true });
}
