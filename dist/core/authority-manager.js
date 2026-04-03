"use strict";
/**
 * Authority Manager — Creates and manages spending authorities
 *
 * Handles the lifecycle: creation, delegation, revocation.
 * Each authority is cryptographically signed by the grantor,
 * creating a verifiable delegation chain without on-chain state.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthorityManager = exports.Ed25519Signer = void 0;
const uuid_1 = require("uuid");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const bs58_1 = __importDefault(require("bs58"));
/**
 * Simple Ed25519 signer for development and demos.
 * In production, this is replaced by the OWS signing interface.
 */
class Ed25519Signer {
    keypair;
    constructor(secretKey) {
        this.keypair = secretKey
            ? tweetnacl_1.default.sign.keyPair.fromSecretKey(secretKey)
            : tweetnacl_1.default.sign.keyPair();
    }
    getPublicKey() {
        return bs58_1.default.encode(this.keypair.publicKey);
    }
    async sign(message) {
        return tweetnacl_1.default.sign.detached(message, this.keypair.secretKey);
    }
    async verify(message, signature, pubkey) {
        const pubkeyBytes = bs58_1.default.decode(pubkey);
        return tweetnacl_1.default.sign.detached.verify(message, signature, pubkeyBytes);
    }
    getSecretKey() {
        return this.keypair.secretKey;
    }
}
exports.Ed25519Signer = Ed25519Signer;
// ============================================================
// AUTHORITY MANAGER
// ============================================================
class AuthorityManager {
    engine;
    agents = new Map();
    signers = new Map();
    constructor(engine) {
        this.engine = engine;
    }
    // -------------------------------------------------------
    // Agent Registration
    // -------------------------------------------------------
    registerAgent(identity, signer) {
        this.agents.set(identity.id, identity);
        this.signers.set(identity.id, signer);
    }
    getAgent(id) {
        return this.agents.get(id);
    }
    // -------------------------------------------------------
    // Authority Creation — Root level
    // -------------------------------------------------------
    async createRootAuthority(grantorAgentId, granteeAgentId, policy, chain = 'solana:mainnet') {
        const grantor = this.agents.get(grantorAgentId);
        const grantee = this.agents.get(granteeAgentId);
        const signer = this.signers.get(grantorAgentId);
        if (!grantor || !grantee || !signer) {
            throw new Error(`Agent not found: grantor=${!!grantor}, grantee=${!!grantee}`);
        }
        const authorityId = (0, uuid_1.v4)();
        // Create the authority payload for signing
        const payload = this.buildAuthorityPayload(authorityId, grantor.pubkey, grantee.pubkey, policy, chain, 0, null);
        const signature = await signer.sign(payload);
        const authority = {
            id: authorityId,
            chain,
            grantor: grantor.pubkey,
            grantee: grantee.pubkey,
            policy,
            spent: 0n,
            delegated: 0n,
            transactionCount: 0,
            recentTransactions: [],
            parentAuthorityId: null,
            depth: 0,
            status: 'active',
            grantorSignature: bs58_1.default.encode(signature),
            createdAt: Date.now(),
            childAuthorities: [],
        };
        this.engine.registerAuthority(authority);
        return authority;
    }
    // -------------------------------------------------------
    // Delegation — Agent delegates to sub-agent
    // -------------------------------------------------------
    async delegate(parentAuthorityId, delegatorAgentId, granteeAgentId, amount, policyOverrides = {}) {
        const parent = this.engine.getAuthority(parentAuthorityId);
        const delegator = this.agents.get(delegatorAgentId);
        const grantee = this.agents.get(granteeAgentId);
        const signer = this.signers.get(delegatorAgentId);
        if (!parent || !delegator || !grantee || !signer) {
            throw new Error('Missing parent authority, delegator, or grantee');
        }
        // Verify the delegator is the grantee of the parent authority
        if (parent.grantee !== delegator.pubkey) {
            throw new Error('Delegator is not the grantee of the parent authority');
        }
        // Build child policy — inherit from parent, apply overrides, enforce constraints
        const childPolicy = this.buildChildPolicy(parent.policy, amount, policyOverrides);
        // Validate delegation through the policy engine
        const validation = this.engine.validateDelegation(parentAuthorityId, amount, childPolicy);
        if (!validation.valid) {
            throw new Error(`Delegation denied: ${validation.reason}`);
        }
        const authorityId = (0, uuid_1.v4)();
        const payload = this.buildAuthorityPayload(authorityId, delegator.pubkey, grantee.pubkey, childPolicy, parent.chain, parent.depth + 1, parentAuthorityId);
        const signature = await signer.sign(payload);
        const childAuthority = {
            id: authorityId,
            chain: parent.chain,
            grantor: delegator.pubkey,
            grantee: grantee.pubkey,
            policy: childPolicy,
            spent: 0n,
            delegated: 0n,
            transactionCount: 0,
            recentTransactions: [],
            parentAuthorityId,
            depth: parent.depth + 1,
            status: 'active',
            grantorSignature: bs58_1.default.encode(signature),
            createdAt: Date.now(),
            childAuthorities: [],
        };
        // Register child and update parent
        parent.childAuthorities.push(authorityId);
        this.engine.registerAuthority(childAuthority);
        return childAuthority;
    }
    // -------------------------------------------------------
    // Permission Negotiation — Agentic layer
    // -------------------------------------------------------
    async negotiatePermission(orchestratorAuthorityId, orchestratorAgentId, request) {
        const orchestratorAuth = this.engine.getAuthority(orchestratorAuthorityId);
        const requesterAgent = this.agents.get(request.requesterId);
        if (!orchestratorAuth || !requesterAgent) {
            return { outcome: 'denied', reason: 'Orchestrator authority or requester not found' };
        }
        // Calculate what's available
        const availableBudget = orchestratorAuth.policy.maxRedelegation - orchestratorAuth.delegated;
        const requestedAmount = request.requestedPolicy.maxSpend ?? 0n;
        // Decision logic — this is where the "agentic" intelligence lives
        // Rule 1: Check if we even have enough to delegate
        if (requestedAmount > availableBudget) {
            // Counter-offer with what's available
            if (availableBudget > 0n) {
                const adjustedPolicy = this.buildChildPolicy(orchestratorAuth.policy, availableBudget, request.requestedPolicy);
                return {
                    outcome: 'counter_offer',
                    adjustedPolicy,
                    reason: `Requested ${requestedAmount} but only ${availableBudget} available. Offering max available.`,
                };
            }
            return { outcome: 'denied', reason: 'No delegation budget remaining' };
        }
        // Rule 2: Check requester trust score
        if (requesterAgent.trustScore < 30 && requestedAmount > availableBudget / 4n) {
            // Low trust agent requesting large amount — counter with smaller amount
            const reducedAmount = availableBudget / 4n;
            const adjustedPolicy = this.buildChildPolicy(orchestratorAuth.policy, reducedAmount, request.requestedPolicy);
            return {
                outcome: 'counter_offer',
                adjustedPolicy,
                reason: `Trust score ${requesterAgent.trustScore} is low. Offering reduced budget of ${reducedAmount}.`,
            };
        }
        // Rule 3: Check if priority justifies the amount
        if (request.priority === 'low' && requestedAmount > availableBudget / 2n) {
            const reducedAmount = availableBudget / 2n;
            const adjustedPolicy = this.buildChildPolicy(orchestratorAuth.policy, reducedAmount, request.requestedPolicy);
            return {
                outcome: 'counter_offer',
                adjustedPolicy,
                reason: `Low priority request capped at 50% of available budget.`,
            };
        }
        // Grant the request
        const authority = await this.delegate(orchestratorAuthorityId, orchestratorAgentId, request.requesterId, requestedAmount, request.requestedPolicy);
        return { outcome: 'granted', authority };
    }
    // -------------------------------------------------------
    // Verification — Verify the full delegation chain
    // -------------------------------------------------------
    async verifyDelegationChain(authorityId) {
        const chain = [];
        let current = this.engine.getAuthority(authorityId);
        while (current) {
            chain.unshift({
                authorityId: current.id,
                grantor: current.grantor,
                grantee: current.grantee,
                depth: current.depth,
            });
            // Verify signature
            const signer = this.findSignerByPubkey(current.grantor);
            if (signer) {
                const payload = this.buildAuthorityPayload(current.id, current.grantor, current.grantee, current.policy, current.chain, current.depth, current.parentAuthorityId);
                const sigBytes = bs58_1.default.decode(current.grantorSignature);
                const valid = await signer.verify(payload, sigBytes, current.grantor);
                if (!valid) {
                    return { valid: false, chain, error: `Invalid signature at depth ${current.depth}` };
                }
            }
            // Walk up
            if (current.parentAuthorityId) {
                current = this.engine.getAuthority(current.parentAuthorityId);
            }
            else {
                break;
            }
        }
        return { valid: true, chain };
    }
    // -------------------------------------------------------
    // Internal Helpers
    // -------------------------------------------------------
    buildChildPolicy(parentPolicy, amount, overrides) {
        return {
            maxSpend: amount,
            tokenMint: overrides.tokenMint ?? parentPolicy.tokenMint,
            // Child can only use a subset of parent's allowed programs
            allowedPrograms: overrides.allowedPrograms
                ? overrides.allowedPrograms.filter(p => parentPolicy.allowedPrograms.length === 0 || parentPolicy.allowedPrograms.includes(p))
                : [...parentPolicy.allowedPrograms],
            allowedDestinations: overrides.allowedDestinations
                ? overrides.allowedDestinations.filter(d => parentPolicy.allowedDestinations.length === 0 || parentPolicy.allowedDestinations.includes(d))
                : [...parentPolicy.allowedDestinations],
            // Child cannot expire after parent
            expiresAt: Math.min(overrides.expiresAt ?? parentPolicy.expiresAt, parentPolicy.expiresAt),
            // Child gets proportional re-delegation — cannot exceed what was delegated to it
            maxRedelegation: overrides.maxRedelegation
                ? (overrides.maxRedelegation < amount ? overrides.maxRedelegation : amount / 2n)
                : amount / 4n,
            // Child depth is strictly less than parent's remaining depth
            maxDelegationDepth: Math.min(overrides.maxDelegationDepth ?? parentPolicy.maxDelegationDepth - 1, parentPolicy.maxDelegationDepth - 1),
            maxTransactionSize: overrides.maxTransactionSize
                ? (overrides.maxTransactionSize < parentPolicy.maxTransactionSize
                    ? overrides.maxTransactionSize
                    : parentPolicy.maxTransactionSize)
                : parentPolicy.maxTransactionSize,
            rateLimit: overrides.rateLimit ?? { ...parentPolicy.rateLimit },
        };
    }
    buildAuthorityPayload(id, grantor, grantee, policy, chain, depth, parentId) {
        const message = JSON.stringify({
            id, grantor, grantee, chain, depth, parentId,
            maxSpend: policy.maxSpend.toString(),
            tokenMint: policy.tokenMint,
            allowedPrograms: policy.allowedPrograms,
            expiresAt: policy.expiresAt,
            maxRedelegation: policy.maxRedelegation.toString(),
            maxDelegationDepth: policy.maxDelegationDepth,
        });
        return new TextEncoder().encode(message);
    }
    findSignerByPubkey(pubkey) {
        for (const [, signer] of this.signers) {
            if (signer.getPublicKey() === pubkey) {
                return signer;
            }
        }
        return undefined;
    }
}
exports.AuthorityManager = AuthorityManager;
//# sourceMappingURL=authority-manager.js.map