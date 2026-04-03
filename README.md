# @agent-authority/sdk

**The missing authorization layer between OWS wallets and x402 payments.**

---

## The Problem

OWS gives agents wallets. x402 lets agents pay. But there's no standard for WHO is authorized to spend WHAT, up to HOW MUCH, on WHICH programs, and whether they can delegate that authority downstream.

Today agents either get full wallet access (dangerous) or no access (useless). When an orchestrator spawns sub-agents, it has two options: hand them the private key (no controls) or implement bespoke ad-hoc limits (no composability, no verification, nothing portable).

Multi-agent workflows need scoped, hierarchical spending authority. This is the missing middleware.

---

## Quick Start

```bash
npm install @agent-authority/sdk
```

```typescript
import { createAgentNetwork } from '@agent-authority/sdk';

const network = await createAgentNetwork({
  chain: 'solana:mainnet',
  rootBudget: { amount: 100, token: 'USDC' },
  expiry: '2h',
  agents: {
    researcher: { budget: 30, allowedPrograms: ['allium', 'x402'], canDelegate: true, maxDelegationAmount: 10 },
    trader:     { budget: 20, allowedPrograms: ['jupiter'],        canDelegate: false },
  },
});

// Agents can now spend — within their policy bounds
await network.agents.researcher.payX402({ url: '...', amount: 500_000n, ... });
await network.agents.trader.spend({ programId: '...', amount: 5_000_000n, description: '...' });

// Revoke mid-session if something goes wrong
network.revoke('trader', 'Risk limit hit');

// Full audit trail
network.audit(event => console.log(event.eventType, event.details));

// Per-agent stats
console.log(network.stats());
```

---

## What It Does

- **Scoped spending policies** — amount caps, program allowlists, destination restrictions, rate limits, and expiry on every agent authority
- **Hierarchical delegation** — agents can sub-delegate with cryptographically signed authority chains; children can never exceed parent constraints
- **x402 payment interception** — drop-in handler that validates every 402 payment against the agent's authority before executing
- **Permission negotiation** — trust-score-based counter-offers when agents request authority they can't fully justify
- **Cascading revocation** — revoke a parent and all child authorities are instantly revoked
- **Full audit trail** — every spend approval, rejection, delegation, and revocation emits a typed event
- **Cross-chain support** — Solana and EVM (Base, Ethereum) with independent policy enforcement per chain

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Agent Framework                      │
│          (elizaOS / Solana Agent Kit / GOAT / etc.)          │
└────────────────────────┬────────────────────────────────────┘
                         │ calls
┌────────────────────────▼────────────────────────────────────┐
│              @agent-authority/sdk                            │
│                                                              │
│  ┌─────────────────┐   ┌───────────────┐   ┌─────────────┐  │
│  │  PolicyEngine   │   │  AuthManager  │   │ X402Handler │  │
│  │  (enforcement)  │   │ (delegation)  │   │ (intercept) │  │
│  └────────┬────────┘   └───────┬───────┘   └──────┬──────┘  │
│           │                   │                   │          │
│  ┌────────▼───────────────────▼───────────────────▼──────┐  │
│  │                 SpendingAuthority                       │  │
│  │  { maxSpend, allowedPrograms, expiresAt, rateLimit... } │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────┬─────────────────┘
                                            │ validates before
┌───────────────────────────────────────────▼─────────────────┐
│                    OWS Wallet                                 │
│   (signs transactions — never touches private key directly)  │
└───────────────────────────────────────────┬─────────────────┘
                                            │ executes
┌───────────────────────────────────────────▼─────────────────┐
│                    x402 Payment                               │
│      (HTTP 402 / Solana transaction / EVM transaction)        │
└─────────────────────────────────────────────────────────────┘

Delegation tree:
  Orchestrator ($100)
    ├── Researcher ($30) — Allium + x402 only
    │     └── DataScraper ($5) — Allium only, max $1/tx
    └── Trader ($20) — Jupiter only, no sub-delegation
```

---

## How It Fits the Stack

| Layer | Role |
|-------|------|
| **OWS** | Where the keys live. Signs authority payloads and transactions. |
| **@agent-authority/sdk** | Who is authorized to use those keys, how much, and on which programs. |
| **x402** | How the payment is transported (HTTP 402 → Solana/EVM tx). |
| **MoonPay** | How agent wallets get funded (fiat on-ramp → USDC). |

The SDK sits between OWS and x402. Without it, every framework implements ad-hoc controls with no standard, no composability, and no verifiability.

---

## Core API

### `createAgentNetwork(config)` — Quick-start

```typescript
const network = await createAgentNetwork({
  chain: 'solana:mainnet' | 'eip155:8453' | ...,
  rootBudget: { amount: number, token: 'USDC' },
  expiry: '2h' | '30m' | '1d',
  agents: Record<string, AgentSpec>,
});
```

Returns a typed network with `.agents`, `.engine`, `.audit()`, `.revoke()`, `.stats()`.

### `PolicyEngine`

```typescript
const engine = new PolicyEngine();

// Validate a transaction against an authority
const result = engine.validate({ authorityId, programId, amount, description });

// Revoke (cascades to all children)
engine.revoke(authorityId, reason);

// Subscribe to events
engine.on('spend_approved', handler);
engine.on('spend_rejected', handler);
engine.on('authority_revoked', handler);
```

### `AuthorityManager`

```typescript
const manager = new AuthorityManager(engine);

// Create root authority (orchestrator's budget)
const rootAuth = await manager.createRootAuthority(grantorId, granteeId, policy, chain);

// Delegate to a sub-agent
const childAuth = await manager.delegate(parentId, delegatorId, granteeId, amount, policyOverrides);

// Negotiate with trust-score-based counter-offers
const result = await manager.negotiatePermission(orchestratorAuthId, orchestratorId, request);

// Verify the full delegation chain cryptographically
const check = await manager.verifyDelegationChain(authorityId);
```

### `AutonomousAgent`

```typescript
const agent = new AutonomousAgent({ identity, signer, engine, manager, x402Handler });

// Spend directly (validates against active authority)
const result = await agent.spend({ programId, amount, description });

// Handle x402 payment (validates + executes)
const r = await agent.payX402({ url, amount, tokenMint, recipient, facilitatorProgram, schemes });

// Delegate to a sub-agent
const childAuth = await agent.delegateTo(childAgent, amount, policyOverrides);

// Request authority from an orchestrator (with negotiation)
const negotiation = await agent.requestPermission(orchestratorAuthId, orchestratorId, request);
```

### `X402Handler`

```typescript
const handler = new X402Handler(engine);

// Called when an agent encounters HTTP 402
const result = await handler.handlePaymentRequired(authorityId, paymentRequest);

// Preview without deducting (dry run)
const preview = handler.dryRun(authorityId, amount, programId);
```

---

## Run the Demos

```bash
npm install

# Core demo — full delegation + revocation + audit trail
npm run demo

# OWS demo — same flow with OWS wallet signing (falls back if OWS not installed)
npm run demo:ows

# Cross-chain demo — Solana + Base, one wallet, isolated engines
npm run demo:crosschain

# Research scenario — multi-agent research workflow
npm run scenario:research

# Trading scenario — fund manager + strategy bots with risk controls
npm run scenario:trading

# Tests
npm test
```

---

## Cross-Chain Support

Authorities are scoped to a chain. A Solana authority cannot be used by a Base engine, and vice versa — this is structural, not a policy rule.

```typescript
// Solana engine — isolated state
const solanaEngine = new PolicyEngine();
const solAuth = await solanaManager.createRootAuthority(..., 'solana:mainnet');

// Base engine — completely separate
const baseEngine = new PolicyEngine();
const baseAuth = await baseManager.createRootAuthority(..., 'eip155:8453');

// Cross-chain isolation proof:
baseEngine.validate({ authorityId: solAuth.id, ... });
// → { valid: false, reason: 'Authority not found' }
// A Solana authority is invisible to the Base engine.
```

---

## OWS Integration

```typescript
import { createOWSWallet, OWSSigner } from '@agent-authority/sdk/ows';

// Creates a named OWS wallet and returns a SigningProvider
const signer = await createOWSWallet('trader-agent', 'solana:mainnet');

const agent = new AutonomousAgent({
  identity: { id: 'trader', pubkey: signer.getPublicKey(), ... },
  signer,  // OWS-backed — all authority signatures use OWS
  engine, manager, x402Handler,
});
```

If OWS CLI is not installed, `OWSSigner` falls back to an in-process Ed25519 keypair with a console warning. The entire protocol runs identically.

---

## MoonPay Integration

```typescript
import { fundAgentWallet, checkBalance } from '@agent-authority/sdk/moonpay';

// Fund an agent wallet via MoonPay on-ramp (simulate: true for demos)
const result = await fundAgentWallet(agentPubkey, 100, {
  network: 'solana-mainnet',
  simulate: true,  // set false for production with API key
});
// → { txHash: 'mp_...', amountUSDC: 98.5, confirmed: true }
```

---

## Hackathon Track

**The Grid — Cross-chain Infrastructure**

| Requirement | Status |
|-------------|--------|
| OWS CLI for wallet operations | ✅ `src/ows/signer.ts` — full OWS integration with Ed25519 fallback |
| MoonPay agent skill | ✅ `src/moonpay/funding.ts` — fiat on-ramp with simulate mode |
| 2+ chains | ✅ Solana (`solana:mainnet`) + Base (`eip155:8453`) with isolated engines |
| OWS wallet as signing layer | ✅ All authority signatures route through `SigningProvider` / OWS |

---

## Roadmap

**Phase 2 — On-chain verification**
Deploy an Anchor program on Solana that stores authority hashes on-chain, making the delegation chain verifiable by anyone without trusting the SDK.

**Phase 3 — ERC-4337 session keys**
On the EVM side, integrate ERC-4337 session keys as the execution layer for Base authority enforcement, so policies are enforced by the account abstraction contract, not just the SDK.

**Phase 4 — Cross-framework adapters**
Adapters for elizaOS, Solana Agent Kit, GOAT, and OpenClaw so any agent framework gets policy enforcement with one import.
