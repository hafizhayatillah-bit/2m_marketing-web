import { useLayoutEffect, useRef, useState } from "react";
import { compactIDR, formatDay, formatIDR } from "../../lib/format";
import type { DailyRow } from "../../lib/types";

const H = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 52 };
const GAP = 2; // celah warna permukaan di antara segmen

function niceStep(max: number, ticks = 4): number {
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

// Kolom bertumpuk per hari: modal (bawah) + laba kotor (atas) = omzet. Satu sumbu rupiah.
export function SalesChart({ rows }: { rows: DailyRow[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const max = Math.max(0, ...rows.map((r) => Math.max(r.omzet, r.hpp)));
  const step = niceStep(max || 100_000);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, rows.length);
  const barW = Math.max(2, Math.min(24, band * 0.64));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(plotW / 64))));
  const hovered = hover !== null ? rows[hover] : undefined;

  return (
    <div ref={box} className="relative w-full" onPointerLeave={() => setHover(null)}>
      <svg width={width} height={H} role="img" aria-label={`Grafik penjualan harian, ${rows.length} hari. Detail tersedia di tampilan tabel.`} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {compactIDR(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = PAD.left + band * i + band / 2;
          const x = cx - barW / 2;
          const costH = Math.min(r.hpp, r.omzet);
          const profit = Math.max(0, r.laba_kotor);
          const yCost = y(costH);
          const yTop = y(costH + profit);
          const base = y(0);
          const radius = Math.min(4, barW / 2);
          // Ujung data membulat 4px, pangkal di garis dasar tetap persegi.
          const topSeg = profit > 0 && yCost - GAP - yTop > 0.5;
          const segPath = (x0: number, y0: number, y1: number, rounded: boolean) => {
            const h = Math.max(0, y1 - y0);
            const rr = rounded ? Math.min(radius, h) : 0;
            return `M${x0},${y1} V${y0 + rr} Q${x0},${y0} ${x0 + rr},${y0} H${x0 + barW - rr} Q${x0 + barW},${y0} ${x0 + barW},${y0 + rr} V${y1} Z`;
          };
          return (
            <g key={r.date} opacity={hover === null || hover === i ? 1 : 0.45} style={{ transition: "opacity 160ms ease" }}>
              {costH > 0 && <path d={segPath(x, yCost, base, !topSeg)} fill="hsl(var(--chart-cost))" />}
              {topSeg && <path d={segPath(x, yTop, yCost - GAP, true)} fill="hsl(var(--chart-profit))" />}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {formatDay(r.date, rows.length > 14 ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric" })}
                </text>
              )}
              {/* Area sentuh selebar pita, lebih besar dari batangnya. */}
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
            </g>
          );
        })}
        <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="hsl(var(--input))" strokeWidth={1} />
      </svg>
      {hovered && hover !== null && (
        <div
          className="material pointer-events-none absolute top-2 z-10 w-52 rounded-lg p-3 text-sm"
          // Di samping batang (kanan, atau kiri kalau mepet tepi) supaya batang yang disorot tetap terlihat.
          style={{
            left: (() => {
              const cx = PAD.left + band * hover + band / 2;
              const gap = barW / 2 + 12;
              return cx + gap + 208 <= width ? cx + gap : Math.max(0, cx - gap - 208);
            })(),
          }}
          role="status"
        >
          <p className="font-bold">{formatDay(hovered.date, { weekday: "long", day: "numeric", month: "long" })}</p>
          <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
            <dt className="text-muted-foreground">Omzet</dt>
            <dd className="text-right font-bold">{formatIDR(hovered.omzet)}</dd>
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-sm bg-[hsl(var(--chart-cost))]" aria-hidden="true" /> Modal
            </dt>
            <dd className="text-right">{formatIDR(hovered.hpp)}</dd>
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-sm bg-[hsl(var(--chart-profit))]" aria-hidden="true" /> Laba kotor
            </dt>
            <dd className="text-right">{formatIDR(hovered.laba_kotor)}</dd>
            <dt className="text-muted-foreground">Transaksi</dt>
            <dd className="text-right">{hovered.transactions}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground" aria-hidden="true">
      <span className="flex items-center gap-2">
        <span className="size-3 rounded-sm bg-[hsl(var(--chart-profit))]" /> Laba kotor
      </span>
      <span className="flex items-center gap-2">
        <span className="size-3 rounded-sm bg-[hsl(var(--chart-cost))]" /> Modal (HPP)
      </span>
      <span>Tinggi kolom = omzet</span>
    </div>
  );
}
