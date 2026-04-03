"use strict";
/**
 * Chain Adapter — Multi-chain support
 *
 * Abstracts chain-specific address validation and transaction encoding
 * for Solana and EVM chains. Used by the policy engine to enforce
 * chain-scoped spending authorities.
 *
 * Supported chains:
 *   solana:mainnet, solana:devnet
 *   eip155:1  (Ethereum)
 *   eip155:8453 (Base)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAIN_INFO = exports.EVMAdapter = exports.SolanaAdapter = void 0;
exports.getChainAdapter = getChainAdapter;
const bs58_1 = __importDefault(require("bs58"));
// ============================================================
// SOLANA ADAPTER
// ============================================================
class SolanaAdapter {
    chainId;
    constructor(chainId = 'solana:mainnet') {
        this.chainId = chainId;
    }
    validateAddress(address) {
        if (address.length < 32 || address.length > 44)
            return false;
        try {
            const decoded = bs58_1.default.decode(address);
            return decoded.length === 32;
        }
        catch {
            return false;
        }
    }
    /**
     * SPL Token transfer instruction layout:
     *   [0]    instruction discriminator (3 = Transfer)
     *   [1..8] amount as little-endian u64
     */
    decodeTransferAmount(txBytes) {
        if (txBytes.length < 9)
            return null;
        try {
            if (txBytes[0] !== 3)
                return null;
            return txBytes.readBigUInt64LE(1);
        }
        catch {
            return null;
        }
    }
    formatAmount(units, decimals) {
        const divisor = BigInt(10 ** decimals);
        const whole = units / divisor;
        const frac = units % divisor;
        return `${whole}.${frac.toString().padStart(decimals, '0').slice(0, 2)}`;
    }
    getNativeTokenSymbol() {
        return 'SOL';
    }
    isEVM() {
        return false;
    }
}
exports.SolanaAdapter = SolanaAdapter;
// ============================================================
// EVM ADAPTER
// ============================================================
class EVMAdapter {
    chainId;
    constructor(chainId = 'eip155:1') {
        this.chainId = chainId;
    }
    /** EVM addresses: 0x + 40 hex chars (case-insensitive) */
    validateAddress(address) {
        return /^0x[0-9a-fA-F]{40}$/.test(address);
    }
    /**
     * ERC20 transfer(address,uint256) ABI:
     *   [0..3]   function selector: 0xa9059cbb
     *   [4..35]  padded address (32 bytes)
     *   [36..67] amount as big-endian uint256 (32 bytes)
     */
    decodeTransferAmount(txBytes) {
        if (txBytes.length < 68)
            return null;
        const selector = txBytes.slice(0, 4).toString('hex');
        if (selector !== 'a9059cbb')
            return null;
        try {
            const amountHex = txBytes.slice(36, 68).toString('hex');
            return BigInt('0x' + amountHex);
        }
        catch {
            return null;
        }
    }
    formatAmount(units, decimals) {
        const divisor = BigInt(10 ** decimals);
        const whole = units / divisor;
        const frac = units % divisor;
        return `${whole}.${frac.toString().padStart(decimals, '0').slice(0, 2)}`;
    }
    getNativeTokenSymbol() {
        // Both Ethereum mainnet and Base use ETH as the gas token
        return 'ETH';
    }
    isEVM() {
        return true;
    }
}
exports.EVMAdapter = EVMAdapter;
// ============================================================
// FACTORY
// ============================================================
function getChainAdapter(chainId) {
    if (chainId.startsWith('solana:')) {
        return new SolanaAdapter(chainId);
    }
    if (chainId.startsWith('eip155:')) {
        return new EVMAdapter(chainId);
    }
    throw new Error(`Unsupported chain: ${chainId}. Supported prefixes: solana:, eip155:`);
}
exports.CHAIN_INFO = {
    'solana:mainnet': {
        name: 'Solana',
        nativeToken: 'SOL',
        usdcAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        explorerUrl: 'https://solscan.io/tx',
    },
    'solana:devnet': {
        name: 'Solana Devnet',
        nativeToken: 'SOL',
        usdcAddress: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
        explorerUrl: 'https://solscan.io/tx?cluster=devnet',
    },
    'eip155:1': {
        name: 'Ethereum',
        nativeToken: 'ETH',
        usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        explorerUrl: 'https://etherscan.io/tx',
    },
    'eip155:8453': {
        name: 'Base',
        nativeToken: 'ETH',
        usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        explorerUrl: 'https://basescan.org/tx',
    },
};
//# sourceMappingURL=chain-adapter.js.map