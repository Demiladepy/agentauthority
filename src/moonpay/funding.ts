/**
 * MoonPay Funding Skill
 *
 * Fiat on-ramp for funding agent authority accounts via MoonPay.
 * Uses the MoonPay buy/onramp skill to purchase USDC and send it to
 * the agent's wallet address.
 *
 * simulate: true (default) produces realistic terminal output without
 * making real transactions — safe for hackathon demos.
 */

import { v4 as uuid } from 'uuid';

// ============================================================
// TYPES
// ============================================================

export interface MoonPayFundingConfig {
  /** MoonPay API key — only required in production */
  apiKey?: string;
  /** Target Solana network */
  network: 'solana-mainnet' | 'solana-devnet';
  /** If true, simulates funding flow without real transactions */
  simulate: boolean;
}

export interface FundingResult {
  /** MoonPay transaction hash (simulated or real) */
  txHash: string;
  /** Amount of USDC received */
  amountUSDC: number;
  /** USDC in token smallest units (6 decimals) */
  amountLamports: bigint;
  /** Recipient wallet address */
  recipient: string;
  /** Network the transaction landed on */
  network: string;
  confirmed: boolean;
  timestamp: number;
}

export interface BalanceResult {
  /** USDC balance in token smallest units (6 decimals) */
  lamports: bigint;
  /** Human-readable USD equivalent */
  usd: number;
}

const DEFAULT_CONFIG: MoonPayFundingConfig = {
  network: 'solana-mainnet',
  simulate: true,
};

// ============================================================
// FUND AGENT WALLET
// ============================================================

/**
 * Purchase USDC via MoonPay and send to a wallet address.
 *
 * In simulate mode, logs a realistic funding flow and returns
 * mock tx data. In production, requires MoonPay CLI and API key.
 */
export async function fundAgentWallet(
  walletAddress: string,
  amountUSD: number,
  config: Partial<MoonPayFundingConfig> = {}
): Promise<FundingResult> {
  const cfg: MoonPayFundingConfig = { ...DEFAULT_CONFIG, ...config };
  const networkLabel = cfg.network === 'solana-mainnet' ? 'Solana Mainnet' : 'Solana Devnet';

  console.log(`  → Initiating MoonPay on-ramp: $${amountUSD.toFixed(2)} USD → USDC`);
  console.log(`  → Network: ${networkLabel}`);
  console.log(`  → Recipient: ${walletAddress}`);

  if (cfg.simulate) {
    // Simulate KYC + payment processing delay
    await new Promise(resolve => setTimeout(resolve, 400));

    // Simulate MoonPay fee (~1.5%)
    const fee = amountUSD * 0.015;
    const netUSDC = amountUSD - fee;
    const txHash = `mp_${uuid().replace(/-/g, '').slice(0, 40)}`;

    console.log(`  → Processing payment... (fee: $${fee.toFixed(2)} MoonPay fee)`);
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log(`  ✓ Funded: ${netUSDC.toFixed(2)} USDC received (simulated)`);
    console.log(`  → MoonPay tx: ${txHash}`);

    return {
      txHash,
      amountUSDC: netUSDC,
      amountLamports: BigInt(Math.round(netUSDC * 1_000_000)),
      recipient: walletAddress,
      network: cfg.network,
      confirmed: true,
      timestamp: Date.now(),
    };
  }

  // Production: invoke MoonPay CLI
  // moonpay buy --currency USDC-SOL --amount ${amountUSD} --wallet ${walletAddress}
  throw new Error(
    'Production MoonPay funding requires the MoonPay CLI and a valid API key. ' +
    'Set simulate: true for demo use. See: https://docs.moonpay.com/agent-cli'
  );
}

// ============================================================
// CHECK BALANCE
// ============================================================

/**
 * Returns the USDC balance for a wallet address.
 * In simulate mode returns a mock $100 balance.
 */
export async function checkBalance(
  walletAddress: string,
  config: Partial<MoonPayFundingConfig> = {}
): Promise<BalanceResult> {
  const cfg: MoonPayFundingConfig = { ...DEFAULT_CONFIG, ...config };

  if (cfg.simulate) {
    // Mock balance: $100 USDC
    const lamports = 100_000_000n;
    return {
      lamports,
      usd: Number(lamports) / 1_000_000,
    };
  }

  // Production: query Solana RPC for USDC SPL token account balance
  throw new Error(
    'Production balance check requires a Solana RPC endpoint. ' +
    'Set simulate: true for demo use.'
  );
}
