/* EGMM PWA 서비스워커 — 설치 요건 충족용(네트워크 우선, 오프라인 시 캐시) */
const CACHE = 'egmm-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      try {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
      } catch (err) {}
      return res;
    }).catch(() => caches.match(e.request))
  );
});
