const MAX_BYTES = 400 * 1024;
const MAX_SIDE = 1600;

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal memproses foto."))), "image/jpeg", quality);
  });
}

// Re-encodes as JPEG (the presigned URL signs image/jpeg), at most 1600px and 400 KB, on a white
// background so a transparent PNG does not turn black.
export async function compressImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Format foto tidak didukung. Pakai JPG, PNG atau WebP.");
  }

  let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.72, 0.6]) {
        const blob = await toJpeg(canvas, quality);
        if (blob.size <= MAX_BYTES) return blob;
      }
      scale *= 0.75;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Foto terlalu besar untuk dikecilkan.");
}

// ---------------------------------------------------------------- foto produk 4:3

// Bingkai foto produk = kartu produk di kiosk (product-card-photo, 4:3). Foto disimpan persis
// seukuran bingkai ini, jadi kiosk, keranjang dan website menampilkan hasil yang sama tanpa terpotong.
export const PHOTO_W = 1200;
export const PHOTO_H = 900;
export const PHOTO_RATIO = PHOTO_W / PHOTO_H;

/** zoom 1 = seluruh foto pas di bingkai; ox/oy = geser titik tengah, dalam lebar/tinggi bingkai. */
export type PhotoFrame = { zoom: number; ox: number; oy: number };

/** Ukuran foto di zoom 1, sebagai pecahan lebar & tinggi bingkai. */
export function fitSize(width: number, height: number): { w: number; h: number } {
  const r = width / height;
  return r >= PHOTO_RATIO ? { w: 1, h: PHOTO_RATIO / r } : { w: r / PHOTO_RATIO, h: 1 };
}

/** Zoom terkecil yang menutup seluruh bingkai (tanpa pinggiran putih). */
export function coverZoom(width: number, height: number): number {
  const f = fitSize(width, height);
  return Math.max(1 / f.w, 1 / f.h);
}

async function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  let last: Blob | null = null;
  for (const quality of [0.88, 0.8, 0.72, 0.6]) {
    last = await toJpeg(canvas, quality);
    if (last.size <= MAX_BYTES) return last;
  }
  return last!;
}

/** Gambar foto ke kanvas 1200×900 berlatar putih sesuai posisi di editor, lalu JPEG ≤ ~400 KB. */
export async function renderPhoto(img: HTMLImageElement, frame: PhotoFrame): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_W;
  canvas.height = PHOTO_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
  ctx.imageSmoothingQuality = "high";
  const f = fitSize(img.naturalWidth, img.naturalHeight);
  const w = f.w * frame.zoom * PHOTO_W;
  const h = f.h * frame.zoom * PHOTO_H;
  const x = PHOTO_W / 2 + frame.ox * PHOTO_W - w / 2;
  const y = PHOTO_H / 2 + frame.oy * PHOTO_H - h / 2;
  ctx.drawImage(img, x, y, w, h);
  return encodeJpeg(canvas);
}
