/**
 * ═══════════════════════════════════════════════════════════════
 *  RESEARCH AGENT WORKFLOW
 * ═══════════════════════════════════════════════════════════════
 *
 *  Scenario: "Investigate token XYZ for potential investment"
 *
 *  Orchestrator ($200) → DataAgent ($30) + SocialAgent ($10) + AnalysisAgent ($15)
 *
 *  Demonstrates:
 *  - Multi-agent task decomposition with budget allocation
 *  - x402 micro-payments for data services
 *  - Policy enforcement: unauthorized program access blocked
 *  - Budget exhaustion prevention
 *  - Full cost accounting with audit trail
 *
 *  Key insight: Without this protocol, the orchestrator would need to give
 *  each sub-agent a full wallet with no spending controls. With it, each
 *  agent has precisely scoped, cryptographically enforced authority.
 *
 *  Run: npm run scenario:research
 * ═══════════════════════════════════════════════════════════════
 */

import { PolicyEngine } from '../core/policy-engine';
import { AuthorityManager, Ed25519Signer } from '../core/authority-manager';
import { X402Handler } from '../x402/handler';
import { AutonomousAgent } from '../agents/autonomous-agent';
import { SpendingPolicy, AuditEvent } from '../core/types';

// ============================================================
// CONSTANTS
// ============================================================

const USDC_MINT     = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ALLIUM        = 'ALLiUMv1Gx5EP7BuRhXDgzCkqFSJpGXyisotXwSey4Cd';
const SOCIAL_API    = 'SociaLDataProgram111111111111111111111111';
const COMPUTE_API   = 'ComputeAPIProgram1111111111111111111111111';
const X402          = 'x402FaciLitatorProgram11111111111111111111';

const USDC = (n: number) => BigInt(Math.round(n * 1_000_000));
const fmt  = (n: bigint)  => `$${(Number(n) / 1_000_000).toFixed(2)}`;

// ============================================================
// COLORS
// ============================================================

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
};

function banner(text: string): void {
  const line = '═'.repeat(60);
  console.log(`\n${C.cyan}${line}${C.reset}`);
  console.log(`${C.bold}${C.white}  ${text}${C.reset}`);
  console.log(`${C.cyan}${line}${C.reset}\n`);
}

function section(text: string): void {
  console.log(`\n${C.bold}${C.blue}▶ ${text}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(50)}${C.reset}`);
}

function success(text: string): void { console.log(`  ${C.green}✓${C.reset} ${text}`); }
function fail(text: string): void    { console.log(`  ${C.red}✗${C.reset} ${text}`); }
function info(text: string): void    { console.log(`  ${C.dim}→${C.reset} ${text}`); }

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Agent color labels
const AGENT_COLORS: Record<string, string> = {
  orchestrator: C.magenta,
  data:         C.cyan,
  social:       C.yellow,
  analysis:     C.blue,
};

function agentLog(agentId: string, level: string, msg: string): void {
  const names: Record<string, string> = {
    orchestrator: 'Orchestrator',
    data:         'DataAgent',
    social:       'SocialAgent',
    analysis:     'AnalysisAgent',
  };
  const c = AGENT_COLORS[agentId] ?? C.white;
  const lc = level === 'error' ? C.red : level === 'warn' ? C.yellow : c;
  console.log(`  ${lc}[${names[agentId] ?? agentId}]${C.reset} ${msg}`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  banner('RESEARCH AGENT WORKFLOW');
  console.log(`${C.dim}  Task: "Investigate token XYZ for potential investment"`);
  console.log(`  Budget: $200 USDC  |  3 sub-agents  |  Solana:mainnet${C.reset}\n`);

  // --------------------------------------------------------
  // INFRASTRUCTURE
  // --------------------------------------------------------

  section('1. INITIALIZING RESEARCH INFRASTRUCTURE');

  const engine  = new PolicyEngine();
  const manager = new AuthorityManager(engine);
  const x402    = new X402Handler(engine);

  const auditTrail: AuditEvent[] = [];
  for (const et of ['authority_created', 'spend_approved', 'spend_rejected', 'authority_revoked'] as const) {
    engine.on(et, (e) => { auditTrail.push(e); });
  }

  success('Policy Engine initialized');
  success('Authority Manager initialized');

  // --------------------------------------------------------
  // CREATE AGENTS
  // --------------------------------------------------------

  section('2. SPAWNING RESEARCH AGENTS');

  const makeAgent = (id: string, name: string, role: string, trust: number) => {
    const signer = new Ed25519Signer();
    const agent = new AutonomousAgent({
      identity: { id, name, pubkey: signer.getPublicKey(), role, trustScore: trust, totalSpends: 0, totalRejections: 0 },
      signer, engine, manager, x402Handler: x402,
      onLog: (level, msg) => agentLog(id, level, msg),
    });
    return agent;
  };

  const orchestrator  = makeAgent('orchestrator', 'Orchestrator',   'Task coordinator & budget controller', 100);
  const dataAgent     = makeAgent('data',         'DataAgent',       'Allium onchain data queries',           75);
  const socialAgent   = makeAgent('social',       'SocialAgent',     'Social sentiment analysis',             65);
  const analysisAgent = makeAgent('analysis',     'AnalysisAgent',   'Statistical compute & backtesting',     70);

  success(`Orchestrator   spawned (budget controller)`);
  success(`DataAgent      spawned (Allium data — $30 budget)`);
  success(`SocialAgent    spawned (social APIs — $10 budget)`);
  success(`AnalysisAgent  spawned (compute APIs — $15 budget)`);

  await sleep(300);

  // --------------------------------------------------------
  // ROOT AUTHORITY: $200 USDC
  // --------------------------------------------------------

  section('3. CREATING ROOT RESEARCH AUTHORITY ($200)');

  const rootPolicy: SpendingPolicy = {
    maxSpend: USDC(200),
    tokenMint: USDC_MINT,
    allowedPrograms: [ALLIUM, SOCIAL_API, COMPUTE_API, X402],
    allowedDestinations: [],
    expiresAt: Date.now() + 60 * 60 * 1000,  // 1 hour
    maxRedelegation: USDC(80),
    maxDelegationDepth: 2,
    maxTransactionSize: USDC(10),
    rateLimit: { maxTransactions: 50, windowMs: 60_000 },
  };

  const rootAuth = await manager.createRootAuthority(
    'orchestrator', 'orchestrator', rootPolicy, 'solana:mainnet'
  );
  orchestrator.setAuthority(rootAuth);

  success(`Root authority: ${rootAuth.id.slice(0, 8)}...`);
  info(`Budget: ${fmt(USDC(200))} USDC | Max delegation: ${fmt(USDC(80))}`);

  await sleep(300);

  // --------------------------------------------------------
  // DELEGATE TO SUB-AGENTS
  // --------------------------------------------------------

  section('4. DELEGATING TO SUB-AGENTS');

  const dataAuth = await orchestrator.delegateTo(dataAgent, USDC(30), {
    allowedPrograms: [ALLIUM, X402],
    maxTransactionSize: USDC(3),
  });
  success(`DataAgent:     ${fmt(USDC(30))} delegated (Allium only, max $3/tx)`);

  const socialAuth = await orchestrator.delegateTo(socialAgent, USDC(10), {
    allowedPrograms: [SOCIAL_API, X402],
    maxTransactionSize: USDC(2),
  });
  success(`SocialAgent:   ${fmt(USDC(10))} delegated (social APIs only, max $2/tx)`);

  const analysisAuth = await orchestrator.delegateTo(analysisAgent, USDC(15), {
    allowedPrograms: [COMPUTE_API, X402],
    maxTransactionSize: USDC(5),
  });
  success(`AnalysisAgent: ${fmt(USDC(15))} delegated (compute APIs only, max $5/tx)`);

  await sleep(300);

  // --------------------------------------------------------
  // DATA AGENT: Onchain queries
  // --------------------------------------------------------

  section('5. DATA AGENT — ALLIUM ONCHAIN QUERIES');
  info('DataAgent executes paid x402 data queries via Allium');

  const dataPayments = [
    { url: 'https://api.allium.xyz/v1/token-holders/XYZ',       amount: USDC(0.50), desc: 'Token holder analysis — 50k wallets' },
    { url: 'https://api.allium.xyz/v1/transactions/XYZ/30d',    amount: USDC(1.00), desc: 'Transaction history — 30 days' },
    { url: 'https://api.allium.xyz/v1/whale-wallets/XYZ',       amount: USDC(0.25), desc: 'Whale wallet tracking — top 100' },
  ];

  let dataTotal = 0n;
  for (const p of dataPayments) {
    const r = await dataAgent.payX402({
      url: p.url, amount: p.amount, tokenMint: USDC_MINT,
      recipient: 'ALLiUMDataProvider1111111111111111111111',
      description: p.desc, facilitatorProgram: X402, schemes: ['exact-amount'],
    });
    if (r.paid) {
      dataTotal += p.amount;
      success(`${fmt(p.amount)} — ${p.desc}`);
      info(`Remaining: ${fmt(r.remaining!)}`);
    }
  }

  await sleep(300);

  // --------------------------------------------------------
  // SOCIAL AGENT: Sentiment queries
  // --------------------------------------------------------

  section('6. SOCIAL AGENT — SENTIMENT ANALYSIS');

  const socialPayments = [
    { url: 'https://api.lunarcrush.com/v2/tokenxyz/sentiment',   amount: USDC(0.10), desc: 'Sentiment score — 7-day aggregate' },
    { url: 'https://api.lunarcrush.com/v2/tokenxyz/mentions',    amount: USDC(0.05), desc: 'Mention count — Twitter + Reddit' },
  ];

  let socialTotal = 0n;
  for (const p of socialPayments) {
    const r = await socialAgent.payX402({
      url: p.url, amount: p.amount, tokenMint: USDC_MINT,
      recipient: 'SociaLDataRecipient11111111111111111111',
      description: p.desc, facilitatorProgram: X402, schemes: ['exact-amount'],
    });
    if (r.paid) {
      socialTotal += p.amount;
      success(`${fmt(p.amount)} — ${p.desc}`);
    }
  }

  await sleep(300);

  // --------------------------------------------------------
  // ANALYSIS AGENT: Compute
  // --------------------------------------------------------

  section('7. ANALYSIS AGENT — STATISTICAL COMPUTE');

  const computePayment = await analysisAgent.payX402({
    url: 'https://api.compute.xyz/v1/backtest/momentum-xyzusdc',
    amount: USDC(2.00),
    tokenMint: USDC_MINT,
    recipient: 'ComputeAPIRecipient111111111111111111111',
    description: 'Backtesting compute — 90-day momentum strategy',
    facilitatorProgram: X402,
    schemes: ['exact-amount'],
  });
  if (computePayment.paid) success(`${fmt(USDC(2.00))} — backtesting compute`);

  await sleep(300);

  // --------------------------------------------------------
  // POLICY ENFORCEMENT: AnalysisAgent tries SOCIAL API
  // --------------------------------------------------------

  section('8. POLICY ENFORCEMENT — UNAUTHORIZED ACCESS');
  info('AnalysisAgent tries to access Allium data endpoint (not in its allowlist)');

  const unauthorized = await analysisAgent.payX402({
    url: 'https://api.allium.xyz/v1/token-holders/XYZ',
    amount: USDC(0.50),
    tokenMint: USDC_MINT,
    recipient: 'ALLiUMDataProvider1111111111111111111111',
    description: 'Token holder data — UNAUTHORIZED',
    facilitatorProgram: ALLIUM,  // ← ALLIUM is not in AnalysisAgent allowlist
    schemes: ['exact-amount'],
  });

  if (!unauthorized.paid) {
    fail(`BLOCKED: AnalysisAgent cannot access Allium — not in its program allowlist`);
    info(`AnalysisAgent is scoped to ${COMPUTE_API.slice(0, 20)}... only`);
  }

  await sleep(300);

  // --------------------------------------------------------
  // POLICY ENFORCEMENT: DataAgent tries to overspend
  // --------------------------------------------------------

  section('9. POLICY ENFORCEMENT — BUDGET EXHAUSTION');
  info('DataAgent tries to purchase a $35 bulk dataset — exceeds $30 budget');

  const overspend = await dataAgent.payX402({
    url: 'https://api.allium.xyz/v1/full-history/XYZ/365d',
    amount: USDC(35),
    tokenMint: USDC_MINT,
    recipient: 'ALLiUMDataProvider1111111111111111111111',
    description: 'Full year transaction history — OVERSPEND',
    facilitatorProgram: X402,
    schemes: ['exact-amount'],
  });

  if (!overspend.paid) {
    fail(`BLOCKED: ${overspend.error}`);
    info(`DataAgent spent ${fmt(dataTotal)} of ${fmt(USDC(30))} — overspend prevented`);
  }

  await sleep(300);

  // --------------------------------------------------------
  // FINAL REPORT
  // --------------------------------------------------------

  banner('RESEARCH REPORT');

  const totalCost = dataTotal + socialTotal + USDC(2.00);
  const budgetUsed = (Number(totalCost) / Number(USDC(200)) * 100).toFixed(1);

  console.log(`\n${C.bold}  Cost Breakdown${C.reset}`);
  console.log(`    DataAgent    (Allium queries):    ${fmt(dataTotal)}`);
  console.log(`    SocialAgent  (sentiment):         ${fmt(socialTotal)}`);
  console.log(`    AnalysisAgent (compute/backtest): ${fmt(USDC(2.00))}`);
  console.log(`    ${'─'.repeat(36)}`);
  console.log(`    ${C.bold}Total cost:   ${fmt(totalCost)}${C.reset}`);
  console.log(`    Budget used:  ${budgetUsed}% of ${fmt(USDC(200))}`);
  console.log(`    Remaining:    ${fmt(USDC(200) - totalCost)}`);

  console.log(`\n${C.bold}  Policy Enforcement${C.reset}`);
  const rejected = auditTrail.filter(e => e.eventType === 'spend_rejected').length;
  console.log(`    Unauthorized access attempts blocked: ${rejected}`);
  console.log(`    All rejections: zero funds lost, zero data leaked`);

  console.log(`\n${C.bold}  Audit Trail${C.reset}`);
  console.log(`    Total events: ${auditTrail.length}`);
  const counts = auditTrail.reduce((acc, e) => { acc[e.eventType] = (acc[e.eventType] || 0) + 1; return acc; }, {} as Record<string, number>);
  for (const [type, count] of Object.entries(counts)) {
    const c = type.includes('reject') ? C.red : type.includes('approved') ? C.green : C.dim;
    console.log(`    ${c}${type}: ${count}${C.reset}`);
  }

  banner('RESEARCH COMPLETE');
  console.log(`${C.dim}  Research complete. Total cost: ${fmt(totalCost)}. Budget remaining: ${fmt(USDC(200) - totalCost)}.`);
  console.log(``);
  console.log(`  Without this protocol:`);
  console.log(`    Each sub-agent would need full wallet access.`);
  console.log(`    A buggy AnalysisAgent could drain the $200 budget on data queries.`);
  console.log(`    No audit trail. No spending limits. No program restrictions.`);
  console.log(``);
  console.log(`  With this protocol:`);
  console.log(`    DataAgent can ONLY spend on Allium, up to $30, $3 at a time.`);
  console.log(`    SocialAgent can ONLY spend on social APIs, up to $10.`);
  console.log(`    AnalysisAgent cannot access data endpoints — ever.`);
  console.log(`    Every spend is auditable. Every delegation is signed.${C.reset}\n`);
}

main().catch(err => {
  console.error('Research workflow failed:', err);
  process.exit(1);
});
