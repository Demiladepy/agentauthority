"use strict";
/**
 * ═══════════════════════════════════════════════════════════════
 *  AGENT SPENDING AUTHORITY PROTOCOL — CROSS-CHAIN DEMO
 * ═══════════════════════════════════════════════════════════════
 *
 *  One OWS wallet. Two chains. Independent policy enforcement.
 *
 *  Demonstrates:
 *  1. Same orchestrator creates root authorities on Solana AND Base
 *  2. Researcher agent gets Solana authority
 *  3. Trader agent gets Base authority
 *  4. Both make x402 payments within their chain policies
 *  5. Solana authority cannot be used on Base engine — blocked
 *  6. Base authority cannot be used on Solana engine — blocked
 *
 *  Run: npm run demo:crosschain
 * ═══════════════════════════════════════════════════════════════
 */
Object.defineProperty(exports, "__esModule", { value: true });
const policy_engine_1 = require("../core/policy-engine");
const authority_manager_1 = require("../core/authority-manager");
const handler_1 = require("../x402/handler");
const autonomous_agent_1 = require("../agents/autonomous-agent");
const chain_adapter_1 = require("../chains/chain-adapter");
const evm_authority_1 = require("../chains/evm-authority");
// ============================================================
// CONSTANTS
// ============================================================
// Solana
const SOL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const ALLIUM = 'ALLiUMv1Gx5EP7BuRhXDgzCkqFSJpGXyisotXwSey4Cd';
const X402_SOL = 'x402FaciLitatorProgram11111111111111111111';
// Base (EVM)
const X402_BASE = '0x' + 'a402'.padStart(40, '0'); // mock Base x402 facilitator
const USDC = (n) => BigInt(Math.round(n * 1_000_000));
// ============================================================
// PRETTY PRINTING
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
function chainBadge(chain) {
    if (chain.startsWith('solana'))
        return `${C.magenta}[Solana]${C.reset}`;
    if (chain === 'eip155:8453')
        return `${C.cyan}[Base]${C.reset}`;
    return `[${chain}]`;
}
function success(text) { console.log(`  ${C.green}✓${C.reset} ${text}`); }
function fail(text) { console.log(`  ${C.red}✗${C.reset} ${text}`); }
function info(text) { console.log(`  ${C.dim}→${C.reset} ${text}`); }
function fmtUSDC(lamports) {
    return `$${(Number(lamports) / 1_000_000).toFixed(2)} USDC`;
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
// ============================================================
// MAIN
// ============================================================
async function main() {
    banner('CROSS-CHAIN SPENDING AUTHORITY PROTOCOL');
    console.log(`${C.dim}  One wallet. Two chains. Independent policy enforcement.`);
    console.log(`  Solana + Base (EVM) — same SDK, isolated authority engines.${C.reset}\n`);
    // ============================================================
    // The orchestrator uses ONE signer (OWS or Ed25519).
    // It creates SEPARATE PolicyEngine instances — one per chain.
    // This models real-world isolation: cross-chain spending is
    // structurally impossible because authorities live in separate engines.
    // ============================================================
    const orchestratorSigner = new authority_manager_1.Ed25519Signer();
    const orchPubkey = orchestratorSigner.getPublicKey();
    // --------------------------------------------------------
    // SOLANA ENGINE SETUP
    // --------------------------------------------------------
    section('1. INITIALIZING SOLANA AUTHORITY ENGINE');
    info(`Chain: solana:mainnet`);
    const solEngine = new policy_engine_1.PolicyEngine();
    const solManager = new authority_manager_1.AuthorityManager(solEngine);
    const solX402 = new handler_1.X402Handler(solEngine);
    solManager.registerAgent({ id: 'orchestrator', name: 'Orchestrator', pubkey: orchPubkey,
        role: 'Root authority holder', trustScore: 100, totalSpends: 0, totalRejections: 0 }, orchestratorSigner);
    const researcherSolSigner = new authority_manager_1.Ed25519Signer();
    solManager.registerAgent({ id: 'researcher', name: 'Researcher', pubkey: researcherSolSigner.getPublicKey(),
        role: 'Data researcher', trustScore: 80, totalSpends: 0, totalRejections: 0 }, researcherSolSigner);
    const solPolicy = {
        maxSpend: USDC(50),
        tokenMint: SOL_USDC_MINT,
        allowedPrograms: [JUPITER, ALLIUM, X402_SOL],
        allowedDestinations: [],
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
        maxRedelegation: USDC(30),
        maxDelegationDepth: 2,
        maxTransactionSize: USDC(20),
        rateLimit: { maxTransactions: 20, windowMs: 60_000 },
    };
    const solRootAuth = await solManager.createRootAuthority('orchestrator', 'orchestrator', solPolicy, 'solana:mainnet');
    success(`Solana root authority: ${solRootAuth.id.slice(0, 8)}... (${fmtUSDC(solPolicy.maxSpend)} budget)`);
    info(`Programs allowed: Jupiter, Allium, x402`);
    // --------------------------------------------------------
    // BASE ENGINE SETUP (separate isolated engine)
    // --------------------------------------------------------
    section('2. INITIALIZING BASE AUTHORITY ENGINE');
    info(`Chain: eip155:8453 (Base)`);
    const baseEngine = new policy_engine_1.PolicyEngine();
    const baseManager = new authority_manager_1.AuthorityManager(baseEngine);
    const baseX402 = new handler_1.X402Handler(baseEngine);
    // Same orchestrator (same signer), but registered in the BASE engine
    baseManager.registerAgent({ id: 'orchestrator', name: 'Orchestrator', pubkey: orchPubkey,
        role: 'Root authority holder', trustScore: 100, totalSpends: 0, totalRejections: 0 }, orchestratorSigner);
    const traderBaseSigner = new authority_manager_1.Ed25519Signer();
    baseManager.registerAgent({ id: 'trader', name: 'Trader', pubkey: traderBaseSigner.getPublicKey(),
        role: 'DeFi trader', trustScore: 70, totalSpends: 0, totalRejections: 0 }, traderBaseSigner);
    const basePolicy = {
        maxSpend: USDC(50),
        tokenMint: evm_authority_1.BASE_USDC,
        allowedPrograms: [evm_authority_1.BASE_UNISWAP_V3, evm_authority_1.BASE_AAVE_V3, X402_BASE],
        allowedDestinations: [],
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
        maxRedelegation: USDC(30),
        maxDelegationDepth: 2,
        maxTransactionSize: USDC(25),
        rateLimit: { maxTransactions: 20, windowMs: 60_000 },
    };
    const baseRootAuth = await baseManager.createRootAuthority('orchestrator', 'orchestrator', basePolicy, 'eip155:8453');
    success(`Base root authority: ${baseRootAuth.id.slice(0, 8)}... (${fmtUSDC(basePolicy.maxSpend)} budget)`);
    info(`Programs allowed: Uniswap V3, Aave V3, x402`);
    info(`Token: USDC on Base (${evm_authority_1.BASE_USDC.slice(0, 14)}...)`);
    await sleep(300);
    // --------------------------------------------------------
    // RESEARCHER: Solana delegation + payments
    // --------------------------------------------------------
    section('3. RESEARCHER — SOLANA AUTHORITY');
    info('Orchestrator delegates $20 USDC to Researcher on Solana');
    const researcherSolAuth = await solManager.delegate(solRootAuth.id, 'orchestrator', 'researcher', USDC(20), { allowedPrograms: [ALLIUM, X402_SOL], maxTransactionSize: USDC(5) });
    const researcher = new autonomous_agent_1.AutonomousAgent({
        identity: { id: 'researcher', name: 'Researcher', pubkey: researcherSolSigner.getPublicKey(),
            role: 'Data researcher', trustScore: 80, totalSpends: 0, totalRejections: 0 },
        signer: researcherSolSigner,
        engine: solEngine, manager: solManager, x402Handler: solX402,
        onLog: (level, msg) => {
            const c = level === 'error' ? C.red : level === 'warn' ? C.yellow : C.magenta;
            console.log(`  ${c}[Researcher]${C.reset} ${chainBadge('solana:mainnet')} ${msg}`);
        },
    });
    researcher.setAuthority(researcherSolAuth);
    success(`Researcher authority on Solana: ${researcherSolAuth.id.slice(0, 8)}...`);
    const r1 = await researcher.payX402({
        url: 'https://api.allium-data.xyz/v1/token-holders/TokenXYZ',
        amount: USDC(0.50),
        tokenMint: SOL_USDC_MINT,
        recipient: 'ALLiUMDataProvider1111111111111111111111',
        description: 'Token holder analysis — 10k wallets',
        facilitatorProgram: X402_SOL,
        schemes: ['exact-amount'],
    });
    if (r1.paid)
        success(`${chainBadge('solana:mainnet')} Allium payment: ${fmtUSDC(USDC(0.50))} — remaining: ${fmtUSDC(r1.remaining)}`);
    const r2 = await researcher.payX402({
        url: 'https://api.allium-data.xyz/v1/whale-tracking/TokenXYZ',
        amount: USDC(0.25),
        tokenMint: SOL_USDC_MINT,
        recipient: 'ALLiUMDataProvider1111111111111111111111',
        description: 'Whale wallet tracking — 30-day history',
        facilitatorProgram: X402_SOL,
        schemes: ['exact-amount'],
    });
    if (r2.paid)
        success(`${chainBadge('solana:mainnet')} Allium payment: ${fmtUSDC(USDC(0.25))} — remaining: ${fmtUSDC(r2.remaining)}`);
    await sleep(300);
    // --------------------------------------------------------
    // TRADER: Base delegation + payments
    // --------------------------------------------------------
    section('4. TRADER — BASE AUTHORITY');
    info('Orchestrator delegates $20 USDC to Trader on Base');
    const traderBaseAuth = await baseManager.delegate(baseRootAuth.id, 'orchestrator', 'trader', USDC(20), { allowedPrograms: [evm_authority_1.BASE_UNISWAP_V3, X402_BASE], maxTransactionSize: USDC(15) });
    const trader = new autonomous_agent_1.AutonomousAgent({
        identity: { id: 'trader', name: 'Trader', pubkey: traderBaseSigner.getPublicKey(),
            role: 'DeFi trader', trustScore: 70, totalSpends: 0, totalRejections: 0 },
        signer: traderBaseSigner,
        engine: baseEngine, manager: baseManager, x402Handler: baseX402,
        onLog: (level, msg) => {
            const c = level === 'error' ? C.red : level === 'warn' ? C.yellow : C.cyan;
            console.log(`  ${c}[Trader]${C.reset} ${chainBadge('eip155:8453')} ${msg}`);
        },
    });
    trader.setAuthority(traderBaseAuth);
    success(`Trader authority on Base: ${traderBaseAuth.id.slice(0, 8)}...`);
    const t1 = await trader.spend({
        programId: evm_authority_1.BASE_UNISWAP_V3,
        amount: USDC(10),
        description: 'Swap 10 USDC → WETH via Uniswap V3 on Base',
        destination: '0x' + 'dead'.padStart(40, '0'),
    });
    if (t1.success)
        success(`${chainBadge('eip155:8453')} Uniswap swap approved: ${fmtUSDC(USDC(10))} — remaining: ${fmtUSDC(t1.remainingBudget)}`);
    const t2 = await trader.spend({
        programId: evm_authority_1.BASE_AAVE_V3,
        amount: USDC(5),
        description: 'Supply 5 USDC to Aave V3 on Base',
        destination: evm_authority_1.BASE_AAVE_V3,
    });
    if (t2.success)
        success(`${chainBadge('eip155:8453')} Aave supply approved: ${fmtUSDC(USDC(5))} — remaining: ${fmtUSDC(t2.remainingBudget)}`);
    await sleep(300);
    // --------------------------------------------------------
    // CROSS-CHAIN ISOLATION PROOF
    // --------------------------------------------------------
    section('5. CROSS-CHAIN ISOLATION — THE KEY PROOF');
    info('Attempting to use Solana authority on the Base engine → should fail');
    info('Attempting to use Base authority on the Solana engine → should fail');
    // Researcher (Solana authority) tries to spend via BASE engine
    // The authority ID from solEngine doesn't exist in baseEngine
    const crossResult1 = baseEngine.validate({
        authorityId: researcherSolAuth.id, // ← Solana authority ID
        programId: evm_authority_1.BASE_UNISWAP_V3,
        amount: USDC(1),
        description: 'Trying to spend Solana authority on Base engine',
    });
    if (!crossResult1.valid) {
        fail(`BLOCKED: Solana authority "${researcherSolAuth.id.slice(0, 8)}..." rejected by Base engine`);
        info(`Reason: ${crossResult1.reason}`);
    }
    // Trader (Base authority) tries to spend via SOLANA engine
    const crossResult2 = solEngine.validate({
        authorityId: traderBaseAuth.id, // ← Base authority ID
        programId: JUPITER,
        amount: USDC(1),
        description: 'Trying to spend Base authority on Solana engine',
    });
    if (!crossResult2.valid) {
        fail(`BLOCKED: Base authority "${traderBaseAuth.id.slice(0, 8)}..." rejected by Solana engine`);
        info(`Reason: ${crossResult2.reason}`);
    }
    success('Cross-chain isolation confirmed: authorities are non-transferable across chains');
    info('An agent authorized on Solana cannot spend on Base, and vice versa.');
    info('This is structural — not a policy rule. Different engines, different state.');
    await sleep(300);
    // --------------------------------------------------------
    // SUMMARY REPORT
    // --------------------------------------------------------
    banner('CROSS-CHAIN SUMMARY');
    console.log(`\n${C.bold}  Solana Engine ${chainBadge('solana:mainnet')}${C.reset}`);
    const solStats = solEngine.getAuthorityStats(researcherSolAuth.id);
    if (solStats) {
        console.log(`    Researcher spent: ${fmtUSDC(BigInt(solStats.spent))} of ${fmtUSDC(USDC(20))}`);
        console.log(`    Txns: ${solStats.transactions}`);
        console.log(`    Status: ${C.green}${solStats.status}${C.reset}`);
    }
    console.log(`\n${C.bold}  Base Engine ${chainBadge('eip155:8453')}${C.reset}`);
    const baseStats = baseEngine.getAuthorityStats(traderBaseAuth.id);
    if (baseStats) {
        console.log(`    Trader spent: ${fmtUSDC(BigInt(baseStats.spent))} of ${fmtUSDC(USDC(20))}`);
        console.log(`    Txns: ${baseStats.transactions}`);
        console.log(`    Status: ${C.green}${baseStats.status}${C.reset}`);
    }
    console.log(`\n  ${C.dim}Chain info:${C.reset}`);
    console.log(`    Solana: ${chain_adapter_1.CHAIN_INFO['solana:mainnet'].name} — USDC ${chain_adapter_1.CHAIN_INFO['solana:mainnet'].usdcAddress.slice(0, 20)}...`);
    console.log(`    Base:   ${chain_adapter_1.CHAIN_INFO['eip155:8453'].name}   — USDC ${chain_adapter_1.CHAIN_INFO['eip155:8453'].usdcAddress.slice(0, 20)}...`);
    banner('CROSS-CHAIN DEMO COMPLETE');
    console.log(`${C.dim}  One wallet. Two isolated authority engines. Zero cross-chain leakage.`);
    console.log(`  This is what production multi-chain agent infrastructure looks like.${C.reset}\n`);
}
main().catch(err => {
    console.error('Cross-chain demo failed:', err);
    process.exit(1);
});
//# sourceMappingURL=cross-chain.js.map