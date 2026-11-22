import { useEffect, useState } from "react";

/** Event Chrome/Edge/Android sebelum menampilkan dialog install (tidak ada di Safari/Firefox). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const INSTALLED_MODES = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];

/** True kalau halaman ini sedang berjalan sebagai aplikasi terpasang (bukan tab browser). */
export function isInstalledApp(): boolean {
  if (INSTALLED_MODES.some((m) => window.matchMedia(`(display-mode: ${m})`).matches)) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true; // iOS Safari
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// Ditangkap saat modul dimuat: beforeinstallprompt bisa datang sebelum React selesai render.
// Browser TIDAK mengirim event ini kalau aplikasinya sudah terpasang, jadi tombol otomatis tidak muncul.
let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // tahan mini-infobar bawaan; install lewat tombol kita
  deferred = e as BeforeInstallPromptEvent;
  installedNow = false;
  notify();
});
window.addEventListener("appinstalled", () => {
  deferred = null;
  installedNow = true;
  notify();
});

/**
 * mode "prompt": browser siap install (Chrome/Edge/Android) -> tombol memanggil dialog install.
 * mode "ios": iPhone/iPad (tidak ada API install) -> tombol menampilkan petunjuk "Tambah ke Layar Utama".
 * null: sudah terpasang / sedang dibuka sebagai aplikasi / browser tidak mendukung -> tombol disembunyikan.
 */
export function usePwaInstall() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const installed = installedNow || isInstalledApp();
  const mode: "prompt" | "ios" | null = installed ? null : deferred ? "prompt" : isIos() ? "ios" : null;

  async function install() {
    const e = deferred;
    if (!e) return;
    deferred = null; // satu event hanya bisa dipakai sekali
    notify();
    await e.prompt();
    const choice = await e.userChoice;
    if (choice.outcome === "accepted") {
      installedNow = true;
      notify();
    }
  }

  return { mode, install };
}

/**
 * Layar penuh otomatis untuk aplikasi terpasang. Di HP/tablet manifest "display: fullscreen" sudah menutup seluruh
 * layar. Di laptop/PC, Chrome membuka aplikasi sebagai jendela: perbesar jendela itu ke ukuran layar pengguna.
 */
export function fitInstalledWindowToScreen() {
  if (!isInstalledApp()) return;
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  const fit = () => {
    try {
      if (window.outerWidth < s.availWidth - 8 || window.outerHeight < s.availHeight - 8) {
        window.moveTo(s.availLeft ?? 0, s.availTop ?? 0);
        window.resizeTo(s.availWidth, s.availHeight);
      }
    } catch {
      // Browser menolak resize (mis. bukan jendela aplikasi): biarkan ukuran apa adanya.
    }
  };
  if (document.readyState === "complete") fit();
  else window.addEventListener("load", fit, { once: true });
}
