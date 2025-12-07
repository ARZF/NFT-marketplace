"""
Shared FastAPI application factory used for local dev (uvicorn) and Vercel.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from api.nft import router as nft_router
import os
from pathlib import Path


from marketplace_indexer import get_active_listings, run_indexer


def create_app() -> FastAPI:
    app = FastAPI(title="Python NFT Marketplace", version="0.2.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Serve the static frontend (index.html and any related assets)
    # frontend_dist = Path(__file__).parent / "front-end" / "dist"
    # if frontend_dist.exists():
    app.mount("/static", StaticFiles(directory=".", html=False), name="static")
    
    @app.get("/", include_in_schema=False)
    async def root_index() -> FileResponse:
        """
        Return the main HTML page so the Railway web URL shows the UI.
        """
        # frontend_index = Path(__file__).parent / "front-end" / "dist" / "index.html"
        # if frontend_index.exists():
        #     return FileResponse(str(frontend_index))
        # Fallback if dist doesn't exist yet
        return FileResponse("index.html")
    
    @app.on_event("startup")
    async def startup_indexer() -> None:  # pragma: no cover - FastAPI lifecycle
        run_indexer()

    @app.get("/api/health")
    def healthcheck() -> dict:
        return {"status": "ok"}

    @app.get("/api/listings")
    def read_listings() -> list[dict]:
        return [listing.to_dict() for listing in get_active_listings()]

    @app.post("/api/reindex")
    def reindex() -> list[dict]:
        run_indexer()
        return [listing.to_dict() for listing in get_active_listings()]

    @app.get("/api/config")
    def config() -> dict:
        return {
            "marketplaceAddress": os.getenv("MARKETPLACE_CONTRACT_ADDRESS", "").strip(),
            "nftContractAddress": os.getenv("NFT_CONTRACT_ADDRESS", "").strip(),
            "assetStorageProvider": os.getenv("ASSET_STORAGE_PROVIDER", "nftstorage").strip().lower(),
        }

    app.include_router(nft_router)
    
    return app

