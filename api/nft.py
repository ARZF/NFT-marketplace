from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
import json

from nft_storage_client import upload_file_to_nft_storage

router = APIRouter(prefix="/api/nft", tags=["nft"])


@router.post("/upload")
async def upload_to_ipfs(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
):
    try:
        file_bytes = await file.read()
        mime_type = file.content_type or "application/octet-stream"
        image_cid = upload_file_to_nft_storage(file_bytes, file.filename, mime_type)

        metadata = {
            "name": name,
            "description": description,
            "image": f"ipfs://{image_cid}",
        }
        
        # Upload metadata JSON to IPFS
        metadata_json = json.dumps(metadata)
        metadata_bytes = metadata_json.encode("utf-8")
        metadata_cid = upload_file_to_nft_storage(metadata_bytes, "metadata.json", "application/json")
        
        return JSONResponse({
            "ok": True,
            "image_cid": image_cid,
            "metadata_cid": metadata_cid,
            "metadata": metadata
        })
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/key-status")
def key_status() -> JSONResponse:
    from nft_storage_client import (
        FILEBASE_ACCESS_KEY_ID,
        FILEBASE_SECRET_ACCESS_KEY,
        FILEBASE_BUCKET,
    )

    present = bool(FILEBASE_ACCESS_KEY_ID and FILEBASE_SECRET_ACCESS_KEY and FILEBASE_BUCKET)
    return JSONResponse({"ok": True, "provider": "filebase", "present": present})