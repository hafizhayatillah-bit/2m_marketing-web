import { useState } from "react";
import { usePwaInstall } from "../lib/pwa";
import { Dialog } from "./Dialog";
import { IconDownload } from "./Icons";
import { cn } from "../lib/utils";

/** Tombol "Install aplikasi". Tidak dirender sama sekali kalau aplikasi sudah terpasang atau dibuka sebagai aplikasi. */
export function InstallButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { mode, install } = usePwaInstall();
  const [iosHelp, setIosHelp] = useState(false);
  if (!mode) return null;

  return (
    <>
      <button
        type="button"
        className={cn("btn btn-secondary btn-sm", className)}
        onClick={() => (mode === "prompt" ? void install() : setIosHelp(true))}
        aria-label="Install aplikasi admin"
        title="Install aplikasi admin"
      >
        <IconDownload className="text-base" />
        <span className={compact ? "hidden sm:inline" : undefined}>Install aplikasi</span>
      </button>
      {iosHelp && (
        <Dialog title="Install di iPhone / iPad">
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>Buka halaman ini di <b>Safari</b>.</li>
            <li>
              Tap tombol <b>Bagikan</b> (kotak dengan panah ke atas).
            </li>
            <li>
              Pilih <b>Tambah ke Layar Utama</b> (Add to Home Screen), lalu <b>Tambah</b>.
            </li>
            <li>Buka aplikasi <b>2M Admin</b> dari layar utama: tampil layar penuh dan tombol ini tidak muncul lagi.</li>
          </ol>
          <button type="button" className="btn btn-primary btn-block" onClick={() => setIosHelp(false)}>
            Mengerti
          </button>
        </Dialog>
      )}
    </>
  );
}
