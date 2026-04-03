"use strict";
/**
 * ═══════════════════════════════════════════════════════════════
 *  AGENT SPENDING AUTHORITY PROTOCOL — FULL DEMO
 * ═══════════════════════════════════════════════════════════════
 *
 *  Scenario: An orchestrator agent manages a $100 USDC budget.
 *  It delegates to a researcher agent and a trader agent.
 *  The researcher pays for data via x402.
 *  The trader attempts to overspend and gets blocked.
 *  The researcher sub-delegates to a data-scraper agent.
 *  Everything is policy-enforced with a verifiable delegation chain.
 *
 *  This demonstrates:
 *  1. Root authority creation
 *  2. Hierarchical delegation (3 levels deep)
 *  3. x402 payment handling with policy enforcement
 *  4. Overspend rejection
 *  5. Permission negotiation (counter-offers)
 *  6. Trust-score-based decisions
 *  7. Cascading revocation
 *  8. Full audit trail
 * ═══════════════════════════════════════════════════════════════
 */
Object.defineProperty(exports, "__esModule", { value: true });
const policy_engine_1 = require("../core/policy-engine");
const authority_manager_1 = require("../core/authority-manager");
const handler_1 = require("../x402/handler");
const autonomous_agent_1 = require("../agents/autonomous-agent");
const funding_1 = require("../moonpay/funding");
// ============================================================
// CONSTANTS — Simulating real Solana addresses
// ============================================================
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER_PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ALLIUM_DATA_ENDPOINT = 'ALLiUMv1Gx5EP7BuRhXDgzCkqFSJpGXyisotXwSey4Cd';
const X402_FACILITATOR = 'x402FaciLitatorProgram11111111111111111111';
// USDC has 6 decimals
const USDC = (amount) => BigInt(Math.round(amount * 1_000_000));
// ============================================================
// PRETTY PRINTING
// ============================================================
const COLORS = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgBlue: '\x1b[44m',
    bgGreen: '\x1b[42m',
    bgRed: '\x1b[41m',
    bgYellow: '\x1b[43m',
};
function banner(text) {
    const line = '═'.repeat(60);
    console.log(`\n${COLORS.cyan}${line}${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.white}  ${text}${COLORS.reset}`);
    console.log(`${COLORS.cyan}${line}${COLORS.reset}\n`);
}
function section(text) {
    console.log(`\n${COLORS.bold}${COLORS.blue}▶ ${text}${COLORS.reset}`);
    console.log(`${COLORS.dim}${'─'.repeat(50)}${COLORS.reset}`);
}
function success(text) {
    console.log(`  ${COLORS.green}✓${COLORS.reset} ${text}`);
}
function fail(text) {
    console.log(`  ${COLORS.red}✗${COLORS.reset} ${text}`);
}
function info(text) {
    console.log(`  ${COLORS.dim}→${COLORS.reset} ${text}`);
}
function warn(text) {
    console.log(`  ${COLORS.yellow}⚠${COLORS.reset} ${text}`);
}
function formatUSDC(lamports) {
    const dollars = Number(lamports) / 1_000_000;
    return `$${dollars.toFixed(2)} USDC`;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// ============================================================
// MAIN DEMO
// ============================================================
async function main() {
    banner('AGENT SPENDING AUTHORITY PROTOCOL');
    console.log(`${COLORS.dim}  The missing policy layer for the agent economy.`);
    console.log(`  Built on OWS · Works with x402 · Solana-native${COLORS.reset}\n`);
    // --------------------------------------------------------
    // SETUP
    // --------------------------------------------------------
    section('1. INITIALIZING PROTOCOL INFRASTRUCTURE');
    const engine = new policy_engine_1.PolicyEngine();
    const manager = new authority_manager_1.AuthorityManager(engine);
    const x402Handler = new handler_1.X402Handler(engine);
    // Set up audit trail listener
    const auditTrail = [];
    const auditEvents = [
        'authority_created', 'authority_delegated', 'spend_approved',
        'spend_rejected', 'authority_revoked', 'rate_limit_hit',
    ];
    for (const eventType of auditEvents) {
        engine.on(eventType, (event) => {
            auditTrail.push(event);
        });
    }
    success('Policy Engine initialized');
    success('Authority Manager initialized');
    success('x402 Handler initialized');
    success('Audit trail listener active');
    // --------------------------------------------------------
    // CREATE AGENTS
    // --------------------------------------------------------
    section('2. REGISTERING AGENTS');
    // Orchestrator — the root agent with the budget
    const orchestrator = new autonomous_agent_1.AutonomousAgent({
        identity: {
            id: 'orchestrator',
            name: 'Orchestrator',
            pubkey: '', // Will be set by signer
            role: 'Budget controller and task coordinator',
            trustScore: 100,
            totalSpends: 0,
            totalRejections: 0,
        },
        engine, manager, x402Handler,
        onLog: (level, msg) => {
            const color = level === 'error' ? COLORS.red : level === 'warn' ? COLORS.yellow : COLORS.magenta;
            console.log(`  ${color}[Orchestrator]${COLORS.reset} ${msg}`);
        },
    });
    // Researcher — gets delegated authority for data acquisition
    const researcher = new autonomous_agent_1.AutonomousAgent({
        identity: {
            id: 'researcher',
            name: 'Researcher',
            pubkey: '',
            role: 'Data acquisition and analysis',
            trustScore: 75,
            totalSpends: 0,
            totalRejections: 0,
        },
        engine, manager, x402Handler,
        onLog: (level, msg) => {
            const color = level === 'error' ? COLORS.red : level === 'warn' ? COLORS.yellow : COLORS.cyan;
            console.log(`  ${color}[Researcher]${COLORS.reset} ${msg}`);
        },
    });
    // Trader — gets delegated authority for trading
    const trader = new autonomous_agent_1.AutonomousAgent({
        identity: {
            id: 'trader',
            name: 'Trader',
            pubkey: '',
            role: 'DeFi trading execution',
            trustScore: 50,
            totalSpends: 0,
            totalRejections: 0,
        },
        engine, manager, x402Handler,
        onLog: (level, msg) => {
            const color = level === 'error' ? COLORS.red : level === 'warn' ? COLORS.yellow : COLORS.green;
            console.log(`  ${color}[Trader]${COLORS.reset} ${msg}`);
        },
    });
    // Data Scraper — sub-agent of the researcher
    const scraper = new autonomous_agent_1.AutonomousAgent({
        identity: {
            id: 'scraper',
            name: 'DataScraper',
            pubkey: '',
            role: 'Onchain data scraping via Allium',
            trustScore: 40,
            totalSpends: 0,
            totalRejections: 0,
        },
        engine, manager, x402Handler,
        onLog: (level, msg) => {
            const color = level === 'error' ? COLORS.red : level === 'warn' ? COLORS.yellow : COLORS.blue;
            console.log(`  ${color}[DataScraper]${COLORS.reset} ${msg}`);
        },
    });
    success(`Orchestrator registered (pubkey: ${orchestrator.signer.getPublicKey().slice(0, 16)}...)`);
    success(`Researcher registered  (pubkey: ${researcher.signer.getPublicKey().slice(0, 16)}...)`);
    success(`Trader registered      (pubkey: ${trader.signer.getPublicKey().slice(0, 16)}...)`);
    success(`DataScraper registered (pubkey: ${scraper.signer.getPublicKey().slice(0, 16)}...)`);
    // --------------------------------------------------------
    // FUND ORCHESTRATOR WALLET VIA MOONPAY
    // --------------------------------------------------------
    section('2.5 FUNDING AGENT WALLETS VIA MOONPAY');
    info('Orchestrator wallet receives fiat on-ramp via MoonPay (simulated)');
    const funding = await (0, funding_1.fundAgentWallet)(orchestrator.signer.getPublicKey(), 100, { network: 'solana-mainnet', simulate: true });
    if (funding.confirmed) {
        success(`Orchestrator funded: ${funding.amountUSDC.toFixed(2)} USDC ready for delegation`);
        info(`MoonPay tx: ${funding.txHash}`);
        info(`Lamports: ${funding.amountLamports.toLocaleString()} (6 decimals)`);
    }
    await sleep(300);
    // --------------------------------------------------------
    // CREATE ROOT AUTHORITY
    // --------------------------------------------------------
    section('3. CREATING ROOT SPENDING AUTHORITY');
    info('Orchestrator creates a $100 USDC budget with 2-hour expiry');
    const rootPolicy = {
        maxSpend: USDC(100),
        tokenMint: USDC_MINT,
        allowedPrograms: [JUPITER_PROGRAM, TOKEN_PROGRAM, ALLIUM_DATA_ENDPOINT, X402_FACILITATOR],
        allowedDestinations: [], // any destination within allowed programs
        expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
        maxRedelegation: USDC(60), // can delegate up to $60
        maxDelegationDepth: 3,
        maxTransactionSize: USDC(25), // max $25 per tx
        rateLimit: { maxTransactions: 20, windowMs: 60_000 },
    };
    const rootAuthority = await manager.createRootAuthority('orchestrator', 'orchestrator', rootPolicy, 'solana:mainnet');
    orchestrator.setAuthority(rootAuthority);
    success(`Root authority created: ${rootAuthority.id.slice(0, 8)}...`);
    info(`Budget: ${formatUSDC(rootPolicy.maxSpend)}`);
    info(`Delegation limit: ${formatUSDC(rootPolicy.maxRedelegation)}`);
    info(`Max delegation depth: ${rootPolicy.maxDelegationDepth}`);
    info(`Max tx size: ${formatUSDC(rootPolicy.maxTransactionSize)}`);
    info(`Rate limit: ${rootPolicy.rateLimit.maxTransactions} tx / ${rootPolicy.rateLimit.windowMs / 1000}s`);
    await sleep(300);
    // --------------------------------------------------------
    // DELEGATE TO RESEARCHER
    // --------------------------------------------------------
    section('4. DELEGATING TO RESEARCHER');
    info('Orchestrator delegates $30 USDC to Researcher for data acquisition');
    const researcherAuth = await orchestrator.delegateTo(researcher, USDC(30), {
        allowedPrograms: [ALLIUM_DATA_ENDPOINT, X402_FACILITATOR, TOKEN_PROGRAM],
        maxRedelegation: USDC(10), // researcher can sub-delegate up to $10
        maxTransactionSize: USDC(5), // max $5 per data query
    });
    success(`Delegated to Researcher: ${researcherAuth.id.slice(0, 8)}...`);
    info(`Amount: ${formatUSDC(USDC(30))}`);
    info(`Can re-delegate: ${formatUSDC(USDC(10))}`);
    info(`Depth: ${researcherAuth.depth}`);
    await sleep(300);
    // --------------------------------------------------------
    // DELEGATE TO TRADER
    // --------------------------------------------------------
    section('5. DELEGATING TO TRADER');
    info('Orchestrator delegates $20 USDC to Trader for DeFi operations');
    const traderAuth = await orchestrator.delegateTo(trader, USDC(20), {
        allowedPrograms: [JUPITER_PROGRAM, TOKEN_PROGRAM],
        maxRedelegation: USDC(0), // trader cannot sub-delegate
        maxDelegationDepth: 0,
        maxTransactionSize: USDC(10),
    });
    success(`Delegated to Trader: ${traderAuth.id.slice(0, 8)}...`);
    info(`Amount: ${formatUSDC(USDC(20))}`);
    info(`Can re-delegate: ${formatUSDC(USDC(0))} (forbidden)`);
    info(`Depth: ${traderAuth.depth}`);
    await sleep(300);
    // --------------------------------------------------------
    // RESEARCHER: x402 PAYMENTS
    // --------------------------------------------------------
    section('6. RESEARCHER MAKES x402 PAYMENTS');
    info('Researcher fetches wallet risk data from an Allium-powered API');
    // Payment 1: Wallet risk profile
    const dataPayment1 = {
        url: 'https://api.allium-data.xyz/v1/wallet-risk/7xKXtg2...',
        amount: USDC(0.50),
        tokenMint: USDC_MINT,
        recipient: 'ALLiUMDataProvider1111111111111111111111',
        description: 'Wallet risk profile — full counterparty graph',
        facilitatorProgram: X402_FACILITATOR,
        schemes: ['exact-amount'],
    };
    const pay1 = await researcher.payX402(dataPayment1);
    if (pay1.paid) {
        success(`Payment 1 approved: ${formatUSDC(dataPayment1.amount)} for wallet risk profile`);
        info(`Remaining: ${formatUSDC(pay1.remaining)}`);
    }
    // Payment 2: Token vesting analysis
    const dataPayment2 = {
        url: 'https://api.allium-data.xyz/v1/vesting-audit/TokenXYZ',
        amount: USDC(1.00),
        tokenMint: USDC_MINT,
        recipient: 'ALLiUMDataProvider1111111111111111111111',
        description: 'Token vesting audit — cliff dates and unlock schedule',
        facilitatorProgram: X402_FACILITATOR,
        schemes: ['exact-amount'],
    };
    const pay2 = await researcher.payX402(dataPayment2);
    if (pay2.paid) {
        success(`Payment 2 approved: ${formatUSDC(dataPayment2.amount)} for vesting audit`);
        info(`Remaining: ${formatUSDC(pay2.remaining)}`);
    }
    await sleep(300);
    // --------------------------------------------------------
    // RESEARCHER: SUB-DELEGATES TO SCRAPER (3 levels deep!)
    // --------------------------------------------------------
    section('7. RESEARCHER SUB-DELEGATES TO DATA SCRAPER');
    info('Researcher delegates $5 to DataScraper for bulk onchain queries');
    const scraperAuth = await researcher.delegateTo(scraper, USDC(5), {
        allowedPrograms: [ALLIUM_DATA_ENDPOINT, X402_FACILITATOR],
        maxTransactionSize: USDC(1),
    });
    success(`Sub-delegated to DataScraper: ${scraperAuth.id.slice(0, 8)}...`);
    info(`Depth: ${scraperAuth.depth} (3 levels: Orchestrator → Researcher → DataScraper)`);
    info(`Amount: ${formatUSDC(USDC(5))}`);
    // DataScraper makes a payment
    const scraperPayment = {
        url: 'https://api.allium-data.xyz/v1/bulk-transactions/batch-7',
        amount: USDC(0.25),
        tokenMint: USDC_MINT,
        recipient: 'ALLiUMDataProvider1111111111111111111111',
        description: 'Bulk transaction history — 1000 records',
        facilitatorProgram: X402_FACILITATOR,
        schemes: ['exact-amount'],
    };
    const scraperPay = await scraper.payX402(scraperPayment);
    if (scraperPay.paid) {
        success(`DataScraper payment approved at depth 2: ${formatUSDC(scraperPayment.amount)}`);
    }
    await sleep(300);
    // --------------------------------------------------------
    // TRADER: SUCCESSFUL TRADE
    // --------------------------------------------------------
    section('8. TRADER EXECUTES A TRADE');
    info('Trader swaps $8 USDC → SOL via Jupiter');
    const tradeResult = await trader.spend({
        programId: JUPITER_PROGRAM,
        amount: USDC(8),
        description: 'Swap 8 USDC → SOL via Jupiter aggregator',
        destination: 'JUPRouterSwapAddress111111111111111111',
    });
    if (tradeResult.success) {
        success(`Trade approved: ${formatUSDC(USDC(8))}`);
        info(`Remaining budget: ${formatUSDC(tradeResult.remainingBudget)}`);
    }
    await sleep(300);
    // --------------------------------------------------------
    // TRADER: OVERSPEND ATTEMPT — REJECTED!
    // --------------------------------------------------------
    section('9. TRADER ATTEMPTS TO OVERSPEND — POLICY ENFORCEMENT');
    info('Trader tries to swap $15 USDC — exceeds remaining budget');
    const overspendResult = await trader.spend({
        programId: JUPITER_PROGRAM,
        amount: USDC(15),
        description: 'Swap 15 USDC → SOL — aggressive position',
        destination: 'JUPRouterSwapAddress111111111111111111',
    });
    if (!overspendResult.success) {
        fail(`BLOCKED: ${overspendResult.error}`);
        info('Policy engine prevented overspend — budget integrity maintained');
    }
    await sleep(300);
    // --------------------------------------------------------
    // TRADER: TRIES UNAUTHORIZED PROGRAM — REJECTED!
    // --------------------------------------------------------
    section('10. TRADER TRIES UNAUTHORIZED PROGRAM');
    info('Trader tries to interact with Allium (not in their allowlist)');
    const unauthorizedResult = await trader.spend({
        programId: ALLIUM_DATA_ENDPOINT,
        amount: USDC(1),
        description: 'Trying to access data endpoint — not authorized',
    });
    if (!unauthorizedResult.success) {
        fail(`BLOCKED: ${unauthorizedResult.error}`);
        info('Trader can only use Jupiter + Token Program — data access is Researcher only');
    }
    await sleep(300);
    // --------------------------------------------------------
    // PERMISSION NEGOTIATION
    // --------------------------------------------------------
    section('11. PERMISSION NEGOTIATION — COUNTER-OFFER');
    info('A new low-trust agent requests $40 from the Orchestrator');
    const newAgent = new autonomous_agent_1.AutonomousAgent({
        identity: {
            id: 'newcomer',
            name: 'Newcomer',
            pubkey: '',
            role: 'New untrusted agent',
            trustScore: 20, // Low trust!
            totalSpends: 0,
            totalRejections: 0,
        },
        engine, manager, x402Handler,
        onLog: (level, msg) => {
            console.log(`  ${COLORS.yellow}[Newcomer]${COLORS.reset} ${msg}`);
        },
    });
    const negotiation = await newAgent.requestPermission(rootAuthority.id, 'orchestrator', {
        description: 'Need budget for experimental trading strategy',
        requestedPolicy: { maxSpend: USDC(40) },
        justification: 'Testing a new momentum strategy on Jupiter',
        priority: 'medium',
    });
    if (negotiation.counterOffer) {
        warn(`Counter-offer! Requested ${formatUSDC(USDC(40))}, offered ${formatUSDC(negotiation.counterOffer.maxSpend)}`);
        info(`Reason: ${negotiation.reason}`);
    }
    else if (negotiation.granted) {
        success('Permission granted');
    }
    else {
        fail(`Denied: ${negotiation.reason}`);
    }
    await sleep(300);
    // --------------------------------------------------------
    // VERIFY DELEGATION CHAIN
    // --------------------------------------------------------
    section('12. VERIFYING DELEGATION CHAIN');
    info('Cryptographically verifying the chain from DataScraper back to root');
    const verification = await manager.verifyDelegationChain(scraperAuth.id);
    if (verification.valid) {
        success('Delegation chain is cryptographically valid!');
        for (const link of verification.chain) {
            info(`Depth ${link.depth}: ${link.grantor.slice(0, 12)}... → ${link.grantee.slice(0, 12)}... (${link.authorityId.slice(0, 8)}...)`);
        }
    }
    else {
        fail(`Chain verification failed: ${verification.error}`);
    }
    await sleep(300);
    // --------------------------------------------------------
    // CASCADING REVOCATION
    // --------------------------------------------------------
    section('13. CASCADING REVOCATION');
    info('Orchestrator revokes Researcher — all sub-authorities cascade');
    const revoked = engine.revoke(researcherAuth.id, 'Mission complete — revoking data acquisition budget');
    if (revoked) {
        success('Researcher authority revoked');
        // Check that scraper is also revoked
        const scraperStatus = engine.getAuthorityStats(scraperAuth.id);
        if (scraperStatus?.status === 'revoked') {
            success('DataScraper authority cascaded — also revoked');
        }
    }
    // DataScraper tries to pay after revocation
    info('DataScraper attempts payment after revocation...');
    const postRevokePay = await scraper.payX402(scraperPayment);
    if (!postRevokePay.paid) {
        fail(`BLOCKED: ${postRevokePay.error}`);
        info('Cascading revocation working correctly');
    }
    await sleep(300);
    // --------------------------------------------------------
    // FINAL REPORT
    // --------------------------------------------------------
    banner('FINAL STATUS REPORT');
    // Authority stats
    for (const [name, agent] of [
        ['Orchestrator', orchestrator],
        ['Researcher', researcher],
        ['Trader', trader],
        ['DataScraper', scraper],
    ]) {
        const auth = agent.getAuthority();
        if (auth) {
            const stats = engine.getAuthorityStats(auth.id);
            if (stats) {
                console.log(`\n${COLORS.bold}  ${name}${COLORS.reset}`);
                console.log(`    Status: ${stats.status === 'active' ? COLORS.green : COLORS.red}${stats.status}${COLORS.reset}`);
                console.log(`    Spent: ${formatUSDC(BigInt(stats.spent))} / ${formatUSDC(BigInt(stats.spent) + BigInt(stats.remaining))}`);
                console.log(`    Transactions: ${stats.transactions}`);
                console.log(`    Utilization: ${stats.utilization}%`);
                console.log(`    Children: ${stats.children}`);
            }
        }
    }
    // Audit trail summary
    console.log(`\n${COLORS.bold}  Audit Trail${COLORS.reset}`);
    console.log(`    Total events: ${auditTrail.length}`);
    const eventCounts = auditTrail.reduce((acc, e) => {
        acc[e.eventType] = (acc[e.eventType] || 0) + 1;
        return acc;
    }, {});
    for (const [type, count] of Object.entries(eventCounts)) {
        const color = type.includes('reject') || type.includes('revok') ? COLORS.red
            : type.includes('approved') ? COLORS.green
                : COLORS.dim;
        console.log(`    ${color}${type}: ${count}${COLORS.reset}`);
    }
    banner('DEMO COMPLETE');
    console.log(`${COLORS.dim}  This protocol provides the missing authorization layer`);
    console.log(`  between OWS (wallet) and x402 (payment transport).`);
    console.log(`  `);
    console.log(`  Every agent operates within cryptographically verifiable`);
    console.log(`  spending bounds. No agent ever touches a private key.`);
    console.log(`  Delegation chains are signed and auditable.`);
    console.log(`  `);
    console.log(`  Built for The Grid — Solana Agent Hackathon 2026${COLORS.reset}\n`);
}
// ============================================================
// RUN
// ============================================================
main().catch(err => {
    console.error('Demo failed:', err);
    process.exit(1);
});
//# sourceMappingURL=run.js.map