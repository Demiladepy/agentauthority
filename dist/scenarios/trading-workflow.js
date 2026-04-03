"use strict";
/**
 * ═══════════════════════════════════════════════════════════════
 *  TRADING AGENT WORKFLOW — RISK MANAGEMENT
 * ═══════════════════════════════════════════════════════════════
 *
 *  Scenario: Autonomous trading fund with risk controls
 *
 *  FundManager ($1000) → MomentumBot ($300) + ArbitrageBot ($200) + YieldBot ($150)
 *
 *  Demonstrates:
 *  - Per-agent trading budgets with hard caps
 *  - Max single transaction enforcement
 *  - Unauthorized DEX access blocked
 *  - Mid-session agent revocation (risk limit hit)
 *  - Attempt to trade after revocation — blocked
 *  - PnL report with per-agent cost accounting
 *
 *  Run: npm run scenario:trading
 * ═══════════════════════════════════════════════════════════════
 */
Object.defineProperty(exports, "__esModule", { value: true });
const policy_engine_1 = require("../core/policy-engine");
const authority_manager_1 = require("../core/authority-manager");
const handler_1 = require("../x402/handler");
const autonomous_agent_1 = require("../agents/autonomous-agent");
// ============================================================
// CONSTANTS
// ============================================================
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const RAYDIUM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const MARINADE = 'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD';
const LIDO = 'CrX7kMhLC3cSsXJdT7JDgqrRVMGDGKwFQFNpP7BKCD3';
const ORCA_WHIRL = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'; // unauthorized DEX
const USDC = (n) => BigInt(Math.round(n * 1_000_000));
const fmt = (n) => `$${(Number(n) / 1_000_000).toFixed(2)}`;
// ============================================================
// COLORS
// ============================================================
const C = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
};
function banner(text) {
    const line = '═'.repeat(60);
    console.log(`\n${C.cyan}${line}${C.reset}`);
    console.log(`${C.bold}${C.white}  ${text}${C.reset}`);
    console.log(`${C.cyan}${line}${C.reset}\n`);
}
function section(text) {
    console.log(`\n${C.bold}${C.blue}▶ ${text}${C.reset}`);
    console.log(`${C.dim}${'─'.repeat(50)}${C.reset}`);
}
function success(text) { console.log(`  ${C.green}✓${C.reset} ${text}`); }
function fail(text) { console.log(`  ${C.red}✗${C.reset} ${text}`); }
function info(text) { console.log(`  ${C.dim}→${C.reset} ${text}`); }
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
const BOT_COLORS = {
    fund: C.magenta,
    momentum: C.cyan,
    arbitrage: C.yellow,
    yield: C.green,
};
function botLog(id, level, msg) {
    const names = {
        fund: 'FundManager', momentum: 'MomentumBot', arbitrage: 'ArbitrageBot', yield: 'YieldBot',
    };
    const c = BOT_COLORS[id] ?? C.white;
    const lc = level === 'error' ? C.red : level === 'warn' ? C.yellow : c;
    console.log(`  ${lc}[${names[id] ?? id}]${C.reset} ${msg}`);
}
// ============================================================
// MAIN
// ============================================================
async function main() {
    banner('TRADING AGENT WORKFLOW — RISK MANAGEMENT');
    console.log(`${C.dim}  Fund Manager deploys $1000 USDC across 3 strategy bots.`);
    console.log(`  Each bot has hard caps on spend, tx size, and DEX access.`);
    console.log(`  A misbehaving bot can be mid-session revoked.${C.reset}\n`);
    // --------------------------------------------------------
    // INFRASTRUCTURE
    // --------------------------------------------------------
    section('1. INITIALIZING TRADING INFRASTRUCTURE');
    const engine = new policy_engine_1.PolicyEngine();
    const manager = new authority_manager_1.AuthorityManager(engine);
    const x402 = new handler_1.X402Handler(engine);
    const auditTrail = [];
    for (const et of ['authority_created', 'spend_approved', 'spend_rejected', 'authority_revoked']) {
        engine.on(et, (e) => { auditTrail.push(e); });
    }
    success('Policy Engine initialized');
    success('Authority Manager initialized');
    // --------------------------------------------------------
    // CREATE BOTS
    // --------------------------------------------------------
    section('2. DEPLOYING STRATEGY BOTS');
    const makeBot = (id, name, role, trust) => {
        const signer = new authority_manager_1.Ed25519Signer();
        return new autonomous_agent_1.AutonomousAgent({
            identity: { id, name, pubkey: signer.getPublicKey(), role, trustScore: trust, totalSpends: 0, totalRejections: 0 },
            signer, engine, manager, x402Handler: x402,
            onLog: (level, msg) => botLog(id, level, msg),
        });
    };
    const fundManager = makeBot('fund', 'FundManager', 'Capital allocator', 100);
    const momentumBot = makeBot('momentum', 'MomentumBot', 'Price momentum trading', 70);
    const arbitrageBot = makeBot('arbitrage', 'ArbitrageBot', 'DEX arbitrage', 75);
    const yieldBot = makeBot('yield', 'YieldBot', 'Yield optimization', 80);
    success(`FundManager   deployed — budget controller`);
    success(`MomentumBot   deployed — Jupiter only, $50 max/trade`);
    success(`ArbitrageBot  deployed — Jupiter + Raydium, $100 max/trade`);
    success(`YieldBot      deployed — Marinade + Lido, $75 max/trade`);
    await sleep(300);
    // --------------------------------------------------------
    // ROOT AUTHORITY: $1000
    // --------------------------------------------------------
    section('3. FUND MANAGER ESTABLISHES $1000 AUTHORITY');
    const fundPolicy = {
        maxSpend: USDC(1000),
        tokenMint: USDC_MINT,
        allowedPrograms: [JUPITER, RAYDIUM, MARINADE, LIDO],
        allowedDestinations: [],
        expiresAt: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
        maxRedelegation: USDC(700),
        maxDelegationDepth: 2,
        maxTransactionSize: USDC(100),
        rateLimit: { maxTransactions: 100, windowMs: 60_000 },
    };
    const fundAuth = await manager.createRootAuthority('fund', 'fund', fundPolicy, 'solana:mainnet');
    fundManager.setAuthority(fundAuth);
    success(`Fund authority: ${fundAuth.id.slice(0, 8)}... | Budget: ${fmt(USDC(1000))}`);
    await sleep(300);
    // --------------------------------------------------------
    // DELEGATE TO BOTS
    // --------------------------------------------------------
    section('4. ALLOCATING CAPITAL TO STRATEGY BOTS');
    const momentumAuth = await fundManager.delegateTo(momentumBot, USDC(300), {
        allowedPrograms: [JUPITER],
        maxTransactionSize: USDC(50),
        maxRedelegation: USDC(0),
        maxDelegationDepth: 0,
    });
    success(`MomentumBot:  ${fmt(USDC(300))} | Jupiter only | Max $50/trade`);
    const arbitrageAuth = await fundManager.delegateTo(arbitrageBot, USDC(200), {
        allowedPrograms: [JUPITER, RAYDIUM],
        maxTransactionSize: USDC(100),
        maxRedelegation: USDC(0),
        maxDelegationDepth: 0,
    });
    success(`ArbitrageBot: ${fmt(USDC(200))} | Jupiter + Raydium | Max $100/trade`);
    const yieldAuth = await fundManager.delegateTo(yieldBot, USDC(150), {
        allowedPrograms: [MARINADE, LIDO],
        maxTransactionSize: USDC(75),
        maxRedelegation: USDC(0),
        maxDelegationDepth: 0,
    });
    success(`YieldBot:     ${fmt(USDC(150))} | Marinade + Lido | Max $75/trade`);
    await sleep(300);
    // --------------------------------------------------------
    // MOMENTUM BOT: 5 trades — last one blocked
    // --------------------------------------------------------
    section('5. MOMENTUM BOT TRADING SESSION');
    info('MomentumBot executes Jupiter swaps — 5th trade hits max tx limit');
    const momentumTrades = [
        { amount: USDC(20), desc: 'SOL/USDC momentum entry — long signal' },
        { amount: USDC(30), desc: 'SOL/USDC add to position — strength confirmed' },
        { amount: USDC(45), desc: 'SOL/USDC scale up — breakout detected' },
        { amount: USDC(50), desc: 'SOL/USDC max position — momentum peak' },
        { amount: USDC(51), desc: 'SOL/USDC aggressive add — EXCEEDS $50 max' },
    ];
    let momentumSpent = 0n;
    for (const trade of momentumTrades) {
        const r = await momentumBot.spend({
            programId: JUPITER,
            amount: trade.amount,
            description: trade.desc,
            destination: 'JUPRouterSwap1111111111111111111111111',
        });
        if (r.success) {
            momentumSpent += trade.amount;
            success(`Trade: ${fmt(trade.amount)} — ${trade.desc.split(' — ')[1] ?? ''}`);
            info(`Remaining: ${fmt(r.remainingBudget)}`);
        }
        else {
            fail(`BLOCKED: ${r.error}`);
            info(`Max tx size is $50 — this bot cannot exceed that, ever`);
        }
    }
    await sleep(300);
    // --------------------------------------------------------
    // ARBITRAGE BOT: 2 valid trades, then unauthorized DEX
    // --------------------------------------------------------
    section('6. ARBITRAGE BOT TRADING SESSION');
    info('ArbitrageBot trades on Jupiter and Raydium, then tries Orca — blocked');
    const arb1 = await arbitrageBot.spend({
        programId: JUPITER,
        amount: USDC(80),
        description: 'BONK/USDC arb — Jupiter leg',
        destination: 'JUPRouterSwap1111111111111111111111111',
    });
    if (arb1.success)
        success(`Arb trade 1: ${fmt(USDC(80))} via Jupiter`);
    const arb2 = await arbitrageBot.spend({
        programId: RAYDIUM,
        amount: USDC(80),
        description: 'BONK/USDC arb — Raydium leg (closing position)',
        destination: 'RaydiumSwapRouter111111111111111111111',
    });
    if (arb2.success)
        success(`Arb trade 2: ${fmt(USDC(80))} via Raydium`);
    // Try Orca — not in allowlist
    const arbOrca = await arbitrageBot.spend({
        programId: ORCA_WHIRL,
        amount: USDC(20),
        description: 'BONK/USDC arb — Orca Whirlpool (UNAUTHORIZED)',
        destination: 'OrcaWhirlpoolRouter111111111111111111',
    });
    if (!arbOrca.success) {
        fail(`BLOCKED: ${arbOrca.error}`);
        info(`ArbitrageBot is authorized for Jupiter + Raydium only`);
        info(`Orca is NOT in its allowlist — structural enforcement, not a config flag`);
    }
    await sleep(300);
    // --------------------------------------------------------
    // YIELD BOT: Stake + attempted over-withdrawal
    // --------------------------------------------------------
    section('7. YIELD BOT — STAKING SESSION');
    info('YieldBot stakes on Marinade, then tries emergency withdrawal beyond budget');
    const stake1 = await yieldBot.spend({
        programId: MARINADE,
        amount: USDC(75),
        description: 'Stake 75 USDC into mSOL via Marinade',
        destination: 'MarinadeStakePool111111111111111111111',
    });
    if (stake1.success)
        success(`Staked: ${fmt(USDC(75))} USDC → mSOL via Marinade`);
    // Try to unstake more than remaining budget
    const unstake = await yieldBot.spend({
        programId: MARINADE,
        amount: USDC(100), // exceeds remaining
        description: 'Emergency unstake 100 USDC — EXCEEDS BUDGET',
        destination: 'MarinadeStakePool111111111111111111111',
    });
    if (!unstake.success) {
        fail(`BLOCKED: ${unstake.error}`);
        info(`YieldBot has only ${fmt(USDC(75))} remaining — can't unstake ${fmt(USDC(100))}`);
    }
    await sleep(300);
    // --------------------------------------------------------
    // MID-SESSION REVOCATION
    // --------------------------------------------------------
    section('8. FUND MANAGER REVOKES MOMENTUM BOT (RISK LIMIT HIT)');
    info('MomentumBot hit max tx limit — fund manager revokes authority mid-session');
    const revoked = engine.revoke(momentumAuth.id, 'Risk limit hit — max transaction size exceeded');
    if (revoked) {
        success(`MomentumBot authority revoked: ${momentumAuth.id.slice(0, 8)}...`);
    }
    // MomentumBot tries to trade after revocation
    info('MomentumBot attempts trade after revocation...');
    const postRevoke = await momentumBot.spend({
        programId: JUPITER,
        amount: USDC(20),
        description: 'SOL/USDC — trading after revocation',
    });
    if (!postRevoke.success) {
        fail(`BLOCKED: ${postRevoke.error}`);
        success(`Revocation working — MomentumBot cannot trade`);
    }
    await sleep(300);
    // --------------------------------------------------------
    // FINAL PNL REPORT
    // --------------------------------------------------------
    banner('TRADING SESSION REPORT');
    const slots = [
        { name: 'MomentumBot', auth: momentumAuth, budget: USDC(300) },
        { name: 'ArbitrageBot', auth: arbitrageAuth, budget: USDC(200) },
        { name: 'YieldBot', auth: yieldAuth, budget: USDC(150) },
    ];
    let totalDeployed = 0n;
    console.log(`\n${C.bold}  Per-Agent Breakdown${C.reset}`);
    for (const slot of slots) {
        const stats = engine.getAuthorityStats(slot.auth.id);
        if (stats) {
            const spent = BigInt(stats.spent);
            totalDeployed += spent;
            const statusColor = stats.status === 'revoked' ? C.red : stats.status === 'active' ? C.green : C.yellow;
            console.log(`\n  ${C.bold}${slot.name}${C.reset}`);
            console.log(`    Status:  ${statusColor}${stats.status}${C.reset}`);
            console.log(`    Budget:  ${fmt(slot.budget)}`);
            console.log(`    Spent:   ${fmt(spent)}`);
            console.log(`    Unused:  ${fmt(slot.budget - spent)}`);
            console.log(`    Txns:    ${stats.transactions}`);
            console.log(`    Util:    ${stats.utilization}%`);
        }
    }
    console.log(`\n${C.bold}  Fund Summary${C.reset}`);
    console.log(`    Total deployed: ${fmt(totalDeployed)} of ${fmt(USDC(650))} allocated`);
    console.log(`    Unallocated:    ${fmt(USDC(1000) - USDC(650))}`);
    const rejected = auditTrail.filter(e => e.eventType === 'spend_rejected').length;
    const approved = auditTrail.filter(e => e.eventType === 'spend_approved').length;
    const revocations = auditTrail.filter(e => e.eventType === 'authority_revoked').length;
    console.log(`\n${C.bold}  Risk Events${C.reset}`);
    console.log(`    ${C.green}Approved trades:        ${approved}${C.reset}`);
    console.log(`    ${C.red}Blocked attempts:       ${rejected}${C.reset}`);
    console.log(`    ${C.red}Mid-session revocations: ${revocations}${C.reset}`);
    banner('TRADING WORKFLOW COMPLETE');
    console.log(`${C.dim}  Without this protocol:`);
    console.log(`    A compromised or buggy trading agent drains your entire wallet.`);
    console.log(`    MomentumBot's $51 trade would have gone through.`);
    console.log(`    ArbitrageBot could have traded on any DEX on Solana.`);
    console.log(`    A revoked bot could keep trading.`);
    console.log(``);
    console.log(`  With this protocol:`);
    console.log(`    Each agent can only lose what you authorized.`);
    console.log(`    On the protocols you approved.`);
    console.log(`    Within the time window you set.`);
    console.log(`    And you can pull the plug mid-session.${C.reset}\n`);
}
main().catch(err => {
    console.error('Trading workflow failed:', err);
    process.exit(1);
});
//# sourceMappingURL=trading-workflow.js.map