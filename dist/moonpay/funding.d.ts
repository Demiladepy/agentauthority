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
/**
 * Purchase USDC via MoonPay and send to a wallet address.
 *
 * In simulate mode, logs a realistic funding flow and returns
 * mock tx data. In production, requires MoonPay CLI and API key.
 */
export declare function fundAgentWallet(walletAddress: string, amountUSD: number, config?: Partial<MoonPayFundingConfig>): Promise<FundingResult>;
/**
 * Returns the USDC balance for a wallet address.
 * In simulate mode returns a mock $100 balance.
 */
export declare function checkBalance(walletAddress: string, config?: Partial<MoonPayFundingConfig>): Promise<BalanceResult>;
//# sourceMappingURL=funding.d.ts.map