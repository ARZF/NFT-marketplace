// Activity page JavaScript
// Similar structure to index.js but focused on activity feed

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
const API_ACTIVITY_URL = `${API_BASE}/api/activity`;

let allActivities = [];
let filteredActivities = [];
let currentFilter = "all";

// DOM elements
const activityFeed = document.getElementById("activityFeed");
const emptyState = document.getElementById("emptyState");
const loadingState = document.getElementById("loadingState");
const filterAll = document.getElementById("filterAll");
const filterMint = document.getElementById("filterMint");
const filterList = document.getElementById("filterList");
const filterSold = document.getElementById("filterSold");
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

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
    await initializeChainSelect();
    await fetchActivity();
    setupFilters();
    setupWalletHandlers();
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

    // Set default chain
    const defaultChainId = DEFAULT_CHAIN_ID;
    chainSelect.value = defaultChainId;

    // Listen for chain changes
    chainSelect.addEventListener("change", async (e) => {
        const chainId = parseInt(e.target.value);
        await switchNetwork(chainId);
    });

    // Check current chain on load
    if (window.ethereum) {
        try {
            const chainId = await window.ethereum.request({ method: "eth_chainId" });
            const chainIdNum = parseInt(chainId, 16);
            if (CHAINS[chainIdNum]) {
                chainSelect.value = chainIdNum;
            }
        } catch (err) {
            console.error("Failed to get chain ID:", err);
        }
    }
}

async function switchNetwork(chainId) {
    if (!window.ethereum) return;

    const chainConfig = CHAINS[chainId];
    if (!chainConfig) {
        console.error("Unknown chain ID:", chainId);
        return;
    }

    try {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chainConfig.chainId }],
        });
    } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: "wallet_addEthereumChain",
                    params: [
                        {
                            chainId: chainConfig.chainId,
                            chainName: chainConfig.chainName,
                            nativeCurrency: chainConfig.nativeCurrency,
                            rpcUrls: chainConfig.rpcUrls,
                            blockExplorerUrls: chainConfig.blockExplorerUrls,
                        },
                    ],
                });
            } catch (addError) {
                console.error("Failed to add chain:", addError);
            }
        } else {
            console.error("Failed to switch chain:", switchError);
        }
    }
}

// Fetch activity data
async function fetchActivity() {
    try {
        loadingState.classList.remove("hidden");
        emptyState.classList.add("hidden");
        activityFeed.innerHTML = "";

        const response = await fetch(API_ACTIVITY_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        allActivities = data || [];

        applyFilter();
    } catch (error) {
        console.error("Failed to fetch activity:", error);
        showNotification("خطا در بارگذاری فعالیت‌ها: " + error.message, {
            type: "error",
            title: "خطا",
        });
        loadingState.classList.add("hidden");
        emptyState.classList.remove("hidden");
    }
}

// Setup filter buttons
function setupFilters() {
    if (filterAll) {
        filterAll.addEventListener("click", () => setFilter("all"));
    }
    if (filterMint) {
        filterMint.addEventListener("click", () => setFilter("mint"));
    }
    if (filterList) {
        filterList.addEventListener("click", () => setFilter("list"));
    }
    if (filterSold) {
        filterSold.addEventListener("click", () => setFilter("sold"));
    }
}

function setFilter(filter) {
    currentFilter = filter;

    // Update button states
    document.querySelectorAll(".filter-btn").forEach((btn) => {
        btn.classList.remove("active", "bg-emerald-500", "text-slate-900");
        btn.classList.add("bg-slate-800", "text-slate-300");
    });

    const activeButton =
        filter === "all" ? filterAll :
            filter === "mint" ? filterMint :
                filter === "list" ? filterList :
                    filterSold;

    if (activeButton) {
        activeButton.classList.add("active", "bg-emerald-500", "text-slate-900");
        activeButton.classList.remove("bg-slate-800", "text-slate-300");
    }

    applyFilter();
}

function applyFilter() {
    if (currentFilter === "all") {
        filteredActivities = allActivities;
    } else {
        filteredActivities = allActivities.filter(
            (activity) => activity.event_type === currentFilter
        );
    }

    renderActivities();
}

// Render activities
function renderActivities() {
    loadingState.classList.add("hidden");

    if (filteredActivities.length === 0) {
        emptyState.classList.remove("hidden");
        activityFeed.innerHTML = "";
        return;
    }

    emptyState.classList.add("hidden");
    activityFeed.innerHTML = "";

    const template = document.getElementById("activityItemTemplate");
    if (!template) {
        console.error("Activity item template not found");
        return;
    }

    filteredActivities.forEach((activity) => {
        const item = template.content.cloneNode(true);
        const article = item.querySelector(".activity-item");

        // Set event badge
        const badge = item.querySelector("[data-field='event-badge']");
        if (badge) {
            const eventLabels = {
                mint: "ضرب",
                list: "لیست",
                sold: "فروخته شده",
            };
            badge.textContent = eventLabels[activity.event_type] || activity.event_type;

            const badgeColors = {
                mint: "bg-blue-500 text-white",
                list: "bg-purple-500 text-white",
                sold: "bg-emerald-500 text-white",
            };
            badge.className = `activity-badge px-2 py-1 rounded text-xs font-semibold ${badgeColors[activity.event_type] || "bg-slate-600 text-white"}`;
        }

        // Set NFT name
        const nameField = item.querySelector("[data-field='name']");
        if (nameField) {
            nameField.textContent = activity.name || `Token #${activity.token_id}`;
        }

        // Set description
        const descField = item.querySelector("[data-field='description']");
        if (descField) {
            if (activity.description) {
                descField.textContent = activity.description;
            } else {
                descField.textContent = `NFT #${activity.token_id} در ${activity.nft_address.slice(0, 6)}...${activity.nft_address.slice(-4)}`;
            }
        }

        // Set image
        const imageContainer = item.querySelector("[data-field='image-container']");
        const imageField = item.querySelector("[data-field='image']");
        if (imageField) {
            if (activity.image_url) {
                imageField.src = activity.image_url;
                imageField.onerror = () => {
                    imageContainer.classList.add("bg-slate-800");
                    imageField.style.display = "none";
                };
            } else {
                imageContainer.classList.add("bg-slate-800");
                imageField.style.display = "none";
            }
        }

        // Set price (only for list and sold events)
        const priceContainer = item.querySelector("[data-field='price-container']");
        const priceField = item.querySelector("[data-field='price']");
        if (priceContainer && priceField) {
            if (activity.event_type === "list" || activity.event_type === "sold") {
                priceField.textContent = `${parseFloat(activity.price_eth).toFixed(4)} ETH`;
                priceContainer.style.display = "block";
            } else {
                priceContainer.style.display = "none";
            }
        }

        // Set token ID
        const tokenIdField = item.querySelector("[data-field='token-id']");
        if (tokenIdField) {
            tokenIdField.textContent = `#${activity.token_id}`;
        }

        // Set address
        const addressLabel = item.querySelector("[data-field='address-label']");
        const addressField = item.querySelector("[data-field='address']");
        if (addressField) {
            let address = "";
            let label = "";

            if (activity.event_type === "mint") {
                address = activity.owner_address || "";
                label = "مالک:";
            } else if (activity.event_type === "list" || activity.event_type === "sold") {
                address = activity.seller_address || "";
                label = activity.event_type === "sold" ? "فروشنده:" : "فروشنده:";
            }

            if (addressLabel) {
                addressLabel.textContent = label;
            }
            if (address) {
                addressField.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
                addressField.title = address;
            }
        }

        // Set detail link
        const detailLink = item.querySelector("[data-field='detail-link']");
        if (detailLink) {
            detailLink.href = `/nft-detail.html?token_id=${activity.token_id}&nft_address=${activity.nft_address}&chain_id=${activity.chain_id}`;
        }

        activityFeed.appendChild(item);
    });
}

// Wallet handlers
function setupWalletHandlers() {
    if (walletButton) {
        walletButton.addEventListener("click", async () => {
            await connectWallet();
        });
    }

    if (viewOwnedBtn) {
        viewOwnedBtn.addEventListener("click", () => {
            if (userAddress) {
                window.location.href = `/?filter=owned&address=${userAddress}`;
            }
        });
    }

    if (showAllBtn) {
        showAllBtn.addEventListener("click", () => {
            walletMenu?.classList.add("hidden");
        });
    }

    if (disconnectBtn) {
        disconnectBtn.addEventListener("click", () => {
            disconnectWallet();
        });
    }

    // Close wallet menu when clicking outside
    document.addEventListener("click", (e) => {
        if (walletMenu && !walletMenu.contains(e.target) && !walletButton?.contains(e.target)) {
            walletMenu.classList.add("hidden");
        }
    });

    // Check if wallet is already connected
    checkWalletConnection();
}

async function connectWallet() {
    if (!window.ethereum) {
        showNotification("لطفاً MetaMask را نصب کنید", {
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

        // Listen for account changes
        window.ethereum.on("accountsChanged", handleAccountsChanged);
        window.ethereum.on("chainChanged", handleChainChanged);

        showNotification("کیف‌پول با موفقیت متصل شد", {
            type: "success",
            title: "اتصال موفق",
        });
    } catch (error) {
        console.error("Failed to connect wallet:", error);
        showNotification("خطا در اتصال کیف‌پول: " + error.message, {
            type: "error",
            title: "خطا",
        });
    }
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

    showNotification("کیف‌پول قطع شد", {
        type: "info",
        title: "قطع اتصال",
    });
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

async function checkWalletConnection() {
    if (!window.ethereum) return;

    try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (accounts.length > 0) {
            await connectWallet();
        }
    } catch (error) {
        console.error("Failed to check wallet connection:", error);
    }
}

// Notification system (simplified version)
function showNotification(message, opts = {}) {
    const { type = "info", title = "" } = opts;
    const toastContainer = document.getElementById("toastContainer");
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `fixed bottom-4 left-4 bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg z-50 max-w-sm`;

    if (title) {
        const titleEl = document.createElement("div");
        titleEl.className = "font-semibold text-white mb-1";
        titleEl.textContent = title;
        toast.appendChild(titleEl);
    }

    const msgEl = document.createElement("div");
    msgEl.className = `text-sm ${type === "error" ? "text-red-400" :
            type === "success" ? "text-emerald-400" :
                "text-slate-300"
        }`;
    msgEl.textContent = message;
    toast.appendChild(msgEl);

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("opacity-0", "transition-opacity", "duration-300");
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

