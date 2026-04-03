/**
 * EVM Authority Example — Base Chain (eip155:8453)
 *
 * Demonstrates creating a spending authority scoped to Base.
 * Same PolicyEngine, same AuthorityManager — only the chain ID changes.
 * This is the same middleware working across two completely different VMs.
 */
import { PolicyEngine } from '../core/policy-engine';
import { AuthorityManager, SigningProvider } from '../core/authority-manager';
import { SpendingAuthority } from '../core/types';
import { CHAIN_INFO } from './chain-adapter';
/** USDC on Base (official Coinbase-bridged) */
export declare const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** Uniswap V3 SwapRouter on Base */
export declare const BASE_UNISWAP_V3 = "0x2626664c2603336E57B271c5C0b26F421741e481";
/** Aave V3 Pool on Base */
export declare const BASE_AAVE_V3 = "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64B";
/** 1inch Router on Base */
export declare const BASE_1INCH = "0x1111111254EEB25477B68fb85Ed929f73A960582";
export interface BaseAuthoritySetup {
    engine: PolicyEngine;
    manager: AuthorityManager;
    authority: SpendingAuthority;
    signer: SigningProvider;
    chainInfo: typeof CHAIN_INFO['eip155:8453'];
}
/**
 * Creates an isolated PolicyEngine + AuthorityManager scoped to Base.
 *
 * Key insight: the same SDK classes handle EVM chains identically
 * to Solana. The `chain` field on SpendingAuthority scopes each
 * authority to its chain — cross-chain spending is structurally impossible
 * because authorities from different engines are never shared.
 */
export declare function createBaseAuthority(agentId: string, agentName: string, budgetUSDC?: number, signer?: SigningProvider): Promise<BaseAuthoritySetup>;
//# sourceMappingURL=evm-authority.d.ts.map