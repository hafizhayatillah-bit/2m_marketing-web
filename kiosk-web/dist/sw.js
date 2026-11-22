// Service worker kiosk: simpan "cangkang" aplikasi (index.html + assets) supaya kalau tablet
// reboot / reload saat internet mati, kiosk tetap terbuka dan menampilkan layar offline yang
// mencoba lagi otomatis, bukan halaman error Chrome. API (/api/...) TIDAK pernah di-cache.
const CACHE = "kiosk-shell-v2";
const SHELL = "./";
// Path relatif ke lokasi sw.js, jadi jalan di base mana pun (FastAPI maupun static site di root).
const ASSETS_PATH = new URL("assets/", self.location.href).pathname;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function store(key, response) {
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(key, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Halaman: selalu coba jaringan dulu (deploy baru langsung terpakai), cache hanya cadangan.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => store(SHELL, res))
        .catch(() => caches.match(SHELL)),
    );
    return;
  }
  // Logo: jaringan dulu (kalau logo diganti langsung terpakai), cache sebagai cadangan saat offline.
  if (url.pathname.endsWith("/logo-2m.png")) {
    event.respondWith(fetch(req).then((res) => store(req, res)).catch(() => caches.match(req)));
    return;
  }
  // File ber-hash tidak pernah berubah: cache dulu.
  if (url.pathname.startsWith(ASSETS_PATH)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => store(req, res))));
  }
});
