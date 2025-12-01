"""
Shared FastAPI application factory used for local dev (uvicorn) and Vercel.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

    @app.on_event("startup")
    async def startup_indexer() -> None:  # pragma: no cover - FastAPI lifecycle
        run_indexer()

    @app.get("/api/health")
    def healthcheck() -> dict:
        return {"status": "ok"}

    @app.get("/api/listings")
    def read_listings() -> list[dict]:
        return [listing.to_dict() for listing in get_active_listings()]

    return app

