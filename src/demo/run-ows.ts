/**
 * ═══════════════════════════════════════════════════════════════
 *  AGENT SPENDING AUTHORITY PROTOCOL — OWS DEMO
 * ═══════════════════════════════════════════════════════════════
 *
 *  Same as run.ts but all agents use OWS wallets for signing.
 *  If OWS CLI is not installed, falls back to Ed25519Signer
 *  with a visible warning — the demo still runs identically.
 *
 *  Run: npm run demo:ows
 * ═══════════════════════════════════════════════════════════════
 */

import { execSync } from 'child_process';
import { PolicyEngine } from '../core/policy-engine';
import { AuthorityManager } from '../core/authority-manager';
import { X402Handler, X402PaymentRequired } from '../x402/handler';
import { AutonomousAgent } from '../agents/autonomous-agent';
import { SpendingPolicy, AgentIdentity, AuditEvent } from '../core/types';
import { OWSSigner, createOWSWallet } from '../ows/signer';

// ============================================================
// CONSTANTS
// ============================================================

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER_PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ALLIUM_DATA_ENDPOINT = 'ALLiUMv1Gx5EP7BuRhXDgzCkqFSJpGXyisotXwSey4Cd';
const X402_FACILITATOR = 'x402FaciLitatorProgram11111111111111111111';

const USDC = (amount: number) => BigInt(Math.round(amount * 1_000_000));

// ============================================================
// PRETTY PRINTING
// ============================================================

const COLORS = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function banner(text: string): void {
  const line = '═'.repeat(60);
  console.log(`\n${COLORS.cyan}${line}${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.white}  ${text}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${line}${COLORS.reset}\n`);
}

function section(text: string): void {
  console.log(`\n${COLORS.bold}${COLORS.blue}▶ ${text}${COLORS.reset}`);
  console.log(`${COLORS.dim}${'─'.repeat(50)}${COLORS.reset}`);
}

function success(text: string): void { console.log(`  ${COLORS.green}✓${COLORS.reset} ${text}`); }
function fail(text: string): void    { console.log(`  ${COLORS.red}✗${COLORS.reset} ${text}`); }
function info(text: string): void    { console.log(`  ${COLORS.dim}→${COLORS.reset} ${text}`); }
function warn(text: string): void    { console.log(`  ${COLORS.yellow}⚠${COLORS.reset} ${text}`); }

function formatUSDC(lamports: bigint): string {
  return `$${(Number(lamports) / 1_000_000).toFixed(2)} USDC`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  banner('AGENT SPENDING AUTHORITY PROTOCOL — OWS EDITION');
  console.log(`${COLORS.dim}  All agent wallets are managed by OWS.`);
  console.log(`  Falls back to Ed25519 if OWS CLI is not installed.`);
  console.log(`  Built on OWS · Works with x402 · Solana-native${COLORS.reset}\n`);

  // --------------------------------------------------------
  // SETUP: Create OWS wallets
  // --------------------------------------------------------

  section('0. PROVISIONING OWS WALLETS');
  info('Creating OWS wallets for each agent via CLI...');

  const walletNames = {
    orchestrator: 'orchestrator-agent',
    researcher:   'researcher-agent',
    trader:       'trader-agent',
    scraper:      'data-scraper-agent',
  };

  let owsActive = false;
  try {
    execSync('ows --version', { stdio: 'pipe' });
    owsActive = true;
    info('OWS CLI detected — using hardware-backed signing');
  } catch {
    warn('OWS CLI not found — using Ed25519 fallback (demo still runs identically)');
    warn('Install OWS: curl -fsSL https://docs.openwallet.sh/install.sh | bash');
  }

  const [orchSigner, researchSigner, traderSigner, scraperSigner] = await Promise.all([
    createOWSWallet(walletNames.orchestrator, 'solana:mainnet'),
    createOWSWallet(walletNames.researcher,   'solana:mainnet'),
    createOWSWallet(walletNames.trader,       'solana:mainnet'),
    createOWSWallet(walletNames.scraper,      'solana:mainnet'),
  ]);

  const signerLabel = owsActive ? 'OWS' : 'Ed25519 (fallback)';
  success(`Wallet "${walletNames.orchestrator}" → ${orchSigner.getPublicKey().slice(0, 16)}... [${signerLabel}]`);
  success(`Wallet "${walletNames.researcher}"   → ${researchSigner.getPublicKey().slice(0, 16)}... [${signerLabel}]`);
  success(`Wallet "${walletNames.trader}"       → ${traderSigner.getPublicKey().slice(0, 16)}... [${signerLabel}]`);
  success(`Wallet "${walletNames.scraper}"      → ${scraperSigner.getPublicKey().slice(0, 16)}... [${signerLabel}]`);

  await sleep(300);

  // --------------------------------------------------------
  // SETUP: Protocol infrastructure
  // --------------------------------------------------------

  section('1. INITIALIZING PROTOCOL INFRASTRUCTURE');

  const engine = new PolicyEngine();
  const manager = new AuthorityManager(engine);
  const x402Handler = new X402Handler(engine);

  const auditTrail: AuditEvent[] = [];
  const auditEvents: string[] = [
    'authority_created', 'authority_delegated', 'spend_approved',
    'spend_rejected', 'authority_revoked', 'rate_limit_hit',
  ];
  for (const et of auditEvents) {
    engine.on(et as any, (e: AuditEvent) => { auditTrail.push(e); });
  }

  success('Policy Engine initialized');
  success('Authority Manager initialized');
  success('x402 Handler initialized');

  // --------------------------------------------------------
  // REGISTER AGENTS — pass OWS signers explicitly
  // --------------------------------------------------------

  section('2. REGISTERING AGENTS WITH OWS WALLETS');

  const makeIdentity = (id: string, name: string, role: string, trust: number, pubkey: string): AgentIdentity => ({
    id, name, pubkey, role, trustScore: trust, totalSpends: 0, totalRejections: 0,
  });

  const orchestrator = new AutonomousAgent({
    identity: makeIdentity('orchestrator', 'Orchestrator', 'Budget controller', 100, orchSigner.getPublicKey()),
    signer: orchSigner,
    engine, manager, x402Handler,
    onLog: (level, msg) => {
      const c = level === 'error' ? COLORS.red : level === 'warn' ? COLORS.yellow : COLORS.magenta;
      console.log(`  ${c}[Orchestrator]${COLORS.reset} ${msg}`);
    },
  });

  const researcher = new AutonomousAgent({
    identity: makeIdentity('researcher', 'Researcher', 'Data acquisition', 75, researchSigner.getPublicKey()),
    signer: researchSigner,
    engine, manager, x402Handler,
    onLog: (level, msg) => {
      const c = level === 'error' ? COLORS.red : level === 'warn' ? COLORS.yellow : COLORS.cyan;
      console.log(`  ${c}[Researcher]${COLORS.reset} ${msg}`);
    },
  });

  const trader = new AutonomousAgent({
    identity: makeIdentity('trader', 'Trader', 'DeFi trading', 50, traderSigner.getPublicKey()),
    signer: traderSigner,
    engine, manager, x402Handler,
    onLog: (level, msg) => {
      const c = level === 'error' ? COLORS.red : level === 'warn' ? COLORS.yellow : COLORS.green;
      console.log(`  ${c}[Trader]${COLORS.reset} ${msg}`);
    },
  });

  const scraper = new AutonomousAgent({
    identity: makeIdentity('scraper', 'DataScraper', 'Onchain data scraping', 40, scraperSigner.getPublicKey()),
    signer: scraperSigner,
    engine, manager, x402Handler,
    onLog: (level, msg) => {
      const c = level === 'error' ? COLORS.red : level === 'warn' ? COLORS.yellow : COLORS.blue;
      console.log(`  ${c}[DataScraper]${COLORS.reset} ${msg}`);
    },
  });

  success(`Orchestrator — ${orchSigner.getPublicKey().slice(0, 16)}... [${signerLabel}]`);
  success(`Researcher   — ${researchSigner.getPublicKey().slice(0, 16)}... [${signerLabel}]`);
  success(`Trader       — ${traderSigner.getPublicKey().slice(0, 16)}... [${signerLabel}]`);
  success(`DataScraper  — ${scraperSigner.getPublicKey().slice(0, 16)}... [${signerLabel}]`);

  await sleep(300);

  // --------------------------------------------------------
  // ROOT AUTHORITY
  // --------------------------------------------------------

  section('3. CREATING ROOT SPENDING AUTHORITY');
  info('Orchestrator creates a $100 USDC budget — signed by OWS wallet');

  const rootPolicy: SpendingPolicy = {
    maxSpend: USDC(100),
    tokenMint: USDC_MINT,
    allowedPrograms: [JUPITER_PROGRAM, TOKEN_PROGRAM, ALLIUM_DATA_ENDPOINT, X402_FACILITATOR],
    allowedDestinations: [],
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    maxRedelegation: USDC(60),
    maxDelegationDepth: 3,
    maxTransactionSize: USDC(25),
    rateLimit: { maxTransactions: 20, windowMs: 60_000 },
  };

  const rootAuthority = await manager.createRootAuthority(
    'orchestrator', 'orchestrator', rootPolicy, 'solana:mainnet'
  );
  orchestrator.setAuthority(rootAuthority);

  success(`Root authority created: ${rootAuthority.id.slice(0, 8)}...`);
  info(`Budget: ${formatUSDC(rootPolicy.maxSpend)}`);
  info(`Chain: solana:mainnet`);
  info(`Signed by: ${owsActive ? 'OWS wallet (hardware)' : 'Ed25519 (software fallback)'}`);

  await sleep(300);

  // --------------------------------------------------------
  // DELEGATE TO RESEARCHER
  // --------------------------------------------------------

  section('4. DELEGATING TO RESEARCHER');
  info('Orchestrator OWS wallet signs the delegation');

  const researcherAuth = await orchestrator.delegateTo(researcher, USDC(30), {
    allowedPrograms: [ALLIUM_DATA_ENDPOINT, X402_FACILITATOR, TOKEN_PROGRAM],
    maxRedelegation: USDC(10),
    maxTransactionSize: USDC(5),
  });

  success(`Delegated to Researcher: ${researcherAuth.id.slice(0, 8)}...`);
  info(`Amount: ${formatUSDC(USDC(30))}`);
  info(`Depth: ${researcherAuth.depth} — delegation chain signed by OWS`);

  await sleep(300);

  // --------------------------------------------------------
  // DELEGATE TO TRADER
  // --------------------------------------------------------

  section('5. DELEGATING TO TRADER');

  const traderAuth = await orchestrator.delegateTo(trader, USDC(20), {
    allowedPrograms: [JUPITER_PROGRAM, TOKEN_PROGRAM],
    maxRedelegation: USDC(0),
    maxDelegationDepth: 0,
    maxTransactionSize: USDC(10),
  });

  success(`Delegated to Trader: ${traderAuth.id.slice(0, 8)}...`);
  info(`Amount: ${formatUSDC(USDC(20))}`);

  await sleep(300);

  // --------------------------------------------------------
  // RESEARCHER: x402 PAYMENTS
  // --------------------------------------------------------

  section('6. RESEARCHER MAKES x402 PAYMENTS');

  const pay1 = await researcher.payX402({
    url: 'https://api.allium-data.xyz/v1/wallet-risk/7xKXtg2...',
    amount: USDC(0.50),
    tokenMint: USDC_MINT,
    recipient: 'ALLiUMDataProvider1111111111111111111111',
    description: 'Wallet risk profile — full counterparty graph',
    facilitatorProgram: X402_FACILITATOR,
    schemes: ['exact-amount'],
  });
  if (pay1.paid) success(`Payment approved: ${formatUSDC(USDC(0.50))} for wallet risk profile`);

  const pay2 = await researcher.payX402({
    url: 'https://api.allium-data.xyz/v1/vesting-audit/TokenXYZ',
    amount: USDC(1.00),
    tokenMint: USDC_MINT,
    recipient: 'ALLiUMDataProvider1111111111111111111111',
    description: 'Token vesting audit — cliff dates and unlock schedule',
    facilitatorProgram: X402_FACILITATOR,
    schemes: ['exact-amount'],
  });
  if (pay2.paid) success(`Payment approved: ${formatUSDC(USDC(1.00))} for vesting audit`);

  await sleep(300);

  // --------------------------------------------------------
  // SUB-DELEGATION → SCRAPER
  // --------------------------------------------------------

  section('7. RESEARCHER SUB-DELEGATES TO DATA SCRAPER');
  info('Researcher OWS wallet signs this sub-delegation');

  const scraperAuth = await researcher.delegateTo(scraper, USDC(5), {
    allowedPrograms: [ALLIUM_DATA_ENDPOINT, X402_FACILITATOR],
    maxTransactionSize: USDC(1),
  });

  success(`Sub-delegated to DataScraper: ${scraperAuth.id.slice(0, 8)}...`);
  info(`Depth: ${scraperAuth.depth} (3 levels deep — all OWS-signed)`);

  const scraperPayment: X402PaymentRequired = {
    url: 'https://api.allium-data.xyz/v1/bulk-transactions/batch-7',
    amount: USDC(0.25),
    tokenMint: USDC_MINT,
    recipient: 'ALLiUMDataProvider1111111111111111111111',
    description: 'Bulk transaction history — 1000 records',
    facilitatorProgram: X402_FACILITATOR,
    schemes: ['exact-amount'],
  };

  const scraperPay = await scraper.payX402(scraperPayment);
  if (scraperPay.paid) success(`DataScraper payment at depth 2: ${formatUSDC(scraperPayment.amount)}`);

  await sleep(300);

  // --------------------------------------------------------
  // TRADER: SUCCESS + OVERSPEND + UNAUTHORIZED
  // --------------------------------------------------------

  section('8. TRADER: APPROVED TRADE');

  const t1 = await trader.spend({ programId: JUPITER_PROGRAM, amount: USDC(8), description: 'Swap 8 USDC → SOL via Jupiter' });
  if (t1.success) success(`Trade approved: ${formatUSDC(USDC(8))} — remaining: ${formatUSDC(t1.remainingBudget!)}`);

  section('9. TRADER ATTEMPTS OVERSPEND — BLOCKED');

  const t2 = await trader.spend({ programId: JUPITER_PROGRAM, amount: USDC(15), description: 'Swap 15 USDC (too much)' });
  if (!t2.success) fail(`BLOCKED: ${t2.error}`);

  section('10. TRADER TRIES UNAUTHORIZED PROGRAM — BLOCKED');

  const t3 = await trader.spend({ programId: ALLIUM_DATA_ENDPOINT, amount: USDC(1), description: 'Accessing data (not allowed)' });
  if (!t3.success) fail(`BLOCKED: ${t3.error}`);

  await sleep(300);

  // --------------------------------------------------------
  // VERIFY DELEGATION CHAIN
  // --------------------------------------------------------

  section('11. VERIFYING OWS-SIGNED DELEGATION CHAIN');
  info('Cryptographically verifying chain from DataScraper back to root');

  const verification = await manager.verifyDelegationChain(scraperAuth.id);

  if (verification.valid) {
    success('Delegation chain cryptographically valid!');
    for (const link of verification.chain) {
      info(`Depth ${link.depth}: ${link.grantor.slice(0, 12)}... → ${link.grantee.slice(0, 12)}... (${link.authorityId.slice(0, 8)}...)`);
    }
    info(`All signatures created by ${owsActive ? 'OWS hardware wallets' : 'Ed25519 fallback signers'}`);
  } else {
    fail(`Chain verification failed: ${verification.error}`);
  }

  await sleep(300);

  // --------------------------------------------------------
  // CASCADING REVOCATION
  // --------------------------------------------------------

  section('12. CASCADING REVOCATION');

  engine.revoke(researcherAuth.id, 'Mission complete');
  success('Researcher authority revoked');

  const scraperStatus = engine.getAuthorityStats(scraperAuth.id);
  if (scraperStatus?.status === 'revoked') success('DataScraper cascaded — also revoked');

  const postRevoke = await scraper.payX402(scraperPayment);
  if (!postRevoke.paid) fail(`BLOCKED post-revocation: ${postRevoke.error}`);

  // --------------------------------------------------------
  // FINAL REPORT
  // --------------------------------------------------------

  banner('FINAL STATUS REPORT');

  for (const [name, agent] of [['Orchestrator', orchestrator], ['Researcher', researcher], ['Trader', trader], ['DataScraper', scraper]] as const) {
    const auth = agent.getAuthority();
    if (auth) {
      const stats = engine.getAuthorityStats(auth.id);
      if (stats) {
        console.log(`\n${COLORS.bold}  ${name}${COLORS.reset}`);
        console.log(`    Status: ${stats.status === 'active' ? COLORS.green : COLORS.red}${stats.status}${COLORS.reset}`);
        console.log(`    Spent: ${formatUSDC(BigInt(stats.spent))}`);
        console.log(`    Txns: ${stats.transactions}`);
        console.log(`    Signer: ${owsActive ? 'OWS wallet' : 'Ed25519 fallback'}`);
      }
    }
  }

  console.log(`\n${COLORS.bold}  Audit Trail${COLORS.reset}`);
  const counts = auditTrail.reduce((acc, e) => { acc[e.eventType] = (acc[e.eventType] || 0) + 1; return acc; }, {} as Record<string, number>);
  for (const [type, count] of Object.entries(counts)) {
    const c = type.includes('reject') || type.includes('revok') ? COLORS.red : type.includes('approved') ? COLORS.green : COLORS.dim;
    console.log(`    ${c}${type}: ${count}${COLORS.reset}`);
  }

  banner('OWS DEMO COMPLETE');
  console.log(`${COLORS.dim}  OWS wallet: ${owsActive ? 'ACTIVE — hardware-backed signing' : 'FALLBACK — Ed25519 in-process'}`);
  console.log(`  Every delegation in this demo was signed by an OWS-compatible wallet.`);
  console.log(`  No agent ever touched another agent's private key.${COLORS.reset}\n`);
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
