import os
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

security = HTTPBasic()


def verify_admin(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    expected_username = os.getenv("ADMIN_USERNAME", "")
    expected_password = os.getenv("ADMIN_PASSWORD", "")

    # compare_digest avoids leaking match length via timing; still check even if env unset
    is_valid_username = secrets.compare_digest(credentials.username, expected_username)
    is_valid_password = secrets.compare_digest(credentials.password, expected_password)

    if not (expected_username and expected_password and is_valid_username and is_valid_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username
