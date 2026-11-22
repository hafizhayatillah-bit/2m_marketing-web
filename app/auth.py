import os
import secrets
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app import rate_limit

security = HTTPBasic()

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _reject_cross_site(request: Request) -> None:
    """CSRF untuk admin Jinja (/admin/*): browser otomatis mengirim kredensial Basic Auth ke form dari situs lain,
    jadi POST (hapus/ubah) dari origin lain ditolak. Form admin sendiri same-origin, jadi tidak terpengaruh."""
    if request.method in SAFE_METHODS:
        return
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permintaan lintas situs ditolak.")
    origin = request.headers.get("origin") or request.headers.get("referer")
    if origin and origin != "null":
        host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
        if urlsplit(origin).netloc.lower() != host.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permintaan lintas situs ditolak.")


def verify_admin(request: Request, credentials: HTTPBasicCredentials = Depends(security)) -> str:
    expected_username = os.getenv("ADMIN_USERNAME", "")
    expected_password = os.getenv("ADMIN_PASSWORD", "")

    # Kredensial ini sama dengan login /admin-pos, jadi pakai limiter yang sama (sebelumnya tanpa batas sama sekali:
    # password bisa ditebak lewat /admin tanpa kena lockout).
    wait = rate_limit.admin_login_locked(request)
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Terlalu banyak percobaan gagal. Coba lagi {wait} detik lagi.",
        )

    # compare_digest avoids leaking match length via timing; still check even if env unset
    is_valid_username = secrets.compare_digest(credentials.username.encode(), expected_username.encode())
    is_valid_password = secrets.compare_digest(credentials.password.encode(), expected_password.encode())

    if not (expected_username and expected_password and is_valid_username and is_valid_password):
        rate_limit.admin_login_failed(request)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    _reject_cross_site(request)
    return credentials.username
