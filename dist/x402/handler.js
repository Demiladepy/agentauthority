"use strict";
/**
 * x402 Policy-Aware Payment Handler
 *
 * When an agent hits a 402 Payment Required response,
 * this handler intercepts it, validates against the agent's
 * spending authority, and either approves or rejects the payment.
 *
 * This is the bridge between x402 (payment transport) and
 * the Spending Authority Protocol (payment authorization).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402Handler = void 0;
// ============================================================
// x402 HANDLER
// ============================================================
class X402Handler {
    engine;
    paymentLog = [];
    constructor(engine) {
        this.engine = engine;
    }
    /**
     * Handle a 402 Payment Required response.
     *
     * This is the function agents call when they encounter a 402.
     * It validates the payment against their spending authority
     * and returns whether they're authorized to proceed.
     */
    async handlePaymentRequired(authorityId, paymentRequest) {
        // Build a transaction intent from the x402 request
        const intent = {
            authorityId,
            programId: paymentRequest.facilitatorProgram,
            destination: paymentRequest.recipient,
            amount: paymentRequest.amount,
            description: `x402 payment: ${paymentRequest.description} (${paymentRequest.url})`,
        };
        // Validate through the policy engine
        const validation = this.engine.validate(intent);
        // Log it
        this.paymentLog.push({
            timestamp: Date.now(),
            url: paymentRequest.url,
            amount: paymentRequest.amount,
            authorized: validation.valid,
            authorityId,
        });
        if (validation.valid) {
            return {
                authorized: true,
                // In a real implementation, this would be the actual Solana tx signature
                // For the SDK demo, we return a deterministic hash
                transactionSignature: this.generateMockSignature(authorityId, paymentRequest),
                remainingBudget: validation.remainingBudget,
                warningLevel: validation.warningLevel,
            };
        }
        else {
            return {
                authorized: false,
                rejectionReason: validation.reason,
            };
        }
    }
    /**
     * Simulate what would happen if this payment was made,
     * without actually deducting from the budget.
     */
    dryRun(authorityId, amount, programId) {
        const authority = this.engine.getAuthority(authorityId);
        if (!authority)
            return { wouldSucceed: false, reason: 'Authority not found' };
        if (authority.status !== 'active')
            return { wouldSucceed: false, reason: `Authority is ${authority.status}` };
        if (Date.now() > authority.policy.expiresAt)
            return { wouldSucceed: false, reason: 'Expired' };
        const effectiveBudget = authority.policy.maxSpend - authority.delegated;
        const remaining = effectiveBudget - authority.spent;
        if (amount > remaining)
            return { wouldSucceed: false, reason: `Need ${amount}, have ${remaining}` };
        if (amount > authority.policy.maxTransactionSize)
            return { wouldSucceed: false, reason: 'Exceeds tx limit' };
        if (authority.policy.allowedPrograms.length > 0 && !authority.policy.allowedPrograms.includes(programId)) {
            return { wouldSucceed: false, reason: 'Program not allowed' };
        }
        return { wouldSucceed: true };
    }
    /**
     * Get spending analytics for an authority's x402 payments.
     */
    getPaymentAnalytics(authorityId) {
        const relevant = this.paymentLog.filter(l => l.authorityId === authorityId);
        const approved = relevant.filter(l => l.authorized);
        const totalSpent = approved.reduce((sum, l) => sum + l.amount, 0n);
        const uniqueEndpoints = new Set(relevant.map(l => l.url)).size;
        return {
            totalPayments: relevant.length,
            totalSpent,
            approvedCount: approved.length,
            rejectedCount: relevant.length - approved.length,
            uniqueEndpoints,
            averagePayment: approved.length > 0 ? totalSpent / BigInt(approved.length) : 0n,
        };
    }
    generateMockSignature(authorityId, req) {
        // Deterministic mock signature for demo purposes
        const data = `${authorityId}:${req.recipient}:${req.amount}:${Date.now()}`;
        // In production, this would be the real Solana transaction signature
        return Buffer.from(data).toString('base64').slice(0, 88);
    }
}
exports.X402Handler = X402Handler;
//# sourceMappingURL=handler.js.map