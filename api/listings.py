import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from marketplace_indexer import get_active_listings, run_indexer


def set_common_headers(handler: BaseHTTPRequestHandler) -> None:
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")


def respond(handler: BaseHTTPRequestHandler, status: HTTPStatus, body: object) -> None:
    handler.send_response(status)
    set_common_headers(handler)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


class handler(BaseHTTPRequestHandler):  # Vercel looks for this class name
    def do_OPTIONS(self) -> None:  # pragma: no cover - exercised by browsers
        self.send_response(HTTPStatus.NO_CONTENT)
        set_common_headers(self)
        self.end_headers()

    def do_GET(self) -> None:
        run_indexer()
        listings = [listing.to_dict() for listing in get_active_listings()]
        respond(self, HTTPStatus.OK, listings)

