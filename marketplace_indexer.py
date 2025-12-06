"""
NFT Marketplace indexer with optional live-chain reads plus a mock fallback.
"""

from __future__ import annotations

import logging
import os
import requests
from dataclasses import asdict, dataclass
from decimal import Decimal
from functools import lru_cache
from typing import Dict, Iterable, List, Literal, TypedDict, Optional

from web3 import Web3
from web3.contract.contract import ContractEvent
from web3.exceptions import InvalidAddress

from db import (
    fetch_active_listing_rows,
    init_db,
    mark_listing_sold_record,
    reset_listings_table,
    upsert_listing_record,
)

logger = logging.getLogger(__name__)

DEFAULT_RPC_URL = "https://sepolia.infura.io/v3/YOUR_INFURA_KEY"
RPC_URL = os.getenv("MARKETPLACE_RPC_URL", DEFAULT_RPC_URL).strip()
DEFAULT_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000dEaD00"
MARKETPLACE_ADDRESS = os.getenv("MARKETPLACE_CONTRACT_ADDRESS", DEFAULT_CONTRACT_ADDRESS).strip()
USE_MOCK_EVENTS = os.getenv("USE_MOCK_EVENTS", "true").lower() in {"true", "1", "yes"}
BLOCK_LOOKBACK = int(os.getenv("BLOCK_LOOKBACK", "10000"))

MARKETPLACE_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "internalType": "address", "name": "seller", "type": "address"},
            {"indexed": True, "internalType": "address", "name": "nft", "type": "address"},
            {"indexed": False, "internalType": "uint256", "name": "tokenId", "type": "uint256"},
            {"indexed": False, "internalType": "uint256", "name": "price", "type": "uint256"},
        ],
        "name": "ListingCreated",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "internalType": "address", "name": "buyer", "type": "address"},
            {"indexed": True, "internalType": "address", "name": "nft", "type": "address"},
            {"indexed": False, "internalType": "uint256", "name": "tokenId", "type": "uint256"},
        ],
        "name": "ListingSold",
        "type": "event",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "nftAddress", "type": "address"},
            {"internalType": "uint256", "name": "tokenId", "type": "uint256"},
        ],
        "name": "buyItem",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function",
    },
]

# NFT ABI for tokenURI function (standard ERC721)
NFT_ABI = [
    {
        "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
        "name": "tokenURI",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    }
]


class ListingCreatedEvent(TypedDict):
    event: Literal["ListingCreated"]
    tokenId: int
    nftAddress: str
    priceWei: int
    seller: str


class ListingSoldEvent(TypedDict):
    event: Literal["ListingSold"]
    tokenId: int
    nftAddress: str
    buyer: str


@dataclass
class Listing:
    token_id: int
    nft_address: str
    price_eth: str
    price_wei: str
    seller_address: str
    is_sold: bool = False
    # Metadata fields
    name: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    token_uri: Optional[str] = None

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)


def checksum(address: str) -> str:
    try:
        return Web3.to_checksum_address(address)
    except ValueError:
        return address


def normalize_address(address: str) -> str:
    return address.lower()


@lru_cache(maxsize=1)
def web3_client() -> Web3:
    """
    Lazily-initialized Web3 client.

    NOTE: Validation of RPC URL and contract address is performed in
    `validate_chain_configuration` which is called from `run_indexer` before
    we ever construct the client for live-chain reads.
    """
    return Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 10}))


def wei_to_eth_str(value_wei: int) -> str:
    eth_value = Decimal(Web3.from_wei(value_wei, "ether"))
    normalized = eth_value.normalize()
    text = format(normalized, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def ipfs_to_https(ipfs_url: str) -> str:
    """
    Convert IPFS URL to HTTPS gateway URL.
    Supports both ipfs:// and https://ipfs.io formats.
    """
    if not ipfs_url:
        return ""
    
    # Handle ipfs:// protocol
    if ipfs_url.startswith("ipfs://"):
        cid = ipfs_url.replace("ipfs://", "").strip("/")
        # Use IPFS.io gateway (can add fallbacks if needed)
        return f"https://ipfs.io/ipfs/{cid}"
    
    # Already HTTPS or other format
    return ipfs_url


def fetch_ipfs_json(ipfs_url: str, timeout: int = 10) -> Optional[Dict]:
    """
    Fetch and parse JSON metadata from IPFS.
    """
    if not ipfs_url:
        return None
    
    https_url = ipfs_to_https(ipfs_url)
    if not https_url:
        return None
    
    try:
        response = requests.get(https_url, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        logger.warning(f"Failed to fetch IPFS metadata from {https_url}: {exc}")
        return None


def fetch_token_uri(w3: Web3, nft_address: str, token_id: int) -> Optional[str]:
    """
    Fetch tokenURI from NFT contract.
    """
    try:
        nft_contract = w3.eth.contract(address=checksum(nft_address), abi=NFT_ABI)
        token_uri = nft_contract.functions.tokenURI(token_id).call()
        return token_uri if token_uri else None
    except Exception as exc:
        logger.warning(f"Failed to fetch tokenURI for {nft_address}#{token_id}: {exc}")
        return None


def enrich_listing_with_metadata(listing: Listing) -> Listing:
    """
    Fetch and enrich a listing with NFT metadata from IPFS.
    """
    # Only fetch if we don't already have metadata
    if listing.name and listing.image_url:
        return listing
    
    # Skip if we can't connect to chain (mock mode)
    if USE_MOCK_EVENTS:
        # In mock mode, we can't fetch real tokenURI, so return as-is
        return listing
    
    try:
        w3 = web3_client()
        token_uri = fetch_token_uri(w3, listing.nft_address, listing.token_id)
        
        if not token_uri:
            return listing
        
        listing.token_uri = token_uri
        metadata = fetch_ipfs_json(token_uri)
        
        if metadata:
            listing.name = metadata.get("name", f"Token #{listing.token_id}")
            listing.description = metadata.get("description", "")
            
            # Handle image field - could be IPFS URL or HTTPS
            image = metadata.get("image", "")
            if image:
                listing.image_url = ipfs_to_https(image)
        
    except Exception as exc:
        logger.warning(f"Failed to enrich listing {listing.token_id}: {exc}")
    
    return listing


def simulate_event_stream() -> Iterable[dict]:
    """
    Pretend to fetch the last 10k blocks and yield structured event data.
    """

    mock_data = [
        {
            "tokenId": 1,
            "nftAddress": "0x1111111111111111111111111111111111111111",
            "priceEth": 0.25,
            "seller": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
            "tokenId": 2,
            "nftAddress": "0x2222222222222222222222222222222222222222",
            "priceEth": 1.5,
            "seller": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        {
            "tokenId": 3,
            "nftAddress": "0x3333333333333333333333333333333333333333",
            "priceEth": 0.05,
            "seller": "0xcccccccccccccccccccccccccccccccccccccccc",
        },
    ]
    base_listing_events: List[ListingCreatedEvent] = [
        {
            "event": "ListingCreated",
            "tokenId": entry["tokenId"],
            "nftAddress": entry["nftAddress"],
            "priceWei": Web3.to_wei(entry["priceEth"], "ether"),
            "seller": entry["seller"],
        }
        for entry in mock_data
    ]

    base_sale_events: List[ListingSoldEvent] = [
        {
            "event": "ListingSold",
            "tokenId": 2,
            "nftAddress": f"0x{2:040x}",
            "buyer": "0xdddddddddddddddddddddddddddddddddddddddd",
        }
    ]

    for evt in base_listing_events + base_sale_events:
        yield evt


def validate_chain_configuration() -> None:
    """
    Ensure that when USE_MOCK_EVENTS is disabled we have sane on-chain settings.

    This is aimed at better runtime errors on Railway / production where
    forgetting to set env vars can otherwise result in obscure Web3 failures.
    """

    # RPC URL checks
    if not RPC_URL:
        raise ValueError(
            "MARKETPLACE_RPC_URL is empty. Set a real HTTPS RPC endpoint or re-enable USE_MOCK_EVENTS."
        )
    if "YOUR_INFURA_KEY" in RPC_URL:
        raise ValueError(
            "MARKETPLACE_RPC_URL is still using the placeholder Infura URL. "
            "Replace YOUR_INFURA_KEY with a real project ID, or set USE_MOCK_EVENTS=true."
        )

    # Contract address checks
    if not MARKETPLACE_ADDRESS:
        raise ValueError(
            "MARKETPLACE_CONTRACT_ADDRESS is empty. Set it to your deployed marketplace contract address "
            "or re-enable USE_MOCK_EVENTS."
        )
    if MARKETPLACE_ADDRESS == DEFAULT_CONTRACT_ADDRESS:
        raise ValueError(
            "MARKETPLACE_CONTRACT_ADDRESS is still the dead placeholder address. "
            "Set it to your deployed marketplace contract address, or set USE_MOCK_EVENTS=true."
        )

    try:
        # This will raise InvalidAddress if the format is wrong.
        Web3.to_checksum_address(MARKETPLACE_ADDRESS)
    except (InvalidAddress, ValueError) as exc:  # web3 <-> py differences
        raise ValueError(
            f"MARKETPLACE_CONTRACT_ADDRESS '{MARKETPLACE_ADDRESS}' is not a valid Ethereum address. "
            "Expected a 0x-prefixed, 40-hex-character address."
        ) from exc


def fetch_contract_events(w3: Web3) -> List[dict]:
    try:
        contract = w3.eth.contract(address=checksum(MARKETPLACE_ADDRESS), abi=MARKETPLACE_ABI)
        latest = w3.eth.block_number
    except Exception as exc:  # pragma: no cover - defensive, type varies
        # Surface configuration / connectivity issues explicitly instead of
        # failing deep inside web3 with a less obvious stack trace.
        raise RuntimeError(
            "Failed to connect to Ethereum RPC or load marketplace contract. "
            f"RPC URL: '{RPC_URL}', contract: '{MARKETPLACE_ADDRESS}'. "
            "Double-check MARKETHPLACE_RPC_URL / MARKETPLACE_CONTRACT_ADDRESS or re-enable USE_MOCK_EVENTS."
        ) from exc
    from_block = max(latest - BLOCK_LOOKBACK, 0)

    def parse_logs(event: ContractEvent, event_name: str) -> List[dict]:
        logs = event.get_logs(fromBlock=from_block, toBlock="latest")
        parsed: List[dict] = []
        for log in logs:
            args = log["args"]
            parsed.append(
                {
                    "event": event_name,
                    "tokenId": int(args["tokenId"]),
                    "nftAddress": args["nft"],
                    "priceWei": int(args["price"]) if "price" in args else None,
                    "seller": args.get("seller"),
                    "buyer": args.get("buyer"),
                    "blockNumber": log["blockNumber"],
                    "logIndex": log["logIndex"],
                }
            )
        return parsed

    listings = parse_logs(contract.events.ListingCreated(), "ListingCreated")
    sales = parse_logs(contract.events.ListingSold(), "ListingSold")
    combined = [evt for evt in listings + sales if evt["tokenId"] is not None]
    combined.sort(key=lambda evt: (evt.get("blockNumber", 0), evt.get("logIndex", 0)))
    return combined


def process_events(events: Iterable[dict]) -> None:
    """
    Consume the events and mutate the in-memory listing book.
    """

    for event in events:
        normalized_address = normalize_address(event["nftAddress"])
        match event["event"]:
            case "ListingCreated":
                if event.get("priceWei") is None:
                    continue
                price_wei = int(event["priceWei"])
                upsert_listing_record(
                    token_id=event["tokenId"],
                    nft_address=normalized_address,
                    price_eth=wei_to_eth_str(price_wei),
                    price_wei=str(price_wei),
                    seller_address=event.get("seller") or "",
                    is_sold=0,
                )
            case "ListingSold":
                mark_listing_sold_record(token_id=event["tokenId"], nft_address=normalized_address)


def run_indexer() -> None:
    """
    Public entrypoint that can be called during FastAPI startup or manually.
    """

    init_db()
    reset_listings_table()

    if USE_MOCK_EVENTS:
        logger.info("USE_MOCK_EVENTS=true — seeding listings from built-in mock dataset.")
        events = simulate_event_stream()
    else:
        # Fail fast with a clear explanation if env vars are misconfigured.
        try:
            validate_chain_configuration()
        except ValueError as exc:
            logger.error("Live-chain indexing disabled due to invalid configuration: %s", exc)
            raise RuntimeError(
                f"Cannot run live-chain indexer: {exc}. "
                "Either fix the environment variables or set USE_MOCK_EVENTS=true."
            ) from exc

        logger.info(
            "USE_MOCK_EVENTS=false — fetching real events from chain. "
            "RPC URL: %s, contract: %s, lookback: %d blocks",
            RPC_URL,
            MARKETPLACE_ADDRESS,
            BLOCK_LOOKBACK,
        )
        events = fetch_contract_events(web3_client())
    process_events(events)


def get_active_listings() -> List[Listing]:
    init_db()
    rows = fetch_active_listing_rows()
    listings: List[Listing] = []
    for row in rows:
        listing = Listing(
            token_id=int(row["token_id"]),
            nft_address=checksum(row["nft_address"]),
            price_eth=row["price_eth"],
            price_wei=row["price_wei"],
            seller_address=row["seller_address"],
            is_sold=bool(row["is_sold"]),
            name=row.get("name"),
            description=row.get("description"),
            image_url=row.get("image_url"),
            token_uri=row.get("token_uri"),
        )
        # Only fetch if metadata is missing
        if not listing.name or not listing.image_url:
            listing = enrich_listing_with_metadata(listing)
            # Cache the metadata in database
            if listing.name or listing.image_url:
                from db import upsert_listing_record
                upsert_listing_record(
                    token_id=listing.token_id,
                    nft_address=listing.nft_address,
                    price_eth=listing.price_eth,
                    price_wei=listing.price_wei,
                    seller_address=listing.seller_address,
                    is_sold=1 if listing.is_sold else 0,
                    name=listing.name,
                    description=listing.description,
                    image_url=listing.image_url,
                    token_uri=listing.token_uri,
                )
        listings.append(listing)
    return listings


def reset_index() -> None:
    init_db()
    reset_listings_table()

