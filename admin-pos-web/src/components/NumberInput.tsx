import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import { cn } from "../lib/utils";

// "100000" -> "100.000" (titik ribuan gaya Indonesia). Nilai di state tetap angka polos tanpa titik.
export function formatThousands(digits: string): string {
  if (!digits) return "";
  return digits.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "maxLength" | "prefix"> & {
  value: string; // angka polos, mis. "100000"
  onValueChange: (digits: string) => void;
  maxDigits?: number;
  // Teks kecil di dalam kolom sebelah kiri, mis. "Rp".
  prefix?: string;
  wrapperClassName?: string;
};

// Input angka dengan titik ribuan otomatis saat diketik. Posisi kursor dijaga walau titik bertambah/berkurang.
export const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  { value, onValueChange, maxDigits = 9, prefix, className, wrapperClassName, ...rest },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  // Jumlah digit di kiri kursor setelah ketikan terakhir; dipakai untuk menaruh kursor lagi setelah format ulang.
  const caretDigits = useRef<number | null>(null);
  const shown = formatThousands(value);

  useLayoutEffect(() => {
    const el = input.current;
    const want = caretDigits.current;
    if (!el || want === null || document.activeElement !== el) return;
    caretDigits.current = null;
    let pos = 0;
    let seen = 0;
    while (pos < shown.length && seen < want) {
      if (/\d/.test(shown[pos]!)) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }, [shown]);

  const field = (
    <input
      {...rest}
      ref={input}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={cn("field tabular-nums", prefix && "pl-10", className)}
      value={shown}
      onChange={(e) => {
        const raw = e.target.value;
        const caret = e.target.selectionStart ?? raw.length;
        const digits = raw.replace(/\D/g, "").slice(0, maxDigits);
        caretDigits.current = Math.min(digits.length, raw.slice(0, caret).replace(/\D/g, "").length);
        onValueChange(digits.replace(/^0+(?=\d)/, ""));
      }}
    />
  );
  if (!prefix) return field;
  return (
    <span className={cn("relative block", wrapperClassName)}>
      <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
        {prefix}
      </span>
      {field}
    </span>
  );
});
