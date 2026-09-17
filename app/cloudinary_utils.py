import os

import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
from fastapi import UploadFile

load_dotenv(override=True)

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
