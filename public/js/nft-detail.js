/******************************
 * Notification / Toast system
 ******************************/
const toastContainer = document.getElementById("toastContainer");

function showNotification(message, opts = {}) {
    const {
        type = "info",
        title = "",
        duration = type === "error" ? null : 6000,
        actions = [],
    } = opts;
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

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification("کپی شد به حافظه‌ی کلیپ‌بورد.", {
            type: "success",
            duration: 2500,
        });
    } catch (e) {
        showNotification("کپی ناموفق بود. لطفاً دستی کپی کنید.", {
            type: "error",
            title: "خطا",
        });
    }
}

/******************************
 * App logic
 ******************************/

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
const API_LISTINGS_URL = `${API_BASE}/api/listings`;
const API_REINDEX_URL = `${API_BASE}/api/reindex`;

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

    // Update price in UI if it exists
    if (nftPrice) {
        const val = nftPrice.textContent.split(' ')[0];
        nftPrice.textContent = `${val} ${CURRENCY}`;
    }
}
const MARKETPLACE_ABI = [
    "function buyItem(address nftAddress, uint256 tokenId) payable",
    "function listItem(address nftAddress, uint256 tokenId, uint256 price)",
];
const NFT_ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "function mint(string uri) returns (uint256)",
    "function approve(address to, uint256 tokenId)",
    "function setApprovalForAll(address operator, bool approved)",
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
];

// DOM refs
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const errorMessage = document.getElementById("errorMessage");
const nftDetailContent = document.getElementById("nftDetailContent");
const nftImage = document.getElementById("nftImage");
const nftName = document.getElementById("nftName");
const nftTokenId = document.getElementById("nftTokenId");
const nftPrice = document.getElementById("nftPrice");
const nftOwner = document.getElementById("nftOwner");
const nftAddress = document.getElementById("nftAddress");
const nftTokenIdDetail = document.getElementById("nftTokenIdDetail");
const nftTokenUri = document.getElementById("nftTokenUri");
const nftTokenUriSection = document.getElementById("nftTokenUriSection");
const nftDescription = document.getElementById("nftDescription");
const nftDescriptionSection = document.getElementById("nftDescriptionSection");
const buyButton = document.getElementById("buyButton");
const walletButton = document.getElementById("walletButton");
const walletMenu = document.getElementById("walletMenu");
const viewOwnedBtn = document.getElementById("viewOwnedBtn");
const disconnectBtn = document.getElementById("disconnectBtn");

let provider = null;
let signer = null;
let userAddress = null;
let currentListing = null;

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const tokenId = urlParams.get("token_id");
const nftAddressParam = urlParams.get("nft_address");
const chainIdParam = urlParams.get("chain_id");

if (chainIdParam) {
    currentChainId = Number(chainIdParam);
    updateChainConfig(currentChainId);
}

walletButton?.addEventListener("click", handleWalletButtonClick);
viewOwnedBtn?.addEventListener("click", () => {
    window.location.href = "/";
});
disconnectBtn?.addEventListener("click", disconnectWallet);
buyButton?.addEventListener("click", handleBuy);

function shortenAddress(address = "") {
    if (!address || address.length < 10) return address || "N/A";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function connectWallet() {
    if (!window.ethereum) {
        showNotification(
            "MetaMask یا کیف‌پول EIP-1193 نصب نیست. لطفاً نصب یا فعال کنید.",
            {
                type: "error",
                title: "کیف‌پول یافت نشد",
                actions: [{ label: "باشه", primary: true }],
            }
        );
        return;
    }
    try {
        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        const network = await provider.getNetwork();
        updateChainConfig(Number(network.chainId));

        // Listen for network changes
        window.ethereum.on('chainChanged', (chainId) => {
            updateChainConfig(Number(chainId));
        });

        walletButton.textContent = shortenAddress(userAddress);
        walletButton.classList.remove("bg-slate-100", "text-slate-900");
        walletButton.classList.add("bg-emerald-400", "text-slate-900");
        walletMenu?.classList.add("hidden");
        showNotification("کیف‌پول متصل شد: " + shortenAddress(userAddress), {
            type: "success",
            duration: 3500,
        });
    } catch (error) {
        console.error("Wallet connection failed", error);
        showNotification(
            "اتصال کیف‌پول ناموفق بود: " + (error?.message || ""),
            {
                type: "error",
                title: "خطا",
                actions: [{ label: "باشه", primary: true }],
            }
        );
    }
}

function handleWalletButtonClick() {
    if (signer && userAddress) {
        walletMenu?.classList.toggle("hidden");
    } else {
        connectWallet();
    }
}

function disconnectWallet() {
    provider = null;
    signer = null;
    userAddress = null;
    walletButton.textContent = "اتصال کیف‌پول";
    walletButton.classList.remove("bg-emerald-400");
    walletButton.classList.add("bg-slate-100", "text-slate-900");
    walletMenu?.classList.add("hidden");
    showNotification("کیف‌پول قطع شد.", { type: "info" });
}

async function loadBackendConfig() {
    try {
        const resp = await fetch(`${API_BASE}/api/config`);
        if (!resp.ok) return;
        const cfg = await resp.json();
        if (cfg?.marketplaceAddress)
            MARKETPLACE_ADDRESS = cfg.marketplaceAddress;
        if (cfg?.nftContractAddress)
            NFT_CONTRACT_ADDRESS = cfg.nftContractAddress;
    } catch (e) {
        console.warn(e);
    }
}

async function fetchNFTDetails() {
    if (!tokenId || !nftAddressParam) {
        showError("پارامترهای URL ناقص است. token_id و nft_address مورد نیاز است.");
        return;
    }

    try {
        loadingState.classList.remove("hidden");
        errorState.classList.add("hidden");
        nftDetailContent.classList.add("hidden");

        await loadBackendConfig();

        const response = await fetch(API_LISTINGS_URL);
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const listings = await response.json();

        // Find the matching NFT
        const listing = listings.find(
            (l) =>
                l.token_id.toString() === tokenId.toString() &&
                l.nft_address.toLowerCase() === nftAddressParam.toLowerCase() &&
                (chainIdParam ? Number(l.chain_id) === Number(chainIdParam) : true)
        );

        if (!listing) {
            showError("NFT مورد نظر یافت نشد. ممکن است فروخته شده باشد یا وجود نداشته باشد.");
            return;
        }

        currentListing = listing;
        displayNFTDetails(listing);
    } catch (error) {
        console.error("Failed to fetch NFT details", error);
        showError("بارگذاری جزئیات NFT ناموفق بود: " + (error.message || ""));
    }
}

function showError(message) {
    loadingState.classList.add("hidden");
    errorState.classList.remove("hidden");
    nftDetailContent.classList.add("hidden");
    errorMessage.textContent = message;
}

function displayNFTDetails(listing) {
    loadingState.classList.add("hidden");
    errorState.classList.add("hidden");
    nftDetailContent.classList.remove("hidden");

    // Image
    const imageUrl = listing.image_cid
        ? `https://level-blue-echidna.myfilebase.com/ipfs/${listing.image_cid}`
        : listing.image_url ||
        `https://picsum.photos/seed/${listing.token_id}/800/800`;
    nftImage.style.backgroundImage = `url(${imageUrl})`;

    // Name
    const tokenName = listing.name || `Token #${listing.token_id}`;
    nftName.textContent = tokenName;
    document.title = `${tokenName} - مارکت NFT`;

    // Token ID
    nftTokenId.textContent = `Token ID: ${listing.token_id}`;
    nftTokenIdDetail.textContent = listing.token_id.toString();

    // Price
    nftPrice.textContent = `${listing.price_eth} ${CURRENCY}`;

    // Owner/Seller
    const ownerAddress = listing.seller_address || listing.owner || "N/A";
    nftOwner.textContent = ownerAddress;
    nftOwner.style.cursor = "pointer";
    nftOwner.title = "کلیک برای کپی";
    nftOwner.addEventListener("click", () => copyToClipboard(ownerAddress));

    // NFT Address
    nftAddress.textContent = listing.nft_address;
    nftAddress.style.cursor = "pointer";
    nftAddress.title = "کلیک برای کپی";
    nftAddress.addEventListener("click", () =>
        copyToClipboard(listing.nft_address)
    );

    // Token URI
    if (listing.token_uri) {
        nftTokenUri.textContent = listing.token_uri;
        nftTokenUriSection.classList.remove("hidden");
        nftTokenUri.style.cursor = "pointer";
        nftTokenUri.title = "کلیک برای کپی";
        nftTokenUri.addEventListener("click", () =>
            copyToClipboard(listing.token_uri)
        );
    } else {
        nftTokenUriSection.classList.add("hidden");
    }

    // Description
    if (listing.description) {
        nftDescription.textContent = listing.description;
        nftDescriptionSection.classList.remove("hidden");
    } else {
        nftDescriptionSection.classList.add("hidden");
    }

    // Buy button state
    if (listing.is_sold) {
        buyButton.disabled = true;
        buyButton.textContent = "فروخته شد";
        buyButton.classList.remove("bg-emerald-400", "hover:bg-emerald-300");
        buyButton.classList.add("bg-slate-700", "text-slate-400");
    } else {
        buyButton.disabled = false;
        buyButton.textContent = "خرید";
        buyButton.classList.remove("bg-slate-700", "text-slate-400");
        buyButton.classList.add("bg-emerald-400", "hover:bg-emerald-300");
    }
}

async function handleBuy() {
    if (!currentListing) return;

    try {
        if (!signer) await connectWallet();
        if (!signer) return;

        const contract = new ethers.Contract(
            MARKETPLACE_ADDRESS,
            MARKETPLACE_ABI,
            signer
        );
        buyButton.disabled = true;
        buyButton.textContent = "تأیید در کیف‌پول...";
        const tx = await contract.buyItem(
            currentListing.nft_address,
            currentListing.token_id,
            { value: currentListing.price_wei }
        );
        buyButton.textContent = "در انتظار تایید شبکه...";
        await tx.wait();
        buyButton.textContent = "فروخته شد";
        buyButton.classList.remove("bg-emerald-400", "hover:bg-emerald-300");
        buyButton.classList.add("bg-slate-700", "text-slate-400");

        showNotification(`خرید با موفقیت انجام شد.\nهش تراکنش: ${tx.hash}`, {
            type: "success",
            title: "خرید موفق",
            duration: 9000,
            actions: [
                {
                    label: "کپی هش",
                    primary: false,
                    onClick: () => copyToClipboard(tx.hash),
                },
            ],
        });

        // Refresh the page after a short delay
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    } catch (error) {
        console.error("Transaction failed", error);
        showNotification(
            "تراکنش ناموفق: " +
            (error?.data?.message ?? error.message ?? "رد شد"),
            {
                type: "error",
                title: "خطا",
                actions: [{ label: "باشه", primary: true }],
            }
        );
        buyButton.disabled = false;
        buyButton.textContent = "خرید";
    }
}

// Initialize
fetchNFTDetails();
