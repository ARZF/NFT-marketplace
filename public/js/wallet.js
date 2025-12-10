        const LOCAL_API_FALLBACK = "http://localhost:8000";
        const params = new URLSearchParams(window.location.search);
        const manualApiOverride = params.get("api");
        const isLocalhost =
            window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1";
        // In production (Railway, Vercel, etc.), default to same-origin backend.
        const defaultApiBase = isLocalhost ? LOCAL_API_FALLBACK : window.location.origin;
        const API_BASE = (manualApiOverride ?? defaultApiBase).replace(/\/$/, "");
        const API_LISTINGS_URL = `${API_BASE}/api/listings`;
        const API_NFT_UPLOAD_URL = `${API_BASE}/api/nft/upload`;
        const API_REINDEX_URL = `${API_BASE}/api/reindex`;
        // Default to your deployed SimpleMarketplace on Sepolia.
        // You can override this in the future by editing this constant or by
        // wiring a small config endpoint in the backend.
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

        loadBackendConfig();

        const listingsGrid = document.getElementById("listingsGrid");
        const emptyState = document.getElementById("emptyState");
        const walletButton = document.getElementById("walletButton");
        const walletMenu = document.getElementById("walletMenu");
        const viewOwnedBtn = document.getElementById("viewOwnedBtn");
        const disconnectBtn = document.getElementById("disconnectBtn");
        const showAllBtn = document.getElementById("showAllBtn");
        const mintForm = document.getElementById("mintForm");
        const mintResult = document.getElementById("mintResult");
        const mintSubmitButton = document.getElementById("mintSubmitButton");
        const mintImageInput = document.getElementById("mintImage");
        const mintPriceInput = document.getElementById("mintPrice");
        const mintSection = document.getElementById("mintSection");
        const ownedNFTsModal = document.getElementById("ownedNFTsModal");
        const ownedNFTsGrid = document.getElementById("ownedNFTsGrid");
        const ownedEmptyState = document.getElementById("ownedEmptyState");
        const closeOwnedModal = document.getElementById("closeOwnedModal");

        let provider = null;
        let signer = null;
        let userAddress = null;
        let lastListings = [];
        walletButton.addEventListener("click", handleWalletButtonClick);
        viewOwnedBtn?.addEventListener("click", viewOwnedNFTs);
        closeOwnedModal?.addEventListener("click", () => ownedNFTsModal?.classList.add('hidden'));
        ownedNFTsModal?.addEventListener("click", (e) => { if (e.target === ownedNFTsModal) ownedNFTsModal.classList.add('hidden'); });
        disconnectBtn?.addEventListener("click", disconnectWallet);
        showAllBtn?.addEventListener("click", () => { renderListings(lastListings); walletMenu?.classList.add('hidden'); });
        mintForm?.addEventListener("submit", handleMintForm);

        async function connectWallet() {
            if (!window.ethereum) {
                alert("MetaMask (or another EIP-1193 wallet) is required.");
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
                // show mint form when wallet connected
                mintSection?.classList.remove('hidden');
                // hide menu on connect (will toggle when clicking)
                walletMenu?.classList.add('hidden');
            } catch (error) {
                console.error("Wallet connection failed", error);
                alert(`Unable to connect wallet: ${error.message}`);
            }
        }

        function handleWalletButtonClick() {
            // If connected, toggle dropdown menu; otherwise initiate connect
            if (signer && userAddress) {
                walletMenu?.classList.toggle('hidden');
            } else {
                connectWallet();
            }
        }

        function disconnectWallet() {
            provider = null;
            signer = null;
            userAddress = null;
            walletButton.textContent = 'Connect Wallet';
            walletButton.classList.remove('bg-emerald-400');
            walletButton.classList.add('bg-slate-100', 'text-slate-900');
            walletMenu?.classList.add('hidden');
            // hide mint form when disconnected
            mintSection?.classList.add('hidden');
            // restore full listing view
            renderListings(lastListings);
        }

        function viewOwnedNFTs() {
            if (!userAddress) {
                alert('Please connect your wallet first.');
                return;
            }
            const addr = userAddress.toLowerCase();
            const owned = lastListings.filter(l => (l.seller_address && l.seller_address.toLowerCase() === addr) || (l.owner && l.owner.toLowerCase() === addr));
            renderOwnedNFTsModal(owned);
            walletMenu?.classList.add('hidden');
        }

        function renderOwnedNFTsModal(listings) {
            ownedNFTsGrid.innerHTML = "";
            if (!listings.length) {
                ownedEmptyState.classList.remove('hidden');
                ownedNFTsGrid.classList.add('hidden');
            } else {
                ownedEmptyState.classList.add('hidden');
                ownedNFTsGrid.classList.remove('hidden');
                listings.forEach((listing) => {
                    const template = document
                        .getElementById("listingCardTemplate")
                        .content.cloneNode(true);
                    const tokenName = listing.name || `Token #${listing.token_id}`;
                    const imageUrl = listing.image_cid
                        ? `https://level-blue-echidna.myfilebase.com/ipfs/${listing.image_cid}`
                        : listing.image_url || `https://picsum.photos/seed/${listing.token_id}/400/300`;
                    template.querySelector('[data-field="title"]').textContent = tokenName;
                    template.querySelector('[data-field="address"]').textContent = `NFT: ${shortenAddress(listing.nft_address)}`;
                    template.querySelector('[data-field="price"]').textContent = `${listing.price_eth} ETH`;
                    template.querySelector('[data-field="seller"]').textContent = `Seller: ${shortenAddress(listing.seller_address)}`;
                    template.querySelector('[data-field="image"]').style.backgroundImage = `url(${imageUrl})`;
                    const buyButton = template.querySelector(".buy-btn");
                    buyButton.addEventListener("click", () => handleBuy(listing, buyButton));
                    ownedNFTsGrid.appendChild(template);
                });
            }
            ownedNFTsModal.classList.remove('hidden');
        }

        async function fetchListings() {
            try {
                const response = await fetch(API_LISTINGS_URL);
                if (!response.ok) {
                    throw new Error(`API returned ${response.status}`);
                }
                const listings = await response.json();
                lastListings = listings || [];
                renderListings(lastListings);
            } catch (error) {
                console.error("Failed to fetch listings", error);
                emptyState.textContent = "Unable to load listings. Check backend.";
                emptyState.classList.remove("hidden");
            }
        }

        function renderListings(listings) {
            listingsGrid.innerHTML = "";
            if (!listings.length) {
                emptyState.classList.remove("hidden");
                return;
            }
            emptyState.classList.add("hidden");
            listings.forEach((listing) => {
                const template = document
                    .getElementById("listingCardTemplate")
                    .content.cloneNode(true);

                // Use actual metadata if available, otherwise fallback to defaults
                const tokenName = listing.name || `Token #${listing.token_id}`;
                const imageUrl = listing.image_cid
                    ? `https://level-blue-echidna.myfilebase.com/ipfs/${listing.image_cid}`
                    : listing.image_url || `https://picsum.photos/seed/${listing.token_id}/400/300`;

                template.querySelector('[data-field="title"]').textContent = tokenName;
                template.querySelector('[data-field="address"]').textContent = `NFT: ${shortenAddress(listing.nft_address)}`;
                template.querySelector('[data-field="price"]').textContent = `${listing.price_eth} ETH`;
                template.querySelector('[data-field="seller"]').textContent = `Seller: ${shortenAddress(
                    listing.seller_address
                )}`;
                template.querySelector('[data-field="image"]').style.backgroundImage = `url(${imageUrl})`;

                const buyButton = template.querySelector(".buy-btn");
                buyButton.addEventListener("click", () => handleBuy(listing, buyButton));

                listingsGrid.appendChild(template);
            });
        }

        async function handleBuy(listing, button) {
            try {
                if (!signer) {
                    await connectWallet();
                }
                if (!signer) {
                    return;
                }
                const contract = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
                button.disabled = true;
                button.textContent = "Confirm in wallet...";
                const tx = await contract.buyItem(listing.nft_address, listing.token_id, {
                    value: listing.price_wei,
                });
                button.textContent = "Waiting for block...";
                await tx.wait();
                button.textContent = "SOLD";
                button.classList.remove("bg-emerald-400", "hover:bg-emerald-300");
                button.classList.add("bg-slate-700", "text-slate-400");
                alert(`Success! Tx hash: ${tx.hash}`);
            } catch (error) {
                console.error("Transaction failed", error);
                alert(error?.data?.message ?? error.message ?? "Transaction rejected");
                button.disabled = false;
                button.textContent = "Buy NFT";
            }
        }

        async function handleMintForm(event) {
            event.preventDefault();
            if (!mintImageInput?.files?.length) {
                setMintStatus("Please choose an image file to upload.", "error");
                return;
            }
            const formData = new FormData(mintForm);
            formData.set("file", mintImageInput.files[0]);

            try {
                if (!signer) {
                    await connectWallet();
                }
                if (!signer) {
                    setMintStatus("Wallet connection required.", "error");
                    return;
                }

                // Reload config in case it changed
                await loadBackendConfig();
                const valid = await validateConfig();
                if (!valid) {
                    return;
                }

                mintSubmitButton.disabled = true;
                mintSubmitButton.textContent = "Uploading...";
                setMintStatus("Uploading artwork to NFT.Storage...", "info");

                const response = await fetch(API_NFT_UPLOAD_URL, {
                    method: "POST",
                    body: formData,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(errText || `Upload failed (${response.status})`);
                }
                const result = await response.json();
                if (!result?.ok) {
                    throw new Error("Unexpected response from backend");
                }

                if (!result.metadata_cid) {
                    throw new Error("Metadata CID not returned from backend");
                }
                const tokenURI = `ipfs://${result.metadata_cid}`;

                const priceEth = parseFloat(mintPriceInput.value);
                if (!(priceEth > 0)) {
                    throw new Error("Enter a valid positive price");
                }
                const priceWei = ethers.parseUnits(priceEth.toString(), 18);

                setMintStatus("Minting NFT on-chain...", "info");
                const nft = new ethers.Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, signer);
                const txMint = await nft.mint(tokenURI);
                const receiptMint = await txMint.wait();

                let mintedTokenId = null;

                // Try to find parsed Transfer event using the contract interface
                for (const log of receiptMint.logs ?? []) {
                    // only consider logs from our NFT contract
                    if (log.address.toLowerCase() !== NFT_CONTRACT_ADDRESS.toLowerCase()) continue;
                    try {
                        const parsed = nft.interface.parseLog(log);
                        if (parsed && parsed.name === "Transfer") {
                            // parsed.args[2] is tokenId (Transfer(address,address,uint256))
                            mintedTokenId = parsed.args.tokenId ?? parsed.args[2];
                            break;
                        }
                    } catch (e) {
                        // not a log we can parse with this interface — ignore
                    }
                }

                if (mintedTokenId === null) {
                    throw new Error("Unable to determine minted tokenId from receipt logs");
                }

                // Normalize to string for later calls
                const tokenIdForApprove = mintedTokenId.toString();
                console.log("Using tokenId for approval:", tokenIdForApprove);

                setMintStatus("Approving marketplace...", "info");

                // Try setApprovalForAll first (more gas efficient and avoids per-token issues)
                try {
                    const isApproved = await nft.isApprovedForAll(userAddress, MARKETPLACE_ADDRESS);
                    if (!isApproved) {
                        console.log("Setting approval for all tokens...");
                        const approveAllTx = await nft.setApprovalForAll(MARKETPLACE_ADDRESS, true);
                        await approveAllTx.wait();
                        console.log("Approval for all completed");
                    } else {
                        console.log("Already approved for all");
                    }
                } catch (approveAllError) {
                    console.warn("setApprovalForAll failed, trying per-token approval:", approveAllError);
                    // Fall back to per-token approval
                    const approveTx = await nft.approve(MARKETPLACE_ADDRESS, tokenIdForApprove);
                    await approveTx.wait();
                }

                setMintStatus("Creating marketplace listing...", "info");
                const market = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
                const txList = await market.listItem(NFT_CONTRACT_ADDRESS, tokenIdForApprove, priceWei);
                await txList.wait();

                setMintStatus("Listing created. Refreshing inventory...", "info");
                await fetch(API_REINDEX_URL, { method: "POST" }).catch(() => { });
                await fetchListings();

                const metadataPreview = JSON.stringify(result.metadata, null, 2);
                setMintStatus(
                    `Success! Minted tokenId: ${mintedTokenId.toString()} and listed at ${priceEth} ETH.\n\nMetadata preview:\n${metadataPreview}`,
                    "success"
                );
                mintForm.reset();
            } catch (error) {
                console.error("Mint+List failed", error);
                setMintStatus(error.message || "Operation failed. See console.", "error");
            } finally {
                mintSubmitButton.disabled = false;
                mintSubmitButton.textContent = "Upload & Prepare Metadata";
            }
        }

        function setMintStatus(message, type = "info") {
            if (!mintResult) {
                return;
            }
            mintResult.textContent = message;
            mintResult.classList.remove("hidden", "text-slate-300", "text-emerald-300", "text-red-400");
            const classMap = {
                info: "text-slate-300",
                success: "text-emerald-300",
                error: "text-red-400",
            };
            mintResult.classList.add(classMap[type] ?? "text-slate-300");
        }

        function shortenAddress(address = "") {
            if (!address || address.length < 10) return address || "N/A";
            return `${address.slice(0, 6)}...${address.slice(-4)}`;
        }

        async function loadBackendConfig() {
            try {
                const resp = await fetch(`${API_BASE}/api/config`);
                if (!resp.ok) return;
                const cfg = await resp.json();
                if (cfg?.marketplaceAddress) {
                    MARKETPLACE_ADDRESS = cfg.marketplaceAddress;
                }
                if (cfg?.nftContractAddress) {
                    NFT_CONTRACT_ADDRESS = cfg.nftContractAddress;
                }
            } catch { }
        }

        async function validateConfig() {
            if (!NFT_CONTRACT_ADDRESS || !MARKETPLACE_ADDRESS) {
                setMintStatus("Missing contract addresses.", "error");
                return false;
            }
            if (NFT_CONTRACT_ADDRESS.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase()) {
                setMintStatus("NFT_CONTRACT_ADDRESS must differ from MARKETPLACE_ADDRESS.", "error");
                return false;
            }
            if (!provider) {
                await connectWallet();
                if (!provider) return false;
            }

            // Validate address format
            try {
                ethers.getAddress(NFT_CONTRACT_ADDRESS);
                ethers.getAddress(MARKETPLACE_ADDRESS);
            } catch (e) {
                setMintStatus("Invalid contract address format.", "error");
                return false;
            }

            // Check if contracts exist (this depends on the network the user is connected to)
            try {
                const nftCode = await provider.getCode(NFT_CONTRACT_ADDRESS);
                const marketCode = await provider.getCode(MARKETPLACE_ADDRESS);

                // If no code found, warn but don't block (user might be on wrong network)
                // The transaction will fail naturally if contracts don't exist
                if (!nftCode || nftCode === "0x") {
                    const network = await provider.getNetwork();
                    console.warn(
                        `No contract found at NFT_CONTRACT_ADDRESS on ${network.name} (chainId: ${network.chainId}). ` +
                        `Make sure you're connected to the correct network.`
                    );
                    // Don't return false - allow user to proceed, transaction will fail if wrong network
                }
                if (!marketCode || marketCode === "0x") {
                    const network = await provider.getNetwork();
                    console.warn(
                        `No contract found at MARKETPLACE_ADDRESS on ${network.name} (chainId: ${network.chainId}). ` +
                        `Make sure you're connected to the correct network.`
                    );
                    // Don't return false - allow user to proceed, transaction will fail if wrong network
                }
            } catch (e) {
                // If getCode fails, it might be a network issue - still allow proceeding
                // The actual transaction will fail if contracts don't exist anyway
                console.warn("Could not verify contract existence:", e);
                setMintStatus(
                    "Warning: Could not verify contracts exist. Make sure you're on the correct network. " +
                    "The transaction will fail if contracts don't exist.",
                    "info"
                );
                // Don't return false - allow user to proceed, transaction will fail if wrong
            }
            return true;
        }

        fetchListings();
