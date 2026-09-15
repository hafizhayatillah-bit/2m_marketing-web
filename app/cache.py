"""Process-local TTL cache.

No Redis service is provisioned for this project (see docker-compose.yml), so a
simple in-memory cache is used instead. Good enough for a single-process deployment;
if the app ever runs multiple worker processes, swap this for a shared cache (Redis)
since each process would otherwise keep its own copy.
"""
import threading
import time
from typing import Any, Callable, Dict, Tuple

_lock = threading.Lock()
_store: Dict[str, Tuple[float, Any]] = {}


def get_or_set(key: str, ttl_seconds: int, loader: Callable[[], Any]) -> Any:
    now = time.monotonic()
    with _lock:
        cached = _store.get(key)
        if cached is not None and cached[0] > now:
            return cached[1]

    value = loader()
    with _lock:
        _store[key] = (now + ttl_seconds, value)
    return value


def invalidate(prefix: str) -> None:
    with _lock:
        for key in [k for k in _store if k.startswith(prefix)]:
            del _store[key]
