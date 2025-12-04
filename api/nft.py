from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse

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
        return JSONResponse({"ok": True, "image_cid": image_cid, "metadata": metadata})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))