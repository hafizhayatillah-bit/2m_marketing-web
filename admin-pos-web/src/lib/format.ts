export function formatIDR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "–";
  return `${amount < 0 ? "-" : ""}Rp${Math.abs(Math.round(amount)).toLocaleString("id-ID")}`;
}

// Untuk sumbu grafik: 0 / 500rb / 1,2jt.
export function compactIDR(amount: number): string {
  const a = Math.abs(amount);
  if (a >= 1_000_000_000) return `${trim(amount / 1_000_000_000)}M`;
  if (a >= 1_000_000) return `${trim(amount / 1_000_000)}jt`;
  if (a >= 1_000) return `${trim(amount / 1_000)}rb`;
  return String(amount);
}
const trim = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

export const formatNumber = (n: number) => n.toLocaleString("id-ID");

const WIB: Intl.DateTimeFormatOptions = { timeZone: "Asia/Jakarta" };

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("id-ID", { ...WIB, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString("id-ID", { ...WIB, hour: "2-digit", minute: "2-digit" });
}

// "2026-11-22" (tanggal WIB) -> "Min, 22 Nov"
export function formatDay(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Date(`${day}T12:00:00+07:00`).toLocaleDateString("id-ID", { ...WIB, ...opts });
}

// Tanggal hari ini di WIB sebagai YYYY-MM-DD.
export function todayWIB(): string {
  return new Date().toLocaleDateString("en-CA", WIB);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toLocaleDateString("en-CA", WIB);
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 8)}01`;
}

export const digitsOnly = (s: string) => s.replace(/\D/g, "");
export const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
