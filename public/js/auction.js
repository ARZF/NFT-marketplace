// Auction page JavaScript

const LOCAL_API_FALLBACK = "http://localhost:8000";
const params = new URLSearchParams(window.location.search);
const manualApiOverride = params.get("api");
const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
const defaultApiBase = isLocalhost
    ? LOCAL_API_FALLBACK
    : window.location.origin;
const API_BASE = (manualApiOverride ?? defaultApiBase).replace(/\/$/, "");
const API_AUCTION_URL = `${API_BASE}/api/auction`;

let currentChainId = DEFAULT_CHAIN_ID;

// DOM refs
const chainSelect = document.getElementById("chainSelect");
const chainSelectForm = document.getElementById("chainSelectForm");
const createAuctionForm = document.getElementById("createAuctionForm");
const createAuctionBtn = document.getElementById("createAuctionBtn");
const activeAuctionsGrid = document.getElementById("activeAuctionsGrid");
const activeEmptyState = document.getElementById("activeEmptyState");
const loadingActive = document.getElementById("loadingActive");
const refreshAuctionsBtn = document.getElementById("refreshAuctions");

document.addEventListener("DOMContentLoaded", async () => {
    initializeChainSelectors();
    setupFormHandler();
    setupRefreshHandler();
    await fetchActiveAuctions();
    // Auto refresh every 45s
    setInterval(fetchActiveAuctions, 45000);
});

function setupRefreshHandler() {
    if (refreshAuctionsBtn) {
        refreshAuctionsBtn.addEventListener("click", fetchActiveAuctions);
    }
}

function initializeChainSelectors() {
    const chains = Object.keys(CHAINS).map((id) => ({
        id: parseInt(id, 10),
        name: CHAINS[id].name,
    }));

    [chainSelect, chainSelectForm].forEach((selectEl) => {
        if (!selectEl) return;
        selectEl.innerHTML = chains
            .map((chain) => `<option value="${chain.id}">${chain.name}</option>`)
            .join("");
        selectEl.value = DEFAULT_CHAIN_ID;
        selectEl.addEventListener("change", (e) => {
            const chainId = parseInt(e.target.value, 10);
            currentChainId = chainId;
        });
    });

    currentChainId = DEFAULT_CHAIN_ID;
}

function setupFormHandler() {
    if (!createAuctionForm) return;

    createAuctionForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const tokenId = parseInt(document.getElementById("tokenIdInput")?.value || "0", 10);
        const nftAddress = (document.getElementById("nftAddressInput")?.value || "").trim();
        const chainId = parseInt(chainSelectForm?.value || DEFAULT_CHAIN_ID, 10);
        const startPriceEth = document.getElementById("startPriceInput")?.value;
        const startTimeInput = document.getElementById("startTimeInput")?.value;
        const endTimeInput = document.getElementById("endTimeInput")?.value;

        if (!nftAddress || !ethers.isAddress(nftAddress)) {
            showNotification("آدرس قرارداد معتبر نیست.", { type: "error", title: "خطا" });
            return;
        }

        if (!endTimeInput) {
            showNotification("زمان پایان را وارد کنید.", { type: "error", title: "خطا" });
            return;
        }

        const startTimestamp = startTimeInput
            ? Math.floor(new Date(startTimeInput).getTime() / 1000)
            : Math.floor(Date.now() / 1000);
        const endTimestamp = Math.floor(new Date(endTimeInput).getTime() / 1000);

        if (endTimestamp <= startTimestamp) {
            showNotification("زمان پایان باید بعد از زمان شروع باشد.", { type: "error", title: "خطا" });
            return;
        }

        let startPriceWei;
        try {
            startPriceWei = ethers.parseEther(String(startPriceEth)).toString();
        } catch {
            showNotification("مقدار قیمت شروع معتبر نیست.", { type: "error", title: "خطا" });
            return;
        }

        createAuctionBtn.disabled = true;
        createAuctionBtn.textContent = "در حال ایجاد...";

        try {
            const res = await fetch(API_AUCTION_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token_id: tokenId,
                    nft_address: nftAddress,
                    chain_id: chainId,
                    start_price_wei: startPriceWei,
                    start_time: startTimestamp,
                    end_time: endTimestamp,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }

            showNotification("حراج ایجاد شد.", { type: "success", title: "موفق" });
            createAuctionForm.reset();
            if (chainSelectForm) chainSelectForm.value = String(chainId);
            await fetchActiveAuctions();
        } catch (error) {
            console.error("Create auction failed", error);
            showNotification(error.message || "خطا در ایجاد حراج", { type: "error", title: "خطا" });
        } finally {
            createAuctionBtn.disabled = false;
            createAuctionBtn.textContent = "ایجاد حراج";
        }
    });
}

async function fetchActiveAuctions() {
    try {
        loadingActive?.classList.remove("hidden");
        activeEmptyState?.classList.add("hidden");
        if (activeAuctionsGrid) activeAuctionsGrid.innerHTML = "";

        const res = await fetch(`${API_AUCTION_URL}/active`);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const auctions = await res.json();
        renderAuctions(auctions || []);
    } catch (error) {
        console.error("Failed to fetch auctions", error);
        showNotification("خطا در بارگذاری حراج‌ها: " + error.message, {
            type: "error",
            title: "خطا",
        });
        activeEmptyState?.classList.remove("hidden");
    } finally {
        loadingActive?.classList.add("hidden");
    }
}

function renderAuctions(auctions) {
    if (!activeAuctionsGrid) return;

    if (!auctions.length) {
        activeEmptyState?.classList.remove("hidden");
        activeAuctionsGrid.innerHTML = "";
        return;
    }

    activeEmptyState?.classList.add("hidden");
    const template = document.getElementById("auctionCardTemplate");
    if (!template) return;

    activeAuctionsGrid.innerHTML = "";

    auctions.forEach((auction) => {
        const card = template.content.cloneNode(true);
        const article = card.querySelector("article");
        const now = Math.floor(Date.now() / 1000);
        const hasEnded = now > auction.end_time || auction.status !== "ACTIVE";

        const currentBid = auction.current_bid_wei || auction.start_price_wei;
        const startPriceEth = ethers.formatEther(auction.start_price_wei || "0");
        const currentBidEth = ethers.formatEther(currentBid || "0");

        card.querySelector('[data-field="title"]').textContent = `Token #${auction.token_id}`;
        card.querySelector('[data-field="address"]').textContent = `${auction.nft_address.slice(0, 6)}...${auction.nft_address.slice(-4)}`;
        card.querySelector('[data-field="chain"]').textContent = `Chain ID: ${auction.chain_id}`;
        card.querySelector('[data-field="status"]').textContent = hasEnded ? "پایان یافته" : "فعال";
        card.querySelector('[data-field="startPrice"]').textContent = `${startPriceEth} ETH`;
        card.querySelector('[data-field="currentBid"]').textContent = `${currentBidEth} ETH`;
        card.querySelector('[data-field="seller"]').textContent = `فروشنده: ${auction.seller_address.slice(0, 6)}...${auction.seller_address.slice(-4)}`;
        card.querySelector('[data-field="endsIn"]').textContent = hasEnded
            ? "پایان یافته"
            : `پایان: ${new Date(auction.end_time * 1000).toLocaleString()}`;

        const bidInput = card.querySelector('[data-field="bidInput"]');
        const bidBtn = card.querySelector(".bid-btn");

        if (hasEnded) {
            bidInput.disabled = true;
            bidBtn.disabled = true;
            bidBtn.textContent = "پایان یافته";
        } else {
            bidBtn.addEventListener("click", async () => {
                const amountEth = bidInput.value;
                if (!amountEth) {
                    showNotification("مقدار پیشنهاد را وارد کنید.", { type: "error", title: "خطا" });
                    return;
                }
                await placeBid(auction.id, amountEth, bidBtn);
            });
        }

        activeAuctionsGrid.appendChild(card);
    });
}

async function placeBid(auctionId, amountEth, button) {
    let bidWei;
    try {
        bidWei = ethers.parseEther(String(amountEth)).toString();
    } catch {
        showNotification("مقدار پیشنهاد معتبر نیست.", { type: "error", title: "خطا" });
        return;
    }

    button.disabled = true;
    const prevLabel = button.textContent;
    button.textContent = "در حال ارسال...";

    try {
        const res = await fetch(`${API_AUCTION_URL}/bid`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                auction_id: auctionId,
                bid_amount_wei: bidWei,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${res.status}`);
        }

        showNotification("پیشنهاد ثبت شد.", { type: "success", title: "موفق" });
        await fetchActiveAuctions();
    } catch (error) {
        console.error("Place bid failed", error);
        showNotification(error.message || "خطا در ثبت پیشنهاد", { type: "error", title: "خطا" });
    } finally {
        button.disabled = false;
        button.textContent = prevLabel;
    }
}

/******************************
 * Toast helpers
 ******************************/
function showNotification(message, opts = {}) {
    const {
        type = "info",
        title = "",
        duration = type === "error" ? 6000 : 5000,
    } = opts;
    const toastContainer = document.getElementById("toastContainer");
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.innerHTML = type === "success" ? "✓" : type === "error" ? "⚠" : "ℹ";
    toast.appendChild(icon);

    const body = document.createElement("div");
    body.className = "body";
    if (title) {
        const t = document.createElement("div");
        t.className = "title";
        t.textContent = title;
        body.appendChild(t);
    }
    const m = document.createElement("div");
    m.className = "msg";
    m.textContent = message;
    body.appendChild(m);
    toast.appendChild(body);

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-x";
    closeBtn.setAttribute("aria-label", "بستن اعلان");
    closeBtn.innerHTML = "✕";
    closeBtn.addEventListener("click", () => dismissToast(toast));
    toast.appendChild(closeBtn);

    toastContainer.appendChild(toast);

    if (duration && typeof duration === "number") {
        toast._timeout = setTimeout(() => dismissToast(toast), duration);
    }
}

function dismissToast(toast) {
    if (!toast || !toast.parentElement) return;
    clearTimeout(toast._timeout);
    toast.style.transition = "opacity .12s ease, transform .12s ease";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(6px)";
    setTimeout(() => {
        try {
            toast.remove();
        } catch (e) {
            // ignore
        }
    }, 140);
}
