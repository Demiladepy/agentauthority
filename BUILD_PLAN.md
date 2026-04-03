# AGENT SPENDING AUTHORITY PROTOCOL — 18-HOUR BUILD PLAN

## What You're Building

The missing authorization layer between OWS (wallet) and x402 (payments) for the AI agent economy on Solana. A TypeScript SDK that lets any agent framework enforce hierarchical spending policies with cryptographic delegation chains.

**Product name:** `@agent-authority/sdk`  
**Track:** The Grid (Cross-chain infrastructure)  
**Required stack:** OWS CLI + MoonPay agent skill + 2+ chains + OWS wallet as signing layer

---

## WHAT'S ALREADY BUILT (Your Starting Point)

The core SDK is done and compiles + runs cleanly:

```
src/
├── core/
│   ├── types.ts              ✅ Complete type system
│   ├── policy-engine.ts      ✅ Transaction validation, rate limits, audit events
│   └── authority-manager.ts  ✅ Authority creation, delegation, negotiation, signing
├── agents/
│   └── autonomous-agent.ts   ✅ Agent abstraction with spend/delegate/negotiate
├── x402/
│   └── handler.ts            ✅ x402 payment interception with policy enforcement
├── demo/
│   └── run.ts                ✅ 13-step demo (working — run `npm run demo`)
└── index.ts                  ✅ Barrel exports
```

Run `npm run demo` to verify everything works before starting.

---

## 18-HOUR TIMELINE

### PHASE 1: OWS Integration (Hours 0–3)
**Goal:** Replace the demo Ed25519Signer with actual OWS wallet signing.

**What to do:**
1. Install OWS CLI on your machine: `curl -fsSL https://docs.openwallet.sh/install.sh | bash`
2. Create an OWS signing adapter: `src/ows/signer.ts`
3. Create a wallet provisioning helper that creates OWS wallets for each agent
4. Update the demo to use OWS wallets instead of raw Ed25519 keypairs

**Claude Code Prompt — OWS Signer Adapter:**
```
Read the OWS documentation at https://docs.openwallet.sh and the npm package @open-wallet-standard/core.

I need you to create a file `src/ows/signer.ts` that implements my existing `SigningProvider` interface (defined in src/core/authority-manager.ts) using OWS for wallet operations.

The SigningProvider interface is:
- getPublicKey(): string
- sign(message: Uint8Array): Promise<Uint8Array>
- verify(message: Uint8Array, signature: Uint8Array, pubkey: string): Promise<boolean>

The adapter should:
1. Accept a wallet name and chain identifier in the constructor
2. Use @open-wallet-standard/core to create/access the wallet
3. Use OWS signMessage for the sign() method
4. The chain parameter should support both "solana:mainnet" and "eip155:1" formats
5. Handle errors gracefully — if OWS is not installed, fall back to Ed25519Signer with a warning

Export the class as `OWSSigner` and also export a helper function `createOWSWallet(name: string): Promise<OWSSigner>` that creates the wallet and returns the signer.

Do not modify any existing files. Only create the new file.
```

**Claude Code Prompt — OWS Demo Update:**
```
I have a working demo at src/demo/run.ts that uses Ed25519Signer for all agents.

Create a new file `src/demo/run-ows.ts` that is a copy of src/demo/run.ts but modified to:
1. Import OWSSigner from '../ows/signer'
2. Try to use OWS wallets for each agent (orchestrator, researcher, trader, scraper)
3. If OWS is not available, gracefully fall back to Ed25519Signer with a console warning
4. The wallet names should be: "orchestrator-agent", "researcher-agent", "trader-agent", "scraper-agent"
5. Add a setup phase at the beginning that creates the OWS wallets using the CLI via child_process.execSync

Keep the exact same demo flow and output formatting. Only change the signer initialization.

Add a new script to package.json: "demo:ows": "tsc && node dist/demo/run-ows.js"
```

---

### PHASE 2: MoonPay Agent Skill Integration (Hours 3–5)
**Goal:** Add MoonPay CLI as the fiat on-ramp for funding agent authority accounts.

**What to do:**
1. Install MoonPay CLI: check https://docs.moonpay.com/agent-cli for installation
2. Create a MoonPay funding skill: `src/moonpay/funding.ts`
3. Integrate into the demo flow — show agents getting funded before spending

**Claude Code Prompt — MoonPay Funding Skill:**
```
Read the MoonPay CLI documentation. I need a file `src/moonpay/funding.ts` that provides:

1. A `fundAgentWallet` function that:
   - Takes a wallet address (Solana pubkey string) and amount in USD
   - Uses MoonPay's buy/onramp skill to purchase USDC and send to the wallet
   - Returns the transaction hash and confirmation
   - Has a `simulate` mode that logs what would happen without making real transactions

2. A `checkBalance` function that:
   - Takes a wallet address
   - Returns the USDC balance (use Solana RPC or MoonPay's balance check if available)

3. A `MoonPayFundingConfig` type with:
   - apiKey (optional — for production)
   - network: 'solana-mainnet' | 'solana-devnet'
   - simulate: boolean

For the hackathon demo, `simulate: true` is the default. The function should log realistic-looking output showing the funding flow even in simulation mode.

Keep this modular — it should work standalone and not depend on the rest of the SDK.
```

**Cursor Prompt — Demo Integration:**
```
In src/demo/run.ts, add a new section between step 2 (REGISTERING AGENTS) and step 3 (CREATING ROOT AUTHORITY):

Section "2.5 FUNDING AGENT WALLETS VIA MOONPAY"

Import the fundAgentWallet function from '../moonpay/funding'.

Show the orchestrator wallet being funded with $100 USDC via MoonPay (in simulate mode).
Log output like:
  → Initiating MoonPay on-ramp: $100 USD → USDC
  → Network: Solana Mainnet
  → Recipient: [orchestrator pubkey]
  ✓ Funded: 100.00 USDC received (simulated)
  → MoonPay tx: [mock tx hash]

Keep all existing demo sections and numbering — just insert this new section.
```

---

### PHASE 3: EVM Chain Support (Hours 5–7)
**Goal:** Make the policy engine chain-aware for both Solana and EVM. Satisfies the "2+ chains" requirement.

**Claude Code Prompt — Chain Abstraction:**
```
I need to add EVM support to my agent spending authority SDK. Currently everything works for Solana.

Create a file `src/chains/chain-adapter.ts` with:

1. A `ChainAdapter` interface:
   - chainId: string (e.g., "solana:mainnet", "eip155:1", "eip155:8453" for Base)
   - validateAddress(address: string): boolean
   - decodeTransferAmount(txBytes: Buffer): bigint | null
   - formatAmount(lamports: bigint, decimals: number): string
   - getNativeTokenSymbol(): string

2. A `SolanaAdapter` class implementing ChainAdapter
   - Validates Solana base58 addresses (32-44 chars, valid base58)
   - Understands SPL token transfer instruction format
   - SOL as native token

3. An `EVMAdapter` class implementing ChainAdapter
   - Validates 0x-prefixed Ethereum addresses (42 chars, valid hex)
   - Understands ERC20 transfer(address,uint256) function selector
   - ETH as native token for eip155:1, ETH for eip155:8453 (Base)

4. A `getChainAdapter(chainId: string): ChainAdapter` factory function

5. Update the SpendingAuthority type concept: the policy engine should check the chain field and use the appropriate adapter for address validation.

Then create `src/chains/evm-authority.ts` that shows how to create a spending authority on Base (eip155:8453) — same PolicyEngine, same AuthorityManager, different chain parameter and address format.

Do NOT modify existing core files. These are additive files only.
```

**Claude Code Prompt — Cross-Chain Demo:**
```
Create `src/demo/cross-chain.ts` — a focused demo showing:

1. An orchestrator with a root authority on Solana
2. The same orchestrator (same OWS wallet, different chain derivation) creates a SECOND root authority on Base (eip155:8453)
3. A researcher agent receives delegated authority on Solana
4. A trader agent receives delegated authority on Base
5. Both make x402 payments within their respective chain policies
6. Show that a Solana-authorized agent CANNOT spend on the Base authority and vice versa

This demonstrates: one OWS wallet, two chains, independent policy enforcement per chain.

Use the same pretty-print formatting as the existing demo (COLORS object, banner/section/success/fail/info functions). Copy those helpers from src/demo/run.ts.

Add script: "demo:crosschain": "tsc && node dist/demo/cross-chain.js"
```

---

### PHASE 4: Real Agent Scenarios with LLM Decision-Making (Hours 7–10)
**Goal:** Build 2-3 realistic agent workflows that demonstrate the protocol solving real problems. This is where the "agentic edge" becomes undeniable.

**Claude Code Prompt — Research Agent Workflow:**
```
Create `src/scenarios/research-workflow.ts`:

A complete workflow where:
1. An Orchestrator agent has a $200 budget
2. It receives a task: "Investigate token XYZ for potential investment"
3. It creates three sub-agents:
   a. DataAgent — authorized for Allium data endpoints only, $30 budget
   b. SocialAgent — authorized for social data APIs, $10 budget  
   c. AnalysisAgent — authorized for compute APIs, $15 budget
4. Each agent executes simulated x402 payments:
   - DataAgent: pays $0.50 for token holder analysis, $1 for transaction history, $0.25 for whale tracking
   - SocialAgent: pays $0.10 for sentiment score, $0.05 for mention count
   - AnalysisAgent: pays $2 for backtesting compute
5. The AnalysisAgent tries to access social data (unauthorized program) — blocked
6. DataAgent tries to overspend — blocked
7. Orchestrator reviews the audit trail and calculates total cost
8. Final output: "Research complete. Total cost: $X.XX. Budget remaining: $Y.YY"

Make each agent log their actions with their name color-coded.
Each simulated x402 payment should have a realistic URL and description.

The key insight to demonstrate: without this protocol, the orchestrator would have to give each sub-agent a full wallet with no spending controls. With this protocol, each agent has precisely scoped authority.

Add script: "scenario:research": "tsc && node dist/scenarios/research-workflow.js"
```

**Claude Code Prompt — Trading Agent with Risk Limits:**
```
Create `src/scenarios/trading-workflow.ts`:

A workflow demonstrating risk management:
1. A Fund Manager agent has a $1000 budget
2. It delegates to three strategy agents:
   a. MomentumBot — $300 budget, max $50/trade, Jupiter only
   b. ArbitrageBot — $200 budget, max $100/trade, Jupiter + Raydium
   c. YieldBot — $150 budget, max $75/trade, Marinade + Lido
3. Simulate a trading session:
   - MomentumBot makes 5 trades ($20, $30, $45, $50, then $51 — last one blocked by max tx limit)
   - ArbitrageBot makes 2 trades, then tries to trade on an unauthorized DEX — blocked
   - YieldBot stakes successfully, then tries to emergency withdraw more than its budget — blocked
4. Fund Manager revokes MomentumBot mid-session (risk limit hit)
5. MomentumBot tries to trade after revocation — blocked
6. Final PnL report showing each agent's spending

The demo should make it viscerally obvious why spending authority matters for autonomous trading:
"Without this: a compromised or buggy trading agent drains your entire wallet.
With this: the agent can only lose what you authorized, on the protocols you approved, within the time window you set."

Add script: "scenario:trading": "tsc && node dist/scenarios/trading-workflow.js"
```

---

### PHASE 5: SDK Polish + Developer Experience (Hours 10–13)
**Goal:** Make the SDK something other developers would actually use.

**Claude Code Prompt — Quick Start API:**
```
Create `src/quick-start.ts` — a simplified API that wraps the complexity:

import { createAgentNetwork } from '@agent-authority/sdk';

// One function to set up everything
const network = await createAgentNetwork({
  chain: 'solana:mainnet',
  rootBudget: { amount: 100, token: 'USDC' },
  expiry: '2h',
  agents: [
    { 
      name: 'researcher', 
      budget: 30, 
      allowedPrograms: ['allium', 'x402'],
      canDelegate: true,
      maxDelegationAmount: 10 
    },
    { 
      name: 'trader', 
      budget: 20, 
      allowedPrograms: ['jupiter'],
      canDelegate: false 
    },
  ],
});

// Use the agents directly
const result = await network.agents.researcher.payX402({ ... });
const delegated = await network.agents.researcher.delegateTo('sub-scraper', 5);

This should:
1. Create the PolicyEngine, AuthorityManager, X402Handler internally
2. Generate Ed25519 signers (or OWS signers if available) for each agent
3. Create the root authority and delegate to each agent
4. Return a typed object with .agents, .engine, .audit, .revoke(), .stats()
5. Include proper TypeScript generics so agent names are autocompleted

The `allowedPrograms` field should accept friendly names like 'jupiter', 'allium', 'raydium', 'marinade' and map them to real program IDs internally.

This is the API that goes in the README as the "5-minute quickstart."
```

**Claude Code Prompt — Tests:**
```
Create `src/__tests__/policy-engine.test.ts` using Node's built-in test runner (node:test + node:assert):

Test cases:
1. "creates root authority with correct initial state"
2. "approves spend within budget"
3. "rejects spend exceeding budget"
4. "rejects spend on unauthorized program"
5. "rejects spend after expiry"
6. "enforces rate limits"
7. "enforces max transaction size"
8. "delegates to child with reduced permissions"
9. "prevents child from exceeding parent's program allowlist"
10. "prevents delegation beyond max depth"
11. "cascading revocation revokes all children"
12. "tracks cumulative spend across multiple transactions"
13. "exhausts authority when fully spent"
14. "negotiation counter-offers for low-trust agents"
15. "delegation chain verification succeeds for valid chain"

Each test should be self-contained — create its own engine, manager, and authorities.
Use BigInt literals for USDC amounts (e.g., 50_000_000n for $50).
Group related tests with describe().

Add script: "test": "tsc && node --test dist/__tests__/policy-engine.test.js"
```

---

### PHASE 6: README + Documentation (Hours 13–15)
**Goal:** A README that positions this as infrastructure, not a hackathon project.

**Claude Code Prompt — README:**
```
Create README.md for the @agent-authority/sdk package. This is for a hackathon submission on The Grid track (cross-chain infrastructure) at a Solana hackathon sponsored by MoonPay (OWS), Solana Foundation, and others.

Structure:
1. **One-liner**: "The missing authorization layer between OWS wallets and x402 payments."

2. **The Problem** (4-5 sentences):
   - OWS gives agents wallets. x402 lets agents pay. But there's no standard for WHO is authorized to spend WHAT, up to HOW MUCH, on WHICH programs, and whether they can delegate that authority downstream.
   - Today agents either get full wallet access (dangerous) or no access (useless).
   - Multi-agent workflows need scoped, hierarchical spending authority.
   - This is the missing middleware.

3. **Quick Start** — show the createAgentNetwork API (5 lines)

4. **What It Does** — bullet list:
   - Scoped spending policies (amount caps, program allowlists, rate limits, expiry)
   - Hierarchical delegation with cryptographic signatures
   - x402 payment interception and policy enforcement
   - Permission negotiation with trust-score-based decisions
   - Cascading revocation
   - Full audit trail
   - Cross-chain support (Solana + EVM)

5. **Architecture Diagram** — ASCII art showing:
   OWS Wallet → Spending Authority Protocol → x402 Payment
   With delegation tree: Root → Agent A → Sub-Agent B

6. **How It Fits the Stack**:
   - OWS = where the keys live
   - This SDK = who's authorized to use those keys, and how much
   - x402 = how the payment is transported
   - MoonPay = how the wallet gets funded

7. **Run the Demo**: npm run demo, npm run demo:crosschain, npm run scenario:research

8. **API Reference** — brief docs for PolicyEngine, AuthorityManager, AutonomousAgent, X402Handler

9. **Hackathon Track**: The Grid — Cross-chain infrastructure
   - Required stack compliance: OWS CLI ✓, MoonPay skill ✓, 2+ chains ✓, OWS wallet as signing layer ✓

10. **Roadmap**: Phase 2 would be on-chain Solana program (Anchor) to make policies verifiable on-chain. Phase 3: ERC-4337 session key integration on EVM side.

Do NOT use flowery language. Write like an engineer explaining infrastructure to other engineers. Short sentences. No marketing fluff.
```

---

### PHASE 7: Submission Package (Hours 15–18)
**Goal:** Everything a judge needs to evaluate and be impressed.

**Cursor Prompt — Demo Video Script:**
```
Write a script for a 3-minute demo video of the Agent Spending Authority Protocol.

Format: Terminal recording (no slides, no UI — this is infrastructure).

Script:
[0:00-0:20] Title card in terminal: ASCII art banner + "The missing authorization layer for the agent economy"

[0:20-0:40] The Problem: Quick text explaining:
"OWS gives agents wallets. x402 lets them pay. But who decides HOW MUCH an agent can spend? On WHICH programs? Can it delegate to sub-agents? Today: nothing. Agents get full wallet access or nothing."

[0:40-1:30] Run `npm run demo` — show the full flow:
- Orchestrator creates $100 budget
- Delegates to Researcher ($30) and Trader ($20)  
- Researcher makes x402 payments for data
- Researcher sub-delegates to DataScraper
- Trader overspends → BLOCKED
- Trader tries unauthorized program → BLOCKED
- Cascading revocation

[1:30-2:00] Run `npm run demo:crosschain` — show:
- Same wallet, two chains (Solana + Base)
- Independent policy enforcement per chain
- Cross-chain isolation

[2:00-2:30] Run `npm run scenario:research` — show:
- Real multi-agent research workflow
- Budget tracking across all agents
- Audit trail

[2:30-3:00] Closing:
- Show the quick-start code (5 lines to set up an agent network)
- "One npm install. Any agent framework. Built on OWS. Works with x402."
- GitHub link
```

**Claude Code Prompt — Submission Write-up:**
```
Create SUBMISSION.md — the hackathon submission description.

Sections:
1. **Project Name**: Agent Spending Authority Protocol
2. **Track**: The Grid — Cross-chain Infrastructure
3. **One-liner**: The missing authorization layer between OWS wallets and x402 payments for the AI agent economy.

4. **Problem**:
   Solana has processed 15M+ agent transactions. OWS just standardized agent wallets. x402 standardized agent payments. But there's a critical gap: no standard for spending authorization. When an agent spawns sub-agents or composes services, they need scoped, hierarchical spending authority — not raw wallet access. Today, every agent framework rolls its own ad-hoc spending limits with no composability, no delegation, and no verification.

5. **Solution**:
   A TypeScript SDK that implements:
   - Policy-gated spending with caps, program allowlists, rate limits, and expiry
   - Hierarchical delegation with cryptographic proof chains
   - x402 payment interception and automatic policy enforcement
   - Trust-score-based permission negotiation
   - Cross-chain support (Solana + EVM via OWS)
   - Full audit trail for every spend and delegation

6. **Required Stack Compliance**:
   - OWS CLI: ✅ Used for wallet creation and signing
   - MoonPay Agent Skill: ✅ Fiat on-ramp for funding authority accounts
   - 2+ Chains: ✅ Solana + Base (EVM) with independent policy enforcement
   - OWS Wallet as Signing Layer: ✅ All authority signatures go through OWS

7. **Technical Architecture**: Brief description of PolicyEngine, AuthorityManager, X402Handler, AutonomousAgent

8. **Why This Matters**:
   Every agent framework on Solana (elizaOS, Solana Agent Kit, GOAT, OpenClaw) needs this. It's the middleware that makes OWS production-ready for multi-agent workflows. Without it, agents either get full wallet access (security nightmare) or can't transact autonomously (defeats the purpose).

9. **Demo**: Links to demo commands and video

10. **Built By**: Your name, location (Nigeria), solo builder
```

---

## PROMPT RULES FOR YOUR AI AGENTS

Give these rules to Claude Code and Cursor at the start of every session:

```
CONTEXT: I'm building the Agent Spending Authority Protocol for a Solana hackathon. The core SDK is already built and working (src/core/, src/agents/, src/x402/, src/demo/). I need you to ADD features without breaking existing code.

RULES:
1. NEVER modify files in src/core/ or src/agents/autonomous-agent.ts unless I explicitly ask you to fix a bug in them. These are stable and tested.
2. All new files go in their own directories (src/ows/, src/moonpay/, src/chains/, src/scenarios/, src/__tests__/).
3. Import types from '../core/types' and classes from '../core/policy-engine' and '../core/authority-manager'.
4. Use the existing SigningProvider interface for any new signer implementations.
5. Use BigInt for all token amounts. USDC has 6 decimals. $1 USDC = 1_000_000n.
6. The project uses: TypeScript strict mode, Node.js 22, CommonJS modules, tweetnacl for Ed25519, bs58 for encoding, uuid for IDs.
7. No frontend. No React. No HTML. This is a CLI SDK.
8. Every new demo/scenario file should use the same pretty-print helpers (COLORS, banner, section, success, fail, info). Copy them from src/demo/run.ts.
9. Test with `npx tsc` after every change. Fix all type errors before moving on.
10. This is an 18-hour hackathon sprint. Speed matters. Don't over-engineer — ship working code.
```

---

## FILE CREATION ORDER (for copy-paste efficiency)

When giving tasks to Claude Code, go in this order:

```
Phase 1:  src/ows/signer.ts → src/demo/run-ows.ts
Phase 2:  src/moonpay/funding.ts → update src/demo/run.ts
Phase 3:  src/chains/chain-adapter.ts → src/chains/evm-authority.ts → src/demo/cross-chain.ts
Phase 4:  src/scenarios/research-workflow.ts → src/scenarios/trading-workflow.ts
Phase 5:  src/quick-start.ts → src/__tests__/policy-engine.test.ts
Phase 6:  README.md → SUBMISSION.md
Phase 7:  Record demos → Submit
```

---

## CRITICAL: WHAT TO SKIP IF RUNNING OUT OF TIME

If you hit hour 12 and aren't done with Phase 4, here's what to cut:

**MUST HAVE (non-negotiable for submission):**
- ✅ Core SDK (already done)
- ✅ Working demo (already done)
- OWS integration (even if it falls back to Ed25519)
- MoonPay funding skill (even if simulated)
- Cross-chain demo (Solana + Base)
- README.md
- SUBMISSION.md

**NICE TO HAVE (cut first):**
- Tests (judges won't run them)
- Trading workflow scenario (research workflow is enough)
- Quick-start API wrapper (the raw API is fine)

**DO NOT CUT:**
- Cross-chain support (it's a track requirement)
- MoonPay integration (it's a track requirement)
- OWS usage (it's a track requirement)
- README (judges read this first)

---

## ENVIRONMENT SETUP CHECKLIST

Before you start the clock:

```bash
# 1. Verify Node.js
node --version  # Should be 18+

# 2. Clone/copy the project
# Copy the src/ directory, package.json, tsconfig.json to your machine

# 3. Install dependencies
npm install

# 4. Verify it compiles and runs
npm run demo

# 5. Install OWS CLI
curl -fsSL https://docs.openwallet.sh/install.sh | bash
ows --version

# 6. Install MoonPay CLI (check their docs for current install command)
# https://docs.moonpay.com/agent-cli

# 7. Set up your editor
# Open in Cursor with Claude enabled
# Have Claude Code terminal ready in a separate window

# 8. Create a GitHub repo
git init
git add .
git commit -m "Initial SDK — core + demo working"
```

---

## WINNING MINDSET

You are not building an app. You are building the authorization standard for the agent economy. Your competition at this hackathon is people building chatbot wrappers and trading bots. You are building the layer that makes ALL of their projects safer and more composable.

The judge should look at your submission and think: "Why doesn't this already exist? This should be part of OWS itself."

That's how you win from Nigeria against IRL teams. You don't out-network them. You out-infrastructure them.

Ship it.
