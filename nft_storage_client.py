import os
import requests

NFT_STORAGE_API_KEY = (os.getenv("NFT_STORAGE_API_KEY") or "").strip()
NFT_STORAGE_UPLOAD_URL = "https://api.nft.storage/upload"


def upload_file_to_nft_storage(file_bytes: bytes, filename: str, mime_type: str) -> str:
    if not NFT_STORAGE_API_KEY:
        raise RuntimeError("NFT_STORAGE_API_KEY is not set")

    headers = {"Authorization": f"Bearer {NFT_STORAGE_API_KEY}"}
    files = {"file": (filename, file_bytes, mime_type)}

    resp = requests.post(NFT_STORAGE_UPLOAD_URL, headers=headers, files=files, timeout=60)
    if resp.status_code == 401:
        raise RuntimeError("Unauthorized: Check NFT_STORAGE_API_KEY value")
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"NFT.Storage upload failed: {data}")
    return data["value"]["cid"]