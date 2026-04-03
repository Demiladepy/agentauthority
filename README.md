# SpendOS — Agent Spend Governance for the Autonomous Economy

> Give agents wallets, not blank checks.

## The Problem

OWS gives agents wallets and x402 gives them a payment rail — but nothing sits between them to enforce *what* an agent is allowed to pay for, *how much*, and *to whom*. Without an authorization layer, every agent that receives a wallet has full signing authority. Multi-agent workflows (orchestrator → researcher → scraper) require scoped, hierarchical spending limits with cryptographic accountability and dynamic trust so that a compromised sub-agent cannot drain the parent's budget.

## What SpendOS Does

| Feature | Description |
|---|---|
| **Hierarchical policies** | Budget caps, program allowlists, rate limits, tx-size limits, expiry — all inherited and enforced down delegation chains |
| **Cryptographic delegation** | Ed25519-signed authority tokens. Every delegation is verifiable from sub-agent back to root without on-chain state |
| **Dynamic reputation scoring** | Behavioral trust tiers (0–100) that auto-adjust spending limits. Successful agents earn more authority; bad actors lose it |
| **Dead man's switch** | Heartbeat-based auto-revocation. Unresponsive agents lose authority and remaining funds sweep to a recovery wallet |
| **Behavioral watchdog** | Real-time anomaly detection (velocity spikes, unusual programs, near-limit clustering, rapid delegation) with auto-throttle |
| **x402 interception** | Policy-checked before every micropayment. 402 Payment Required → SpendOS validates → approve or reject |
| **Cross-chain governance** | Solana + EVM (Base, Ethereum, Arbitrum) from one OWS wallet via the same policy engine |
| **MoonPay integration** | Fiat on-ramp funding for agent wallets via MoonPay CLI skill |
| **Full audit trail** | Every spend, rejection, delegation, revocation, and anomaly is logged with cryptographic delegation path |

## Quick Start

```typescript
import { createAgentNetwork } from '@agent-authority/sdk';

const network = await createAgentNetwork({
  chain: 'solana:mainnet',
  rootBudget: { amount: 100, token: 'USDC' },
  expiry: '2h',
  agents: {
    researcher: { budget: 30, allowedPrograms: ['allium', 'x402'], canDelegate: true },
    trader:     { budget: 20, allowedPrograms: ['jupiter'],        canDelegate: false },
  },
});

// x402 payment — automatically policy-checked
await network.agents.researcher.payX402({
  url: 'https://api.allium.xyz/v1/wallet-risk/...',
  amount: 500_000n,        // $0.50 USDC (6 decimals)
  tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  recipient: '...',
  description: 'Wallet risk report',
  facilitatorProgram: 'x402FaciLitatorProgram11111111111111111111',
  schemes: ['exact-amount'],
});

// Overspend → auto-rejected
await network.agents.trader.spend({
  programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  amount: 999_000_000n,    // $999 — exceeds budget
  description: 'YOLO trade',
}); // → { success: false, error: 'Would exceed spending limit...' }
```

## Run the Demo

```bash
git clone <repo>
cd agent-authority-sdk
npm install
npm run demo:full      # Full 12-scene showcase (Track 02 submission demo)
npm run demo           # Original 13-step demo
npm test               # Policy engine test suite
```

## Architecture

```
                    ┌──────────────────────────────────────────┐
                    │              SpendOS SDK                  │
                    │                                           │
 OWS Wallet ───────►│  AuthorityManager  ◄──► PolicyEngine     │
 (Ed25519/OWS)      │       │                    │             │
                    │       │ signs               │ enforces   │
                    │       ▼                     ▼             │
                    │  SpendingAuthority   ReputationEngine     │
                    │  (delegation chain)  (trust tiers 0-100) │
                    │                                           │
                    │  DeadMansSwitch ◄─── heartbeat()         │
                    │  Watchdog       ◄─── spend events        │
                    │                                           │
                    └──────────────────┬───────────────────────┘
                                       │ validates
                                       ▼
                              x402 Payment Required
                              (micropayment rail)
```

## File Structure

```
src/
├── core/
│   ├── types.ts              — SpendingPolicy, SpendingAuthority, AuditEvent, etc.
│   ├── policy-engine.ts      — Enforcement: validate, revoke, rate-limit, audit
│   └── authority-manager.ts  — Create, delegate, verify delegation chains
├── reputation/
│   ├── types.ts              — AgentMetrics, TrustTier, ReputationReport
│   └── reputation-engine.ts  — Dynamic behavioral scoring (5 trust tiers)
├── safety/
│   ├── types.ts              — WatchdogAlert, HealthScore, DeadMansSwitchConfig
│   ├── dead-mans-switch.ts   — Heartbeat-based auto-revocation + fund sweep
│   └── watchdog.ts           — Real-time anomaly detection + auto-throttle
├── agents/
│   └── autonomous-agent.ts   — Agent runtime: spend, delegate, payX402, executeTask
├── x402/
│   └── handler.ts            — 402 Payment Required interception + policy check
├── ows/
│   └── signer.ts             — OWS CLI adapter (falls back to Ed25519)
├── moonpay/
│   └── funding.ts            — Fiat on-ramp via MoonPay CLI
├── chains/
│   └── chain-adapter.ts      — Solana + EVM address validation, chain metadata
├── quick-start.ts            — One-call agent network setup
└── demo/
    ├── run.ts                — Original demo (13 steps)
    └── full-demo.ts          — Full submission demo (12 scenes)
```

## Reputation Tiers

| Tier | Score | Max/Day | Max/Tx | Delegation Depth | Rate Limit |
|---|---|---|---|---|---|
| Probationary | 0–20 | $5 | $1 | 0 (none) | 5 tx/min |
| Limited | 21–40 | $50 | $10 | 1 | 10 tx/min |
| Standard | 41–60 | $200 | $50 | 2 | 20 tx/min |
| Trusted | 61–80 | $1,000 | $200 | 3 | 50 tx/min |
| Sovereign | 81–100 | $5,000 | $1,000 | 4 | 100 tx/min |

Score is a weighted composite: success rate (25%), delegation reliability (20%), spend efficiency (15%), time consistency (10%), counterparty diversity (10%), account age (10%), total volume (10%). All metrics use exponential moving averages so recent behavior dominates.

## Track Compliance

| Requirement | Status |
|---|---|
| Track 02 — Agent Spend Governance & Identity | ✅ Core focus |
| OWS CLI integration | ✅ `OWSSigner` wraps OWS CLI, falls back to Ed25519 |
| OWS Wallet usage | ✅ All signing through `SigningProvider` interface |
| MoonPay agent skill | ✅ `fundAgentWallet()` calls `mp virtual-account onramp create` |
| Solana-native | ✅ Default chain `solana:mainnet`, per-authority chain scoping |

## Technical Decisions

**Local-first policy engine** — Enforced at the SDK layer before any transaction reaches the network. Zero on-chain cost for rejections, sub-millisecond enforcement, full offline operation. Phase 2 ships the Anchor program for on-chain verifiability.

**Ed25519 delegation chains** — Each authority is signed by the grantor's keypair over a deterministic payload. Delegation chains are cryptographically verifiable without a trusted third party in O(depth) local operations.

**Behavioral reputation, not staked** — Staked systems require capital lockup and on-chain state. Behavioral scoring is free, updates in real-time, and is harder to game — you can't buy a track record, you have to earn it.

**Watchdog pattern over static rules** — Static rules can't distinguish a legitimate burst from an attack. The watchdog compares current behavior to each agent's personal baseline, adapting to different agent archetypes.

## Roadmap

- **Phase 2**: On-chain Solana Anchor program for verifiable policy enforcement. Policies become PDAs. Delegations are on-chain accounts.
- **Phase 3**: ERC-4337 session key bridge for EVM. SpendOS policies map directly to session key permissions.
- **Phase 4**: Agent insurance pool. Agents pay micropayment premiums; coverage against smart contract exploits.
- **Phase 5**: Cross-agent reputation network. Agents that collaborate successfully build shared trust scores across the ecosystem.