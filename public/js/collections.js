// Collections page JavaScript

/**
 * showNotification(message, {type, title, duration, actions})
 * type: 'info' | 'success' | 'error'
 * title: optional short title
 * duration: milliseconds before auto-dismiss. If null and type==='error' => stays until user closes / presses primary action.
 * actions: array of { label: 'باشه', primary: true|false, onClick: fn }
 */
function showNotification(message, opts = {}) {
    const {
        type = "info",
        title = "",
        duration = type === "error" ? null : 6000,
        actions = [],
    } = opts;
    const toastContainer = document.getElementById("toastContainer");
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.innerHTML =
        type === "success" ? "✓" : type === "error" ? "⚠" : "ℹ";
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

    // close X
    const closeBtn = document.createElement("button");
    closeBtn.className = "close-x";
    closeBtn.setAttribute("aria-label", "بستن اعلان");
    closeBtn.innerHTML = "✕";
    closeBtn.addEventListener("click", () => dismissToast(toast));
    toast.appendChild(closeBtn);

    toastContainer.appendChild(toast);

    // auto-dismiss if duration provided
    if (duration && typeof duration === "number") {
        toast._timeout = setTimeout(() => dismissToast(toast), duration);
    }

    // return a handle to programmatically dismiss
    return {
        dismiss: () => dismissToast(toast),
        element: toast,
    };
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
        } catch (e) { }
    }, 140);
}

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
const API_COLLECTIONS_URL = `${API_BASE}/api/collections`;
const API_LISTINGS_URL = `${API_BASE}/api/listings`;

let MARKETPLACE_ADDRESS = getChainConfig(DEFAULT_CHAIN_ID).marketplace;
let NFT_CONTRACT_ADDRESS = getChainConfig(DEFAULT_CHAIN_ID).nft;
let CURRENCY = getChainConfig(DEFAULT_CHAIN_ID).currency;
let currentChainId = DEFAULT_CHAIN_ID;

function updateChainConfig(chainId) {
    const config = getChainConfig(chainId);
    currentChainId = chainId;
    MARKETPLACE_ADDRESS = config.marketplace;
    NFT_CONTRACT_ADDRESS = config.nft;
    CURRENCY = config.currency;
    console.log(`Switched to chain ${chainId}: ${config.name}`);
}

const MARKETPLACE_ABI = [
    "function buyItem(address nftAddress, uint256 tokenId) payable",
];

// DOM elements
const collectionsView = document.getElementById("collectionsView");
const collectionNFTsView = document.getElementById("collectionNFTsView");
const collectionsGrid = document.getElementById("collectionsGrid");
const collectionNFTsGrid = document.getElementById("collectionNFTsGrid");
const collectionsEmptyState = document.getElementById("collectionsEmptyState");
const collectionNFTsEmptyState = document.getElementById("collectionNFTsEmptyState");
const collectionTitle = document.getElementById("collectionTitle");
const collectionCount = document.getElementById("collectionCount");
const backToCollectionsBtn = document.getElementById("backToCollectionsBtn");
const backToCollections = document.getElementById("backToCollections");
const walletButton = document.getElementById("walletButton");
const walletMenu = document.getElementById("walletMenu");
const viewOwnedBtn = document.getElementById("viewOwnedBtn");
const showAllBtn = document.getElementById("showAllBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const chainSelect = document.getElementById("chainSelect");

// Wallet state
let signer = null;
let userAddress = null;
let provider = null;
let currentCollection = null;

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
    await initializeChainSelect();
    await fetchCollections();
    setupWalletHandlers();
    setupEventListeners();
});

// Chain selection
async function initializeChainSelect() {
    if (!chainSelect) return;

    const chains = Object.keys(CHAINS).map(id => ({
        id: parseInt(id),
        name: CHAINS[id].name,
    }));

    chainSelect.innerHTML = chains
        .map((chain) => `<option value="${chain.id}">${chain.name}</option>`)
        .join("");

    const defaultChainId = DEFAULT_CHAIN_ID;
    chainSelect.value = defaultChainId;
    updateChainConfig(defaultChainId);

    chainSelect.addEventListener("change", async (e) => {
        const chainId = parseInt(e.target.value);
        updateChainConfig(chainId);
        if (currentCollection) {
            await fetchCollectionNFTs(currentCollection);
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    if (backToCollectionsBtn) {
        backToCollectionsBtn.addEventListener("click", () => {
            showCollectionsView();
        });
    }
    if (backToCollections) {
        backToCollections.addEventListener("click", () => {
            showCollectionsView();
        });
    }

    // Collection card click handlers
    collectionsGrid.addEventListener("click", (e) => {
        const card = e.target.closest(".collection-card");
        if (card) {
            const collectionName = card.dataset.collection;
            if (collectionName) {
                showCollectionNFTs(collectionName);
            }
        }
    });
}

// Fetch collections
async function fetchCollections() {
    try {
        collectionsEmptyState.classList.add("hidden");
        collectionsGrid.innerHTML = "";

        const response = await fetch(API_COLLECTIONS_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const collections = await response.json();

        if (collections.length === 0) {
            collectionsEmptyState.classList.remove("hidden");
            return;
        }

        const template = document.getElementById("collectionCardTemplate");
        collections.forEach((collection) => {
            const card = template.content.cloneNode(true);
            const article = card.querySelector("article");
            article.dataset.collection = collection.name;

            const previewImage = card.querySelector('[data-field="preview_image"]');
            if (collection.preview_image) {
                previewImage.style.backgroundImage = `url(${collection.preview_image})`;
            } else {
                previewImage.style.backgroundImage = `url(https://via.placeholder.com/400?text=${encodeURIComponent(collection.name)})`;
            }

            card.querySelector('[data-field="name"]').textContent = collection.name;
            card.querySelector('[data-field="count"]').textContent = `${collection.nft_count} NFT`;

            collectionsGrid.appendChild(card);
        });
    } catch (error) {
        console.error("Failed to fetch collections:", error);
        showNotification("خطا در بارگذاری مجموعه‌ها: " + error.message, {
            type: "error",
            title: "خطا",
        });
        collectionsEmptyState.classList.remove("hidden");
    }
}

// Show collection NFTs view
async function showCollectionNFTs(collectionName) {
    currentCollection = collectionName;
    collectionsView.classList.add("hidden");
    collectionNFTsView.classList.remove("hidden");
    collectionTitle.textContent = collectionName;
    await fetchCollectionNFTs(collectionName);
}

// Fetch NFTs for a collection
async function fetchCollectionNFTs(collectionName) {
    try {
        collectionNFTsEmptyState.classList.add("hidden");
        collectionNFTsGrid.innerHTML = "";

        const response = await fetch(`${API_COLLECTIONS_URL}/${encodeURIComponent(collectionName)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const listings = await response.json();

        if (listings.length === 0) {
            collectionNFTsEmptyState.classList.remove("hidden");
            collectionCount.textContent = "0 NFT";
            return;
        }

        collectionCount.textContent = `${listings.length} NFT`;

        const template = document.getElementById("listingCardTemplate");
        listings.forEach((listing) => {
            const card = template.content.cloneNode(true);

            const imageEl = card.querySelector('[data-field="image"]');
            if (listing.image_url) {
                imageEl.style.backgroundImage = `url(${listing.image_url})`;
            } else {
                imageEl.style.backgroundImage = "url(https://via.placeholder.com/400)";
            }
            imageEl.addEventListener("click", () => {
                window.location.href = `/nft-detail.html?token_id=${listing.token_id}&nft_address=${listing.nft_address}&chain_id=${listing.chain_id}`;
            });

            card.querySelector('[data-field="title"]').textContent = listing.name || `Token #${listing.token_id}`;
            card.querySelector('[data-field="address"]').textContent = `${listing.nft_address.slice(0, 6)}...${listing.nft_address.slice(-4)}`;
            card.querySelector('[data-field="price"]').textContent = `${listing.price_eth} ${CURRENCY}`;
            card.querySelector('[data-field="seller"]').textContent = `فروشنده: ${listing.seller_address.slice(0, 6)}...${listing.seller_address.slice(-4)}`;

            const buyBtn = card.querySelector(".buy-btn");
            buyBtn.addEventListener("click", async () => {
                await handleBuy(listing, buyBtn);
            });

            collectionNFTsGrid.appendChild(card);
        });
    } catch (error) {
        console.error("Failed to fetch collection NFTs:", error);
        showNotification("خطا در بارگذاری NFTهای مجموعه: " + error.message, {
            type: "error",
            title: "خطا",
        });
        collectionNFTsEmptyState.classList.remove("hidden");
    }
}

// Show collections view
function showCollectionsView() {
    currentCollection = null;
    collectionsView.classList.remove("hidden");
    collectionNFTsView.classList.add("hidden");
    fetchCollections();
}

// Handle buy
async function handleBuy(listing, button) {
    if (!signer || !userAddress) {
        showNotification("لطفاً ابتدا کیف‌پول خود را متصل کنید.", {
            type: "error",
            title: "کیف‌پول متصل نیست",
        });
        return;
    }

    // Check if listing is on current chain
    if (listing.chain_id !== currentChainId) {
        const switched = await switchNetwork(listing.chain_id);
        if (!switched) {
            return;
        }
        updateChainConfig(listing.chain_id);
    }

    button.disabled = true;
    button.textContent = "در حال پردازش...";

    try {
        const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
        const priceWei = BigInt(listing.price_wei);

        const tx = await marketplace.buyItem(listing.nft_address, listing.token_id, {
            value: priceWei,
        });

        showNotification(`تراکنش ارسال شد: ${tx.hash}`, {
            type: "info",
            title: "در حال پردازش",
        });

        const receipt = await tx.wait();
        showNotification("خرید با موفقیت انجام شد!", {
            type: "success",
            title: "موفق",
        });

        // Refresh the collection NFTs
        await fetchCollectionNFTs(currentCollection);
    } catch (error) {
        console.error("Buy error:", error);
        let errorMsg = "خطا در خرید NFT";
        if (error.message) {
            if (error.message.includes("user rejected")) {
                errorMsg = "تراکنش توسط کاربر رد شد.";
            } else if (error.message.includes("insufficient funds")) {
                errorMsg = "موجودی کافی نیست.";
            } else {
                errorMsg = error.message;
            }
        }
        showNotification(errorMsg, {
            type: "error",
            title: "خطا",
        });
    } finally {
        button.disabled = false;
        button.textContent = "خرید";
    }
}

// Switch network
async function switchNetwork(chainId) {
    if (!window.ethereum) {
        showNotification("MetaMask یا کیف‌پول EIP-1193 نصب نیست.", {
            type: "error",
            title: "کیف‌پول یافت نشد",
        });
        return false;
    }

    const hexChainId = `0x${chainId.toString(16)}`;
    const chainConfig = CHAINS[chainId];

    if (!chainConfig) {
        showNotification(`پیکربندی شبکه برای Chain ID ${chainId} یافت نشد.`, {
            type: "error",
            title: "خطا",
        });
        return false;
    }

    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: hexChainId }],
        });
        return true;
    } catch (switchError) {
        if (switchError.code === 4902 || switchError.code === -32603) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: hexChainId,
                        chainName: chainConfig.chainName,
                        nativeCurrency: chainConfig.nativeCurrency,
                        rpcUrls: chainConfig.rpcUrls,
                        blockExplorerUrls: chainConfig.blockExplorerUrls,
                    }],
                });
                return true;
            } catch (addError) {
                console.error('Error adding network:', addError);
                showNotification(`افزودن شبکه به MetaMask ناموفق بود: ${addError.message}`, {
                    type: "error",
                    title: "خطا",
                });
                return false;
            }
        } else if (switchError.code === 4001) {
            showNotification("تغییر شبکه توسط کاربر رد شد.", {
                type: "info",
            });
            return false;
        } else {
            console.error('Error switching network:', switchError);
            showNotification(`تغییر شبکه ناموفق بود: ${switchError.message}`, {
                type: "error",
                title: "خطا",
            });
            return false;
        }
    }
}

// Wallet handlers
function setupWalletHandlers() {
    if (walletButton) {
        walletButton.addEventListener("click", connectWallet);
    }
    if (walletMenu) {
        walletButton?.addEventListener("click", (e) => {
            e.stopPropagation();
            walletMenu.classList.toggle("hidden");
        });
    }
    if (viewOwnedBtn) {
        viewOwnedBtn.addEventListener("click", () => {
            window.location.href = "/";
        });
    }
    if (showAllBtn) {
        showAllBtn.addEventListener("click", () => {
            walletMenu?.classList.add("hidden");
        });
    }
    if (disconnectBtn) {
        disconnectBtn.addEventListener("click", disconnectWallet);
    }

    // Close wallet menu when clicking outside
    document.addEventListener("click", (e) => {
        if (walletMenu && !walletButton?.contains(e.target) && !walletMenu.contains(e.target)) {
            walletMenu.classList.add("hidden");
        }
    });
}

async function connectWallet() {
    if (!window.ethereum) {
        showNotification("MetaMask یا کیف‌پول EIP-1193 نصب نیست.", {
            type: "error",
            title: "کیف‌پول یافت نشد",
        });
        return;
    }

    try {
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        if (walletButton) {
            walletButton.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        }

        showNotification("کیف‌پول با موفقیت متصل شد!", {
            type: "success",
            title: "موفق",
        });

        // Listen for account changes
        window.ethereum.on("accountsChanged", handleAccountsChanged);
        window.ethereum.on("chainChanged", handleChainChanged);
    } catch (error) {
        console.error("Connection error:", error);
        showNotification("خطا در اتصال کیف‌پول: " + error.message, {
            type: "error",
            title: "خطا",
        });
    }
}

function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        disconnectWallet();
    } else {
        connectWallet();
    }
}

function handleChainChanged(chainId) {
    window.location.reload();
}

function disconnectWallet() {
    signer = null;
    userAddress = null;
    provider = null;

    if (walletButton) {
        walletButton.textContent = "اتصال کیف‌پول";
    }
    if (walletMenu) {
        walletMenu.classList.add("hidden");
    }

    showNotification("کیف‌پول قطع شد.", {
        type: "info",
    });
}

