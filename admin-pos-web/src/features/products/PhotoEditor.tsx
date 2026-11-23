import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { errorMessage } from "../../lib/api";
import { coverZoom, fitSize, renderPhoto, type PhotoFrame } from "../../lib/image";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const FIT: PhotoFrame = { zoom: 1, ox: 0, oy: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Titik tengah foto tidak boleh keluar bingkai, supaya foto tidak hilang saat digeser.
function bound(frame: PhotoFrame): PhotoFrame {
  return { zoom: clamp(frame.zoom, MIN_ZOOM, MAX_ZOOM), ox: clamp(frame.ox, -0.5, 0.5), oy: clamp(frame.oy, -0.5, 0.5) };
}

/** Sumber: file yang baru dipilih, atau URL foto yang sudah tersimpan. */
export type PhotoSource = Blob | string;

async function loadImage(source: PhotoSource): Promise<{ img: HTMLImageElement; url: string }> {
  // URL lama diunduh dulu jadi blob: kanvas dari gambar lintas domain tanpa CORS tidak bisa diekspor.
  let blob: Blob;
  if (typeof source === "string") {
    const res = await fetch(source, { mode: "cors" }).catch(() => null);
    if (!res?.ok) throw new Error("Foto lama tidak bisa dibuka. Unggah ulang fotonya.");
    blob = await res.blob();
  } else {
    blob = source;
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Format foto tidak didukung. Pakai JPG, PNG atau WebP.");
  }
  return { img, url };
}

export function PhotoEditor({ source, onCancel, onDone }: { source: PhotoSource; onCancel: () => void; onDone: (photo: Blob) => void }) {
  const [loaded, setLoaded] = useState<{ img: HTMLImageElement; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<PhotoFrame>(FIT);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; start: PhotoFrame } | null>(null);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    loadImage(source).then(
      (r) => {
        url = r.url;
        if (alive) setLoaded(r);
        else URL.revokeObjectURL(r.url);
      },
      (e) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source]);

  // Roda mouse untuk zoom; listener manual karena onWheel React pasif (tidak bisa preventDefault).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setFrame((f) => bound({ ...f, zoom: f.zoom * Math.exp(-e.deltaY * 0.0015) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const natural = loaded ? { w: loaded.img.naturalWidth, h: loaded.img.naturalHeight } : null;
  const fit = natural ? fitSize(natural.w, natural.h) : { w: 1, h: 1 };
  const cover = natural ? coverZoom(natural.w, natural.h) : 1;
  const w = fit.w * frame.zoom;
  const h = fit.h * frame.zoom;
  const edgeGaps = Math.abs(frame.ox) > w / 2 - 0.5 + 0.001 || Math.abs(frame.oy) > h / 2 - 0.5 + 0.001;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!loaded) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: frame };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    setFrame(bound({ ...d.start, ox: d.start.ox + (e.clientX - d.x) / r.width, oy: d.start.oy + (e.clientY - d.y) / r.height }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const zoomBy = (k: number) => setFrame((f) => bound({ ...f, zoom: f.zoom * k }));
  const nudge = (dx: number, dy: number) => setFrame((f) => bound({ ...f, ox: f.ox + dx, oy: f.oy + dy }));

  const done = async () => {
    if (!loaded) return;
    setBusy(true);
    try {
      onDone(await renderPhoto(loaded.img, frame));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Bingkai ini sama dengan kartu produk di kiosk, keranjang dan website. Geser foto untuk memindahkan, scroll atau pakai slider untuk zoom. Bagian
        kosong jadi putih.
      </p>
      <div
        ref={box}
        className="relative mx-auto aspect-[4/3] w-full max-w-md cursor-grab touch-none select-none overflow-hidden rounded-md border border-border bg-white outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
        tabIndex={0}
        role="application"
        aria-label="Posisi foto. Panah untuk menggeser, plus dan minus untuk zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02;
          const keys: Record<string, () => void> = {
            ArrowLeft: () => nudge(-step, 0),
            ArrowRight: () => nudge(step, 0),
            ArrowUp: () => nudge(0, -step),
            ArrowDown: () => nudge(0, step),
            "+": () => zoomBy(1.1),
            "=": () => zoomBy(1.1),
            "-": () => zoomBy(1 / 1.1),
          };
          const run = keys[e.key];
          if (run && loaded) {
            e.preventDefault();
            run();
          }
        }}
      >
        {loaded && (
          <img
            src={loaded.url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{
              width: `${w * 100}%`,
              height: `${h * 100}%`,
              left: `${(0.5 + frame.ox - w / 2) * 100}%`,
              top: `${(0.5 + frame.oy - h / 2) * 100}%`,
            }}
          />
        )}
        {!loaded && !error && <span className="photo-tile-state">Membuka foto…</span>}
        {error && (
          <span className="photo-tile-state" data-error>
            {error}
          </span>
        )}
      </div>
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <label className="field-label flex items-center gap-3">
          Zoom
          <input
            type="range"
            className="min-w-0 flex-1 accent-primary"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={frame.zoom}
            onChange={(e) => setFrame((f) => bound({ ...f, zoom: Number(e.target.value) }))}
            disabled={!loaded || busy}
          />
          <span className="w-12 text-right tabular-nums">{Math.round(frame.zoom * 100)}%</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFrame(FIT)} disabled={!loaded || busy}>
            Seluruh foto
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFrame({ zoom: cover, ox: 0, oy: 0 })} disabled={!loaded || busy}>
            Penuhi bingkai
          </button>
        </div>
        {loaded && (
          <p className="t-label">
            {w < 0.999 || h < 0.999 || edgeGaps
              ? "Ada pinggiran putih di bingkai."
              : frame.zoom > 1.001
                ? "Foto memenuhi bingkai. Bagian di luar bingkai akan terpotong."
                : "Seluruh foto masuk bingkai."}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          Batal
        </button>
        <button type="button" className="btn btn-primary" onClick={done} disabled={!loaded || busy}>
          {busy ? "Memproses…" : "Pakai foto ini"}
        </button>
      </div>
    </div>
  );
}
