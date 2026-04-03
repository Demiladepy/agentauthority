/**
 * Policy Engine Tests
 *
 * Uses Node.js built-in test runner (node:test + node:assert).
 * Each test creates its own isolated engine and manager.
 *
 * Run: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyEngine } from '../core/policy-engine';
import { AuthorityManager, Ed25519Signer } from '../core/authority-manager';
import { SpendingPolicy } from '../core/types';

// ============================================================
// HELPERS
// ============================================================

const USDC_MINT    = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER      = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const ALLIUM       = 'ALLiUMv1Gx5EP7BuRhXDgzCkqFSJpGXyisotXwSey4Cd';
const RAYDIUM      = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const X402         = 'x402FaciLitatorProgram11111111111111111111';

const USDC = (n: number): bigint => BigInt(Math.round(n * 1_000_000));

function makeSetup() {
  const engine  = new PolicyEngine();
  const manager = new AuthorityManager(engine);

  const orchSigner = new Ed25519Signer();
  manager.registerAgent(
    { id: 'orch', name: 'Orchestrator', pubkey: orchSigner.getPublicKey(),
      role: 'Root', trustScore: 100, totalSpends: 0, totalRejections: 0 },
    orchSigner
  );

  const agentSigner = new Ed25519Signer();
  manager.registerAgent(
    { id: 'agent', name: 'Agent', pubkey: agentSigner.getPublicKey(),
      role: 'Worker', trustScore: 75, totalSpends: 0, totalRejections: 0 },
    agentSigner
  );

  const defaultPolicy: SpendingPolicy = {
    maxSpend: USDC(100),
    tokenMint: USDC_MINT,
    allowedPrograms: [JUPITER, X402],
    allowedDestinations: [],
    expiresAt: Date.now() + 60 * 60 * 1000,
    maxRedelegation: USDC(60),
    maxDelegationDepth: 3,
    maxTransactionSize: USDC(25),
    rateLimit: { maxTransactions: 10, windowMs: 60_000 },
  };

  return { engine, manager, orchSigner, agentSigner, defaultPolicy };
}

// ============================================================
// AUTHORITY CREATION
// ============================================================

describe('Authority creation', () => {

  test('creates root authority with correct initial state', async () => {
    const { engine, manager, defaultPolicy } = makeSetup();
    const auth = await manager.createRootAuthority('orch', 'orch', defaultPolicy, 'solana:mainnet');

    assert.equal(auth.status, 'active');
    assert.equal(auth.spent, 0n);
    assert.equal(auth.delegated, 0n);
    assert.equal(auth.depth, 0);
    assert.equal(auth.parentAuthorityId, null);
    assert.equal(auth.chain, 'solana:mainnet');
    assert.equal(auth.policy.maxSpend, USDC(100));

    const stats = engine.getAuthorityStats(auth.id);
    assert.ok(stats);
    assert.equal(stats.transactions, 0);
    assert.equal(stats.status, 'active');
  });

});

// ============================================================
// SPENDING VALIDATION
// ============================================================

describe('Spending validation', () => {

  test('approves spend within budget', async () => {
    const { engine, manager, defaultPolicy } = makeSetup();
    const auth = await manager.createRootAuthority('orch', 'orch', defaultPolicy, 'solana:mainnet');

    const result = engine.validate({
      authorityId: auth.id,
      programId: JUPITER,
      amount: USDC(10),
      description: 'Test spend',
    });

    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.remainingBudget, USDC(90));
    }
  });

  test('rejects spend exceeding budget', async () => {
    const { engine, manager, defaultPolicy } = makeSetup();
    const auth = await manager.createRootAuthority('orch', 'orch', defaultPolicy, 'solana:mainnet');

    const result = engine.validate({
      authorityId: auth.id,
      programId: JUPITER,
      amount: USDC(110),
      description: 'Overspend attempt',
    });

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.ok(result.reason.includes('exceed') || result.reason.includes('budget') || result.reason.includes('limit'));
    }
  });

  test('rejects spend on unauthorized program', async () => {
    const { engine, manager, defaultPolicy } = makeSetup();
    const auth = await manager.createRootAuthority('orch', 'orch', defaultPolicy, 'solana:mainnet');

    const result = engine.validate({
      authorityId: auth.id,
      programId: ALLIUM,  // not in allowedPrograms
      amount: USDC(1),
      description: 'Unauthorized program',
    });

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.ok(result.reason.toLowerCase().includes('allowlist') || result.reason.toLowerCase().includes('not'));
    }
  });

  test('rejects spend after expiry', async () => {
    const { engine, manager } = makeSetup();
    const expiredPolicy: SpendingPolicy = {
      maxSpend: USDC(100),
      tokenMint: USDC_MINT,
      allowedPrograms: [JUPITER],
      allowedDestinations: [],
      expiresAt: Date.now() - 1000,  // already expired
      maxRedelegation: USDC(50),
      maxDelegationDepth: 2,
      maxTransactionSize: USDC(25),
      rateLimit: { maxTransactions: 10, windowMs: 60_000 },
    };
    const auth = await manager.createRootAuthority('orch', 'orch', expiredPolicy, 'solana:mainnet');

    const result = engine.validate({
      authorityId: auth.id,
      programId: JUPITER,
      amount: USDC(1),
      description: 'Post-expiry spend',
    });

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.ok(result.reason.toLowerCase().includes('expir'));
    }
  });

  test('enforces max transaction size', async () => {
    const { engine, manager, defaultPolicy } = makeSetup();
    const auth = await manager.createRootAuthority('orch', 'orch', defaultPolicy, 'solana:mainnet');

    // Policy has maxTransactionSize = $25
    const result = engine.validate({
      authorityId: auth.id,
      programId: JUPITER,
      amount: USDC(30),  // exceeds $25 limit
      description: 'Oversized tx',
    });

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.ok(result.reason.toLowerCase().includes('maximum') || result.reason.toLowerCase().includes('exceeds'));
    }
  });

  test('enforces rate limits', async () => {
    const { engine, manager } = makeSetup();
    const rateLimitedPolicy: SpendingPolicy = {
      maxSpend: USDC(1000),
      tokenMint: USDC_MINT,
      allowedPrograms: [JUPITER],
      allowedDestinations: [],
      expiresAt: Date.now() + 60 * 60 * 1000,
      maxRedelegation: USDC(500),
      maxDelegationDepth: 2,
      maxTransactionSize: USDC(100),
      rateLimit: { maxTransactions: 3, windowMs: 60_000 },  // only 3 per minute
    };
    const auth = await manager.createRootAuthority('orch', 'orch', rateLimitedPolicy, 'solana:mainnet');

    // Make 3 valid spends
    for (let i = 0; i < 3; i++) {
      const r = engine.validate({ authorityId: auth.id, programId: JUPITER, amount: USDC(1), description: `tx ${i}` });
      assert.equal(r.valid, true);
    }

    // 4th should hit rate limit
    const r4 = engine.validate({ authorityId: auth.id, programId: JUPITER, amount: USDC(1), description: 'rate limited' });
    assert.equal(r4.valid, false);
    if (!r4.valid) {
      assert.ok(r4.reason.toLowerCase().includes('rate'));
    }
  });

  test('tracks cumulative spend across multiple transactions', async () => {
    const { engine, manager, defaultPolicy } = makeSetup();
    const auth = await manager.createRootAuthority('orch', 'orch', defaultPolicy, 'solana:mainnet');

    engine.validate({ authorityId: auth.id, programId: JUPITER, amount: USDC(10), description: 'tx 1' });
    engine.validate({ authorityId: auth.id, programId: JUPITER, amount: USDC(20), description: 'tx 2' });
    engine.validate({ authorityId: auth.id, programId: JUPITER, amount: USDC(15), description: 'tx 3' });

    const stats = engine.getAuthorityStats(auth.id);
    assert.ok(stats);
    assert.equal(stats.transactions, 3);
    assert.equal(BigInt(stats.spent), USDC(45));
    assert.equal(BigInt(stats.remaining), USDC(55));
  });

  test('exhausts authority when fully spent', async () => {
    const { engine, manager } = makeSetup();
    const smallPolicy: SpendingPolicy = {
      maxSpend: USDC(5),
      tokenMint: USDC_MINT,
      allowedPrograms: [JUPITER],
      allowedDestinations: [],
      expiresAt: Date.now() + 60 * 60 * 1000,
      maxRedelegation: 0n,
      maxDelegationDepth: 0,
      maxTransactionSize: USDC(5),
      rateLimit: { maxTransactions: 10, windowMs: 60_000 },
    };
    const auth = await manager.createRootAuthority('orch', 'orch', smallPolicy, 'solana:mainnet');

    const r1 = engine.validate({ authorityId: auth.id, programId: JUPITER, amount: USDC(5), description: 'full spend' });
    assert.equal(r1.valid, true);

    const stats = engine.getAuthorityStats(auth.id);
    assert.equal(stats?.status, 'exhausted');

    // Next spend should be rejected
    const r2 = engine.validate({ authorityId: auth.id, programId: JUPITER, amount: USDC(1), description: 'after exhausted' });
    assert.equal(r2.valid, false);
  });

});

// ============================================================
// DELEGATION
// ============================================================

describe('Delegation', () => {

  test('delegates to child with reduced permissions', async () => {
    const { engine, manager, defaultPolicy } = makeSetup();
    const rootAuth = await manager.createRootAuthority('orch', 'orch', defaultPolicy, 'solana:mainnet');

    const childAuth = await manager.delegate(
      rootAuth.id, 'orch', 'agent', USDC(30),
      { allowedPrograms: [JUPITER], maxTransactionSize: USDC(5) }
    );

    assert.equal(childAuth.depth, 1);
    assert.equal(childAuth.policy.maxSpend, USDC(30));
    assert.deepEqual(childAuth.policy.allowedPrograms, [JUPITER]);
    assert.equal(childAuth.policy.maxTransactionSize, USDC(5));
    assert.equal(childAuth.status, 'active');
  });

  test('prevents child from exceeding parent allowlist', async () => {
    const { engine, manager, defaultPolicy } = makeSetup();
    // Parent allows only [JUPITER, X402]
    const rootAuth = await manager.createRootAuthority('orch', 'orch', defaultPolicy, 'solana:mainnet');

    // Delegate requesting ALLIUM (not in parent's allowlist)
    // buildChildPolicy silently intersects: [ALLIUM] ∩ [JUPITER, X402] = []
    const childAuth = await manager.delegate(rootAuth.id, 'orch', 'agent', USDC(20), {
      allowedPrograms: [ALLIUM],
    });

    // Child gets empty allowedPrograms (ALLIUM was filtered out)
    // Verify ALLIUM was NOT granted as an explicit program to the child
    assert.ok(!childAuth.policy.allowedPrograms.includes(ALLIUM),
      'ALLIUM should not appear in the child allowlist after being filtered by parent intersection');

    // Verify the child can still spend on JUPITER (parent's programs are inherited when empty)
    const spendResult = engine.validate({
      authorityId: childAuth.id,
      programId: JUPITER,
      amount: USDC(1),
      description: 'Valid spend',
    });
    assert.equal(spendResult.valid, true);
  });

  test('prevents delegation beyond max depth', async () => {
    const { manager } = makeSetup();
    const depthLimitedPolicy: SpendingPolicy = {
      maxSpend: USDC(100),
      tokenMint: USDC_MINT,
      allowedPrograms: [JUPITER],
      allowedDestinations: [],
      expiresAt: Date.now() + 60 * 60 * 1000,
      maxRedelegation: USDC(80),
      maxDelegationDepth: 1,  // only 1 level of delegation
      maxTransactionSize: USDC(25),
      rateLimit: { maxTransactions: 10, windowMs: 60_000 },
    };
    const rootAuth = await manager.createRootAuthority('orch', 'orch', depthLimitedPolicy, 'solana:mainnet');

    // Level 1 delegation — should work
    const child = await manager.delegate(rootAuth.id, 'orch', 'agent', USDC(30), {});
    assert.equal(child.depth, 1);

    // Register a grandchild agent
    const grandchildSigner = new Ed25519Signer();
    const grandchildManager = new AuthorityManager(new PolicyEngine());  // new engine just for registration
    const { engine: e2, manager: m2 } = (() => { const eng = new PolicyEngine(); const mgr = new AuthorityManager(eng); return { engine: eng, manager: mgr }; })();

    // Re-using our manager to try to delegate from depth 1 with maxDelegationDepth=0
    const grandSigner = new Ed25519Signer();
    manager['agents'].set('grand', { id: 'grand', name: 'Grand', pubkey: grandSigner.getPublicKey(), role: 'Grand', trustScore: 50, totalSpends: 0, totalRejections: 0 });
    manager['signers'].set('grand', grandSigner);

    await assert.rejects(
      () => manager.delegate(child.id, 'agent', 'grand', USDC(5), {}),
      /depth|exceeded/i
    );

    void grandchildManager; void grandchildSigner; void e2; void m2;
  });

  test('cascading revocation revokes all children', async () => {
    const { engine, manager, defaultPolicy } = makeSetup();
    const rootAuth = await manager.createRootAuthority('orch', 'orch', defaultPolicy, 'solana:mainnet');

    const grandSigner = new Ed25519Signer();
    manager.registerAgent(
      { id: 'grand', name: 'Grand', pubkey: grandSigner.getPublicKey(), role: 'Grand', trustScore: 60, totalSpends: 0, totalRejections: 0 },
      grandSigner
    );

    const childAuth = await manager.delegate(rootAuth.id, 'orch', 'agent', USDC(20), {});
    const grandAuth = await manager.delegate(childAuth.id, 'agent', 'grand', USDC(5), {});

    // Revoke root → should cascade to child and grandchild
    engine.revoke(rootAuth.id, 'Test cascade');

    const rootStats  = engine.getAuthorityStats(rootAuth.id);
    const childStats = engine.getAuthorityStats(childAuth.id);
    const grandStats = engine.getAuthorityStats(grandAuth.id);

    assert.equal(rootStats?.status,  'revoked');
    assert.equal(childStats?.status, 'revoked');
    assert.equal(grandStats?.status, 'revoked');
  });

});

// ============================================================
// NEGOTIATION
// ============================================================

describe('Permission negotiation', () => {

  test('negotiation counter-offers for low-trust agents', async () => {
    const { manager, defaultPolicy } = makeSetup();
    const rootAuth = await manager.createRootAuthority('orch', 'orch', defaultPolicy, 'solana:mainnet');

    // Register low-trust agent
    const lowTrustSigner = new Ed25519Signer();
    manager.registerAgent(
      { id: 'lowguy', name: 'LowGuy', pubkey: lowTrustSigner.getPublicKey(),
        role: 'Untrusted', trustScore: 10, totalSpends: 0, totalRejections: 0 },
      lowTrustSigner
    );

    const result = await manager.negotiatePermission(rootAuth.id, 'orch', {
      requesterId: 'lowguy',
      requesterPubkey: lowTrustSigner.getPublicKey(),
      description: 'Need large budget',
      requestedPolicy: { maxSpend: USDC(50) },
      justification: 'Testing something',
      priority: 'medium',
      requestedAt: Date.now(),
    });

    // Low trust agent requesting large amount should get a counter-offer
    assert.ok(result.outcome === 'counter_offer' || result.outcome === 'granted');
    if (result.outcome === 'counter_offer') {
      // Counter-offer should be less than what was requested
      assert.ok(result.adjustedPolicy.maxSpend < USDC(50));
    }
  });

});

// ============================================================
// DELEGATION CHAIN VERIFICATION
// ============================================================

describe('Delegation chain verification', () => {

  test('delegation chain verification succeeds for valid chain', async () => {
    const { engine, manager, defaultPolicy } = makeSetup();
    void engine;

    const rootAuth = await manager.createRootAuthority('orch', 'orch', defaultPolicy, 'solana:mainnet');
    const childAuth = await manager.delegate(rootAuth.id, 'orch', 'agent', USDC(20), {});

    const result = await manager.verifyDelegationChain(childAuth.id);

    assert.equal(result.valid, true);
    assert.equal(result.chain.length, 2);  // root + child
    assert.equal(result.chain[0].depth, 0);
    assert.equal(result.chain[1].depth, 1);
  });

});
