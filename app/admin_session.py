"""Login admin POS (/admin-pos) dengan cookie sesi, memakai kredensial admin yang sama (ADMIN_USERNAME/ADMIN_PASSWORD).

Token stateless: base64(username|expires) + "." + HMAC-SHA256. Kunci HMAC dari ADMIN_SESSION_SECRET, atau
(kalau kosong) diturunkan dari ADMIN_PASSWORD — jadi mengganti password otomatis mengeluarkan semua sesi.

Cookie: HttpOnly, SameSite=Strict, path /api/v1/admin, Secure di HTTPS. Request yang mengubah data juga wajib
membawa header X-Admin-Request: 1 (form/link dari situs lain tidak bisa menambah header custom).
Admin Jinja lama (/admin/*, HTTP Basic di app/auth.py) tidak berubah.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import threading
import time
from typing import Optional

from fastapi import HTTPException, Request, Response

COOKIE_NAME = "pos_admin"
COOKIE_PATH = "/api/v1/admin"
SESSION_SECONDS = int(os.getenv("ADMIN_SESSION_HOURS", "12")) * 3600

_lock = threading.Lock()
_failures: list[float] = []
MAX_FAILURES = 5
WINDOW_SECONDS = 300


def _secret() -> bytes:
    explicit = os.getenv("ADMIN_SESSION_SECRET", "")
    if explicit:
        return explicit.encode()
    password = os.getenv("ADMIN_PASSWORD", "")
    return hashlib.sha256(f"pos-admin-session|{password}".encode()).digest()


def _sign(payload: str) -> str:
    return hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()


def make_token(username: str, now: Optional[float] = None) -> str:
    expires = int((now or time.time()) + SESSION_SECONDS)
    payload = base64.urlsafe_b64encode(f"{username}|{expires}".encode()).decode()
    return f"{payload}.{_sign(payload)}"


def read_token(token: str) -> Optional[str]:
    try:
        payload, sig = token.rsplit(".", 1)
        if not hmac.compare_digest(sig, _sign(payload)):
            return None
        username, expires = base64.urlsafe_b64decode(payload.encode()).decode().rsplit("|", 1)
        if int(expires) < time.time():
            return None
        # Username di env bisa diganti; sesi lama ikut tidak berlaku.
        if not secrets.compare_digest(username, os.getenv("ADMIN_USERNAME", "")):
            return None
        return username
    except Exception:
        return None


def check_credentials(username: str, password: str) -> bool:
    expected_user = os.getenv("ADMIN_USERNAME", "")
    expected_pass = os.getenv("ADMIN_PASSWORD", "")
    if not (expected_user and expected_pass):
        raise HTTPException(503, detail={"code": "ADMIN_NOT_CONFIGURED", "message": "ADMIN_USERNAME/ADMIN_PASSWORD belum diset di server."})
    now = time.monotonic()
    with _lock:
        _failures[:] = [t for t in _failures if now - t < WINDOW_SECONDS]
        if len(_failures) >= MAX_FAILURES:
            raise HTTPException(429, detail={"code": "LOGIN_LOCKED", "message": "Terlalu banyak percobaan gagal. Coba lagi 5 menit lagi."})
        ok_user = secrets.compare_digest(username, expected_user)
        ok_pass = secrets.compare_digest(password, expected_pass)
        if not (ok_user and ok_pass):
            _failures.append(now)
            return False
        _failures.clear()
        return True


def _is_https(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return proto.split(",")[0].strip() == "https"


def set_session_cookie(response: Response, request: Request, username: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        make_token(username),
        max_age=SESSION_SECONDS,
        path=COOKIE_PATH,
        httponly=True,
        samesite="strict",
        secure=_is_https(request),
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path=COOKIE_PATH)


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def require_admin_session(request: Request) -> str:
    """Dependency untuk semua endpoint /api/v1/admin (kecuali login)."""
    username = read_token(request.cookies.get(COOKIE_NAME, ""))
    if not username:
        raise HTTPException(401, detail={"code": "NOT_LOGGED_IN", "message": "Sesi habis. Silakan masuk lagi."})
    if request.method not in SAFE_METHODS and request.headers.get("x-admin-request") != "1":
        raise HTTPException(403, detail={"code": "CSRF", "message": "Permintaan ditolak."})
    return username
