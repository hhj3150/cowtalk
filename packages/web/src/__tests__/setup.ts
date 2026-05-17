import '@testing-library/jest-dom/vitest';

// jsdom 환경에서 localStorage / sessionStorage 가 clear()/getItem() 없는
// 빈 객체로 노출되는 문제 보정. zustand persist · SearchBar 등이 의존한다.
// 이미 정상 Storage 가 있으면 건드리지 않는다.
function installStoragePolyfill(key: 'localStorage' | 'sessionStorage'): void {
  const existing = (globalThis as Record<string, unknown>)[key];
  if (existing && typeof (existing as Storage).clear === 'function') return;

  const store = new Map<string, string>();
  const storage: Storage = {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(k: string): string | null {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(k: string): void {
      store.delete(k);
    },
    setItem(k: string, v: string): void {
      store.set(k, String(v));
    },
  };

  Object.defineProperty(globalThis, key, { value: storage, configurable: true, writable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, key, { value: storage, configurable: true, writable: true });
  }
}

installStoragePolyfill('localStorage');
installStoragePolyfill('sessionStorage');
