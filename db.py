from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Optional
import time


DB_PATH_SETTING = os.getenv("MARKETPLACE_DB_PATH", "marketplace.db")
_IS_MEMORY_DB = DB_PATH_SETTING.strip() == ":memory:"
_DB_PATH = DB_PATH_SETTING if _IS_MEMORY_DB else str(Path(DB_PATH_SETTING).expanduser())

_connection: sqlite3.Connection | None = None
_is_initialized = False


def _ensure_parent_directory() -> None:
    if _IS_MEMORY_DB:
        return
    Path(_DB_PATH).parent.mkdir(parents=True, exist_ok=True)


def get_connection() -> sqlite3.Connection:
    global _connection
    if _connection is None:
        _ensure_parent_directory()
        _connection = sqlite3.connect(_DB_PATH, check_same_thread=False)
        _connection.row_factory = sqlite3.Row
    return _connection


def init_db() -> None:
    global _is_initialized
    if _is_initialized:
        return
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_id INTEGER NOT NULL,
            nft_address TEXT NOT NULL,
            chain_id INTEGER NOT NULL DEFAULT 11155111,
            price_eth TEXT NOT NULL,
            price_wei TEXT NOT NULL,
            seller_address TEXT NOT NULL,
            is_sold INTEGER NOT NULL DEFAULT 0,
            name TEXT,
            description TEXT,
            image_url TEXT,
            token_uri TEXT,
            UNIQUE (token_id, nft_address, chain_id)
        );
        """
    )
    # Add metadata columns if they don't exist (for existing databases)
    try:
        conn.execute("ALTER TABLE listings ADD COLUMN name TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    try:
        conn.execute("ALTER TABLE listings ADD COLUMN description TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    try:
        conn.execute("ALTER TABLE listings ADD COLUMN image_url TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    try:
        conn.execute("ALTER TABLE listings ADD COLUMN token_uri TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    try:
        conn.execute("ALTER TABLE listings ADD COLUMN chain_id INTEGER NOT NULL DEFAULT 11155111")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE listings ADD COLUMN collection TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    conn.commit()
    _is_initialized = True

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS auctions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_id INTEGER NOT NULL,
            nft_address TEXT NOT NULL,
            chain_id INTEGER NOT NULL DEFAULT 11155111,
            seller_address TEXT NOT NULL,
            start_price_wei TEXT NOT NULL,
            current_bid_wei TEXT,
            current_bidder_address TEXT,
            start_time INTEGER NOT NULL,
            end_time INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            UNIQUE (token_id, nft_address, chain_id)
        );
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS bids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auction_id INTEGER NOT NULL,
            bidder_address TEXT NOT NULL,
            bid_amount_wei TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (auction_id) REFERENCES auctions(id)
        );
        """
    )


def reset_listings_table() -> None:
    init_db()
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM listings")


def upsert_listing_record(
    *,
    token_id: int,
    nft_address: str,
    chain_id: int = 11155111,
    price_eth: str,
    price_wei: str,
    seller_address: str,
    is_sold: int = 0,
    name: Optional[str] = None,
    description: Optional[str] = None,
    image_url: Optional[str] = None,
    token_uri: Optional[str] = None,
    collection: Optional[str] = None,
) -> None:
    init_db()
    conn = get_connection()
    with conn:
        conn.execute(
            """
            INSERT INTO listings (token_id, nft_address, chain_id, price_eth, price_wei, seller_address, is_sold, name, description, image_url, token_uri, collection)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(token_id, nft_address, chain_id) DO UPDATE SET
                price_eth=excluded.price_eth,
                price_wei=excluded.price_wei,
                seller_address=excluded.seller_address,
                is_sold=excluded.is_sold,
                name=COALESCE(excluded.name, listings.name),
                description=COALESCE(excluded.description, listings.description),
                image_url=COALESCE(excluded.image_url, listings.image_url),
                token_uri=COALESCE(excluded.token_uri, listings.token_uri),
                collection=COALESCE(excluded.collection, listings.collection);
            """,
            (token_id, nft_address, chain_id, price_eth, price_wei, seller_address, is_sold, name, description, image_url, token_uri, collection),
        )


def mark_listing_sold_record(*, token_id: int, nft_address: str, chain_id: int = 11155111) -> None:
    init_db()
    conn = get_connection()
    with conn:
        conn.execute(
            """
            UPDATE listings
            SET is_sold = 1
            WHERE token_id = ? AND nft_address = ? AND chain_id = ?;
            """,
            (token_id, nft_address, chain_id),
        )


def fetch_active_listing_rows() -> list[sqlite3.Row]:
    init_db()
    conn = get_connection()
    cursor = conn.execute(
        """
        SELECT token_id, nft_address, chain_id, price_eth, price_wei, seller_address, is_sold, name, description, image_url, token_uri, collection
        FROM listings
        WHERE is_sold = 0
        ORDER BY id DESC;
        """
    )
    return cursor.fetchall()


def fetch_all_listing_rows() -> list[sqlite3.Row]:
    """
    Fetch all listings including sold ones, ordered by id DESC (newest first).
    Used for activity tracking.
    """
    init_db()
    conn = get_connection()
    cursor = conn.execute(
        """
        SELECT id, token_id, nft_address, chain_id, price_eth, price_wei, seller_address, is_sold, name, description, image_url, token_uri, collection
        FROM listings
        ORDER BY id DESC;
        """
    )
    return cursor.fetchall()


def fetch_collections() -> list[dict]:
    """
    Fetch all unique collections with their count of active NFTs.
    Returns a list of dictionaries with collection name and count.
    """
    init_db()
    conn = get_connection()
    cursor = conn.execute(
        """
        SELECT 
            collection,
            COUNT(*) as nft_count,
            MIN(image_url) as preview_image
        FROM listings
        WHERE is_sold = 0 AND collection IS NOT NULL AND collection != ''
        GROUP BY collection
        ORDER BY nft_count DESC, collection ASC;
        """
    )
    rows = cursor.fetchall()
    return [
        {
            "name": row["collection"],
            "nft_count": row["nft_count"],
            "preview_image": row["preview_image"],
        }
        for row in rows
    ]


def fetch_listings_by_collection(collection: str) -> list[sqlite3.Row]:
    """
    Fetch active listings for a specific collection.
    """
    init_db()
    conn = get_connection()
    cursor = conn.execute(
        """
        SELECT token_id, nft_address, chain_id, price_eth, price_wei, seller_address, is_sold, name, description, image_url, token_uri, collection
        FROM listings
        WHERE is_sold = 0 AND collection = ?
        ORDER BY id DESC;
        """,
        (collection,),
    )
    return cursor.fetchall()


def create_auction(
    *,
    token_id: int,
    nft_address: str,
    seller_address: str,
    start_price_wei: str,
    start_time: int,
    end_time: int,
    chain_id: int ,
):
    init_db()
    conn = get_connection()
    with conn:
        conn.execute(
            """
            INSERT INTO auctions (
                token_id, nft_address, chain_id,
                seller_address, start_price_wei,
                start_time, end_time
            )
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (
                token_id,
                nft_address,
                chain_id,
                seller_address,
                start_price_wei,
                start_time,
                end_time,
            ),
        )





def place_bid(
    *,
    auction_id: int,
    bidder_address: str,
    bid_amount_wei: str,
):
    init_db()
    conn = get_connection()

    auction = conn.execute(
        "SELECT * FROM auctions WHERE id = ?",
        (auction_id,),
    ).fetchone()

    if not auction:
        raise ValueError("Auction not found")

    now = int(time.time())

    if auction["status"] != "ACTIVE":
        raise ValueError("Auction not active")

    if now > auction["end_time"]:
        raise ValueError("Auction already ended")

    current = auction["current_bid_wei"] or auction["start_price_wei"]

    if int(bid_amount_wei) <= int(current):
        raise ValueError("Bid too low")

    with conn:
        # insert bid
        conn.execute(
            """
            INSERT INTO bids (auction_id, bidder_address, bid_amount_wei, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (auction_id, bidder_address, bid_amount_wei, now),
        )

        # update auction
        conn.execute(
            """
            UPDATE auctions
            SET current_bid_wei = ?, current_bidder_address = ?
            WHERE id = ?
            """,
            (bid_amount_wei, bidder_address, auction_id),
        )

def fetch_active_auctions() -> list[sqlite3.Row]:
    init_db()
    conn = get_connection()
    cursor = conn.execute(
        """
        SELECT *
        FROM auctions
        WHERE status = 'ACTIVE'
        ORDER BY end_time ASC;
        """
    )
    return cursor.fetchall()

def end_expired_auctions():
    init_db()
    conn = get_connection()
    now = int(time.time())

    with conn:
        conn.execute(
            """
            UPDATE auctions
            SET status = 'ENDED'
            WHERE status = 'ACTIVE' AND end_time < ?
            """,
            (now,),
        )
