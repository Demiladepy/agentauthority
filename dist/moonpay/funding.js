"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.fundAgentWallet = fundAgentWallet;
exports.checkBalance = checkBalance;
const uuid_1 = require("uuid");
const DEFAULT_CONFIG = {
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
async function fundAgentWallet(walletAddress, amountUSD, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
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
        const txHash = `mp_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 40)}`;
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
    throw new Error('Production MoonPay funding requires the MoonPay CLI and a valid API key. ' +
        'Set simulate: true for demo use. See: https://docs.moonpay.com/agent-cli');
}
// ============================================================
// CHECK BALANCE
// ============================================================
/**
 * Returns the USDC balance for a wallet address.
 * In simulate mode returns a mock $100 balance.
 */
async function checkBalance(walletAddress, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (cfg.simulate) {
        // Mock balance: $100 USDC
        const lamports = 100000000n;
        return {
            lamports,
            usd: Number(lamports) / 1_000_000,
        };
    }
    // Production: query Solana RPC for USDC SPL token account balance
    throw new Error('Production balance check requires a Solana RPC endpoint. ' +
        'Set simulate: true for demo use.');
}
//# sourceMappingURL=funding.js.map