"""
NFT Marketplace indexer with optional live-chain reads plus a mock fallback.
"""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from decimal import Decimal
from functools import lru_cache
from typing import Dict, Iterable, List, Literal, TypedDict

from web3 import Web3
from web3.contract.contract import ContractEvent


DEFAULT_RPC_URL = "https://sepolia.infura.io/v3/YOUR_INFURA_KEY"
RPC_URL = os.getenv("MARKETPLACE_RPC_URL", DEFAULT_RPC_URL)
DEFAULT_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000dEaD00"
MARKETPLACE_ADDRESS = os.getenv("MARKETPLACE_CONTRACT_ADDRESS", DEFAULT_CONTRACT_ADDRESS)
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

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)


IN_MEMORY_LISTINGS: Dict[str, Listing] = {}


def checksum(address: str) -> str:
    try:
        return Web3.to_checksum_address(address)
    except ValueError:
        return address


@lru_cache(maxsize=1)
def web3_client() -> Web3:
    return Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 10}))


def wei_to_eth_str(value_wei: int) -> str:
    eth_value = Decimal(Web3.from_wei(value_wei, "ether"))
    normalized = eth_value.normalize()
    text = format(normalized, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


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


def fetch_contract_events(w3: Web3) -> List[dict]:
    contract = w3.eth.contract(address=checksum(MARKETPLACE_ADDRESS), abi=MARKETPLACE_ABI)
    latest = w3.eth.block_number
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
        key = f"{event['nftAddress'].lower()}::{event['tokenId']}"
        match event["event"]:
            case "ListingCreated":
                if event.get("priceWei") is None:
                    continue
                price_wei = int(event["priceWei"])
                IN_MEMORY_LISTINGS[key] = Listing(
                    token_id=event["tokenId"],
                    nft_address=event["nftAddress"],
                    price_eth=wei_to_eth_str(price_wei),
                    price_wei=str(price_wei),
                    seller_address=event["seller"] or "",
                )
            case "ListingSold":
                listing = IN_MEMORY_LISTINGS.get(key)
                if listing:
                    listing.is_sold = True


def run_indexer() -> None:
    """
    Public entrypoint that can be called during FastAPI startup or manually.
    """

    IN_MEMORY_LISTINGS.clear()
    if USE_MOCK_EVENTS:
        events = simulate_event_stream()
    else:
        events = fetch_contract_events(web3_client())
    process_events(events)


def get_active_listings() -> List[Listing]:
    return [listing for listing in IN_MEMORY_LISTINGS.values() if not listing.is_sold]


def reset_index() -> None:
    IN_MEMORY_LISTINGS.clear()

