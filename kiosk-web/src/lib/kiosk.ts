/** Perilaku khusus perangkat kiosk: tanpa zoom, tanpa menu konteks, layar tetap menyala. */
export function lockDownKiosk() {
  const block = (e: Event) => e.preventDefault();
  // Sentuh-lama memunculkan menu konteks; Ctrl+scroll / gesture = zoom.
  window.addEventListener("contextmenu", block);
  window.addEventListener("gesturestart", block);
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0", "p", "s", "o"].includes(e.key.toLowerCase())) e.preventDefault();
  });
  window.addEventListener("dragstart", block);

  // Fullscreen: Chrome --kiosk dan PWA (display: fullscreen) sudah penuh layar. Kalau dibuka di
  // browser biasa, sentuhan pertama meminta fullscreen (browser hanya mengizinkan setelah ada sentuhan).
  const alreadyFull = () =>
    !!document.fullscreenElement ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.innerHeight >= window.screen.height - 1;
  const goFull = () => {
    if (!alreadyFull() && document.fullscreenEnabled) {
      document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }
  };
  window.addEventListener("pointerdown", goFull, { capture: true });

  // Wake Lock: cegah layar mati selama halaman terbuka (butuh https atau localhost).
  type WakeLockNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<unknown> } };
  const nav = navigator as WakeLockNav;
  const keepAwake = () => {
    if (document.visibilityState === "visible") nav.wakeLock?.request("screen").catch(() => {});
  };
  keepAwake();
  document.addEventListener("visibilitychange", keepAwake);

  // Jaga-jaga memori/kebocoran: muat ulang sekali sehari saat dini hari (jam tablet) kalau sedang diam.
  setInterval(() => {
    const h = new Date().getHours();
    if (h === 4 && document.visibilityState === "visible" && !document.querySelector("[data-busy-screen]")) {
      window.location.reload();
    }
  }, 30 * 60_000);
}
