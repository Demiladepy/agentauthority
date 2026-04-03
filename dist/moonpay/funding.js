"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.fundAgentWallet = fundAgentWallet;
exports.checkBalance = checkBalance;
const child_process_1 = require("child_process");
const uuid_1 = require("uuid");
// ============================================================
// CLI AVAILABILITY
// ============================================================
function isMoonPayCLIAvailable() {
    try {
        (0, child_process_1.execSync)('mp --version', { stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
// ============================================================
// FUND AGENT WALLET
// ============================================================
/**
 * Fund an agent wallet via MoonPay fiat on-ramp.
 *
 * When the MoonPay CLI is installed and authenticated,
 * pass simulate: false to execute a real on-ramp transaction.
 * Otherwise the function falls back to a realistic simulation.
 */
async function fundAgentWallet(walletAddress, amountUSD, config = {}) {
    const cfg = {
        network: 'solana-mainnet',
        simulate: true,
        ...config,
    };
    const networkLabel = cfg.network === 'solana-mainnet' ? 'Solana Mainnet' : 'Solana Devnet';
    const cliAvailable = isMoonPayCLIAvailable();
    console.log(`  → Initiating MoonPay on-ramp: $${amountUSD.toFixed(2)} USD → USDC`);
    console.log(`  → Network: ${networkLabel}`);
    console.log(`  → Recipient: ${walletAddress}`);
    // --------------------------------------------------------
    // REAL MODE — MoonPay CLI must be installed + authenticated
    // --------------------------------------------------------
    if (!cfg.simulate && cliAvailable) {
        try {
            console.log(`  → Calling: mp virtual-account onramp create --amount ${amountUSD} --currency USD`);
            const raw = (0, child_process_1.execSync)(`mp virtual-account onramp create --amount ${amountUSD} --currency USD`, { stdio: 'pipe', encoding: 'utf8' });
            const result = JSON.parse(raw);
            const txHash = String(result.id ?? result.transactionId ?? `mp_real_${Date.now()}`);
            const received = Number(result.cryptoAmount ?? result.baseCurrencyAmount ?? amountUSD);
            console.log(`  ✓ Funded: ${received.toFixed(2)} USDC received`);
            console.log(`  → MoonPay onramp ID: ${txHash}`);
            console.log(`  → Status: ${result.status ?? 'pending'}`);
            return {
                txHash,
                amountUSDC: received,
                amountLamports: BigInt(Math.round(received * 1_000_000)),
                recipient: walletAddress,
                network: cfg.network,
                confirmed: result.status === 'completed',
                timestamp: Date.now(),
                real: true,
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`  ⚠ MoonPay CLI call failed: ${message}`);
            console.warn(`  ⚠ Falling back to simulation. Check: mp login --email <email>`);
            // Fall through to simulate
        }
    }
    if (!cfg.simulate && !cliAvailable) {
        console.warn(`  ⚠ MoonPay CLI (mp) not found. Falling back to simulation.`);
        console.warn(`  ⚠ Install: npm install -g @moonpay/cli && mp login --email <email>`);
    }
    // --------------------------------------------------------
    // SIMULATE MODE
    // --------------------------------------------------------
    await new Promise(resolve => setTimeout(resolve, 400));
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
        real: false,
    };
}
// ============================================================
// CHECK BALANCE
// ============================================================
async function checkBalance(walletAddress, config = {}) {
    const cfg = {
        network: 'solana-mainnet',
        simulate: true,
        ...config,
    };
    if (!cfg.simulate && isMoonPayCLIAvailable()) {
        try {
            const raw = (0, child_process_1.execSync)(`mp virtual-account balance --wallet ${walletAddress}`, { stdio: 'pipe', encoding: 'utf8' });
            const result = JSON.parse(raw);
            const usd = Number(result.balance ?? result.amount ?? 0);
            return {
                lamports: BigInt(Math.round(usd * 1_000_000)),
                usd,
            };
        }
        catch {
            // Fall through
        }
    }
    // Simulate: $100 USDC
    const lamports = 100000000n;
    return { lamports, usd: Number(lamports) / 1_000_000 };
}
//# sourceMappingURL=funding.js.map