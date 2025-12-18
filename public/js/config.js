const CHAINS = {
    11155111: { // Sepolia
        name: "sepolia",
        currency: "ETH",
        marketplace: "0xD089b7B482523405b026DF2a5caD007093252b15",
        nft: "0xDB9d9Bb58dB6774bbD72a9cBefb483F03Db1A5Fe",
    },
    84532: { // Base Sepolia
        name: "base-sepolia",
        currency: "ETH",
        marketplace: "0x67d374fCE79f6F0Ad297b643792733a513735a54",
        nft: "0x6B15359C8dF1Cf4F6C3cB51d0788fED2A4B6aD9a",
    }
};

// Default chain ID (e.g., Sepolia)
const DEFAULT_CHAIN_ID = 11155111;

function getChainConfig(chainId) {
    return CHAINS[chainId] || CHAINS[DEFAULT_CHAIN_ID];
}

