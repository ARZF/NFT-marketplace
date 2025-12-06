import os
import uuid
import boto3
from botocore.client import Config

# Filebase (S3-compatible) configuration — required for uploads
FILEBASE_ENDPOINT = (os.getenv("FILEBASE_S3_ENDPOINT") or "https://s3.filebase.com").strip()
FILEBASE_ACCESS_KEY_ID = (os.getenv("FILEBASE_ACCESS_KEY_ID") or "").strip()
FILEBASE_SECRET_ACCESS_KEY = (os.getenv("FILEBASE_SECRET_ACCESS_KEY") or "").strip()
FILEBASE_BUCKET = (os.getenv("FILEBASE_BUCKET") or "").strip()
FILEBASE_REGION = (os.getenv("FILEBASE_REGION") or "us-east-1").strip()


def _upload_via_filebase(file_bytes: bytes, filename: str, mime_type: str) -> str:
    if not (FILEBASE_ACCESS_KEY_ID and FILEBASE_SECRET_ACCESS_KEY and FILEBASE_BUCKET):
        raise RuntimeError(
            "Missing Filebase configuration: set FILEBASE_ACCESS_KEY_ID, FILEBASE_SECRET_ACCESS_KEY, FILEBASE_BUCKET"
        )

    key = filename or f"upload-{uuid.uuid4().hex}"
    session = boto3.session.Session()
    s3 = session.client(
        service_name="s3",
        endpoint_url=FILEBASE_ENDPOINT,
        aws_access_key_id=FILEBASE_ACCESS_KEY_ID,
        aws_secret_access_key=FILEBASE_SECRET_ACCESS_KEY,
        region_name=FILEBASE_REGION,
        config=Config(signature_version="s3v4"),
    )

    s3.put_object(Bucket=FILEBASE_BUCKET, Key=key, Body=file_bytes, ContentType=mime_type)
    head = s3.head_object(Bucket=FILEBASE_BUCKET, Key=key)
    headers = head.get("ResponseMetadata", {}).get("HTTPHeaders", {})
    cid = headers.get("x-amz-meta-cid")
    if not cid:
        raise RuntimeError("Filebase did not return CID in headers; verify bucket is IPFS-enabled")
    return cid


def upload_file_to_nft_storage(file_bytes: bytes, filename: str, mime_type: str) -> str:
    """Upload file to Filebase and return IPFS CID.

    The function name is kept for compatibility with existing imports.
    """
    return _upload_via_filebase(file_bytes, filename, mime_type)