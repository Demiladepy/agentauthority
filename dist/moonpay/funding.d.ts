/**
 * MoonPay Funding Skill
 *
 * Fiat on-ramp for funding agent authority accounts via the MoonPay CLI (`mp`).
 * Uses `mp virtual-account onramp create` to purchase USDC and fund agent wallets.
 *
 * Prerequisites:
 *   npm install -g @moonpay/cli
 *   mp login --email <your-email>
 *   mp verify --email <your-email> --code <6-digit-code>
 *
 * Then set simulate: false to use real on-ramp.
 * simulate: true (default) runs without any real transactions — safe for demos.
 */
export interface MoonPayFundingConfig {
    /** Target Solana network */
    network: 'solana-mainnet' | 'solana-devnet';
    /**
     * If true, simulates the funding flow without real transactions.
     * Defaults to true unless the MoonPay CLI is detected and you
     * explicitly pass simulate: false.
     */
    simulate: boolean;
}
export interface FundingResult {
    /** MoonPay transaction / onramp ID */
    txHash: string;
    /** Amount of USDC received (after fees) */
    amountUSDC: number;
    /** USDC in token smallest units (6 decimals) */
    amountLamports: bigint;
    /** Recipient wallet address */
    recipient: string;
    /** Network */
    network: string;
    confirmed: boolean;
    timestamp: number;
    /** Whether a real MoonPay CLI call was made */
    real: boolean;
}
export interface BalanceResult {
    lamports: bigint;
    usd: number;
}
/**
 * Fund an agent wallet via MoonPay fiat on-ramp.
 *
 * When the MoonPay CLI is installed and authenticated,
 * pass simulate: false to execute a real on-ramp transaction.
 * Otherwise the function falls back to a realistic simulation.
 */
export declare function fundAgentWallet(walletAddress: string, amountUSD: number, config?: Partial<MoonPayFundingConfig>): Promise<FundingResult>;
export declare function checkBalance(walletAddress: string, config?: Partial<MoonPayFundingConfig>): Promise<BalanceResult>;
//# sourceMappingURL=funding.d.ts.map