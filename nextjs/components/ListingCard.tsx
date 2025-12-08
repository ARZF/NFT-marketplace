'use client';

import { Listing } from '@/lib/api';
import { formatEther } from 'ethers';

interface ListingCardProps {
    listing: Listing;
    onBuy: (listing: Listing) => void;
    isBuying?: boolean;
}

export default function ListingCard({ listing, onBuy, isBuying }: ListingCardProps) {
    const imageUrl = listing.image_url || '/placeholder.svg';
    const price = parseFloat(listing.price_eth);

    return (
        <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-800 hover:border-emerald-500/50 transition-all hover:shadow-lg hover:shadow-emerald-500/10">
            {/* Image */}
            <div
                className="h-48 bg-cover bg-center"
                style={{ backgroundImage: `url(${imageUrl})` }}
            />

            {/* Content */}
            <div className="p-4">
                <h3 className="text-lg font-semibold text-white truncate">
                    {listing.name || `Token #${listing.token_id}`}
                </h3>

                <p className="text-sm text-slate-400 line-clamp-2 mt-1">
                    {listing.description || 'No description'}
                </p>

                {/* Seller */}
                <p className="text-xs text-slate-500 mt-2">
                    From:{' '}
                    {listing.seller_address.slice(0, 6)}...{listing.seller_address.slice(-4)}
                </p>

                {/* Price and Button */}
                <div className="mt-4 flex items-center justify-between gap-2">
                    <div>
                        <p className="text-xs text-slate-400">Price</p>
                        <p className="text-xl font-bold text-emerald-400">{price} ETH</p>
                    </div>

                    <button
                        onClick={() => onBuy(listing)}
                        disabled={listing.is_sold || isBuying}
                        className={`px-4 py-2 rounded font-medium text-sm transition-all flex-1 ${listing.is_sold
                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                : isBuying
                                    ? 'bg-slate-700 text-slate-300 cursor-wait'
                                    : 'bg-emerald-400 hover:bg-emerald-300 text-slate-900 cursor-pointer'
                            }`}
                    >
                        {listing.is_sold ? 'SOLD' : isBuying ? 'BUYING...' : 'BUY'}
                    </button>
                </div>
            </div>
        </div>
    );
}
