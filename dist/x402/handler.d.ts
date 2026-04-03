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
import { PolicyEngine } from '../core/policy-engine';
export interface X402PaymentRequired {
    /** The URL that returned 402 */
    url: string;
    /** Amount required (in token smallest units) */
    amount: bigint;
    /** Token to pay in */
    tokenMint: string;
    /** Recipient address */
    recipient: string;
    /** Description of what you're paying for */
    description: string;
    /** The program handling this payment (x402 facilitator) */
    facilitatorProgram: string;
    /** Supported payment schemes */
    schemes: string[];
}
export interface X402PaymentResult {
    /** Whether the payment was authorized and executed */
    authorized: boolean;
    /** If authorized, the transaction signature */
    transactionSignature?: string;
    /** If rejected, why */
    rejectionReason?: string;
    /** Remaining budget after this payment */
    remainingBudget?: bigint;
    /** Warning level for budget health */
    warningLevel?: 'none' | 'low' | 'high';
}
export declare class X402Handler {
    private engine;
    private paymentLog;
    constructor(engine: PolicyEngine);
    /**
     * Handle a 402 Payment Required response.
     *
     * This is the function agents call when they encounter a 402.
     * It validates the payment against their spending authority
     * and returns whether they're authorized to proceed.
     */
    handlePaymentRequired(authorityId: string, paymentRequest: X402PaymentRequired): Promise<X402PaymentResult>;
    /**
     * Simulate what would happen if this payment was made,
     * without actually deducting from the budget.
     */
    dryRun(authorityId: string, amount: bigint, programId: string): {
        wouldSucceed: boolean;
        reason?: string;
    };
    /**
     * Get spending analytics for an authority's x402 payments.
     */
    getPaymentAnalytics(authorityId: string): {
        totalPayments: number;
        totalSpent: bigint;
        approvedCount: number;
        rejectedCount: number;
        uniqueEndpoints: number;
        averagePayment: bigint;
    };
    private generateMockSignature;
}
//# sourceMappingURL=handler.d.ts.map