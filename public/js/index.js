  // Mobile menu toggler — put near other initialization code
(function(){
  const mobileToggle = document.getElementById('mobileToggle');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileBackdrop = document.getElementById('mobileBackdrop');
  const mobileClose = document.getElementById('mobileClose');
  const mobileWalletBtn = document.getElementById('mobileWalletBtn');
  const mobileViewOwned = document.getElementById('mobileViewOwned');
  const mobileDisconnect = document.getElementById('mobileDisconnect');

  if (!mobileToggle || !mobileMenu) return;

  function openMobileMenu(){
    mobileMenu.classList.add('open');
    mobileMenu.classList.remove('closed');
    mobileMenu.setAttribute('aria-hidden','false');
    mobileToggle.setAttribute('aria-expanded','true');
    mobileBackdrop.classList.remove('hidden');
    mobileBackdrop.classList.add('show');
    // prevent body scroll
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    // focus first link
    const firstLink = mobileMenu.querySelector('a, button');
    if (firstLink) firstLink.focus();
  }
  function closeMobileMenu(){
    mobileMenu.classList.remove('open');
    mobileMenu.classList.add('closed');
    mobileMenu.setAttribute('aria-hidden','true');
    mobileToggle.setAttribute('aria-expanded','false');
    mobileBackdrop.classList.add('hidden');
    mobileBackdrop.classList.remove('show');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    mobileToggle.focus();
  }

  // init closed state
  mobileMenu.classList.add('closed');
  mobileBackdrop.classList.add('hidden');

  mobileToggle.addEventListener('click', (e) => {
    const isOpen = mobileMenu.classList.contains('open');
    if (isOpen) closeMobileMenu(); else openMobileMenu();
  });
  mobileClose?.addEventListener('click', closeMobileMenu);
  mobileBackdrop?.addEventListener('click', closeMobileMenu);

  // close on Esc
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
      closeMobileMenu();
    }
  });

  // close mobile menu when screen is resized to md+ (so desktop header appears)
  const mq = window.matchMedia('(min-width: 900px)');
  mq.addEventListener?.('change', (ev) => {
    if (ev.matches) closeMobileMenu();
  });

  // Wire mobile wallet buttons to existing handlers if present
  // assumes you already have functions connectWallet(), viewOwnedNFTs(), disconnectWallet()
  if (mobileWalletBtn) {
    mobileWalletBtn.addEventListener('click', async (e) => {
      closeMobileMenu();
      if (typeof connectWallet === 'function') await connectWallet();
      else document.getElementById('walletButton')?.click();
    });
  }
  if (mobileViewOwned) {
    mobileViewOwned.addEventListener('click', (e) => {
      closeMobileMenu();
      if (typeof viewOwnedNFTs === 'function') viewOwnedNFTs();
      else document.getElementById('viewOwnedBtn')?.click();
    });
  }
  if (mobileDisconnect) {
    mobileDisconnect.addEventListener('click', (e) => {
      closeMobileMenu();
      if (typeof disconnectWallet === 'function') disconnectWallet();
      else document.getElementById('disconnectBtn')?.click();
    });
  }
})();

  
  /******************************
       * Notification / Toast system
       ******************************/
      const toastContainer = document.getElementById("toastContainer");

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

        // actions
        // if (actions && actions.length) {
        //   const actionsWrap = document.createElement("div");
        //   actionsWrap.className = "actions";
        //   actions.forEach((act) => {
        //     const btn = document.createElement("button");
        //     btn.className = "action-btn";
        //     if (act.primary) btn.classList.add("primary");
        //     btn.textContent = act.label || "باشه";
        //     btn.addEventListener("click", () => {
        //       try {
        //         act.onClick && act.onClick();
        //       } catch (e) {
        //         console.error(e);
        //       }
        //       dismissToast(toast);
        //     });
        //     actionsWrap.appendChild(btn);
        //   });
        //   body.appendChild(actionsWrap);
        // }

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
          } catch (e) {}
        }, 140);
      }

      // helper: copy text to clipboard and notify result
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
       * App logic (replacing alert -> notifications)
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
      const API_NFT_UPLOAD_URL = `${API_BASE}/api/nft/upload`;
      const API_REINDEX_URL = `${API_BASE}/api/reindex`;

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
      const ERC721_TRANSFER_TOPIC = ethers.id(
        "Transfer(address,address,uint256)"
      );

      // DOM refs
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
      closeOwnedModal?.addEventListener("click", () =>
        ownedNFTsModal?.classList.add("hidden")
      );
      ownedNFTsModal?.addEventListener("click", (e) => {
        if (e.target === ownedNFTsModal) ownedNFTsModal.classList.add("hidden");
      });
      disconnectBtn?.addEventListener("click", disconnectWallet);
      showAllBtn?.addEventListener("click", () => {
        renderListings(lastListings);
        walletMenu?.classList.add("hidden");
      });
      mintForm?.addEventListener("submit", handleMintForm);

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
          walletButton.textContent = shortenAddress(userAddress);
          walletButton.classList.remove("bg-slate-100", "text-slate-900");
          walletButton.classList.add("bg-emerald-400", "text-slate-900");
          mintSection?.classList.remove("hidden");
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
        mintSection?.classList.add("hidden");
        renderListings(lastListings);
        showNotification("کیف‌پول قطع شد.", { type: "info" });
      }

      function viewOwnedNFTs() {
        if (!userAddress) {
          showNotification("لطفاً ابتدا کیف‌پول را متصل کنید.", {
            type: "error",
            actions: [{ label: "باشه", primary: true }],
          });
          return;
        }
        const addr = userAddress.toLowerCase();
        const owned = lastListings.filter(
          (l) =>
            (l.seller_address && l.seller_address.toLowerCase() === addr) ||
            (l.owner && l.owner.toLowerCase() === addr)
        );
        renderOwnedNFTsModal(owned);
        walletMenu?.classList.add("hidden");
      }

      function renderOwnedNFTsModal(listings) {
        ownedNFTsGrid.innerHTML = "";
        if (!listings.length) {
          ownedEmptyState.classList.remove("hidden");
          ownedNFTsGrid.classList.add("hidden");
        } else {
          ownedEmptyState.classList.add("hidden");
          ownedNFTsGrid.classList.remove("hidden");
          listings.forEach((listing) => {
            const template = document
              .getElementById("listingCardTemplate")
              .content.cloneNode(true);
            const tokenName = listing.name || `Token #${listing.token_id}`;
            const imageUrl = listing.image_cid
              ? `https://level-blue-echidna.myfilebase.com/ipfs/${listing.image_cid}`
              : listing.image_url ||
                `https://picsum.photos/seed/${listing.token_id}/400/300`;
            template.querySelector('[data-field="title"]').textContent =
              tokenName;
            template.querySelector(
              '[data-field="address"]'
            ).textContent = `NFT: ${shortenAddress(listing.nft_address)}`;
            template.querySelector(
              '[data-field="price"]'
            ).textContent = `${listing.price_eth} ETH`;
            template.querySelector(
              '[data-field="seller"]'
            ).textContent = `فروشنده: ${shortenAddress(
              listing.seller_address
            )}`;
            template.querySelector(
              '[data-field="image"]'
            ).style.backgroundImage = `url(${imageUrl})`;
            const buyButton = template.querySelector(".buy-btn");
            buyButton.addEventListener("click", () =>
              handleBuy(listing, buyButton)
            );
            ownedNFTsGrid.appendChild(template);
          });
        }
        ownedNFTsModal.classList.remove("hidden");
      }

      async function fetchListings() {
        try {
          const response = await fetch(API_LISTINGS_URL);
          if (!response.ok) throw new Error(`API returned ${response.status}`);
          const listings = await response.json();
          lastListings = listings || [];
          renderListings(lastListings);
        } catch (error) {
          console.error("Failed to fetch listings", error);
          emptyState.textContent =
            "بارگذاری آگهی‌ها ناموفق بود. بک‌اند را بررسی کنید.";
          emptyState.classList.remove("hidden");
          showNotification(
            "بارگذاری آگهی‌ها ناموفق بود. بک‌اند را بررسی کنید.",
            { type: "error", actions: [{ label: "باشه", primary: true }] }
          );
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
          const tokenName = listing.name || `Token #${listing.token_id}`;
          const imageUrl = listing.image_cid
            ? `https://level-blue-echidna.myfilebase.com/ipfs/${listing.image_cid}`
            : listing.image_url ||
              `https://picsum.photos/seed/${listing.token_id}/400/300`;
          template.querySelector('[data-field="title"]').textContent =
            tokenName;
          template.querySelector(
            '[data-field="address"]'
          ).textContent = `NFT: ${shortenAddress(listing.nft_address)}`;
          template.querySelector(
            '[data-field="price"]'
          ).textContent = `${listing.price_eth} ETH`;
          template.querySelector(
            '[data-field="seller"]'
          ).textContent = `فروشنده: ${shortenAddress(listing.seller_address)}`;
          template.querySelector(
            '[data-field="image"]'
          ).style.backgroundImage = `url(${imageUrl})`;
          const buyButton = template.querySelector(".buy-btn");
          buyButton.addEventListener("click", () =>
            handleBuy(listing, buyButton)
          );
          listingsGrid.appendChild(template);
        });
      }

      async function handleBuy(listing, button) {
        try {
          if (!signer) await connectWallet();
          if (!signer) return;
          const contract = new ethers.Contract(
            MARKETPLACE_ADDRESS,
            MARKETPLACE_ABI,
            signer
          );
          button.disabled = true;
          button.textContent = "تأیید در کیف‌پول...";
          const tx = await contract.buyItem(
            listing.nft_address,
            listing.token_id,
            { value: listing.price_wei }
          );
          button.textContent = "در انتظار تایید شبکه...";
          await tx.wait();
          button.textContent = "فروخته شد";
          button.classList.remove("bg-emerald-400", "hover:bg-emerald-300");
          button.classList.add("bg-slate-700", "text-slate-400");

          // show success notification with copy action
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
          button.disabled = false;
          button.textContent = "خرید";
        }
      }

      async function handleMintForm(event) {
        event.preventDefault();
        if (!mintImageInput?.files?.length) {
          setMintStatus(
            "لطفاً یک فایل تصویری برای آپلود انتخاب کنید.",
            "error"
          );
          return;
        }
        const formData = new FormData(mintForm);
        formData.set("file", mintImageInput.files[0]);

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
          const nft = new ethers.Contract(
            NFT_CONTRACT_ADDRESS,
            NFT_ABI,
            signer
          );
          const txMint = await nft.mint(tokenURI);
          const receiptMint = await txMint.wait();

          let mintedTokenId = null;
          for (const log of receiptMint.logs ?? []) {
            if (
              log.address.toLowerCase() !== NFT_CONTRACT_ADDRESS.toLowerCase()
            )
              continue;
            try {
              const parsed = nft.interface.parseLog(log);
              if (parsed && parsed.name === "Transfer") {
                mintedTokenId = parsed.args.tokenId ?? parsed.args[2];
                break;
              }
            } catch (e) {}
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

          setMintStatus("آگهی ایجاد شد. در حال بروزرسانی...", "info");
          await fetch(API_REINDEX_URL, { method: "POST" }).catch(() => {});
          await fetchListings();

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
          showNotification(
            error.message || "عملیات ناموفق بود. کنسول را بررسی کنید.",
            {
              type: "error",
              title: "خطا",
              actions: [{ label: "باشه", primary: true }],
            }
          );
          setMintStatus(error.message || "خطا", "error");
        } finally {
          mintSubmitButton.disabled = false;
          mintSubmitButton.textContent = "آپلود و آماده‌سازی متادیتا";
        }
      }

      function setMintStatus(message, type = "info") {
        if (!mintResult) return;
        mintResult.textContent = message;
        mintResult.classList.remove(
          "hidden",
          "text-slate-300",
          "text-emerald-300",
          "text-red-400"
        );
        const classMap = {
          info: "text-slate-300",
          success: "text-emerald-300",
          error: "text-red-400",
        };
        mintResult.classList.add(classMap[type] ?? "text-slate-300");
        mintResult.classList.remove("hidden");
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
          if (cfg?.marketplaceAddress)
            MARKETPLACE_ADDRESS = cfg.marketplaceAddress;
          if (cfg?.nftContractAddress)
            NFT_CONTRACT_ADDRESS = cfg.nftContractAddress;
        } catch (e) {
          console.warn(e);
        }
      }

      async function validateConfig() {
        if (!NFT_CONTRACT_ADDRESS || !MARKETPLACE_ADDRESS) {
          setMintStatus("آدرس قراردادها یافت نشد.", "error");
          showNotification("آدرس قراردادها یافت نشد.", {
            type: "error",
            actions: [{ label: "باشه", primary: true }],
          });
          return false;
        }
        if (
          NFT_CONTRACT_ADDRESS.toLowerCase() ===
          MARKETPLACE_ADDRESS.toLowerCase()
        ) {
          setMintStatus(
            "آدرس قرارداد NFT نباید برابر آدرس بازارچه باشد.",
            "error"
          );
          showNotification("آدرس قرارداد NFT نباید برابر آدرس بازارچه باشد.", {
            type: "error",
            actions: [{ label: "باشه", primary: true }],
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
            actions: [{ label: "باشه", primary: true }],
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

      // initialize
      fetchListings();