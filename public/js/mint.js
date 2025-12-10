// Shared config (mirrors index.js Persian UX)
const LOCAL_API_FALLBACK = "http://localhost:8000";
const params = new URLSearchParams(window.location.search);
const manualApiOverride = params.get("api");
const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
const defaultApiBase = isLocalhost ? LOCAL_API_FALLBACK : window.location.origin;
const API_BASE = (manualApiOverride ?? defaultApiBase).replace(/\/$/, "");
const API_NFT_UPLOAD_URL = `${API_BASE}/api/nft/upload`;
const API_CONFIG_URL = `${API_BASE}/api/config`;

let MARKETPLACE_ADDRESS = "0xD089b7B482523405b026DF2a5caD007093252b15";
let NFT_CONTRACT_ADDRESS = "0xDB9d9Bb58dB6774bbD72a9cBefb483F03Db1A5Fe";
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
const ERC721_TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

// Toast / notification system (copied from index.js)
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
    return { dismiss: () => dismissToast(toast), element: toast };
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
    } catch {
        showNotification("کپی ناموفق بود. لطفاً دستی کپی کنید.", {
            type: "error",
            title: "خطا",
        });
    }
}

// DOM refs
const walletButton = document.getElementById("walletButton");
const walletMenu = document.getElementById("walletMenu");
const viewOwnedBtn = document.getElementById("viewOwnedBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const showAllBtn = document.getElementById("showAllBtn");

const mintForm = document.getElementById("mintForm");
const mintImageInput = document.getElementById("mintImage");
const mintPriceInput = document.getElementById("mintPrice");
const mintSubmitButton = document.getElementById("mintSubmitButton");
const spinner = document.getElementById("spinner");
const mintResult = document.getElementById("mintResult");
const mintTitleInput = document.getElementById("mintTitle");
const mintDescriptionInput = document.getElementById("mintDescription");

// Web3 state
let provider = null;
let signer = null;
let userAddress = null;

walletButton?.addEventListener("click", handleWalletButtonClick);
viewOwnedBtn?.addEventListener("click", () => {
    showNotification("نمایش NFT های شما فقط در صفحه اصلی فعال است.", {
        type: "info",
    });
    walletMenu?.classList.add("hidden");
});
disconnectBtn?.addEventListener("click", disconnectWallet);
showAllBtn?.addEventListener("click", () => walletMenu?.classList.add("hidden"));
mintForm?.addEventListener("submit", handleMintForm);

async function connectWallet() {
    if (!window.ethereum) {
        showNotification(
            "MetaMask یا کیف‌پول EIP-1193 نصب نیست. لطفاً نصب یا فعال کنید.",
            { type: "error", title: "کیف‌پول یافت نشد" }
        );
        return;
    }
    try {
        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
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
        showNotification("اتصال کیف‌پول ناموفق بود: " + (error?.message || ""), {
            type: "error",
            title: "خطا",
        });
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
        const resp = await fetch(API_CONFIG_URL);
        if (!resp.ok) return;
        const cfg = await resp.json();
        if (cfg?.marketplaceAddress) MARKETPLACE_ADDRESS = cfg.marketplaceAddress;
        if (cfg?.nftContractAddress) NFT_CONTRACT_ADDRESS = cfg.nftContractAddress;
    } catch (e) {
        console.warn(e);
    }
}

async function validateConfig() {
    if (!NFT_CONTRACT_ADDRESS || !MARKETPLACE_ADDRESS) {
        setMintStatus("آدرس قراردادها یافت نشد.", "error");
        showNotification("آدرس قراردادها یافت نشد.", {
            type: "error",
            title: "خطا",
        });
        return false;
    }
    if (
        NFT_CONTRACT_ADDRESS.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase()
    ) {
        setMintStatus("آدرس قرارداد NFT نباید برابر آدرس بازارچه باشد.", "error");
        showNotification("آدرس قرارداد NFT نباید برابر آدرس بازارچه باشد.", {
            type: "error",
            title: "خطا",
        });
        return false;
    }
    if (!provider) {
        await connectWallet();
        if (!provider) return false;
    }
    try {
        ethers.getAddress(NFT_CONTRACT_ADDRESS);
        ethers.getAddress(MARKETPLACE_ADDRESS);
    } catch (e) {
        setMintStatus("فرمت آدرس قرارداد نامعتبر است.", "error");
        showNotification("فرمت آدرس قرارداد نامعتبر است.", {
            type: "error",
            title: "خطا",
        });
        return false;
    }
    try {
        const nftCode = await provider.getCode(NFT_CONTRACT_ADDRESS);
        const marketCode = await provider.getCode(MARKETPLACE_ADDRESS);
        if (!nftCode || nftCode === "0x") {
            const network = await provider.getNetwork();
            console.warn(
                `قراردادی در NFT_CONTRACT_ADDRESS روی ${network.name} یافت نشد.`
            );
        }
        if (!marketCode || marketCode === "0x") {
            const network = await provider.getNetwork();
            console.warn(
                `قراردادی در MARKETPLACE_ADDRESS روی ${network.name} یافت نشد.`
            );
        }
    } catch (e) {
        console.warn("Could not verify contract existence:", e);
        showNotification(
            "هشدار: امکان بررسی وجود قراردادها نیست. مطمئن شوید در شبکه درست هستید.",
            { type: "info" }
        );
    }
    return true;
}

async function handleMintForm(event) {
    event.preventDefault();
    if (!mintImageInput?.files?.length) {
        setMintStatus("لطفاً یک فایل تصویری برای آپلود انتخاب کنید.", "error");
        return;
    }
    const formData = new FormData();
    formData.append("file", mintImageInput.files[0]);
    formData.append("name", mintTitleInput.value || "");
    formData.append("description", mintDescriptionInput.value || "");
    formData.append("price", mintPriceInput.value || "");

    try {
        if (!signer) await connectWallet();
        if (!signer) {
            setMintStatus("اتصال کیف‌پول مورد نیاز است.", "error");
            return;
        }

        await loadBackendConfig();
        const valid = await validateConfig();
        if (!valid) return;

        mintSubmitButton.disabled = true;
        mintSubmitButton.textContent = "در حال آپلود...";
        spinner?.classList.remove("hidden");
        setMintStatus("در حال آپلود اثر به NFT.Storage...", "info");

        const response = await fetch(API_NFT_UPLOAD_URL, {
            method: "POST",
            body: formData,
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || `آپلود ناموفق (${response.status})`);
        }
        const result = await response.json();
        if (!result?.ok) throw new Error("پاسخ نامتعارف از سرور");
        if (!result.metadata_cid)
            throw new Error("CID متادیتا از بک‌اند بازنگشت.");
        const tokenURI = `ipfs://${result.metadata_cid}`;

        const priceEth = parseFloat(mintPriceInput.value);
        if (!(priceEth > 0)) throw new Error("یک قیمت معتبر وارد کنید");
        const priceWei = ethers.parseUnits(priceEth.toString(), 18);

        setMintStatus("در حال ضرب NFT در زنجیره...", "info");
        const nft = new ethers.Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, signer);
        const txMint = await nft.mint(tokenURI);
        const receiptMint = await txMint.wait();

        let mintedTokenId = null;
        for (const log of receiptMint.logs ?? []) {
            if (log.address.toLowerCase() !== NFT_CONTRACT_ADDRESS.toLowerCase())
                continue;
            try {
                const parsed = nft.interface.parseLog(log);
                if (parsed && parsed.name === "Transfer") {
                    mintedTokenId = parsed.args.tokenId ?? parsed.args[2];
                    break;
                }
            } catch (e) { }
        }
        if (mintedTokenId === null)
            throw new Error("توکن ID پس از ضرب پیدا نشد");

        const tokenIdForApprove = mintedTokenId.toString();
        setMintStatus("در حال اجازه دادن به بازارچه...", "info");
        try {
            const isApproved = await nft.isApprovedForAll(
                userAddress,
                MARKETPLACE_ADDRESS
            );
            if (!isApproved) {
                const approveAllTx = await nft.setApprovalForAll(
                    MARKETPLACE_ADDRESS,
                    true
                );
                await approveAllTx.wait();
            }
        } catch (approveAllError) {
            console.warn(
                "setApprovalForAll failed, trying per-token approval:",
                approveAllError
            );
            const approveTx = await nft.approve(
                MARKETPLACE_ADDRESS,
                tokenIdForApprove
            );
            await approveTx.wait();
        }

        setMintStatus("در حال ایجاد آگهی در بازارچه...", "info");
        const market = new ethers.Contract(
            MARKETPLACE_ADDRESS,
            MARKETPLACE_ABI,
            signer
        );
        const txList = await market.listItem(
            NFT_CONTRACT_ADDRESS,
            tokenIdForApprove,
            priceWei
        );
        await txList.wait();

        const metadataPreview = JSON.stringify(result.metadata, null, 2);
        showNotification(
            `توکن ضرب شد (ID: ${mintedTokenId.toString()}) و در قیمت ${priceEth} ETH لیست شد.`,
            {
                type: "success",
                title: "ضرب و لیست موفق",
                duration: 9000,
                actions: [
                    {
                        label: "نمایش متادیتا (کپی)",
                        primary: false,
                        onClick: () => copyToClipboard(metadataPreview),
                    },
                ],
            }
        );
        setMintStatus(`موفق! توکن: ${mintedTokenId.toString()}`, "success");
        mintForm.reset();
    } catch (error) {
        console.error("Mint+List failed", error);
        showNotification(error.message || "عملیات ناموفق بود. کنسول را بررسی کنید.", {
            type: "error",
            title: "خطا",
        });
        setMintStatus(error.message || "خطا", "error");
    } finally {
        mintSubmitButton.disabled = false;
        mintSubmitButton.textContent = "ضرب و لیست کردن NFT";
        spinner?.classList.add("hidden");
    }
}

function setMintStatus(message, type = "info") {
    if (!mintResult) return;
    mintResult.textContent = message;
    mintResult.className = "";
    mintResult.classList.add(
        "p-3",
        "rounded",
        "mb-4",
        "text-sm",
        "text-right"
    );
    if (type === "error") {
        mintResult.classList.add("bg-red-900/50", "text-red-400");
    } else if (type === "success") {
        mintResult.classList.add("bg-green-900/50", "text-green-400");
    } else {
        mintResult.classList.add("bg-blue-900/50", "text-blue-400");
    }
    mintResult.classList.remove("hidden");
}

function shortenAddress(address = "") {
    if (!address || address.length < 10) return address || "N/A";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// preload config
loadBackendConfig();