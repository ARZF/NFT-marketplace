const CHAINS = {
    11155111: { // Sepolia
        name: "sepolia",
        currency: "ETH",
        marketplace: "0xF93f88857d375Ff390D39A0dc1f7b114D1e8BDa7",
        nft: "0xDB9d9Bb58dB6774bbD72a9cBefb483F03Db1A5Fe",
        // Network configuration for MetaMask
        chainId: '0xaa36a7', // 11155111 in hex
        chainName: 'Sepolia',
        nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
        },
        rpcUrls: ['https://sepolia.infura.io/v3/'],
        blockExplorerUrls: ['https://sepolia.etherscan.io'],
    },
    84532: { // Base Sepolia
        name: "base-sepolia",
        currency: "ETH",
        marketplace: "0x3198628c67dAb715258E57AFE75D1a784bB7F3D3",
        nft: "0x6B15359C8dF1Cf4F6C3cB51d0788fED2A4B6aD9a",
        // Network configuration for MetaMask
        chainId: '0x14a34', // 84532 in hex
        chainName: 'Base Sepolia',
        nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
        },
        rpcUrls: ['https://sepolia.base.org'],
        blockExplorerUrls: ['https://sepolia-explorer.base.org'],
    }
};

// Default chain ID (e.g., Sepolia)
const DEFAULT_CHAIN_ID = 11155111;

function getChainConfig(chainId) {
    return CHAINS[chainId] || CHAINS[DEFAULT_CHAIN_ID];
}

