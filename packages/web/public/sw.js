// CowTalk Service Worker — 오프라인 캐시 + 푸시 알림 + API 캐싱

const CACHE_NAME = 'cowtalk-v5-cache-v3';
const API_CACHE_NAME = 'cowtalk-v5-api-cache-v3';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

// 설치 — 정적 리소스 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

// 활성화 — 이전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// 캐시 가능한 API 경로 (오프라인 지원)
const CACHEABLE_API_PATTERNS = [
  '/api/unified-dashboard/',
  '/api/farms',
  '/api/animals/',
  '/api/weather/',
];

function isCacheableApi(url) {
  return CACHEABLE_API_PATTERNS.some((pattern) => url.includes(pattern));
}

// 가져오기 — 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 캐시 가능한 API: StaleWhileRevalidate
  if (isCacheableApi(url)) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(async (cache) => {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          return new Response(JSON.stringify({ success: false, error: 'Offline' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503,
          });
        }
      }),
    );
    return;
  }

  // 기타 API는 캐시하지 않음
  if (url.includes('/api/')) return;

  // 정적 리소스: 네트워크 우선
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

// ── 푸시 알림 수신 ──

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const options = {
      body: payload.body || '',
      icon: payload.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag || 'cowtalk-notification',
      renotify: true,
      data: payload.data || {},
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: '확인하기' },
        { action: 'dismiss', title: '닫기' },
      ],
    };

    event.waitUntil(
      self.registration.showNotification(payload.title || 'CowTalk 알림', options),
    );
  } catch {
    // JSON 파싱 실패 시 텍스트로 표시
    event.waitUntil(
      self.registration.showNotification('CowTalk 알림', {
        body: event.data.text(),
      }),
    );
  }
});

// ── 알림 클릭 핸들러 ──

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // 이미 열린 창이 있으면 포커스
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      // 없으면 새 창
      return self.clients.openWindow(url);
    }),
  );
});
