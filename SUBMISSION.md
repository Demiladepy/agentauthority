# Agent Spending Authority Protocol

**Track:** The Grid — Cross-chain Infrastructure
**One-liner:** The missing authorization layer between OWS wallets and x402 payments for the AI agent economy.

---

## Problem

Solana has processed 15M+ agent transactions. OWS just standardized agent wallets. x402 standardized agent payments. But there's a critical gap: no standard for spending authorization.

When an agent spawns sub-agents or composes services, it needs scoped, hierarchical spending authority — not raw wallet access. Today, every agent framework rolls its own ad-hoc spending limits with no composability, no delegation, and no verification.

Concretely:
- A trading bot given full wallet access can drain the entire balance if it bugs out or gets compromised
- An orchestrator spawning 5 research agents has no standard way to give each exactly $30, on specific data endpoints, for 2 hours
- Sub-agents have no way to prove to the programs they're calling that they're authorized by a root principal
- There's no audit trail, no revocation, no negotiation

This is infrastructure debt. Every framework is building it wrong, separately.

---

## Solution

A TypeScript SDK that implements:

**Policy-gated spending** — Each agent authority has hard caps on total spend, per-transaction size, rate limits, expiry, and an allowlist of programs it can interact with.

**Hierarchical delegation** — An authority holder can delegate a sub-authority to a child agent. The child's policy is strictly constrained by the parent's. Delegation is signed by the grantor, creating a cryptographically verifiable chain from root to leaf.

**x402 payment interception** — Drop-in handler that intercepts HTTP 402 responses and validates the payment against the agent's authority before executing. Agents never need to implement their own budget checks.

**Trust-score-based negotiation** — When agents request authority from an orchestrator, the manager evaluates trust score and available budget to grant, counter-offer, or deny.

**Cascading revocation** — Revoking an authority immediately revokes all child authorities. A compromised sub-agent can be shut down instantly.

**Cross-chain support** — Solana and EVM (Base, Ethereum) with independent policy enforcement per chain. Solana authorities cannot be used on Base engines — structural isolation, not a config flag.

---

## Required Stack Compliance

### OWS / Open Wallet Standard
`src/ows/signer.ts` implements `SigningProvider` using the OWS CLI for wallet creation and signing. Every authority delegation and transaction goes through `OWSSigner` with graceful Ed25519 fallback.

The MoonPay CLI (`@moonpay/cli`) bundles `@open-wallet-standard/core` as its wallet adapter layer — this is confirmed by the module path `@moonpay/cli/node_modules/@open-wallet-standard/core`. The entire payment flow (login → onramp → signing) goes through a wallet that implements the Open Wallet Standard. This satisfies the OWS requirement: the signing layer is OWS-compatible via MoonPay's CLI integration.

```typescript
const signer = await createOWSWallet('trader-agent', 'solana:mainnet');
// Uses OWS CLI if available, falls back to Ed25519 — demo runs identically either way
```

### MoonPay Agent Skill
`src/moonpay/funding.ts` provides `fundAgentWallet()` using the real MoonPay CLI (`mp virtual-account onramp create`). Integrated into the main demo as section 2.5.

```typescript
// Real on-ramp (requires: npm i -g @moonpay/cli && mp login)
await fundAgentWallet(agentPubkey, 100, { network: 'solana-mainnet', simulate: false });

// Simulation (no CLI required — safe for demo)
await fundAgentWallet(agentPubkey, 100, { network: 'solana-mainnet', simulate: true });
// → $98.50 USDC received (after MoonPay fee)
```

### 2+ Chains
`src/chains/chain-adapter.ts` — `SolanaAdapter` and `EVMAdapter` with address validation and transfer decoding for each chain family.

`src/demo/cross-chain.ts` — demonstrates one orchestrator wallet creating independent root authorities on `solana:mainnet` and `eip155:8453` (Base), with isolated policy engines per chain.

### OWS Wallet as Signing Layer
The `SigningProvider` interface abstracts all signing operations. `OWSSigner` implements it using OWS CLI commands. Every authority creation and delegation calls `signer.sign()` — no code path touches raw private keys directly.

---

## Technical Architecture

### PolicyEngine
The enforcement core. Maintains a registry of `SpendingAuthority` objects. Every `validate(intent)` call checks: status, expiry, program allowlist, destination allowlist, single-tx size, cumulative budget, and rate limit — in that order. On approval, records the spend and emits an audit event. On rejection, emits a reject event and returns the error code.

```
validate(intent) → check 7 rules → approve/reject → emit event → return ValidationResult
```

### AuthorityManager
Handles the lifecycle: creation, delegation, revocation, negotiation. Each authority is created by signing a canonical payload (id, grantor, grantee, policy, chain, depth, parentId) with the grantor's signing provider. The signature is stored on the authority and can be verified by anyone with the grantor's public key.

Delegation enforces: child policy ⊆ parent policy (program allowlist is intersected, expiry is min'd, depth decrements).

Negotiation evaluates: available budget, requester trust score, priority — then grants, counter-offers, or denies.

### X402Handler
Translates `X402PaymentRequired` (from an HTTP 402 response) into a `TransactionIntent` and passes it to the PolicyEngine. Returns `{ authorized: true, transactionSignature, remainingBudget }` or `{ authorized: false, rejectionReason }`. Agents call `handlePaymentRequired()` — they never implement budget checks themselves.

### AutonomousAgent
The agent abstraction. Holds a `SpendingAuthority`, a `SigningProvider`, and references to the engine and manager. Exposes `spend()`, `payX402()`, `delegateTo()`, `requestPermission()`. Trust score updates automatically on approved and rejected spends.

---

## Why This Matters

Every agent framework on Solana — elizaOS, Solana Agent Kit, GOAT, OpenClaw — needs this. It's the middleware that makes OWS production-ready for multi-agent workflows. Without it:

- Agents get full wallet access (security nightmare — one compromised agent drains everything)
- Or agents get no access (defeats the purpose of autonomous agents)

With this protocol, the attack surface is bounded. An agent can only lose what you authorized, on the protocols you approved, within the time window you set.

This should be part of OWS itself. Phase 2 is an Anchor program that makes it on-chain verifiable.

---

## Demo Commands

```bash
npm install

npm run demo              # Core protocol: delegation, revocation, audit trail
npm run demo:ows          # Same demo with OWS wallet signing
npm run demo:crosschain   # Solana + Base, one wallet, isolated engines
npm run scenario:research # Multi-agent research workflow ($200 budget, 3 sub-agents)
npm run scenario:trading  # Trading fund with risk controls + mid-session revocation
npm test                  # 15 policy engine test cases
```

---

## Built By

Solo builder. Nigeria.

This is infrastructure, not a dApp. The goal was to build the layer that makes every other project on this track safer and more composable.
