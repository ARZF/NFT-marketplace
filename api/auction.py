from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import time

from db import (
    create_auction,
    place_bid,
    fetch_active_auctions,
)

router = APIRouter(
    prefix="/api/auction",
    tags=["auction"],
)

class CreateAuctionRequest(BaseModel):
    token_id: int
    nft_address: str
    chain_id: int
    start_price_wei: str
    start_time: int
    end_time: int
    seller_address: str

@router.post("/")
def create_auction_endpoint(payload: CreateAuctionRequest):
    create_auction(
        token_id=payload.token_id,
        nft_address=payload.nft_address,
        chain_id=payload.chain_id,
        seller_address=payload.seller_address,
        start_price_wei=payload.start_price_wei,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    return {"status": "ok"}

class PlaceBidRequest(BaseModel):
    auction_id: int
    bid_amount_wei: str

@router.post("/bid")
def place_bid_endpoint(payload: PlaceBidRequest):
    try:
        place_bid(
            auction_id=payload.auction_id,
            bidder_address="0xTODO",
            bid_amount_wei=payload.bid_amount_wei,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"status": "bid placed"}

@router.get("/active")
def list_active_auctions():
    return fetch_active_auctions()
