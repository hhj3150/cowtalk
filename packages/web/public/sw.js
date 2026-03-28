// CowTalk Service Worker — 오프라인 캐시 + 푸시 알림 + API 캐싱
const CACHE_NAME = 'cowtalk-v5-cache-v4';
const API_CACHE_NAME = 'cowtalk-v5-api-cache-v4';
const STATIC_ASSETS = [
    '/',
    '/manifest.json',
  ];

// Google Maps 관련 도메인 — 서비스 워커에서 처리하지 않고 브라우저에 위임
const BYPASS_DOMAINS = [
    'maps.googleapis.com',
    'maps.gstatic.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'googleapis.com',
    'gstatic.com',
  ];

function isBypassDomain(url) {
    return BYPASS_DOMAINS.some((domain) => url.includes(domain));
}

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
                              .filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
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

// 가져오기 — Google Maps는 무조건 통과, 나머지는 네트워크 우선
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

                        // Google Maps 및 Google 관련 도메인은 서비스 워커를 완전히 우회
                        if (isBypassDomain(url)) {
                              return; // 이벤트를 가로채지 않으면 브라우저가 직접 처리
                        }

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
                  const existing = clients.find((c) => c.url.includes(self.location.origin));
                  if (existing) {
                            existing.navigate(url);
                            return existing.focus();
                  }
                  return self.clients.openWindow(url);
          }),
        );
});
