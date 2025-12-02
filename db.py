from __future__ import annotations

import os
import sqlite3
from pathlib import Path


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
            price_eth TEXT NOT NULL,
            price_wei TEXT NOT NULL,
            seller_address TEXT NOT NULL,
            is_sold INTEGER NOT NULL DEFAULT 0,
            UNIQUE (token_id, nft_address)
        );
        """
    )
    conn.commit()
    _is_initialized = True


def reset_listings_table() -> None:
    init_db()
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM listings")


def upsert_listing_record(
    *,
    token_id: int,
    nft_address: str,
    price_eth: str,
    price_wei: str,
    seller_address: str,
    is_sold: int = 0,
) -> None:
    init_db()
    conn = get_connection()
    with conn:
        conn.execute(
            """
            INSERT INTO listings (token_id, nft_address, price_eth, price_wei, seller_address, is_sold)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(token_id, nft_address) DO UPDATE SET
                price_eth=excluded.price_eth,
                price_wei=excluded.price_wei,
                seller_address=excluded.seller_address,
                is_sold=excluded.is_sold;
            """,
            (token_id, nft_address, price_eth, price_wei, seller_address, is_sold),
        )


def mark_listing_sold_record(*, token_id: int, nft_address: str) -> None:
    init_db()
    conn = get_connection()
    with conn:
        conn.execute(
            """
            UPDATE listings
            SET is_sold = 1
            WHERE token_id = ? AND nft_address = ?;
            """,
            (token_id, nft_address),
        )


def fetch_active_listing_rows() -> list[sqlite3.Row]:
    init_db()
    conn = get_connection()
    cursor = conn.execute(
        """
        SELECT token_id, nft_address, price_eth, price_wei, seller_address, is_sold
        FROM listings
        WHERE is_sold = 0
        ORDER BY id DESC;
        """
    )
    return cursor.fetchall()

