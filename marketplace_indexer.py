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
CHAIN_ID = int(os.getenv("MARKETPLACE_CHAIN_ID", "11155111"))
DEFAULT_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000dEaD00"
MARKETPLACE_ADDRESS = os.getenv("MARKETPLACE_CONTRACT_ADDRESS", DEFAULT_CONTRACT_ADDRESS).strip()

# New Multi-chain Configuration
INDEXED_CHAINS = [
    {
        "chain_id": 11155111,
        "name": "sepolia",
        "rpc_url": os.getenv("SEPOLIA_RPC_URL", "https://sepolia.infura.io/v3/YOUR_INFURA_KEY"),
        "marketplace": os.getenv("SEPOLIA_MARKETPLACE", "0xD089b7B482523405b026DF2a5caD007093252b15"),
    },
    {
        "chain_id": 84532,
        "name": "base-sepolia",
        "rpc_url": os.getenv("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org"),
        "marketplace": os.getenv("BASE_SEPOLIA_MARKETPLACE", "0x67d374fCE79f6F0Ad297b643792733a513735a54"),
    }
]

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
    chain_id: int
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


@lru_cache(maxsize=10)
def web3_client(rpc_url: str) -> Web3:
    """
    Lazily-initialized Web3 client for a specific RPC URL.
    """
    return Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 10}))


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
    If content is not JSON, return None.
    """
    if not ipfs_url:
        return None
    
    https_url = ipfs_to_https(ipfs_url)
    if not https_url:
        return None
    
    try:
        response = requests.get(https_url, timeout=timeout)
        response.raise_for_status()

        # Only try JSON if content-type is application/json
        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            logger.warning(f"IPFS content is not JSON: {https_url} (content-type={content_type})")
            return None

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
        # Find the RPC URL for this listing's chain
        chain_cfg = next((c for c in INDEXED_CHAINS if c["chain_id"] == listing.chain_id), None)
        if not chain_cfg:
            logger.warning(f"No config found for chain_id {listing.chain_id}")
            return listing
            
        w3 = web3_client(chain_cfg["rpc_url"])
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
        logger.warning(f"Failed to enrich listing {listing.token_id} on chain {listing.chain_id}: {exc}")
    
    return listing


def simulate_event_stream(chain_id: int) -> Iterable[dict]:
    """
    Pretend to fetch events for a specific chain and yield structured event data.
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
    ]
    
    # Add a chain-specific mock item
    if chain_id == 84532: # Base Sepolia
        mock_data.append({
            "tokenId": 100,
            "nftAddress": "0x6B15359C8dF1Cf4F6C3cB51d0788fED2A4B6aD9a",
            "priceEth": 0.01,
            "seller": "0xcccccccccccccccccccccccccccccccccccccccc",
        })

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

    for evt in base_listing_events:
        yield evt


def validate_chain_configuration(chain_cfg: dict) -> None:
    """
    Ensure that when USE_MOCK_EVENTS is disabled we have sane on-chain settings
    for a specific chain configuration.
    """
    rpc_url = chain_cfg.get("rpc_url")
    marketplace_address = chain_cfg.get("marketplace")
    chain_name = chain_cfg.get("name", "unknown")

    # RPC URL checks
    if not rpc_url:
        raise ValueError(f"RPC URL for {chain_name} is empty.")
    
    if "YOUR_INFURA_KEY" in rpc_url:
        raise ValueError(f"RPC URL for {chain_name} still uses placeholder YOUR_INFURA_KEY.")

    # Contract address checks
    if not marketplace_address:
        raise ValueError(f"Marketplace address for {chain_name} is empty.")
    
    if marketplace_address == DEFAULT_CONTRACT_ADDRESS:
        raise ValueError(f"Marketplace address for {chain_name} is still placeholder.")

    try:
        Web3.to_checksum_address(marketplace_address)
    except (InvalidAddress, ValueError) as exc:
        raise ValueError(
            f"Marketplace address '{marketplace_address}' for {chain_name} is invalid."
        ) from exc


def fetch_contract_events(chain_cfg: dict) -> List[dict]:
    rpc_url = chain_cfg["rpc_url"]
    marketplace_address = chain_cfg["marketplace"]
    
    w3 = web3_client(rpc_url)
    try:
        contract = w3.eth.contract(address=checksum(marketplace_address), abi=MARKETPLACE_ABI)
        latest = w3.eth.block_number
    except Exception as exc:
        raise RuntimeError(
            f"Failed to connect to chain {chain_cfg['name']} at {rpc_url} or load marketplace contract {marketplace_address}. "
            "Double-check configuration or re-enable USE_MOCK_EVENTS."
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


def process_events(events: Iterable[dict], chain_id: int) -> None:
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
                    chain_id=chain_id,
                    price_eth=wei_to_eth_str(price_wei),
                    price_wei=str(price_wei),
                    seller_address=event.get("seller") or "",
                    is_sold=0,
                )
            case "ListingSold":
                mark_listing_sold_record(token_id=event["tokenId"], nft_address=normalized_address, chain_id=chain_id)


def run_indexer() -> None:
    """
    Public entrypoint that can be called during FastAPI startup or manually.
    Indexes all configured chains.
    """

    init_db()
    reset_listings_table()

    for chain_cfg in INDEXED_CHAINS:
        chain_name = chain_cfg["name"]
        chain_id = chain_cfg["chain_id"]
        
        if USE_MOCK_EVENTS:
            logger.info(f"USE_MOCK_EVENTS=true — seeding mock listings for {chain_name} ({chain_id})")
            events = simulate_event_stream(chain_id)
        else:
            try:
                validate_chain_configuration(chain_cfg)
                logger.info(f"Indexing chain: {chain_name} (id: {chain_id}, rpc: {chain_cfg['rpc_url']})")
                events = fetch_contract_events(chain_cfg)
            except Exception as exc:
                logger.error(f"Failed to index chain {chain_name}: {exc}")
                continue
        
        process_events(events, chain_id)


def get_active_listings() -> List[Listing]:
    init_db()
    rows = fetch_active_listing_rows()
    listings: List[Listing] = []
    for row in rows:

        # Helper function to safely get optional columns (for backward compatibility with old DB schemas)
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
                    chain_id=listing.chain_id,
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

