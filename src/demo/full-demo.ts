/**
 * ═══════════════════════════════════════════════════════════════
 *  SpendOS — FULL SUBMISSION DEMO
 *  Track 02: Agent Spend Governance & Identity
 *  MoonPay / Solana Agent Hackathon 2026
 * ═══════════════════════════════════════════════════════════════
 *
 *  12-scene showcase of every SpendOS capability:
 *  Reputation Engine · Dead Man's Switch · Watchdog · x402 ·
 *  Multi-chain · OWS wallets · MoonPay funding · Audit trail
 */

import { PolicyEngine }         from '../core/policy-engine';
import { AuthorityManager }                   from '../core/authority-manager';
import { X402Handler }          from '../x402/handler';
import { AutonomousAgent }      from '../agents/autonomous-agent';
import { ReputationEngine }     from '../reputation/reputation-engine';
import { DeadMansSwitch }       from '../safety/dead-mans-switch';
import { Watchdog }             from '../safety/watchdog';
import { OWSSigner }            from '../ows/signer';
import { fundAgentWallet }      from '../moonpay/funding';
import { CHAIN_INFO }           from '../chains/chain-adapter';
import {
  SpendingPolicy,
  AgentIdentity,
  AuditEvent,
} from '../core/types';
import { WatchdogAlert }        from '../safety/types';

// ============================================================
// CONSTANTS
// ============================================================

const USDC_MINT     = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_BASE     = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const JUPITER       = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const ALLIUM        = 'ALLiUMv1Gx5EP7BuRhXDgzCkqFSJpGXyisotXwSey4Cd';
const X402_PROG     = 'x402FaciLitatorProgram11111111111111111111';
const TOKEN_PROG    = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const UNISWAP_BASE  = '0x2626664c2603336E57B271c5C0b26F421741e481';

const USDC = (n: number): bigint => BigInt(Math.round(n * 1_000_000));
const fmt  = (n: bigint): string => `$${(Number(n) / 1_000_000).toFixed(2)}`;

// ============================================================
// PRETTY PRINTING  (copied from run.ts as specified)
// ============================================================

const COLORS = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  bgBlue:  '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed:   '\x1b[41m',
};

function banner(text: string): void {
  const line = '═'.repeat(62);
  console.log(`\n${COLORS.cyan}${line}${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.white}  ${text}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${line}${COLORS.reset}\n`);
}

function scene(n: number, text: string): void {
  console.log(`\n${COLORS.bold}${COLORS.blue}▶ Scene ${n}: ${text}${COLORS.reset}`);
  console.log(`${COLORS.dim}${'─'.repeat(56)}${COLORS.reset}`);
}

function success(text: string): void { console.log(`  ${COLORS.green}✓${COLORS.reset} ${text}`); }
function fail(text: string):    void { console.log(`  ${COLORS.red}✗${COLORS.reset} ${text}`); }
function info(text: string):    void { console.log(`  ${COLORS.dim}→${COLORS.reset} ${text}`); }
function warn(text: string):    void { console.log(`  ${COLORS.yellow}⚠${COLORS.reset} ${text}`); }
function alert(text: string):   void { console.log(`  ${COLORS.red}${COLORS.bold}⚡${COLORS.reset} ${text}`); }

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  banner('SpendOS — Agent Spend Governance for the Autonomous Economy');
  console.log(`${COLORS.dim}  "Give agents wallets, not blank checks."`);
  console.log(`  Track 02: Agent Spend Governance & Identity`);
  console.log(`  MoonPay × Solana Agent Hackathon 2026${COLORS.reset}\n`);

  // ──────────────────────────────────────────────────────────
  // SCENE 1 — INFRASTRUCTURE SETUP
  // ──────────────────────────────────────────────────────────

  scene(1, 'INFRASTRUCTURE SETUP');

  const engine      = new PolicyEngine();
  const manager     = new AuthorityManager(engine);
  const x402Handler = new X402Handler(engine);
  const reputation  = new ReputationEngine(engine);

  // Dead man's switch: 2s heartbeat interval for demo purposes
  const dms = new DeadMansSwitch(engine, {
    checkIntervalMs:            2_000,
    defaultHeartbeatIntervalMs: 3_000,
    recoveryWallet:             'RECOVERY_WALLET_111111111111111111111111111',
  });

  const watchdog = new Watchdog(engine);

  // Audit trail
  const auditTrail: AuditEvent[] = [];
  const watchdogAlerts: WatchdogAlert[] = [];

  for (const et of ['authority_created', 'spend_approved', 'spend_rejected',
                     'authority_revoked', 'rate_limit_hit'] as const) {
    engine.on(et, (e) => { auditTrail.push(e); });
  }
  watchdog.onAlert((a) => {
    watchdogAlerts.push(a);
    const color = a.severity === 'critical' ? COLORS.red
                : a.severity === 'warning'  ? COLORS.yellow : COLORS.dim;
    console.log(`  ${color}[WATCHDOG ${a.severity.toUpperCase()}]${COLORS.reset} ${a.message}`);
    if (a.autoActionTaken) alert(`Auto-action taken: ${a.recommendedAction}`);
  });

  dms.onTrigger((agentId, authorityId, recovery) => {
    alert(`DEAD MAN'S SWITCH TRIGGERED — agent: ${agentId}`);
    info(`Authority ${authorityId.slice(0, 8)}... revoked. Sweep → ${recovery.slice(0, 12)}...`);
  });

  success('Policy Engine        online');
  success('Authority Manager    online');
  success('x402 Handler         online');
  success('Reputation Engine    online');
  success('Dead Man\'s Switch   online  (2s check / 3s heartbeat for demo)');
  success('Behavioral Watchdog  online');
  success('Audit trail listener active');

  await sleep(200);

  // ──────────────────────────────────────────────────────────
  // SCENE 2 — OWS WALLET CREATION
  // ──────────────────────────────────────────────────────────

  scene(2, 'OWS WALLET CREATION');
  info('Creating 5 agent wallets via OWSSigner (falls back to Ed25519 gracefully)');

  function makeAgent(
    id: string, name: string, role: string, chain = 'solana:mainnet',
  ): { identity: AgentIdentity; signer: OWSSigner } {
    const signer   = new OWSSigner(name.toLowerCase().replace(/\s/g, '-'), chain);
    const pubkey   = signer.getPublicKey();
    const identity: AgentIdentity = {
      id, name, pubkey, role,
      trustScore: 50, totalSpends: 0, totalRejections: 0,
    };
    return { identity, signer };
  }

  const orchestratorWallet = makeAgent('orchestrator', 'Orchestrator', 'Budget controller');
  const researcherWallet   = makeAgent('researcher',   'Researcher',   'Data acquisition');
  const traderWallet       = makeAgent('trader',       'Trader',       'DeFi execution');
  const rogueWallet        = makeAgent('rogue',        'RogueAgent',   'Unknown intent');
  const scraperWallet      = makeAgent('scraper',      'DataScraper',  'Bulk queries');

  for (const { identity, signer } of [
    orchestratorWallet, researcherWallet, traderWallet, rogueWallet, scraperWallet,
  ]) {
    manager.registerAgent(identity, signer);
    reputation.registerAgent(identity, identity.id === 'orchestrator' ? 85 : 50);
    const owsLabel = (signer as OWSSigner).isUsingOWS() ? 'OWS' : 'Ed25519';
    success(`${identity.name.padEnd(14)} pubkey: ${identity.pubkey.slice(0, 16)}... [${owsLabel}]`);
  }

  await sleep(200);

  // ──────────────────────────────────────────────────────────
  // SCENE 3 — MOONPAY FUNDING
  // ──────────────────────────────────────────────────────────

  scene(3, 'MOONPAY FUNDING');
  info('Funding orchestrator wallet with $500 USDC via MoonPay on-ramp (simulated)');

  const funding = await fundAgentWallet(
    orchestratorWallet.identity.pubkey,
    500,
    { network: 'solana-mainnet', simulate: true },
  );

  if (funding.confirmed) {
    success(`Funded: ${funding.amountUSDC.toFixed(2)} USDC (after ${(500 * 0.015).toFixed(2)} fee)`);
    info(`MoonPay tx: ${funding.txHash}`);
    info(`Lamports:   ${funding.amountLamports.toLocaleString()} (6-decimal USDC)`);
    info(`Network:    ${funding.network}`);
  }

  await sleep(200);

  // ──────────────────────────────────────────────────────────
  // SCENE 4 — ROOT AUTHORITY + MULTI-CHAIN
  // ──────────────────────────────────────────────────────────

  scene(4, 'ROOT AUTHORITY + MULTI-CHAIN');

  // Solana root — $300
  const solanaPolicy: SpendingPolicy = {
    maxSpend:           USDC(300),
    tokenMint:          USDC_MINT,
    allowedPrograms:    [JUPITER, ALLIUM, X402_PROG, TOKEN_PROG],
    allowedDestinations: [],
    expiresAt:          Date.now() + 4 * 60 * 60 * 1000,
    maxRedelegation:    USDC(250),
    maxDelegationDepth: 4,
    maxTransactionSize: USDC(100),
    rateLimit:          { maxTransactions: 100, windowMs: 60_000 },
  };

  const solanaRoot = await manager.createRootAuthority(
    'orchestrator', 'orchestrator', solanaPolicy, 'solana:mainnet',
  );

  // Base (EVM) root — $200
  const basePolicy: SpendingPolicy = {
    maxSpend:           USDC(200),
    tokenMint:          USDC_BASE,
    allowedPrograms:    [UNISWAP_BASE],
    allowedDestinations: [],
    expiresAt:          Date.now() + 4 * 60 * 60 * 1000,
    maxRedelegation:    USDC(150),
    maxDelegationDepth: 3,
    maxTransactionSize: USDC(50),
    rateLimit:          { maxTransactions: 50, windowMs: 60_000 },
  };

  // Register orchestrator on Base chain too (reuse same identity)
  const baseRoot = await manager.createRootAuthority(
    'orchestrator', 'orchestrator', basePolicy, 'eip155:8453',
  );

  const orchestratorAgent = new AutonomousAgent({
    identity: orchestratorWallet.identity,
    signer:   orchestratorWallet.signer,
    engine, manager, x402Handler,
    onLog: (_, msg) => console.log(`  ${COLORS.magenta}[Orchestrator]${COLORS.reset} ${msg}`),
  });
  orchestratorAgent.setAuthority(solanaRoot);

  success(`Solana root authority: ${solanaRoot.id.slice(0, 8)}...  budget ${fmt(solanaPolicy.maxSpend)}`);
  success(`Base root authority:   ${baseRoot.id.slice(0, 8)}...  budget ${fmt(basePolicy.maxSpend)}`);
  info(`Solana explorer: ${CHAIN_INFO['solana:mainnet'].explorerUrl}`);
  info(`Base explorer:   ${CHAIN_INFO['eip155:8453'].explorerUrl}`);
  info(`Total cross-chain budget: ${fmt(solanaPolicy.maxSpend + basePolicy.maxSpend)}`);

  await sleep(200);

  // ──────────────────────────────────────────────────────────
  // SCENE 5 — REPUTATION-BASED DELEGATION
  // ──────────────────────────────────────────────────────────

  scene(5, 'REPUTATION-BASED DELEGATION');
  info('Each agent receives a budget proportional to their trust score');

  // Seed differentiated scores for demo visibility
  reputation.setScore('researcher', 72);  // Trusted tier
  reputation.setScore('trader',     35);  // Limited tier
  reputation.setScore('rogue',      12);  // Probationary tier
  reputation.setScore('scraper',    55);  // Standard tier

  // Show tier assignments
  for (const [id, name] of [
    ['researcher', 'Researcher'], ['trader', 'Trader'],
    ['rogue', 'RogueAgent'], ['scraper', 'DataScraper'],
  ] as const) {
    const pubkey = manager.getAgent(id)?.pubkey ?? id;
    const score  = reputation.getScore(pubkey);
    const tier   = reputation.getTier(score);
    const limits = reputation.getTierLimits(score);
    info(`${name.padEnd(14)} score: ${score.toString().padStart(3)}  tier: ${tier.padEnd(14)} max/day: ${fmt(limits.maxDailySpend)}`);
  }

  console.log();

  // Delegate using reputation-informed budgets
  function reputationBudget(id: string, capUSDC: number): bigint {
    const pubkey = manager.getAgent(id)?.pubkey ?? id;
    const score  = reputation.getScore(pubkey);
    const limits = reputation.getTierLimits(score);
    // Cap at the lesser of tier max and the available cap we're willing to give
    const cap    = USDC(capUSDC);
    return limits.maxDailySpend < cap ? limits.maxDailySpend : cap;
  }

  const researcherBudget = reputationBudget('researcher', 100); // Trusted → $100
  const traderBudget     = reputationBudget('trader',      15); // Limited → $15
  const rogueBudget      = reputationBudget('rogue',        5); // Probationary → $5
  const scraperBudget    = reputationBudget('scraper',     25); // Standard → $25

  const researcherAuth = await manager.delegate(
    solanaRoot.id, 'orchestrator', 'researcher', researcherBudget,
    { allowedPrograms: [ALLIUM, X402_PROG, TOKEN_PROG], maxRedelegation: USDC(20), maxDelegationDepth: 2, maxTransactionSize: USDC(10) },
  );
  const traderAuth = await manager.delegate(
    solanaRoot.id, 'orchestrator', 'trader', traderBudget,
    { allowedPrograms: [JUPITER, TOKEN_PROG], maxRedelegation: 0n, maxDelegationDepth: 0, maxTransactionSize: USDC(8) },
  );
  const rogueAuth = await manager.delegate(
    solanaRoot.id, 'orchestrator', 'rogue', rogueBudget,
    { allowedPrograms: [X402_PROG], maxRedelegation: 0n, maxDelegationDepth: 0, maxTransactionSize: USDC(1) },
  );
  const scraperAuth = await manager.delegate(
    solanaRoot.id, 'orchestrator', 'scraper', scraperBudget,
    { allowedPrograms: [ALLIUM, X402_PROG], maxRedelegation: 0n, maxDelegationDepth: 0, maxTransactionSize: USDC(5) },
  );

  const researcherAgent = new AutonomousAgent({
    identity: researcherWallet.identity, signer: researcherWallet.signer,
    engine, manager, x402Handler,
    onLog: (_, msg) => console.log(`  ${COLORS.cyan}[Researcher]${COLORS.reset} ${msg}`),
  });
  researcherAgent.setAuthority(researcherAuth);

  const traderAgent = new AutonomousAgent({
    identity: traderWallet.identity, signer: traderWallet.signer,
    engine, manager, x402Handler,
    onLog: (_, msg) => console.log(`  ${COLORS.green}[Trader]${COLORS.reset} ${msg}`),
  });
  traderAgent.setAuthority(traderAuth);

  const rogueAgent = new AutonomousAgent({
    identity: rogueWallet.identity, signer: rogueWallet.signer,
    engine, manager, x402Handler,
    onLog: (_, msg) => console.log(`  ${COLORS.red}[RogueAgent]${COLORS.reset} ${msg}`),
  });
  rogueAgent.setAuthority(rogueAuth);

  const scraperAgent = new AutonomousAgent({
    identity: scraperWallet.identity, signer: scraperWallet.signer,
    engine, manager, x402Handler,
    onLog: (_, msg) => console.log(`  ${COLORS.blue}[DataScraper]${COLORS.reset} ${msg}`),
  });
  scraperAgent.setAuthority(scraperAuth);

  success(`Researcher  delegated ${fmt(researcherBudget)}  (Trusted tier)`);
  success(`Trader      delegated ${fmt(traderBudget)}   (Limited tier)`);
  success(`DataScraper delegated ${fmt(scraperBudget)}   (Standard tier)`);
  success(`RogueAgent  delegated ${fmt(rogueBudget)}    (Probationary tier — heavily restricted)`);

  // Register rogue agent with dead man's switch
  dms.register('rogue', rogueAuth.id, 3_000); // 3s heartbeat
  info('RogueAgent registered with Dead Man\'s Switch (3s heartbeat)');

  // Other agents heartbeat continuously — rogue will NOT
  dms.register('researcher', researcherAuth.id, 30_000);
  dms.register('trader',     traderAuth.id,     30_000);

  await sleep(200);

  // ──────────────────────────────────────────────────────────
  // SCENE 6 — AGENT OPERATIONS WITH x402
  // ──────────────────────────────────────────────────────────

  scene(6, 'AGENT OPERATIONS WITH x402');

  // Researcher: 5 Allium data endpoint payments
  info('Researcher fetching market intelligence via x402 micropayments...');
  const alliumData = [
    { url: 'https://api.allium.xyz/v1/wallet-risk/7xKXtg',   amount: USDC(0.50), desc: 'Wallet risk profile' },
    { url: 'https://api.allium.xyz/v1/vesting-audit/SOL',     amount: USDC(1.00), desc: 'Token vesting schedule' },
    { url: 'https://api.allium.xyz/v1/dex-flows/jupiter',     amount: USDC(0.75), desc: 'Jupiter DEX flow analysis' },
    { url: 'https://api.allium.xyz/v1/whale-watch/7d',        amount: USDC(2.00), desc: 'Whale movement report (7d)' },
    { url: 'https://api.allium.xyz/v1/liquidation-risk/aave', amount: USDC(1.50), desc: 'AAVE liquidation risk scan' },
  ];

  let researchTotalSpent = 0n;
  for (const d of alliumData) {
    const result = await researcherAgent.payX402({
      url: d.url, amount: d.amount, tokenMint: USDC_MINT,
      recipient: 'ALLiUMDataProvider1111111111111111111111',
      description: d.desc, facilitatorProgram: X402_PROG, schemes: ['exact-amount'],
    });
    if (result.paid) {
      researchTotalSpent += d.amount;
      success(`x402 paid ${fmt(d.amount)} — ${d.desc}  (remaining: ${fmt(result.remaining!)})`);
    } else {
      fail(`x402 rejected — ${result.error}`);
    }
    dms.heartbeat('researcher');
    await sleep(50);
  }

  // Trader: 3 Jupiter swaps
  console.log();
  info('Trader executing DeFi swaps via Jupiter...');
  const swaps = [
    { amount: USDC(4), desc: 'USDC → SOL position entry' },
    { amount: USDC(3), desc: 'USDC → BONK speculation' },
    { amount: USDC(5), desc: 'USDC → JUP yield strategy' },
  ];

  let traderTotalSpent = 0n;
  for (const s of swaps) {
    const r = await traderAgent.spend({
      programId: JUPITER, amount: s.amount, description: s.desc,
      destination: 'JUPRouterSwapAddress111111111111111111',
    });
    if (r.success) {
      traderTotalSpent += s.amount;
      success(`Swap approved: ${fmt(s.amount)} — ${s.desc}`);
    }
    dms.heartbeat('trader');
    await sleep(50);
  }

  info(`Researcher spent ${fmt(researchTotalSpent)} across ${alliumData.length} x402 payments`);
  info(`Trader spent ${fmt(traderTotalSpent)} across ${swaps.length} swaps`);

  await sleep(200);

  // ──────────────────────────────────────────────────────────
  // SCENE 7 — SECURITY ENFORCEMENT
  // ──────────────────────────────────────────────────────────

  scene(7, 'SECURITY ENFORCEMENT');

  // Overspend attempt
  info('Trader attempts to overspend remaining budget...');
  const overspend = await traderAgent.spend({
    programId: JUPITER, amount: USDC(20),
    description: 'YOLO all-in SOL position',
  });
  if (!overspend.success) {
    fail(`BLOCKED: ${overspend.error}`);
    success('Budget integrity maintained');
  }

  // Unauthorized program attempt
  info('Trader tries to access Allium data (not in their allowlist)...');
  const unauthorized = await traderAgent.spend({
    programId: ALLIUM, amount: USDC(1),
    description: 'Sneaking data access',
  });
  if (!unauthorized.success) {
    fail(`BLOCKED: ${unauthorized.error}`);
    success('Program allowlist enforced');
  }

  // Velocity spike — rapid-fire transactions to trigger watchdog
  info('Simulating velocity spike — rapid-fire transactions...');
  // First build a baseline (seeded into tx history through existing spends)
  // Then fire several rapid transactions to trigger anomaly detection
  for (let i = 0; i < 4; i++) {
    await researcherAgent.payX402({
      url: `https://api.allium.xyz/v1/rapid-query/${i}`,
      amount: USDC(0.10), tokenMint: USDC_MINT,
      recipient: 'ALLiUMDataProvider1111111111111111111111',
      description: `Rapid query ${i}`, facilitatorProgram: X402_PROG, schemes: ['exact-amount'],
    });
    dms.heartbeat('researcher');
    await sleep(20); // fire fast to create velocity spike signal
  }

  await sleep(100);

  // ──────────────────────────────────────────────────────────
  // SCENE 8 — DEAD MAN'S SWITCH
  // ──────────────────────────────────────────────────────────

  scene(8, 'DEAD MAN\'S SWITCH');
  info('RogueAgent has stopped sending heartbeats...');
  info('Waiting for Dead Man\'s Switch to fire (up to 6 seconds)...');

  // RogueAgent never heartbeats — wait for DMS to fire (2s check + 3s*2 grace = ~8s max)
  const dmsBefore = dms.getStatus().find(s => s.agentId === 'rogue');
  if (dmsBefore) {
    info(`RogueAgent ms until trigger: ${dmsBefore.msUntilTrigger}ms`);
  }

  // Wait for the DMS timer to fire
  await sleep(7_000);

  const dmsStatus = dms.getStatus();
  const rogueStatus = dmsStatus.find(s => s.agentId === 'rogue');
  if (rogueStatus?.triggered) {
    success('Dead Man\'s Switch fired — RogueAgent authority revoked');
    info(`Last heartbeat was ${Date.now() - rogueStatus.lastHeartbeat}ms ago`);
    info(`Recovery wallet: ${dms.getTriggerLog()[0]?.authorityId?.slice(0, 8) ?? 'n/a'}...`);
  } else {
    warn('DMS not yet triggered — demo timing may vary');
  }

  // Try to spend after revocation
  info('RogueAgent attempts to spend after revocation...');
  const postRevoke = await rogueAgent.spend({
    programId: X402_PROG, amount: USDC(1),
    description: 'Unauthorized post-revoke spend',
  });
  if (!postRevoke.success) {
    fail(`BLOCKED: ${postRevoke.error}`);
    success('Revoked authority cannot spend — attack contained');
  }

  await sleep(200);

  // ──────────────────────────────────────────────────────────
  // SCENE 9 — DYNAMIC REPUTATION UPDATE
  // ──────────────────────────────────────────────────────────

  scene(9, 'DYNAMIC REPUTATION UPDATE');
  info('Showing how trust scores evolved through the demo...');

  for (const [id, name] of [
    ['researcher', 'Researcher'], ['trader', 'Trader'],
    ['rogue', 'RogueAgent'], ['scraper', 'DataScraper'],
  ] as const) {
    const pubkey  = manager.getAgent(id)?.pubkey ?? id;
    const report  = reputation.getReputationReport(pubkey);
    const history = report.scoreHistory;
    const first   = history[0]?.score ?? 50;
    const last    = history[history.length - 1]?.score ?? 50;
    const delta   = last - first;
    const arrow   = delta > 0 ? `${COLORS.green}↑${delta}${COLORS.reset}`
                  : delta < 0 ? `${COLORS.red}↓${Math.abs(delta)}${COLORS.reset}`
                  : `${COLORS.dim}→ 0${COLORS.reset}`;

    console.log(
      `  ${COLORS.bold}${name.padEnd(14)}${COLORS.reset}` +
      `  score: ${last.toString().padStart(3)} ${arrow.padEnd(20)}` +
      `  tier: ${report.currentTier.padEnd(14)}` +
      `  approved: ${report.metrics.approvedCount}  rejected: ${report.metrics.rejectedCount}`
    );
    info(`  Volume processed: ${fmt(report.metrics.totalVolumeProcessed)}  Success rate: ${(report.metrics.successRate * 100).toFixed(1)}%`);
  }

  console.log();
  const resReport = reputation.getReputationReport(researcherWallet.identity.pubkey);
  success(`Researcher score history: ${resReport.scoreHistory.map(p => p.score).join(' → ')}`);
  const tradReport = reputation.getReputationReport(traderWallet.identity.pubkey);
  info(`Trader score history:     ${tradReport.scoreHistory.map(p => p.score).join(' → ')}`);

  await sleep(200);

  // ──────────────────────────────────────────────────────────
  // SCENE 10 — DELEGATION CHAIN VERIFICATION
  // ──────────────────────────────────────────────────────────

  scene(10, 'DELEGATION CHAIN VERIFICATION');

  // Sub-delegate from researcher to scraper for a deep chain
  info('Researcher sub-delegates $5 to DataScraper...');
  const subAuth = await manager.delegate(
    researcherAuth.id, 'researcher', 'scraper', USDC(5),
    { allowedPrograms: [ALLIUM, X402_PROG], maxTransactionSize: USDC(1) },
  );
  scraperAgent.setAuthority(subAuth);

  const scraperPay = await scraperAgent.payX402({
    url: 'https://api.allium.xyz/v1/bulk-tx/batch-9',
    amount: USDC(0.25), tokenMint: USDC_MINT,
    recipient: 'ALLiUMDataProvider1111111111111111111111',
    description: 'Bulk transaction batch #9',
    facilitatorProgram: X402_PROG, schemes: ['exact-amount'],
  });
  if (scraperPay.paid) success(`DataScraper payment at depth-2: ${fmt(USDC(0.25))}`);

  info('Verifying delegation chain from DataScraper → Researcher → Orchestrator...');
  const chainResult = await manager.verifyDelegationChain(subAuth.id);

  if (chainResult.valid) {
    success('Delegation chain cryptographically valid!');
    for (const link of chainResult.chain) {
      console.log(
        `    ${COLORS.dim}depth ${link.depth}:${COLORS.reset}` +
        ` ${link.grantor.slice(0, 14)}...` +
        ` ${COLORS.cyan}→${COLORS.reset}` +
        ` ${link.grantee.slice(0, 14)}...` +
        ` ${COLORS.dim}(${link.authorityId.slice(0, 8)}...)${COLORS.reset}`
      );
    }
  } else {
    fail(`Chain verification failed: ${chainResult.error}`);
  }

  await sleep(200);

  // ──────────────────────────────────────────────────────────
  // SCENE 11 — AUDIT TRAIL + FORENSICS
  // ──────────────────────────────────────────────────────────

  scene(11, 'AUDIT TRAIL + FORENSICS');

  // Per-event-type breakdown
  const eventCounts = auditTrail.reduce<Record<string, number>>((acc, e) => {
    acc[e.eventType] = (acc[e.eventType] ?? 0) + 1;
    return acc;
  }, {});

  const totalApproved  = eventCounts['spend_approved']    ?? 0;
  const totalRejected  = eventCounts['spend_rejected']    ?? 0;
  const totalCreated   = eventCounts['authority_created'] ?? 0;
  const totalRevoked   = eventCounts['authority_revoked'] ?? 0;
  const totalRateHits  = eventCounts['rate_limit_hit']    ?? 0;

  // Total spend across all agents
  const totalSpend = auditTrail
    .filter(e => e.eventType === 'spend_approved')
    .reduce((sum, e) => sum + BigInt((e.details.amount as string) ?? '0'), 0n);

  // Per-chain breakdown
  const chainBreakdown: Record<string, bigint> = {};
  for (const auth of engine.getAllAuthorities()) {
    const chainKey = auth.chain;
    chainBreakdown[chainKey] = (chainBreakdown[chainKey] ?? 0n) + auth.spent;
  }

  console.log(`\n  ${COLORS.bold}Audit Trail Summary${COLORS.reset}`);
  console.log(`    Total events:       ${auditTrail.length}`);
  console.log(`    ${COLORS.green}Spends approved:    ${totalApproved}${COLORS.reset}`);
  console.log(`    ${COLORS.red}Spends rejected:    ${totalRejected}${COLORS.reset}`);
  console.log(`    Authorities created: ${totalCreated}`);
  console.log(`    Authorities revoked: ${totalRevoked}`);
  console.log(`    Rate limit hits:     ${totalRateHits}`);
  console.log(`    Total USDC spent:    ${fmt(totalSpend)}`);

  console.log(`\n  ${COLORS.bold}Per-Chain Spend${COLORS.reset}`);
  for (const [chain, spent] of Object.entries(chainBreakdown)) {
    const chainName = CHAIN_INFO[chain]?.name ?? chain;
    console.log(`    ${chainName.padEnd(20)} ${fmt(spent)}`);
  }

  console.log(`\n  ${COLORS.bold}Watchdog Alerts${COLORS.reset}`);
  if (watchdogAlerts.length === 0) {
    console.log('    No anomalies detected');
  } else {
    const alertCounts = watchdogAlerts.reduce<Record<string, number>>((acc, a) => {
      const k = `${a.severity}:${a.anomalyType}`;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    for (const [k, n] of Object.entries(alertCounts)) {
      const [sev, type] = k.split(':');
      const color = sev === 'critical' ? COLORS.red : sev === 'warning' ? COLORS.yellow : COLORS.dim;
      console.log(`    ${color}${sev.padEnd(10)}${COLORS.reset} ${type.padEnd(28)} ×${n}`);
    }
  }

  const triggers = dms.getTriggerLog();
  console.log(`\n  ${COLORS.bold}Dead Man\'s Switch Triggers${COLORS.reset}`);
  if (triggers.length === 0) {
    console.log('    No triggers fired');
  } else {
    for (const t of triggers) {
      console.log(`    ${COLORS.red}TRIGGERED${COLORS.reset} agent: ${t.agentId}  auth: ${t.authorityId.slice(0, 8)}...`);
    }
  }

  await sleep(200);

  // ──────────────────────────────────────────────────────────
  // SCENE 12 — FINAL STATUS REPORT
  // ──────────────────────────────────────────────────────────

  banner('FINAL STATUS REPORT');

  const agentList: Array<{ name: string; auth: typeof solanaRoot | null; agent: typeof orchestratorAgent }> = [
    { name: 'Orchestrator', auth: solanaRoot,     agent: orchestratorAgent },
    { name: 'Researcher',   auth: researcherAuth, agent: researcherAgent   },
    { name: 'Trader',       auth: traderAuth,     agent: traderAgent       },
    { name: 'RogueAgent',   auth: rogueAuth,      agent: rogueAgent        },
    { name: 'DataScraper',  auth: subAuth,        agent: scraperAgent      },
  ];

  for (const { name, auth } of agentList) {
    if (!auth) continue;
    const stats = engine.getAuthorityStats(auth.id);
    if (!stats) continue;
    const statusColor = stats.status === 'active' ? COLORS.green
                      : stats.status === 'revoked' ? COLORS.red : COLORS.yellow;
    console.log(`\n  ${COLORS.bold}${name}${COLORS.reset}`);
    console.log(`    Status:       ${statusColor}${stats.status}${COLORS.reset}`);
    console.log(`    Chain:        ${auth.chain}`);
    console.log(`    Spent:        ${fmt(BigInt(stats.spent))} / ${fmt(BigInt(stats.spent) + BigInt(stats.remaining))}`);
    console.log(`    Transactions: ${stats.transactions}`);
    console.log(`    Utilization:  ${stats.utilization}%`);
    console.log(`    Children:     ${stats.children}`);
  }

  console.log(`\n  ${COLORS.bold}Cross-Chain Summary${COLORS.reset}`);
  for (const [chain, spent] of Object.entries(chainBreakdown)) {
    const info2 = CHAIN_INFO[chain];
    if (!info2) continue;
    console.log(`    ${info2.name.padEnd(20)} spent: ${fmt(spent)}  token: ${info2.usdcAddress.slice(0, 14)}...`);
  }

  console.log(`\n  ${COLORS.bold}System Health${COLORS.reset}`);
  console.log(`    Watchdog alerts:      ${watchdogAlerts.length}`);
  console.log(`    DMS triggers:         ${triggers.length}`);
  console.log(`    Total agents tracked: ${[...new Set(auditTrail.map(e => e.agentId))].length}`);
  console.log(`    Audit events total:   ${auditTrail.length}`);

  // Shutdown
  dms.shutdown();

  banner('SpendOS Demo Complete');
  console.log(`${COLORS.dim}  SpendOS is to agent wallets what IAM is to cloud computing.`);
  console.log(`  AWS wouldn't exist without IAM.`);
  console.log(`  The agent economy won't exist without spend governance.`);
  console.log(`  We're building IAM for the agent economy.\n`);
  console.log(`  ${COLORS.bold}npm run demo:full${COLORS.reset}${COLORS.dim} — run this demo again anytime${COLORS.reset}\n`);
}

// ============================================================
// RUN
// ============================================================

main().catch(err => {
  console.error('\nDemo failed:', err);
  process.exit(1);
});