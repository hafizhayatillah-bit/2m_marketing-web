// Same-origin fetch ke /api/v1/admin. Sesi = cookie HttpOnly dari POST /auth/login.
const BASE = "/api/v1/admin";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

let onSessionLost: () => void = () => {};
export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

type Params = Record<string, string | number | boolean | null | undefined>;

export function url(path: string, params?: Params): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return `${BASE}${path}${s ? `?${s}` : ""}`;
}

async function request<T>(method: string, path: string, opts: { params?: Params; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  // Header custom = pertahanan CSRF; server menolak perubahan data tanpa header ini.
  if (method !== "GET") headers["X-Admin-Request"] = "1";
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(url(path, opts.params), { method, headers, body, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "NETWORK", "Server tidak terjangkau. Periksa koneksi internet lalu coba lagi.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    let message = `Permintaan gagal (${res.status}).`;
    let code: string | undefined;
    if (typeof detail === "string") message = detail;
    else if (Array.isArray(detail)) message = "Isian belum valid. Periksa lagi kolom yang diisi.";
    else if (detail && typeof detail === "object") {
      code = detail.code;
      message = detail.message ?? message;
    }
    if (res.status === 401 && path !== "/auth/login") onSessionLost();
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>("GET", path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, { form }),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Terjadi kesalahan";
}
