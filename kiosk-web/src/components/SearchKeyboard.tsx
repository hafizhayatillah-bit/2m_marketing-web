import { useEffect } from "react";
import { cn } from "../lib/utils";
import { IconBackspace, IconCheck } from "./Icons";

const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M", "-", "."],
];

export const SEARCH_MAX = 30;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
  /** Jumlah hasil saat ini, ditampilkan di tombol Selesai. */
  resultCount: number;
}

/**
 * Keyboard huruf di layar untuk pencarian. Kiosk tidak punya kolom ketik: keyboard sentuh Windows
 * tidak bisa dibuka di Chrome kiosk, jadi huruf diketik di sini. Keyboard fisik (USB) juga tetap jalan.
 */
export function SearchKeyboard({ value, onChange, onDone, resultCount }: Props) {
  const type = (ch: string) => {
    if (value.length >= SEARCH_MAX) return;
    // Tidak ada spasi di awal atau dua spasi berturut-turut.
    if (ch === " " && (value === "" || value.endsWith(" "))) return;
    onChange(value + ch.toLowerCase());
  };
  const back = () => onChange(value.slice(0, -1));

  // Keyboard fisik: berguna untuk staf/tes, dan tidak mengganggu layar sentuh.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "Backspace") back();
      else if (e.key === "Enter" || e.key === "Escape") onDone();
      else if (e.key.length === 1 && /[\p{L}\p{N} .\-]/u.test(e.key)) type(e.key);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      className="search-keyboard fixed inset-x-0 bottom-0 z-[720] animate-[kb-up_200ms_cubic-bezier(0.2,0.8,0.2,1)] border-t border-border bg-surface px-6 pb-4 pt-3 shadow-[0_-12px_32px_hsl(var(--shadow-tint)/0.18)]"
      role="group"
      aria-label="Keyboard pencarian"
    >
      <div className="mx-auto flex max-w-[64rem] flex-col gap-2">
        {ROWS.map((row, r) => (
          <div key={r} className="flex justify-center gap-2.5">
            {row.map((k) => (
              <button key={k} type="button" onClick={() => type(k)} className={cn("kb-key", r === 0 && "kb-key-num")}>
                {k}
              </button>
            ))}
            {r === 2 && (
              <button type="button" onClick={back} aria-label="Hapus satu huruf" className="kb-key kb-key-wide">
                <IconBackspace className="text-3xl" />
              </button>
            )}
          </div>
        ))}
        <div className="flex justify-center gap-2.5">
          <button type="button" onClick={() => onChange("")} disabled={!value} className="kb-key kb-key-wide text-lg disabled:opacity-40">
            Hapus semua
          </button>
          <button type="button" onClick={() => type(" ")} aria-label="Spasi" className="kb-key flex-1 text-lg text-muted-foreground">
            spasi
          </button>
          <button type="button" onClick={onDone} className="kb-key kb-key-done">
            <IconCheck className="text-2xl" />
            {value ? `Lihat ${resultCount} hasil` : "Tutup"}
          </button>
        </div>
      </div>
    </div>
  );
}
