// Relay Swap Implementation for Sepolia and Base Sepolia
// Uses Relay API for meta-aggregation swaps

// Relay API Configuration
const RELAY_API_URL = 'https://api.testnets.relay.link/quote/v2';

// Chain-specific WETH addresses (for wrapping/unwrapping if needed)
const WETH_ADDRESSES = {
    11155111: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH Sepolia
    84532: '0x4200000000000000000000000000000000000006', // WETH Base Sepolia
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

// Relay doesn't require specific contract ABIs - it uses API calls

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
    if (!signer || !userAddress) {
        toAmount.value = "";
        swapInfo.classList.add("hidden");
        return;
    }

    // Checksum addresses and handle native ETH properly
    let tokenIn, tokenOut;

    if (fromToken.address === '0x0000000000000000000000000000000000000000') {
        // For native ETH, use zero address
        tokenIn = '0x0000000000000000000000000000000000000000';
    } else {
        // Checksum the address
        try {
            tokenIn = ethers.getAddress(fromToken.address);
        } catch (e) {
            console.error("Invalid fromToken address:", fromToken.address);
            toAmount.value = "";
            swapInfo.classList.add("hidden");
            return;
        }
    }

    if (toToken.address === '0x0000000000000000000000000000000000000000') {
        tokenOut = '0x0000000000000000000000000000000000000000';
    } else {
        try {
            tokenOut = ethers.getAddress(toToken.address);
        } catch (e) {
            console.error("Invalid toToken address:", toToken.address);
            toAmount.value = "";
            swapInfo.classList.add("hidden");
            return;
        }
    }

    if (tokenIn === tokenOut) {
        toAmount.value = "";
        swapInfo.classList.add("hidden");
        return;
    }

    const decimalsIn = fromToken.decimals || 18;
    const amountInWei = ethers.parseUnits(amountIn.toString(), decimalsIn);

    try {
        // Call Relay API for quote with correct field names
        const quoteResponse = await fetch(RELAY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user: ethers.getAddress(userAddress), // Checksum user address
                originChainId: currentChainId,
                destinationChainId: currentChainId, // Same chain swap
                originCurrency: tokenIn,
                destinationCurrency: tokenOut,
                recipient: ethers.getAddress(userAddress), // Checksum recipient address
                tradeType: "EXACT_INPUT",
                amount: amountInWei.toString(),
                referrer: "relay.link/swap",
                useExternalLiquidity: true  // Use external DEX aggregators for same-chain swaps
            })
        });

        if (!quoteResponse.ok) {
            const errorData = await quoteResponse.json().catch(() => ({}));
            // Log full error for debugging
            console.error("Relay API Error:", errorData);

            // Provide more specific error messages
            let errorMessage = errorData.message || errorData.error || `Quote failed: ${quoteResponse.status}`;

            if (errorData.code === 'INVALID_INPUT_CURRENCY' || errorData.code === 'INVALID_OUTPUT_CURRENCY') {
                errorMessage = `توکن انتخاب شده پشتیبانی نمی‌شود. لطفاً توکن دیگری انتخاب کنید.`;
            } else if (errorData.message && errorData.message.includes('currency')) {
                errorMessage = `توکن انتخاب شده پشتیبانی نمی‌شود. لطفاً توکن دیگری انتخاب کنید.`;
            } else if (errorData.message && errorData.message.includes('origin chain configuration')) {
                errorMessage = `پیکربندی شبکه برای معامله یافت نشد. لطفاً دوباره تلاش کنید.`;
            } else if (errorData.message && errorData.message.includes('protocol flow')) {
                errorMessage = `خطا در مسیریابی. لطفاً دوباره تلاش کنید.`;
            }

            throw new Error(errorMessage);
        }

        const quoteData = await quoteResponse.json();

        // Relay returns destinationAmount in the response
        // Check if we have steps with items
        if (!quoteData.steps || !quoteData.steps[0] || !quoteData.steps[0].items || !quoteData.steps[0].items[0]) {
            throw new Error("Invalid quote response structure");
        }

        // Extract destination amount from quote data
        // The amount might be in the quote data or we need to calculate from steps
        const decimalsOut = toToken.decimals || 18;
        let amountOut = null;

        // Try to get destinationAmount from quote data (check multiple possible locations)
        if (quoteData.destinationAmount) {
            amountOut = ethers.formatUnits(quoteData.destinationAmount, decimalsOut);
        } else if (quoteData.quote && quoteData.quote.destinationAmount) {
            amountOut = ethers.formatUnits(quoteData.quote.destinationAmount, decimalsOut);
        } else {
            // If we can't get the exact amount, show placeholder
            // The actual amount will be determined when executing the swap
            toAmount.value = "...";
            swapInfo.classList.add("hidden");
            return;
        }

        toAmount.value = parseFloat(amountOut).toFixed(6);

        // Calculate exchange rate
        const rate = parseFloat(amountOut) / amountIn;
        exchangeRate.textContent = `1 ${fromToken.symbol} = ${rate.toFixed(6)} ${toToken.symbol}`;

        // Use minimum amount from Relay (already includes slippage)
        const minAmount = quoteData.destinationAmountMin || quoteData.quote?.destinationAmountMin || quoteData.destinationAmount;
        const minReceiveAmount = ethers.formatUnits(minAmount, decimalsOut);
        minReceive.textContent = `${parseFloat(minReceiveAmount).toFixed(6)} ${toToken.symbol}`;

        // Show fee if available
        if (quoteData.fee) {
            const feeAmount = ethers.formatUnits(quoteData.fee, decimalsOut);
            document.getElementById("swapFee").textContent = `${parseFloat(feeAmount).toFixed(6)} ${toToken.symbol}`;
        } else if (quoteData.quote?.fee) {
            const feeAmount = ethers.formatUnits(quoteData.quote.fee, decimalsOut);
            document.getElementById("swapFee").textContent = `${parseFloat(feeAmount).toFixed(6)} ${toToken.symbol}`;
        }

        swapInfo.classList.remove("hidden");

    } catch (error) {
        console.error("Quote error:", error);
        toAmount.value = "";
        swapInfo.classList.add("hidden");
        // Don't show error notification for quote failures, just hide the info
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

    try {
        swapButton.disabled = true;
        swapButton.textContent = "در حال پردازش...";
        setSwapStatus("در حال دریافت نرخ...", "info");

        // Checksum addresses and handle native ETH properly
        let tokenIn, tokenOut;

        if (fromToken.address === '0x0000000000000000000000000000000000000000') {
            tokenIn = '0x0000000000000000000000000000000000000000';
        } else {
            try {
                tokenIn = ethers.getAddress(fromToken.address);
            } catch (e) {
                throw new Error(`آدرس توکن ورودی نامعتبر است: ${fromToken.address}`);
            }
        }

        if (toToken.address === '0x0000000000000000000000000000000000000000') {
            tokenOut = '0x0000000000000000000000000000000000000000';
        } else {
            try {
                tokenOut = ethers.getAddress(toToken.address);
            } catch (e) {
                throw new Error(`آدرس توکن خروجی نامعتبر است: ${toToken.address}`);
            }
        }

        const decimalsIn = fromToken.decimals || 18;
        const amountInWei = ethers.parseUnits(amount.toString(), decimalsIn);

        // Get quote from Relay API with correct field names
        setSwapStatus("در حال دریافت نرخ از Relay...", "info");
        const quoteResponse = await fetch(RELAY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user: ethers.getAddress(userAddress), // Checksum user address
                originChainId: currentChainId,
                destinationChainId: currentChainId,
                originCurrency: tokenIn,
                destinationCurrency: tokenOut,
                recipient: ethers.getAddress(userAddress), // Checksum recipient address
                tradeType: "EXACT_INPUT",
                amount: amountInWei.toString(),
                referrer: "relay.link/swap",
                useExternalLiquidity: true  // Use external DEX aggregators for same-chain swaps
            })
        });

        if (!quoteResponse.ok) {
            const errorData = await quoteResponse.json().catch(() => ({}));
            // Log full error for debugging
            console.error("Relay API Error:", errorData);

            // Provide more specific error messages
            let errorMessage = errorData.message || errorData.error || `Quote failed: ${quoteResponse.status}`;

            if (errorData.code === 'INVALID_INPUT_CURRENCY' || errorData.code === 'INVALID_OUTPUT_CURRENCY') {
                errorMessage = `توکن انتخاب شده پشتیبانی نمی‌شود. لطفاً توکن دیگری انتخاب کنید.`;
            } else if (errorData.message && errorData.message.includes('currency')) {
                errorMessage = `توکن انتخاب شده پشتیبانی نمی‌شود. لطفاً توکن دیگری انتخاب کنید.`;
            } else if (errorData.message && errorData.message.includes('origin chain configuration')) {
                errorMessage = `پیکربندی شبکه برای معامله یافت نشد. لطفاً دوباره تلاش کنید.`;
            } else if (errorData.message && errorData.message.includes('protocol flow')) {
                errorMessage = `خطا در مسیریابی. لطفاً دوباره تلاش کنید.`;
            } else if (errorData.message && errorData.message.includes('validating')) {
                errorMessage = `خطا در اعتبارسنجی درخواست. لطفاً دوباره تلاش کنید.`;
            }

            throw new Error(errorMessage);
        }

        const quoteData = await quoteResponse.json();

        if (!quoteData.steps || quoteData.steps.length === 0) {
            throw new Error("No swap steps returned from Relay");
        }

        setSwapStatus(`در حال اجرای ${quoteData.steps.length} مرحله معامله...`, "info");

        // Execute each step from Relay
        // Relay returns steps[0].items[0].data with to, data, value
        let lastTxHash = null;
        for (let i = 0; i < quoteData.steps.length; i++) {
            const step = quoteData.steps[i];

            // Each step can have multiple items
            if (!step.items || step.items.length === 0) {
                continue;
            }

            for (let j = 0; j < step.items.length; j++) {
                const item = step.items[j];
                if (!item.data) {
                    continue;
                }

                setSwapStatus(`مرحله ${i + 1}-${j + 1} از ${quoteData.steps.length}...`, "info");

                // Prepare transaction from item.data
                const txParams = {
                    to: item.data.to,
                    data: item.data.data,
                    value: item.data.value ? BigInt(item.data.value) : 0n
                };

                // Send transaction
                const tx = await signer.sendTransaction(txParams);
                lastTxHash = tx.hash;

                setSwapStatus(`مرحله ${i + 1}-${j + 1} ارسال شد. در حال انتظار... (${shortenAddress(tx.hash)})`, "info");

                // Wait for confirmation
                const receipt = await tx.wait();

                if (!receipt.status) {
                    throw new Error(`Transaction ${i + 1}-${j + 1} failed`);
                }
            }
        }

        setSwapStatus(`معامله موفق! Hash: ${lastTxHash}`, "success");
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

