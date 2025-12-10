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

    # Serve the static frontend (index.html and any related assets).
    # Prefer a Next.js static export/build if present (e.g. `nextjs/out` or `nextjs/dist`).
    frontend_candidates = [
        Path(__file__).parent / "nextjs" / "out",
        Path(__file__).parent / "nextjs" / "dist",
    ]
    frontend_dist: Path | None = None
    for candidate in frontend_candidates:
        if candidate.exists():
            frontend_dist = candidate
            break

    if frontend_dist is not None:
        # Serve static files from the Next.js build directory under `/static`.
        app.mount("/static", StaticFiles(directory=str(frontend_dist), html=True), name="static")
    
    @app.get("/", include_in_schema=False)
    async def root_index() -> FileResponse:
        """
        Return the main HTML page so the Railway web URL shows the UI.
        """

        if frontend_dist is not None:
            frontend_index = frontend_dist / "index.html"
            if frontend_index.exists():
                return FileResponse(str(frontend_index))

        # Fallback to repository root index.html (legacy):
        return FileResponse(str(Path(__file__).parent / "index.html"))

    public_dir = Path(__file__).parent / "public"
    if public_dir.exists():
        app.mount("/public", StaticFiles(directory=str(public_dir)), name="public")

    
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

    @app.get("/mint.html", include_in_schema=False)
    async def mint_form_page() -> FileResponse:
        """
        Return the standalone mint form page.
        """
        return FileResponse(str(Path(__file__).parent / "mint.html"))

    @app.get("/about-us.html", include_in_schema=False)
    async def about_us_page() -> FileResponse:
        """
        Return the standalone about us page.
        """
        return FileResponse(str(Path(__file__).parent / "about-us.html"))

    @app.get("/contact-us.html", include_in_schema=False)
    async def contact_us_page() -> FileResponse:
        """
        Return the standalone contact us page.
        """
        return FileResponse(str(Path(__file__).parent / "contact-us.html"))

    
    app.include_router(nft_router)
    
    return app

