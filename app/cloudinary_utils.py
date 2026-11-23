import os
import re
from typing import Optional
from urllib.parse import urlparse

import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
from fastapi import UploadFile

load_dotenv(os.getenv("ENV_FILE", ".env"), override=True)

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)


def upload_image(file: UploadFile, folder: str) -> str:
    """Upload an admin-provided image file to Cloudinary and return its secure URL."""
    result = cloudinary.uploader.upload(file.file, folder=folder)
    return result["secure_url"]


def public_id_from_url(url: str) -> Optional[str]:
    """public_id Cloudinary dari secure_url milik akun ini; None kalau URL dari tempat lain.

    .../<cloud>/image/upload/[transformasi/]v123/products/abc.jpg -> products/abc
    """
    cloud = os.getenv("CLOUDINARY_CLOUD_NAME")
    if not cloud or not url:
        return None
    parsed = urlparse(url)
    prefix = f"/{cloud}/image/upload/"
    if parsed.netloc != "res.cloudinary.com" or not parsed.path.startswith(prefix):
        return None
    parts = [p for p in parsed.path[len(prefix):].split("/") if p]
    versions = [i for i, p in enumerate(parts) if re.fullmatch(r"v\d+", p)]
    if versions:
        parts = parts[versions[0] + 1:]
    if not parts:
        return None
    parts[-1] = parts[-1].rsplit(".", 1)[0]
    return "/".join(parts)


def delete_image(url: str) -> bool:
    """Hapus foto dari Cloudinary. True kalau terhapus (atau memang sudah tidak ada)."""
    public_id = public_id_from_url(url)
    if not public_id:
        return False
    result = cloudinary.uploader.destroy(public_id, invalidate=True)
    return result.get("result") in ("ok", "not found")
