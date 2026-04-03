# SpendOS — Agent Spend Governance for the Autonomous Economy

**Track:** 02 — Agent Spend Governance & Identity
**One-liner:** Give agents wallets, not blank checks. SpendOS is the IAM layer for the agent economy.

---

## The Problem

OWS gives agents wallets. x402 gives them a payment rail. But there is no standard that sits between them to answer: *what is this agent allowed to spend, on what, for how long, and how much can it re-delegate?*

Today, if you give an agent an OWS wallet to execute a task, you've given it a blank check. It can call any program, spend any amount, and spin up sub-agents with the same unlimited authority. One hallucinated trade or compromised sub-agent drains the entire budget. Multi-agent orchestration is impossible to do safely without a scoped authorization primitive.

## The Solution: SpendOS

SpendOS is a TypeScript SDK that implements a policy enforcement layer between OWS wallets and x402 payments. Every agent in a multi-agent system operates under a *SpendingAuthority* — a cryptographically signed token that encodes exactly what the agent can do: spend limit, allowed programs, max transaction size, rate limit, expiry, and how deep it can re-delegate.

The core insight: delegation chains work like JWTs for spending. The root wallet signs an authority token for the orchestrator. The orchestrator signs a sub-token for the researcher. The researcher signs a sub-sub-token for the scraper. Each token is scoped to be strictly less permissive than its parent. The chain is verifiable with Ed25519 signatures all the way back to the root without any on-chain state.

On top of this base layer, SpendOS adds three safety systems that the track specifically asks for:

**Reputation Engine** — Agents earn trust through behavior. Five tiers (Probationary → Sovereign) with spending limits that scale from $5/day to $5,000/day. Every approved spend, rejected attempt, and delegation outcome feeds into a behavioral composite score via exponential moving averages. New agents start restricted. Reliable agents earn autonomy.

**Dead Man's Switch** — Agents must send periodic heartbeats or their authority is automatically revoked. Configurable per-agent. When triggered: authority revoked, remaining funds swept to a recovery wallet, audit event emitted. This prevents crashed or compromised agents from holding live signing authority indefinitely.

**Behavioral Watchdog** — Subscribes to all spend events and detects four anomaly patterns in real-time: velocity spikes (5x above personal baseline), unusual programs (agent uses a program it's never touched), near-limit clustering (testing boundaries), and rapid delegation (spinning up sub-agents fast). On warning: alert emitted. On critical: rate limit auto-halved.

## Required Stack Compliance

- **OWS CLI**: `OWSSigner` class calls `ows wallet pubkey` and `ows wallet sign`. On machines without OWS installed, it falls back to Ed25519 transparently — so the demo always runs.
- **OWS Wallet**: All signing goes through the `SigningProvider` interface. Every authority token is signed with the grantor's OWS-managed keypair.
- **MoonPay Agent Skill**: `fundAgentWallet()` calls `mp virtual-account onramp create --amount <n> --currency USD` to fund agent wallets from fiat. Simulates realistically if the CLI isn't installed.

## What Makes This Unique

Most hackathon submissions build *users* of wallets — trading bots, research agents, DeFi automators. SpendOS builds the *infrastructure those agents run on*. It's the trust and safety layer that every other submission needs but none of them built.

The analogy holds: AWS wouldn't exist without IAM. Cloud computing needed scoped, auditable, revocable permissions before enterprises would trust it. The agent economy needs the same thing. SpendOS is IAM for agent wallets.

The reputation system is particularly differentiated. Rather than requiring capital lockup (staking), trust is earned through behavior. This means new agents can participate immediately at restricted limits, and good agents naturally earn more authority over time without any governance overhead.

## Demo

```bash
npm install
npm run demo:full
```

The demo runs 12 scenes in ~10 seconds:
1. Infrastructure initialization (all 5 systems online)
2. OWS wallet creation for 5 agents (graceful Ed25519 fallback shown)
3. MoonPay on-ramp funding ($500 USDC, simulated)
4. Root authority on Solana ($300) + Base ($200) — cross-chain from one wallet
5. Reputation-based delegation (Trusted agent gets $100, Probationary gets $5)
6. 5 x402 payments from researcher + 3 Jupiter swaps from trader
7. Security enforcement (overspend blocked, unauthorized program blocked)
8. Dead man's switch fires on rogue agent (waits ~6s for timeout, then revokes)
9. Dynamic reputation update (researcher score up, rogue score down)
10. Cryptographic delegation chain verification (depth-2 chain, Ed25519 verified)
11. Full audit trail forensics (per-chain spend, anomaly alerts, DMS triggers)
12. Final status report (all agents, cross-chain summary, system health)

Total new code: ~800 lines across reputation engine, dead man's switch, watchdog, and demo.
All existing core files (policy engine, authority manager, x402 handler) unchanged.