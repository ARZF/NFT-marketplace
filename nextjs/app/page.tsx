'use client';

import { useEffect, useState, useRef } from 'react';
import { BrowserProvider } from 'ethers';
import ListingCard from '@/components/ListingCard';
import {
  fetchListings,
  fetchConfig,
  uploadNFT,
  reindex,
  Listing,
  Config,
  UploadResponse,
} from '@/lib/api';
import {
  connectWallet,
  shortenAddress,
  WalletState,
  Signer,
  ipfsToHttps,
} from '@/lib/web3';
import {
  buyNFT,
  mintNFT,
  approveNFT,
  listNFT,
  enrichListingMetadata,
} from '@/lib/marketplace';

type StatusType = 'idle' | 'info' | 'success' | 'error';

interface Status {
  type: StatusType;
  message: string;
}

export default function Home() {
  const [wallet, setWallet] = useState<WalletState>({
    provider: null,
    signer: null,
    address: null,
  });
  const [listings, setListings] = useState<Listing[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [status, setStatus] = useState<Status>({ type: 'idle', message: '' });
  const [loading, setLoading] = useState(true);
  const [buySending, setBuySending] = useState<number | null>(null);

  // Mint form state
  const [mintImageFile, setMintImageFile] = useState<File | null>(null);
  const [mintPrice, setMintPrice] = useState('');
  const [mintSubmitting, setMintSubmitting] = useState(false);

  const statusTimeoutRef = useRef<NodeJS.Timeout | undefined>(null);

  // Load config and listings
  useEffect(() => {
    const init = async () => {
      try {
        const [configData, listingsData] = await Promise.all([
          fetchConfig(),
          fetchListings(),
        ]);
        setConfig(configData);
        setListings(listingsData);
      } catch (e) {
        console.error('Failed to load data:', e);
        setStatus({
          type: 'error',
          message: 'Failed to load marketplace data',
        });
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const clearStatus = () => {
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
  };

  const showStatus = (message: string, type: StatusType = 'info') => {
    clearStatus();
    setStatus({ message, type });
    if (type !== 'error') {
      statusTimeoutRef.current = setTimeout(() => {
        setStatus({ type: 'idle', message: '' });
      }, 5000);
    }
  };

  const handleConnect = async () => {
    try {
      const walletState = await connectWallet();
      setWallet(walletState);
      showStatus(`Connected: ${shortenAddress(walletState.address!)}`, 'success');
    } catch (e: any) {
      showStatus(e.message || 'Failed to connect wallet', 'error');
    }
  };

  const handleBuy = async (listing: Listing) => {
    if (!wallet.signer || !config) {
      showStatus('Please connect wallet first', 'error');
      return;
    }

    try {
      setBuySending(listing.token_id);
      showStatus('Confirm transaction in wallet...', 'info');

      await buyNFT(
        config.marketplaceAddress,
        listing.nft_address,
        listing.token_id,
        listing.price_wei,
        wallet.signer
      );

      showStatus('Transaction confirmed! Refreshing listings...', 'info');
      await reindex();
      const newListings = await fetchListings();
      setListings(newListings);
      showStatus('NFT purchased successfully!', 'success');
    } catch (e: any) {
      showStatus(
        e?.reason || e.message || 'Transaction failed',
        'error'
      );
    } finally {
      setBuySending(null);
    }
  };

  const handleMintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!mintImageFile) {
      showStatus('Please select an image file', 'error');
      return;
    }

    if (!wallet.signer || !wallet.address || !config) {
      showStatus('Please connect wallet first', 'error');
      return;
    }

    try {
      setMintSubmitting(true);
      showStatus('Uploading image to IPFS...', 'info');

      const formData = new FormData();
      formData.set('file', mintImageFile);

      const uploadResult: UploadResponse = await uploadNFT(formData);

      if (!uploadResult.ok || !uploadResult.metadata_cid) {
        throw new Error('Failed to upload metadata');
      }

      const tokenURI = `ipfs://${uploadResult.metadata_cid}`;
      const priceEth = parseFloat(mintPrice);

      if (!(priceEth > 0)) {
        throw new Error('Enter a valid positive price');
      }

      showStatus('Minting NFT on-chain...', 'info');
      const tokenId = await mintNFT(
        config.nftContractAddress,
        tokenURI,
        wallet.signer
      );

      showStatus('Approving marketplace...', 'info');
      await approveNFT(
        config.nftContractAddress,
        config.marketplaceAddress,
        tokenId.toString(),
        wallet.address,
        wallet.signer
      );

      showStatus('Creating marketplace listing...', 'info');
      await listNFT(
        config.marketplaceAddress,
        config.nftContractAddress,
        tokenId.toString(),
        priceEth,
        wallet.signer
      );

      showStatus('Refreshing inventory...', 'info');
      await reindex().catch(() => { });
      const newListings = await fetchListings();
      setListings(newListings);

      const metadataPreview = JSON.stringify(uploadResult.metadata, null, 2);
      showStatus(
        `Success! Minted token #${tokenId} and listed at ${priceEth} ETH\n\nMetadata: ${metadataPreview}`,
        'success'
      );

      setMintImageFile(null);
      setMintPrice('');
      const form = document.getElementById('mintForm') as HTMLFormElement;
      form?.reset();
    } catch (e: any) {
      showStatus(e.message || 'Mint and list failed', 'error');
    } finally {
      setMintSubmitting(false);
    }
  };

  const statusBgColor = {
    info: 'bg-blue-900/30 border-blue-500/50 text-blue-300',
    success: 'bg-emerald-900/30 border-emerald-500/50 text-emerald-300',
    error: 'bg-red-900/30 border-red-500/50 text-red-300',
    idle: 'hidden',
  };

  return (
    <div className="min-h-screen container mx-auto! py-20! space-y-10! ">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto px-4 py-4! flex items-center justify-between">
          <div className='space-y-2!'>
            <h1 className="text-2xl font-bold text-white">NFT Marketplace</h1>
            <p className="text-sm text-slate-400">Buy and sell digital assets</p>
          </div>
          <button
            onClick={handleConnect}
            className={`px-6! py-2! rounded-lg font-medium transition-all ${wallet.address
              ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-500/50'
              : 'bg-emerald-400 text-slate-900 hover:bg-emerald-300'
              }`}
          >
            {wallet.address ? shortenAddress(wallet.address) : 'Connect Wallet'}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Status Message */}
        {status.type !== 'idle' && (
          <div
            className={`mb-6 p-4 border rounded-lg whitespace-pre-wrap ${statusBgColor[status.type]}`}
          >
            {status.message}
          </div>
        )}

        {/* Mint Section */}
        {wallet.address && config && (
          <section className="mb-12 bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Mint & List NFT</h2>
            <form id="mintForm" onSubmit={handleMintSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-2">
                  Image File
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setMintImageFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">
                  Price (ETH)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={mintPrice}
                  onChange={(e) => setMintPrice(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white"
                  placeholder="0.0"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={mintSubmitting}
                className="w-full px-4 py-3 bg-emerald-400 text-slate-900 font-semibold rounded-lg hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {mintSubmitting ? 'Processing...' : 'Upload & Create Listing'}
              </button>
            </form>
          </section>
        )}

        {/* Listings Section */}
        <section>
          <h2 className="text-2xl font-bold text-white my-6!">Available Listings</h2>

          {loading ? (
            <div className="text-center text-slate-400">Loading...</div>
          ) : listings.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              No listings available
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.map((listing) => (
                <ListingCard
                  key={`${listing.nft_address}-${listing.token_id}`}
                  listing={listing}
                  onBuy={handleBuy}
                  isBuying={buySending === listing.token_id}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
