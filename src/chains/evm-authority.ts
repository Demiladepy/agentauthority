/**
 * EVM Authority Example — Base Chain (eip155:8453)
 *
 * Demonstrates creating a spending authority scoped to Base.
 * Same PolicyEngine, same AuthorityManager — only the chain ID changes.
 * This is the same middleware working across two completely different VMs.
 */

import { PolicyEngine } from '../core/policy-engine';
import { AuthorityManager, Ed25519Signer, SigningProvider } from '../core/authority-manager';
import { SpendingPolicy, SpendingAuthority } from '../core/types';
import { getChainAdapter, CHAIN_INFO } from './chain-adapter';

// ============================================================
// BASE CHAIN PROGRAM ADDRESSES
// ============================================================

/** USDC on Base (official Coinbase-bridged) */
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
/** Uniswap V3 SwapRouter on Base */
export const BASE_UNISWAP_V3 = '0x2626664c2603336E57B271c5C0b26F421741e481';
/** Aave V3 Pool on Base */
export const BASE_AAVE_V3 = '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64B';
/** 1inch Router on Base */
export const BASE_1INCH = '0x1111111254EEB25477B68fb85Ed929f73A960582';

const USDC = (amount: number) => BigInt(Math.round(amount * 1_000_000));

// ============================================================
// CREATE BASE AUTHORITY
// ============================================================

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
export async function createBaseAuthority(
  agentId: string,
  agentName: string,
  budgetUSDC: number = 50,
  signer?: SigningProvider
): Promise<BaseAuthoritySetup> {
  const engine = new PolicyEngine();
  const manager = new AuthorityManager(engine);
  const adapter = getChainAdapter('eip155:8453');

  const actualSigner = signer ?? new Ed25519Signer();
  const pubkey = actualSigner.getPublicKey();

  manager.registerAgent(
    {
      id: agentId,
      name: agentName,
      pubkey,
      role: 'Base chain spending authority holder',
      trustScore: 100,
      totalSpends: 0,
      totalRejections: 0,
    },
    actualSigner
  );

  const basePolicy: SpendingPolicy = {
    maxSpend: USDC(budgetUSDC),
    tokenMint: BASE_USDC,
    allowedPrograms: [BASE_UNISWAP_V3, BASE_AAVE_V3],
    allowedDestinations: [],
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    maxRedelegation: USDC(Math.floor(budgetUSDC * 0.6)),
    maxDelegationDepth: 2,
    maxTransactionSize: USDC(25),
    rateLimit: { maxTransactions: 20, windowMs: 60_000 },
  };

  const authority = await manager.createRootAuthority(
    agentId,
    agentId,
    basePolicy,
    'eip155:8453'   // ← scoped to Base, not Solana
  );

  void adapter; // adapter available for callers who need address validation

  return {
    engine,
    manager,
    authority,
    signer: actualSigner,
    chainInfo: CHAIN_INFO['eip155:8453'],
  };
}
