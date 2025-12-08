'use client';

import { formatEther } from 'ethers';

interface Listing {
    id: string;
    name: string;
    description: string;
    image_url: string;
    price_eth: string;
    token_id: string;
    seller_address: string;
    is_sold: boolean;
}

interface ListingCardProps {
    listing: any;
    onBuy: (listing: any) => void;
    isBuying?: boolean;
}

export default function ListingCard({ listing, onBuy, isBuying }: ListingCardProps) {
    const imageUrl = listing.image_url || '/placeholder.svg';
    const price = parseFloat(listing.price_eth);


    console.log(listing)

    return (
        <div className="group p-3! relative bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 rounded-2xl overflow-hidden border border-slate-800/50 hover:border-emerald-400/50 transition-all duration-500 hover:shadow-2xl hover:shadow-emerald-500/20 hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative">
                <div className="relative h-64 overflow-hidden">
                    <div
                        className="absolute inset-0 bg-cover bg-center transform group-hover:scale-110 transition-transform duration-700"
                        style={{ backgroundImage: `url(${imageUrl})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />

                    {listing.is_sold && (
                        <div className="absolute top-4 right-4 bg-red-500/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-xs font-bold text-white shadow-lg">
                            SOLD OUT
                        </div>
                    )}

                    {!listing.is_sold && (
                        <div className="absolute px-3! py-1.5! top-4 right-4 bg-emerald-500/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-xs font-bold text-slate-900 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            AVAILABLE
                        </div>
                    )}
                </div>

                <div className="relative p-6">
                    <div className="mb-4">
                        <h3 className="text-xl font-bold text-white mb-2 truncate group-hover:text-emerald-400 transition-colors duration-300">
                            {listing.name || `Token #${listing.token_id}`}
                        </h3>

                        <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                            {listing.description || 'No description available'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 mb-5 pb-5 border-b border-slate-800/50">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-xs font-bold text-slate-900">
                            {listing.seller_address.slice(2, 4).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-500 mb-0.5">Seller</p>
                            <p className="text-sm text-slate-300 font-mono truncate">
                                {listing.seller_address.slice(0, 6)}...{listing.seller_address.slice(-4)}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-end justify-between gap-4">
                        <div className="flex-1">
                            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Current Price</p>
                            <div className="flex items-baseline gap-1">
                                <p className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                                    {price}
                                </p>
                                <p className="text-lg font-semibold text-emerald-400/70">ETH</p>
                            </div>
                        </div>

                        <button
                            onClick={() => onBuy(listing)}
                            disabled={listing.is_sold || isBuying}
                            className={`
                                relative overflow-hidden px-6! py-3! rounded-xl font-bold text-sm
                                transition-all duration-300 transform active:scale-95
                                ${listing.is_sold
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : isBuying
                                        ? 'bg-slate-800 text-slate-400 cursor-wait'
                                        : 'bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-slate-900 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 cursor-pointer'
                                }
                            `}
                        >
                            <span className="relative z-10">
                                {listing.is_sold ? 'SOLD' : isBuying ? 'PROCESSING...' : 'BUY NOW'}
                            </span>
                            {!listing.is_sold && !isBuying && (
                                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
