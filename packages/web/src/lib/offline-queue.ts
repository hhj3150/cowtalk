// 오프라인 기록 큐 — IndexedDB 기반
// 인터넷 끊김 시 기록을 임시 저장, 온라인 복귀 시 자동 동기화

const DB_NAME = 'cowtalk-offline';
const STORE = 'pending-records';
const DB_VERSION = 1;

export interface PendingRecord {
  readonly id?: number;        // IndexedDB 자동 증가
  readonly payload: unknown;   // POST /api/events 페이로드
  readonly createdAt: number;  // Date.now()
  readonly retries: number;
}

// ===========================
// DB 초기화
// ===========================

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

// ===========================
// CRUD
// ===========================

export async function enqueueRecord(payload: unknown): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const record: Omit<PendingRecord, 'id'> = { payload, createdAt: Date.now(), retries: 0 };
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPending(): Promise<readonly PendingRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as PendingRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePending(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function countPending(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ===========================
// 온라인 복귀 시 자동 동기화
// ===========================

export async function flushQueue(
  submitFn: (payload: unknown) => Promise<void>,
): Promise<number> {
  const records = await getAllPending();
  let succeeded = 0;
  for (const rec of records) {
    try {
      await submitFn(rec.payload);
      await deletePending(rec.id!);
      succeeded++;
    } catch {
      // 실패 시 다음 기회에 재시도
    }
  }
  return succeeded;
}
