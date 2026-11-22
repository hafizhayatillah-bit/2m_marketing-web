import { IconMinus, IconPlus } from "./Icons";
import { cn } from "../lib/utils";

interface Props {
  name: string;
  qty: number;
  max: number;
  onChange: (qty: number) => void;
  /** Ditekan "+" padahal sudah mentok stok. */
  onLimit?: () => void;
  className?: string;
}

/** Minus, jumlah, plus. Tanpa kolom ketik supaya keyboard layar tidak muncul di kiosk. */
export function Stepper({ name, qty, max, onChange, onLimit, className }: Props) {
  const atMax = qty >= max;
  return (
    <div className={cn("stepper kiosk-stepper", className)}>
      <button type="button" aria-label={`Kurangi ${name}`} onClick={() => onChange(qty - 1)} className="stepper-key">
        <IconMinus />
      </button>
      <span className="stepper-value" aria-live="polite" aria-label={`Jumlah ${name}`}>
        {qty}
      </span>
      <button
        type="button"
        aria-label={`Tambah ${name}`}
        aria-disabled={atMax}
        onClick={() => (atMax ? onLimit?.() : onChange(qty + 1))}
        className={cn("stepper-key", atMax && "text-muted-foreground/50")}
      >
        <IconPlus />
      </button>
    </div>
  );
}
