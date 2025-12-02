# Python NFT Marketplace (Mock)

This repository demonstrates the backend-heavy architecture described in the project brief. It follows a simple split:

- `marketplace_indexer.py` handles Web3 connectivity, optional live-chain indexing, and a SQLite-backed order book.
- `app_factory.py` / `main.py` expose the API via FastAPI for local dev and deployment (e.g. Railway).
- `index.html` is a Tailwind + ethers.js UI that speaks to `/api/listings` and can trigger a real `buyItem` call through MetaMask.

## Local Development

```bash
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

Open `index.html` in a browser. When developing locally the page defaults to `http://localhost:8000` for API calls. You can override the backend origin by appending `?api=https://your-api-url` to the page URL.

## Environment Variables

Configure these locally (e.g. via `.env`) or inside your hosting provider’s environment variable settings.

| Variable | Description | Default |
| --- | --- | --- |
| `MARKETPLACE_RPC_URL` | HTTPS RPC endpoint (Infura, Alchemy, etc.) | Sepolia placeholder |
| `MARKETPLACE_CONTRACT_ADDRESS` | Deployed marketplace address | Dead address placeholder |
| `USE_MOCK_EVENTS` | `true` keeps using the static dataset, `false` pulls real events via `web3.py` | `true` |
| `BLOCK_LOOKBACK` | Number of blocks to scan when indexing | `10000` |

Set `USE_MOCK_EVENTS=false` plus a real RPC URL & contract address to turn on-chain reads on.

## Deploying to Railway

1. Install the [Railway CLI](https://docs.railway.app/develop/cli/installation) and run `railway login`.
2. From the project root run `railway init` (first time) and connect the repo to a Railway service.
3. Deploy with `railway up`. Railway will detect the `Dockerfile`, build the image, and launch `uvicorn main:app --host 0.0.0.0 --port $PORT`.
4. Inside the Railway dashboard, set the environment variables from the table above (plus anything contract-specific).

Troubleshooting tips:

- If you see `ModuleNotFoundError: No module named 'encodings'`, double-check that the Docker builder is selected. That error shows up when Railway tries to boot a partial Python runtime instead of the container defined here.
- Use `railway logs` to tail output. The FastAPI server binds to the injected `PORT`.

## Wallet & Chain Interaction

The frontend loads `ethers.js@6` and integrates with MetaMask (or any EIP‑1193 wallet):

1. Click **Connect Wallet** to trigger `eth_requestAccounts`.
2. Listings are fetched from `/api/listings`.
3. Press **Buy NFT** to call `buyItem(nftAddress, tokenId)` on the configured marketplace contract. The value field uses the price (in wei) supplied by the backend.
4. The UI waits for the transaction receipt before marking the NFT as sold.

## Architecture Notes

- Listings live in `IN_MEMORY_LISTINGS`. Swap for SQLite/Postgres once persistence is required.
- `marketplace_indexer.run_indexer()` can be scheduled (e.g. cron) or invoked on FastAPI startup/serverless request depending on the deployment target.
- Replace the placeholder ABI/address with your real contracts. The minimal ABI bundled here only includes the events and `buyItem` function needed for the MVP.

