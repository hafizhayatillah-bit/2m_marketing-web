import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR dari string QRIS (gateway) atau gambar QRIS statis (provider manual). */
export function QrCode({ value, imageUrl, size = 320 }: { value?: string | null; imageUrl?: string | null; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let alive = true;
    if (value) {
      QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: "M" })
        .then((url) => alive && setSrc(url))
        .catch(() => alive && setSrc(null));
    } else setSrc(imageUrl ?? null);
    setBroken(false);
    return () => {
      alive = false;
    };
  }, [value, imageUrl, size]);

  if (!src || broken) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border-2 border-dashed border-input p-6 text-center text-muted-foreground"
        style={{ width: size, height: size }}
      >
        Gambar QRIS belum tersedia. Silakan minta QRIS ke petugas.
      </div>
    );
  }
  return (
    <img
      src={src}
      alt="Kode QRIS"
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className="rounded-lg bg-white object-contain p-2"
      style={{ width: size, height: size }}
    />
  );
}
