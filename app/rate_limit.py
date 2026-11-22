"""Pembatas percobaan gagal (login admin, Basic Auth admin lama, PIN staf kiosk). In-memory, per proses.

Render menjalankan satu proses uvicorn, jadi cukup. Kalau nanti pakai beberapa worker/instance, pindahkan ke Redis/DB.
"""
from __future__ import annotations

import threading
import time
from typing import Optional

from fastapi import Request

MAX_KEYS = 10_000


class FailureLimiter:
    """N kali gagal dalam `window_seconds` untuk satu key -> key itu terkunci `lock_seconds`."""

    def __init__(self, max_failures: int, window_seconds: int, lock_seconds: int) -> None:
        self.max_failures = max_failures
        self.window = window_seconds
        self.lock_seconds = lock_seconds
        self._lock = threading.Lock()
        self._failures: dict[str, list[float]] = {}
        self._locked_until: dict[str, float] = {}

    def locked_for(self, key: str) -> int:
        """Sisa detik terkunci (0 = tidak terkunci)."""
        now = time.monotonic()
        with self._lock:
            until = self._locked_until.get(key, 0.0)
            if until <= now:
                self._locked_until.pop(key, None)
                return 0
            return max(1, int(until - now + 0.999))

    def fail(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            if len(self._failures) > MAX_KEYS:
                self._prune(now)
            recent = [t for t in self._failures.get(key, []) if now - t < self.window]
            recent.append(now)
            if len(recent) >= self.max_failures:
                self._locked_until[key] = now + self.lock_seconds
                self._failures.pop(key, None)
            else:
                self._failures[key] = recent

    def success(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._failures.clear()
            self._locked_until.clear()

    def _prune(self, now: float) -> None:
        for k in [k for k, ts in self._failures.items() if not ts or now - ts[-1] >= self.window]:
            del self._failures[k]
        for k in [k for k, until in self._locked_until.items() if until <= now]:
            del self._locked_until[k]


def client_ip(request: Request) -> str:
    """IP klien. Di belakang proxy Render pakai entri TERAKHIR X-Forwarded-For (ditambahkan proxy, bukan klien);
    entri pertama bisa dipalsukan klien. Kalau ternyata itu IP proxy bersama, efeknya jadi limit global (aman)."""
    xff = request.headers.get("x-forwarded-for", "")
    parts = [p.strip() for p in xff.split(",") if p.strip()]
    if parts:
        return parts[-1]
    return request.client.host if request.client else "unknown"


# Satu kredensial admin (ADMIN_USERNAME/ADMIN_PASSWORD) dipakai /admin-pos (cookie) DAN /admin lama (Basic Auth),
# jadi keduanya berbagi limiter yang sama: menebak lewat /admin tidak lagi bisa memotong jalur lockout /admin-pos.
# Per IP: 5 gagal / 5 menit -> kunci 5 menit. Cadangan global (penebak dari banyak IP): 100 gagal / 15 menit.
admin_login_per_ip = FailureLimiter(max_failures=5, window_seconds=300, lock_seconds=300)
admin_login_global = FailureLimiter(max_failures=100, window_seconds=900, lock_seconds=900)


def admin_login_locked(request: Request) -> Optional[int]:
    wait = max(admin_login_per_ip.locked_for(client_ip(request)), admin_login_global.locked_for("global"))
    return wait or None


def admin_login_failed(request: Request) -> None:
    admin_login_per_ip.fail(client_ip(request))
    admin_login_global.fail("global")


def admin_login_succeeded(request: Request) -> None:
    admin_login_per_ip.success(client_ip(request))
