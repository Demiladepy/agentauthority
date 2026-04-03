"use strict";
/**
 * EVM Authority Example — Base Chain (eip155:8453)
 *
 * Demonstrates creating a spending authority scoped to Base.
 * Same PolicyEngine, same AuthorityManager — only the chain ID changes.
 * This is the same middleware working across two completely different VMs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BASE_1INCH = exports.BASE_AAVE_V3 = exports.BASE_UNISWAP_V3 = exports.BASE_USDC = void 0;
exports.createBaseAuthority = createBaseAuthority;
const policy_engine_1 = require("../core/policy-engine");
const authority_manager_1 = require("../core/authority-manager");
const chain_adapter_1 = require("./chain-adapter");
// ============================================================
// BASE CHAIN PROGRAM ADDRESSES
// ============================================================
/** USDC on Base (official Coinbase-bridged) */
exports.BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
/** Uniswap V3 SwapRouter on Base */
exports.BASE_UNISWAP_V3 = '0x2626664c2603336E57B271c5C0b26F421741e481';
/** Aave V3 Pool on Base */
exports.BASE_AAVE_V3 = '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64B';
/** 1inch Router on Base */
exports.BASE_1INCH = '0x1111111254EEB25477B68fb85Ed929f73A960582';
const USDC = (amount) => BigInt(Math.round(amount * 1_000_000));
/**
 * Creates an isolated PolicyEngine + AuthorityManager scoped to Base.
 *
 * Key insight: the same SDK classes handle EVM chains identically
 * to Solana. The `chain` field on SpendingAuthority scopes each
 * authority to its chain — cross-chain spending is structurally impossible
 * because authorities from different engines are never shared.
 */
async function createBaseAuthority(agentId, agentName, budgetUSDC = 50, signer) {
    const engine = new policy_engine_1.PolicyEngine();
    const manager = new authority_manager_1.AuthorityManager(engine);
    const adapter = (0, chain_adapter_1.getChainAdapter)('eip155:8453');
    const actualSigner = signer ?? new authority_manager_1.Ed25519Signer();
    const pubkey = actualSigner.getPublicKey();
    manager.registerAgent({
        id: agentId,
        name: agentName,
        pubkey,
        role: 'Base chain spending authority holder',
        trustScore: 100,
        totalSpends: 0,
        totalRejections: 0,
    }, actualSigner);
    const basePolicy = {
        maxSpend: USDC(budgetUSDC),
        tokenMint: exports.BASE_USDC,
        allowedPrograms: [exports.BASE_UNISWAP_V3, exports.BASE_AAVE_V3],
        allowedDestinations: [],
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
        maxRedelegation: USDC(Math.floor(budgetUSDC * 0.6)),
        maxDelegationDepth: 2,
        maxTransactionSize: USDC(25),
        rateLimit: { maxTransactions: 20, windowMs: 60_000 },
    };
    const authority = await manager.createRootAuthority(agentId, agentId, basePolicy, 'eip155:8453' // ← scoped to Base, not Solana
    );
    void adapter; // adapter available for callers who need address validation
    return {
        engine,
        manager,
        authority,
        signer: actualSigner,
        chainInfo: chain_adapter_1.CHAIN_INFO['eip155:8453'],
    };
}
//# sourceMappingURL=evm-authority.js.map