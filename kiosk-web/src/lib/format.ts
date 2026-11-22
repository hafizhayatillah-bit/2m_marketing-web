export function formatIDR(amount: number): string {
  return `Rp${Math.round(amount).toLocaleString("id-ID")}`;
}

const WIB = "Asia/Jakarta";

export function formatDateTime(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const date = d.toLocaleDateString("id-ID", { timeZone: WIB, day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("id-ID", { timeZone: WIB, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${date} ${time.replace(/\./g, ":")}`;
}

export function formatClock(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("id-ID", { timeZone: WIB, hour: "2-digit", minute: "2-digit", hour12: false })
    .replace(/\./g, ":");
}

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
