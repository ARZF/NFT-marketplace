// Uniswap Swap Implementation for Sepolia and Base Sepolia
// Uses Uniswap V3 SwapRouter contracts

// Uniswap V3 Contract Addresses
const UNISWAP_CONTRACTS = {
    11155111: { // Sepolia
        swapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Uniswap V3 SwapRouter
        quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6', // Uniswap V3 Quoter
        weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH Sepolia
    },
    84532: { // Base Sepolia
        swapRouter: '0x2626664c2603336E57B271c5C0b26F42126eED1B', // Uniswap V3 SwapRouter
        quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a', // Uniswap V3 Quoter
        weth: '0x4200000000000000000000000000000000000006', // WETH Base Sepolia
    }
};

// Common Token Addresses for Testnets
const COMMON_TOKENS = {
    11155111: { // Sepolia
        ETH: { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18, name: 'Ether' },
        WETH: { address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
        USDC: { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', symbol: 'USDC', decimals: 6, name: 'USD Coin' },
        DAI: { address: '0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6', symbol: 'DAI', decimals: 18, name: 'Dai Stablecoin' },
    },
    84532: { // Base Sepolia
        ETH: { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18, name: 'Ether' },
        WETH: { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
        USDC: { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', symbol: 'USDC', decimals: 6, name: 'USD Coin' },
    }
};

// ABIs
const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)"
];

const SWAP_ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
    "function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) external payable returns (uint256 amountOut)",
    "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)",
    "function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory results)"
];

const QUOTER_ABI = [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
    "function quoteExactInput(bytes memory path, uint256 amountIn) external returns (uint256 amountOut, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate)"
];

const WETH_ABI = [
    "function deposit() payable",
    "function withdraw(uint256)",
    "function balanceOf(address) view returns (uint256)"
];

// State
let provider = null;
let signer = null;
let userAddress = null;
let currentChainId = DEFAULT_CHAIN_ID;
let fromToken = null;
let toToken = null;
let selectedTokenType = null; // 'from' or 'to'

// DOM Elements
const walletButton = document.getElementById("walletButton");
const walletMenu = document.getElementById("walletMenu");
const disconnectBtn = document.getElementById("disconnectBtn");
const chainSelect = document.getElementById("chainSelect");
const fromTokenSelect = document.getElementById("fromTokenSelect");
const toTokenSelect = document.getElementById("toTokenSelect");
const fromTokenSymbol = document.getElementById("fromTokenSymbol");
const toTokenSymbol = document.getElementById("toTokenSymbol");
const fromAmount = document.getElementById("fromAmount");
const toAmount = document.getElementById("toAmount");
const fromBalance = document.getElementById("fromBalance");
const toBalance = document.getElementById("toBalance");
const swapTokensBtn = document.getElementById("swapTokensBtn");
const swapButton = document.getElementById("swapButton");
const maxFromBtn = document.getElementById("maxFromBtn");
const swapStatus = document.getElementById("swapStatus");
const swapInfo = document.getElementById("swapInfo");
const exchangeRate = document.getElementById("exchangeRate");
const minReceive = document.getElementById("minReceive");
const tokenModal = document.getElementById("tokenModal");
const closeTokenModal = document.getElementById("closeTokenModal");
const tokenSearch = document.getElementById("tokenSearch");
const tokenList = document.getElementById("tokenList");
const toastContainer = document.getElementById("toastContainer");

// Initialize
function init() {
    setupChainSelect();
    setupEventListeners();
    initializeTokens();
}

function setupChainSelect() {
    if (!chainSelect) return;
    
    chainSelect.innerHTML = "";
    Object.keys(CHAINS).forEach((id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = CHAINS[id].name;
        chainSelect.appendChild(opt);
    });
    
    const persisted = localStorage.getItem("selectedChainId");
    const initial = persisted ? parseInt(persisted) : DEFAULT_CHAIN_ID;
    chainSelect.value = String(initial);
    currentChainId = initial;
    
    chainSelect.addEventListener("change", async (e) => {
        const id = parseInt(e.target.value);
        if (signer && userAddress && window.ethereum) {
            const switched = await switchNetwork(id);
            if (!switched) {
                const currentNetwork = await provider.getNetwork();
                chainSelect.value = String(Number(currentNetwork.chainId));
                return;
            }
        }
        localStorage.setItem("selectedChainId", String(id));
        currentChainId = id;
        initializeTokens();
        updateBalances();
    });
}

function setupEventListeners() {
    walletButton?.addEventListener("click", handleWalletButtonClick);
    disconnectBtn?.addEventListener("click", disconnectWallet);
    fromTokenSelect?.addEventListener("click", () => openTokenModal('from'));
    toTokenSelect?.addEventListener("click", () => openTokenModal('to'));
    swapTokensBtn?.addEventListener("click", swapTokenPositions);
    swapButton?.addEventListener("click", executeSwap);
    maxFromBtn?.addEventListener("click", setMaxAmount);
    closeTokenModal?.addEventListener("click", closeTokenModalFunc);
    fromAmount?.addEventListener("input", debounce(handleAmountChange, 500));
    tokenSearch?.addEventListener("input", filterTokenList);
    
    // Close modal on backdrop click
    tokenModal?.addEventListener("click", (e) => {
        if (e.target === tokenModal) closeTokenModalFunc();
    });
}

function initializeTokens() {
    const tokens = COMMON_TOKENS[currentChainId] || COMMON_TOKENS[DEFAULT_CHAIN_ID];
    if (!tokens) return;
    
    // Set default tokens
    fromToken = tokens.ETH;
    toToken = tokens.WETH || tokens.USDC;
    
    fromTokenSymbol.textContent = fromToken.symbol;
    toTokenSymbol.textContent = toToken.symbol;
    
    updateBalances();
}

async function connectWallet() {
    if (!window.ethereum) {
        showNotification("MetaMask یا کیف‌پول EIP-1193 نصب نیست.", {
            type: "error",
            title: "کیف‌پول یافت نشد"
        });
        return;
    }
    
    try {
        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        
        const network = await provider.getNetwork();
        const networkChainId = Number(network.chainId);
        
        if (chainSelect && CHAINS[networkChainId]) {
            chainSelect.value = String(networkChainId);
            localStorage.setItem("selectedChainId", String(networkChainId));
            currentChainId = networkChainId;
        }
        
        walletButton.textContent = shortenAddress(userAddress);
        walletButton.classList.remove("bg-slate-100", "text-slate-900");
        walletButton.classList.add("bg-emerald-400", "text-slate-900");
        walletMenu?.classList.add("hidden");
        
        showNotification("کیف‌پول متصل شد: " + shortenAddress(userAddress), {
            type: "success",
            duration: 3500,
        });
        
        updateBalances();
        
        // Listen for network changes
        window.ethereum.on('chainChanged', (chainId) => {
            const newChainId = Number(chainId);
            currentChainId = newChainId;
            if (chainSelect && CHAINS[newChainId]) {
                chainSelect.value = String(newChainId);
                localStorage.setItem("selectedChainId", String(newChainId));
            }
            initializeTokens();
            updateBalances();
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
    fromBalance.textContent = "-";
    toBalance.textContent = "-";
    showNotification("کیف‌پول قطع شد.", { type: "info" });
}

async function switchNetwork(chainId) {
    if (!window.ethereum) return false;
    
    const hexChainId = `0x${chainId.toString(16)}`;
    const chainConfig = CHAINS[chainId];
    
    if (!chainConfig) {
        showNotification(`پیکربندی شبکه برای Chain ID ${chainId} یافت نشد.`, {
            type: "error",
            title: "خطا"
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
                    title: "خطا"
                });
                return false;
            }
        } else if (switchError.code === 4001) {
            showNotification("تغییر شبکه توسط کاربر رد شد.", { type: "info" });
            return false;
        } else {
            console.error('Error switching network:', switchError);
            showNotification(`تغییر شبکه ناموفق بود: ${switchError.message}`, {
                type: "error",
                title: "خطا"
            });
            return false;
        }
    }
}

async function updateBalances() {
    if (!signer || !userAddress) {
        fromBalance.textContent = "-";
        toBalance.textContent = "-";
        return;
    }
    
    try {
        // Update from token balance
        if (fromToken.address === '0x0000000000000000000000000000000000000000') {
            // ETH balance
            const balance = await provider.getBalance(userAddress);
            const formatted = ethers.formatEther(balance);
            fromBalance.textContent = parseFloat(formatted).toFixed(4);
        } else {
            // ERC20 balance
            const tokenContract = new ethers.Contract(fromToken.address, ERC20_ABI, provider);
            const balance = await tokenContract.balanceOf(userAddress);
            const decimals = fromToken.decimals || 18;
            const formatted = ethers.formatUnits(balance, decimals);
            fromBalance.textContent = parseFloat(formatted).toFixed(4);
        }
        
        // Update to token balance
        if (toToken.address === '0x0000000000000000000000000000000000000000') {
            // ETH balance
            const balance = await provider.getBalance(userAddress);
            const formatted = ethers.formatEther(balance);
            toBalance.textContent = parseFloat(formatted).toFixed(4);
        } else {
            // ERC20 balance
            const tokenContract = new ethers.Contract(toToken.address, ERC20_ABI, provider);
            const balance = await tokenContract.balanceOf(userAddress);
            const decimals = toToken.decimals || 18;
            const formatted = ethers.formatUnits(balance, decimals);
            toBalance.textContent = parseFloat(formatted).toFixed(4);
        }
    } catch (error) {
        console.error("Error updating balances:", error);
    }
}

function openTokenModal(type) {
    selectedTokenType = type;
    tokenModal.classList.remove("hidden");
    populateTokenList();
}

function closeTokenModalFunc() {
    tokenModal.classList.add("hidden");
    tokenSearch.value = "";
    selectedTokenType = null;
}

function populateTokenList() {
    if (!tokenList) return;
    
    const tokens = COMMON_TOKENS[currentChainId] || COMMON_TOKENS[DEFAULT_CHAIN_ID];
    if (!tokens) return;
    
    tokenList.innerHTML = "";
    
    Object.values(tokens).forEach(token => {
        const tokenItem = document.createElement("button");
        tokenItem.className = "w-full p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-right flex items-center justify-between transition";
        tokenItem.innerHTML = `
            <div>
                <div class="font-semibold">${token.symbol}</div>
                <div class="text-xs text-slate-400">${token.name}</div>
            </div>
            <div class="text-xs text-slate-500 font-mono">${shortenAddress(token.address)}</div>
        `;
        tokenItem.addEventListener("click", () => selectToken(token));
        tokenList.appendChild(tokenItem);
    });
}

function filterTokenList() {
    const searchTerm = tokenSearch.value.toLowerCase();
    const items = tokenList.querySelectorAll("button");
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? "block" : "none";
    });
}

function selectToken(token) {
    if (selectedTokenType === 'from') {
        fromToken = token;
        fromTokenSymbol.textContent = token.symbol;
    } else {
        toToken = token;
        toTokenSymbol.textContent = token.symbol;
    }
    
    closeTokenModalFunc();
    updateBalances();
    handleAmountChange();
}

function swapTokenPositions() {
    const temp = fromToken;
    fromToken = toToken;
    toToken = temp;
    
    fromTokenSymbol.textContent = fromToken.symbol;
    toTokenSymbol.textContent = toToken.symbol;
    
    const tempAmount = fromAmount.value;
    fromAmount.value = toAmount.value;
    toAmount.value = tempAmount;
    
    updateBalances();
    handleAmountChange();
}

function setMaxAmount() {
    if (!signer || !userAddress) {
        showNotification("لطفاً ابتدا کیف‌پول را متصل کنید.", { type: "info" });
        return;
    }
    
    if (fromToken.address === '0x0000000000000000000000000000000000000000') {
        // ETH - get balance and set (leave some for gas)
        provider.getBalance(userAddress).then(balance => {
            const ethBalance = parseFloat(ethers.formatEther(balance));
            const maxAmount = Math.max(0, ethBalance - 0.001); // Leave 0.001 ETH for gas
            fromAmount.value = maxAmount.toFixed(6);
            handleAmountChange();
        });
    } else {
        // ERC20 - get balance and set
        const tokenContract = new ethers.Contract(fromToken.address, ERC20_ABI, provider);
        tokenContract.balanceOf(userAddress).then(balance => {
            const decimals = fromToken.decimals || 18;
            const formatted = ethers.formatUnits(balance, decimals);
            fromAmount.value = formatted;
            handleAmountChange();
        });
    }
}

async function handleAmountChange() {
    const amount = parseFloat(fromAmount.value);
    
    if (!amount || amount <= 0 || !fromToken || !toToken) {
        toAmount.value = "";
        swapInfo.classList.add("hidden");
        return;
    }
    
    if (!signer) {
        swapInfo.classList.add("hidden");
        return;
    }
    
    try {
        await getQuote(amount);
    } catch (error) {
        console.error("Error getting quote:", error);
        toAmount.value = "";
        swapInfo.classList.add("hidden");
    }
}

async function getQuote(amountIn) {
    const contracts = UNISWAP_CONTRACTS[currentChainId];
    if (!contracts) {
        throw new Error("Uniswap contracts not configured for this chain");
    }
    
    const tokenIn = fromToken.address === '0x0000000000000000000000000000000000000000' 
        ? contracts.weth 
        : fromToken.address;
    const tokenOut = toToken.address === '0x0000000000000000000000000000000000000000' 
        ? contracts.weth 
        : toToken.address;
    
    if (tokenIn === tokenOut) {
        throw new Error("Cannot swap same token");
    }
    
    const fee = 3000; // 0.3% fee tier
    const decimalsIn = fromToken.decimals || 18;
    const amountInWei = ethers.parseUnits(amountIn.toString(), decimalsIn);
    
    try {
        // Use Quoter contract to get quote
        const quoter = new ethers.Contract(contracts.quoter, QUOTER_ABI, provider);
        
        // For ETH swaps, we need to use WETH
        const quote = await quoter.quoteExactInputSingle.staticCall(
            tokenIn,
            tokenOut,
            fee,
            amountInWei,
            0
        );
        
        const decimalsOut = toToken.decimals || 18;
        const amountOut = ethers.formatUnits(quote, decimalsOut);
        toAmount.value = parseFloat(amountOut).toFixed(6);
        
        // Calculate exchange rate
        const rate = parseFloat(amountOut) / amountIn;
        exchangeRate.textContent = `1 ${fromToken.symbol} = ${rate.toFixed(6)} ${toToken.symbol}`;
        
        // Calculate minimum receive (0.5% slippage)
        const minReceiveAmount = parseFloat(amountOut) * 0.995;
        minReceive.textContent = `${minReceiveAmount.toFixed(6)} ${toToken.symbol}`;
        
        swapInfo.classList.remove("hidden");
        
    } catch (error) {
        console.error("Quote error:", error);
        // If quoter fails, try to estimate
        toAmount.value = "~";
        swapInfo.classList.add("hidden");
    }
}

async function executeSwap() {
    if (!signer || !userAddress) {
        showNotification("لطفاً ابتدا کیف‌پول را متصل کنید.", { type: "error" });
        await connectWallet();
        return;
    }
    
    const amount = parseFloat(fromAmount.value);
    if (!amount || amount <= 0) {
        showNotification("لطفاً مقدار معتبری وارد کنید.", { type: "error" });
        return;
    }
    
    const contracts = UNISWAP_CONTRACTS[currentChainId];
    if (!contracts) {
        showNotification("Uniswap برای این شبکه پیکربندی نشده است.", { type: "error" });
        return;
    }
    
    try {
        swapButton.disabled = true;
        swapButton.textContent = "در حال پردازش...";
        setSwapStatus("در حال آماده‌سازی معامله...", "info");
        
        const tokenIn = fromToken.address === '0x0000000000000000000000000000000000000000' 
            ? contracts.weth 
            : fromToken.address;
        const tokenOut = toToken.address === '0x0000000000000000000000000000000000000000' 
            ? contracts.weth 
            : toToken.address;
        
        const fee = 3000; // 0.3% fee tier
        const decimalsIn = fromToken.decimals || 18;
        const amountInWei = ethers.parseUnits(amount.toString(), decimalsIn);
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
        
        // Get quote for minimum amount out
        const quoter = new ethers.Contract(contracts.quoter, QUOTER_ABI, provider);
        const quote = await quoter.quoteExactInputSingle.staticCall(
            tokenIn,
            tokenOut,
            fee,
            amountInWei,
            0
        );
        
        // Apply 0.5% slippage
        const amountOutMinimum = quote * BigInt(995) / BigInt(1000);
        
        const router = new ethers.Contract(contracts.swapRouter, SWAP_ROUTER_ABI, signer);
        
        // Handle ETH input
        if (fromToken.address === '0x0000000000000000000000000000000000000000') {
            // ETH -> Token: Wrap ETH first, then swap
            setSwapStatus("در حال تبدیل ETH به WETH...", "info");
            const weth = new ethers.Contract(contracts.weth, WETH_ABI, signer);
            const wrapTx = await weth.deposit({ value: amountInWei });
            await wrapTx.wait();
            
            setSwapStatus("در حال تأیید WETH...", "info");
            const approveTx = await weth.approve(contracts.swapRouter, amountInWei);
            await approveTx.wait();
        } else {
            // ERC20 -> Token: Approve first
            setSwapStatus("در حال تأیید توکن...", "info");
            const tokenContract = new ethers.Contract(fromToken.address, ERC20_ABI, signer);
            const allowance = await tokenContract.allowance(userAddress, contracts.swapRouter);
            
            if (allowance < amountInWei) {
                const approveTx = await tokenContract.approve(contracts.swapRouter, amountInWei);
                await approveTx.wait();
            }
        }
        
        setSwapStatus("در حال اجرای معامله...", "info");
        
        const params = {
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: userAddress,
            deadline: deadline,
            amountIn: amountInWei,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0
        };
        
        const tx = await router.exactInputSingle(params);
        setSwapStatus(`معامله ارسال شد. در حال انتظار... (${shortenAddress(tx.hash)})`, "info");
        
        const receipt = await tx.wait();
        
        // If output is WETH and user wants ETH, unwrap
        if (toToken.address === '0x0000000000000000000000000000000000000000' && tokenOut === contracts.weth) {
            setSwapStatus("در حال تبدیل WETH به ETH...", "info");
            const weth = new ethers.Contract(contracts.weth, WETH_ABI, signer);
            const wethBalance = await weth.balanceOf(userAddress);
            const unwrapTx = await weth.withdraw(wethBalance);
            await unwrapTx.wait();
        }
        
        setSwapStatus(`معامله موفق! Hash: ${tx.hash}`, "success");
        showNotification(`معامله با موفقیت انجام شد!`, {
            type: "success",
            title: "موفق",
            duration: 5000
        });
        
        // Reset form
        fromAmount.value = "";
        toAmount.value = "";
        swapInfo.classList.add("hidden");
        
        // Update balances
        await updateBalances();
        
    } catch (error) {
        console.error("Swap error:", error);
        setSwapStatus(`خطا: ${error.message}`, "error");
        showNotification(`معامله ناموفق بود: ${error.message}`, {
            type: "error",
            title: "خطا"
        });
    } finally {
        swapButton.disabled = false;
        swapButton.textContent = "تبدیل";
    }
}

function setSwapStatus(message, type) {
    if (!swapStatus) return;
    
    swapStatus.classList.remove("hidden");
    swapStatus.textContent = message;
    swapStatus.className = "mt-4 p-3 rounded-lg text-sm text-right";
    
    if (type === "error") {
        swapStatus.classList.add("bg-red-900/50", "text-red-400");
    } else if (type === "success") {
        swapStatus.classList.add("bg-green-900/50", "text-green-400");
    } else {
        swapStatus.classList.add("bg-blue-900/50", "text-blue-400");
    }
}

function showNotification(message, opts = {}) {
    const {
        type = "info",
        title = "",
        duration = type === "error" ? null : 6000,
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

function shortenAddress(address = "") {
    if (!address || address.length < 10) return address || "N/A";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

