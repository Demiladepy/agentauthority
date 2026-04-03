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

import bs58 from 'bs58';

// ============================================================
// CHAIN ADAPTER INTERFACE
// ============================================================

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

// ============================================================
// SOLANA ADAPTER
// ============================================================

export class SolanaAdapter implements ChainAdapter {
  chainId: string;

  constructor(chainId: string = 'solana:mainnet') {
    this.chainId = chainId;
  }

  validateAddress(address: string): boolean {
    if (address.length < 32 || address.length > 44) return false;
    try {
      const decoded = bs58.decode(address);
      return decoded.length === 32;
    } catch {
      return false;
    }
  }

  /**
   * SPL Token transfer instruction layout:
   *   [0]    instruction discriminator (3 = Transfer)
   *   [1..8] amount as little-endian u64
   */
  decodeTransferAmount(txBytes: Buffer): bigint | null {
    if (txBytes.length < 9) return null;
    try {
      if (txBytes[0] !== 3) return null;
      return txBytes.readBigUInt64LE(1);
    } catch {
      return null;
    }
  }

  formatAmount(units: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals);
    const whole = units / divisor;
    const frac = units % divisor;
    return `${whole}.${frac.toString().padStart(decimals, '0').slice(0, 2)}`;
  }

  getNativeTokenSymbol(): string {
    return 'SOL';
  }

  isEVM(): boolean {
    return false;
  }
}

// ============================================================
// EVM ADAPTER
// ============================================================

export class EVMAdapter implements ChainAdapter {
  chainId: string;

  constructor(chainId: string = 'eip155:1') {
    this.chainId = chainId;
  }

  /** EVM addresses: 0x + 40 hex chars (case-insensitive) */
  validateAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }

  /**
   * ERC20 transfer(address,uint256) ABI:
   *   [0..3]   function selector: 0xa9059cbb
   *   [4..35]  padded address (32 bytes)
   *   [36..67] amount as big-endian uint256 (32 bytes)
   */
  decodeTransferAmount(txBytes: Buffer): bigint | null {
    if (txBytes.length < 68) return null;
    const selector = txBytes.slice(0, 4).toString('hex');
    if (selector !== 'a9059cbb') return null;
    try {
      const amountHex = txBytes.slice(36, 68).toString('hex');
      return BigInt('0x' + amountHex);
    } catch {
      return null;
    }
  }

  formatAmount(units: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals);
    const whole = units / divisor;
    const frac = units % divisor;
    return `${whole}.${frac.toString().padStart(decimals, '0').slice(0, 2)}`;
  }

  getNativeTokenSymbol(): string {
    // Both Ethereum mainnet and Base use ETH as the gas token
    return 'ETH';
  }

  isEVM(): boolean {
    return true;
  }
}

// ============================================================
// FACTORY
// ============================================================

export function getChainAdapter(chainId: string): ChainAdapter {
  if (chainId.startsWith('solana:')) {
    return new SolanaAdapter(chainId);
  }
  if (chainId.startsWith('eip155:')) {
    return new EVMAdapter(chainId);
  }
  throw new Error(`Unsupported chain: ${chainId}. Supported prefixes: solana:, eip155:`);
}

// ============================================================
// CHAIN METADATA
// ============================================================

export interface ChainInfo {
  name: string;
  nativeToken: string;
  usdcAddress: string;
  explorerUrl: string;
}

export const CHAIN_INFO: Record<string, ChainInfo> = {
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
