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
export interface ChainAdapter {
    /** Chain identifier, e.g. "solana:mainnet" or "eip155:8453" */
    chainId: string;
    /** Validate that an address is well-formed for this chain */
    validateAddress(address: string): boolean;
    /** Decode transfer amount from raw transaction bytes. Returns null if not a transfer. */
    decodeTransferAmount(txBytes: Buffer): bigint | null;
    /** Format a raw token unit amount as a human-readable string */
    formatAmount(units: bigint, decimals: number): string;
    /** Native gas token symbol */
    getNativeTokenSymbol(): string;
    /** Whether this is an EVM-compatible chain */
    isEVM(): boolean;
}
export declare class SolanaAdapter implements ChainAdapter {
    chainId: string;
    constructor(chainId?: string);
    validateAddress(address: string): boolean;
    /**
     * SPL Token transfer instruction layout:
     *   [0]    instruction discriminator (3 = Transfer)
     *   [1..8] amount as little-endian u64
     */
    decodeTransferAmount(txBytes: Buffer): bigint | null;
    formatAmount(units: bigint, decimals: number): string;
    getNativeTokenSymbol(): string;
    isEVM(): boolean;
}
export declare class EVMAdapter implements ChainAdapter {
    chainId: string;
    constructor(chainId?: string);
    /** EVM addresses: 0x + 40 hex chars (case-insensitive) */
    validateAddress(address: string): boolean;
    /**
     * ERC20 transfer(address,uint256) ABI:
     *   [0..3]   function selector: 0xa9059cbb
     *   [4..35]  padded address (32 bytes)
     *   [36..67] amount as big-endian uint256 (32 bytes)
     */
    decodeTransferAmount(txBytes: Buffer): bigint | null;
    formatAmount(units: bigint, decimals: number): string;
    getNativeTokenSymbol(): string;
    isEVM(): boolean;
}
export declare function getChainAdapter(chainId: string): ChainAdapter;
export interface ChainInfo {
    name: string;
    nativeToken: string;
    usdcAddress: string;
    explorerUrl: string;
}
export declare const CHAIN_INFO: Record<string, ChainInfo>;
//# sourceMappingURL=chain-adapter.d.ts.map