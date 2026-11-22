// Service worker admin POS: syarat PWA (bisa di-install) + cangkang aplikasi tetap terbuka saat koneksi putus.
// API (/api/...) TIDAK pernah di-cache: data admin (stok, harga, laporan) selalu langsung dari server.
const CACHE = "admin-pos-shell-v1";
const SHELL = "./";
// Path relatif ke lokasi sw.js, jadi jalan di base mana pun (/admin-pos/ maupun static site di root).
const ASSETS_PATH = new URL("assets/", self.location.href).pathname;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("admin-pos-") && k !== CACHE).map((k) => caches.delete(k))))
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

  // Halaman: selalu jaringan dulu (deploy baru langsung terpakai), cache hanya cadangan saat offline.
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
  // File ber-hash tidak pernah berubah: cache dulu. Hanya JS/CSS/font asli yang disimpan (bukan halaman error).
  if (url.pathname.startsWith(ASSETS_PATH)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const type = res.headers.get("content-type") || "";
            return type.includes("text/html") ? res : store(req, res);
          }),
      ),
    );
  }
});
