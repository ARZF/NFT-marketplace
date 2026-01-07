"""
Shared FastAPI application factory used for local dev (uvicorn) and Vercel.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from api.nft import router as nft_router
from api.auction import router as auction_router
import os
from pathlib import Path
import json


from marketplace_indexer import get_active_listings, run_indexer, wei_to_eth_str
from db import fetch_all_listing_rows, upsert_listing_record, fetch_collections, fetch_listings_by_collection
from marketplace_indexer import checksum, Listing
from fastapi import HTTPException


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

    @app.post("/api/listings/add")
    async def add_listing(request: Request) -> dict:
        """
        Directly add a listing to the database without resetting the table.
        Used after minting to immediately show the new listing.
        """
        try:
            # Parse request body
            try:
                body = await request.json()
            except Exception as json_error:
                raise HTTPException(status_code=400, detail=f"Invalid JSON in request body: {str(json_error)}")
            
            # Extract parameters from request body
            token_id = body.get("token_id")
            nft_address = body.get("nft_address")
            chain_id = body.get("chain_id")
            price_wei = body.get("price_wei")
            seller_address = body.get("seller_address")
            name = body.get("name")
            description = body.get("description")
            image_url = body.get("image_url")
            token_uri = body.get("token_uri")
            collection = body.get("collection")
            
            # Validate required fields
            missing_fields = []
            if token_id is None:
                missing_fields.append("token_id")
            if not nft_address:
                missing_fields.append("nft_address")
            if chain_id is None:
                missing_fields.append("chain_id")
            if not price_wei:
                missing_fields.append("price_wei")
            if not seller_address:
                missing_fields.append("seller_address")
            
            if missing_fields:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required fields: {', '.join(missing_fields)}"
                )
            
            # Convert price_wei to price_eth
            price_wei_int = int(price_wei)
            price_eth = wei_to_eth_str(price_wei_int)
            
            # Normalize addresses
            nft_address_normalized = checksum(nft_address)
            seller_address_normalized = checksum(seller_address) if seller_address else ""
            
            # Add listing to database
            upsert_listing_record(
                token_id=int(token_id),
                nft_address=nft_address_normalized,
                chain_id=int(chain_id),
                price_eth=price_eth,
                price_wei=str(price_wei_int),
                seller_address=seller_address_normalized,
                is_sold=0,
                name=name,
                description=description,
                image_url=image_url,
                token_uri=token_uri,
                collection=collection,
            )
            
            return {
                "ok": True,
                "message": "Listing added successfully",
                "token_id": token_id,
                "nft_address": nft_address_normalized,
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    @app.get("/api/config")
    def config() -> dict:
        return {
            "marketplaceAddress": os.getenv("MARKETPLACE_CONTRACT_ADDRESS", "").strip(),
            "nftContractAddress": os.getenv("NFT_CONTRACT_ADDRESS", "").strip(),
            "assetStorageProvider": os.getenv("ASSET_STORAGE_PROVIDER", "nftstorage").strip().lower(),
        }

    @app.get("/api/activity")
    def get_activity() -> list[dict]:
        """
        Return activity feed with mint, list, and sold events.
        Each listing represents a 'list' event. If sold, it also represents a 'sold' event.
        We infer 'mint' events from the first listing of each unique token.
        """
        rows = fetch_all_listing_rows()
        activities = []
        minted_tokens = set()  # Track tokens that have already been minted
        
        for row in rows:
            # Helper function to safely get optional columns
            def safe_get(key):
                try:
                    return row[key]
                except (KeyError, IndexError):
                    return None
            
            token_id = int(row["token_id"])
            nft_address = checksum(row["nft_address"])
            chain_id = int(row["chain_id"])
            is_sold = bool(row["is_sold"])
            token_key = (token_id, nft_address, chain_id)
            
            # Create mint activity only for the first occurrence of each token
            if token_key not in minted_tokens:
                mint_activity = {
                    "id": f"mint-{token_id}-{nft_address}-{chain_id}",
                    "event_type": "mint",
                    "token_id": token_id,
                    "nft_address": nft_address,
                    "chain_id": chain_id,
                    "owner_address": row["seller_address"],  # First owner is the minter
                    "name": safe_get("name") or f"Token #{token_id}",
                    "description": safe_get("description"),
                    "image_url": safe_get("image_url"),
                    "token_uri": safe_get("token_uri"),
                    "collection": safe_get("collection"),
                    "order": row["id"] - 0.5,  # Mint events come before list events
                }
                activities.append(mint_activity)
                minted_tokens.add(token_key)
            
            # Create list activity
            list_activity = {
                "id": f"list-{row['id']}",
                "event_type": "list",
                "token_id": token_id,
                "nft_address": nft_address,
                "chain_id": chain_id,
                "price_eth": row["price_eth"],
                "price_wei": row["price_wei"],
                "seller_address": row["seller_address"],
                "name": safe_get("name") or f"Token #{token_id}",
                "description": safe_get("description"),
                "image_url": safe_get("image_url"),
                "token_uri": safe_get("token_uri"),
                "collection": safe_get("collection"),
                "order": row["id"],  # For sorting
            }
            activities.append(list_activity)
            
            # If sold, also create a sold activity
            if is_sold:
                sold_activity = {
                    "id": f"sold-{row['id']}",
                    "event_type": "sold",
                    "token_id": token_id,
                    "nft_address": nft_address,
                    "chain_id": chain_id,
                    "price_eth": row["price_eth"],
                    "price_wei": row["price_wei"],
                    "seller_address": row["seller_address"],
                    "name": safe_get("name") or f"Token #{token_id}",
                    "description": safe_get("description"),
                    "image_url": safe_get("image_url"),
                    "token_uri": safe_get("token_uri"),
                    "collection": safe_get("collection"),
                    "order": row["id"] + 0.5,  # Sold events come after list events
                }
                activities.append(sold_activity)
        
        # Sort by order (mint -> list -> sold for same token)
        activities.sort(key=lambda x: x["order"], reverse=True)
        
        return activities

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

    @app.get("/nft-detail.html", include_in_schema=False)
    async def nft_detail_page() -> FileResponse:
        """
        Return the NFT detail page.
        """
        return FileResponse(str(Path(__file__).parent / "nft-detail.html"))
    
    @app.get("/swap.html", include_in_schema=False)
    async def swap_page() -> FileResponse:
        """
        Return the standalone swap page.
        """
        return FileResponse(str(Path(__file__).parent / "swap.html"))

    @app.get("/activity.html", include_in_schema=False)
    async def activity_page() -> FileResponse:
        """
        Return the activity page.
        """
        return FileResponse(str(Path(__file__).parent / "activity.html"))

    @app.get("/collections.html", include_in_schema=False)
    async def collections_page() -> FileResponse:
        """
        Return the collections page.
        """
        return FileResponse(str(Path(__file__).parent / "collections.html"))

    @app.get("/api/collections")
    def get_collections() -> list[dict]:
        """
        Return all unique collections with their NFT counts.
        """
        return fetch_collections()

    @app.get("/api/collections/{collection_name}")
    def get_collection_nfts(collection_name: str) -> list[dict]:
        """
        Return all active NFTs in a specific collection.
        """
        rows = fetch_listings_by_collection(collection_name)
        listings = []
        for row in rows:
            def safe_get(key):
                try:
                    return row[key]
                except (KeyError, IndexError):
                    return None
            
            listing = Listing(
                token_id=int(row["token_id"]),
                nft_address=checksum(row["nft_address"]),
                chain_id=int(row["chain_id"]),
                price_eth=row["price_eth"],
                price_wei=row["price_wei"],
                seller_address=row["seller_address"],
                is_sold=bool(row["is_sold"]),
                name=safe_get("name"),
                description=safe_get("description"),
                image_url=safe_get("image_url"),
                token_uri=safe_get("token_uri"),
                collection=safe_get("collection"),
            )
            listings.append(listing)
        return [listing.to_dict() for listing in listings]

    app.include_router(nft_router)
    app.include_router(auction_router)
    
    return app

