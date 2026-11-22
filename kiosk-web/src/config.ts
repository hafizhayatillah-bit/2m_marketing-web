/**
 * Konfigurasi kiosk. Urutan: parameter URL (lalu disimpan di localStorage) > localStorage > env build (dev).
 *
 * Contoh URL di shortcut Chrome tablet:
 *   https://<domain>/kiosk/?branch=jatibening&token=<KIOSK_DEVICE_TOKEN>&paper=58
 *
 * Token TIDAK dimasukkan ke build (bundle JS bisa dibaca siapa saja), tapi lewat URL sekali
 * lalu disimpan di localStorage tablet, dan dihapus dari address bar.
 */

const KEYS = { token: "2m.kiosk.token", branch: "2m.kiosk.branch", paper: "2m.kiosk.paper" } as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage diblokir: tetap jalan dengan nilai di memori
  }
}

const params = new URLSearchParams(window.location.search);
const fromUrl = {
  token: params.get("token"),
  branch: params.get("branch"),
  paper: params.get("paper"),
};
if (fromUrl.token) write(KEYS.token, fromUrl.token);
if (fromUrl.branch) write(KEYS.branch, fromUrl.branch);
if (fromUrl.paper) write(KEYS.paper, fromUrl.paper);
if (fromUrl.token) {
  // Jangan biarkan token terlihat di address bar / history.
  params.delete("token");
  const qs = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
}

export type PaperWidth = "58" | "80";

export const config = {
  deviceToken: fromUrl.token ?? read(KEYS.token) ?? (import.meta.env.VITE_KIOSK_DEVICE_TOKEN as string | undefined) ?? "",
  branch: fromUrl.branch ?? read(KEYS.branch) ?? (import.meta.env.VITE_KIOSK_BRANCH as string | undefined) ?? "jatibening",
  paper: ((fromUrl.paper ?? read(KEYS.paper) ?? "58") === "80" ? "80" : "58") as PaperWidth,
  /** Tanpa sentuhan selama ini → muncul peringatan, lalu kembali ke awal. */
  idleWarnMs: 60_000,
  idleCountdownSeconds: 15,
  productsPollMs: 12_000,
  orderPollMs: 2_500,
  /** Layar sukses kembali ke awal setelah sekian detik. */
  successReturnSeconds: 10,
  maxQtyPerItem: 99,
};
