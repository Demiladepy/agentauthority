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
import { TransactionIntent, ValidationResult } from '../core/types';

// ============================================================
// x402 TYPES
// ============================================================

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

// ============================================================
// x402 HANDLER
// ============================================================

export class X402Handler {
  private engine: PolicyEngine;
  private paymentLog: Array<{
    timestamp: number;
    url: string;
    amount: bigint;
    authorized: boolean;
    authorityId: string;
  }> = [];

  constructor(engine: PolicyEngine) {
    this.engine = engine;
  }

  /**
   * Handle a 402 Payment Required response.
   * 
   * This is the function agents call when they encounter a 402.
   * It validates the payment against their spending authority
   * and returns whether they're authorized to proceed.
   */
  async handlePaymentRequired(
    authorityId: string,
    paymentRequest: X402PaymentRequired
  ): Promise<X402PaymentResult> {
    
    // Build a transaction intent from the x402 request
    const intent: TransactionIntent = {
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
    } else {
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
  dryRun(authorityId: string, amount: bigint, programId: string): {
    wouldSucceed: boolean;
    reason?: string;
  } {
    const authority = this.engine.getAuthority(authorityId);
    if (!authority) return { wouldSucceed: false, reason: 'Authority not found' };
    if (authority.status !== 'active') return { wouldSucceed: false, reason: `Authority is ${authority.status}` };
    if (Date.now() > authority.policy.expiresAt) return { wouldSucceed: false, reason: 'Expired' };

    const effectiveBudget = authority.policy.maxSpend - authority.delegated;
    const remaining = effectiveBudget - authority.spent;
    
    if (amount > remaining) return { wouldSucceed: false, reason: `Need ${amount}, have ${remaining}` };
    if (amount > authority.policy.maxTransactionSize) return { wouldSucceed: false, reason: 'Exceeds tx limit' };
    if (authority.policy.allowedPrograms.length > 0 && !authority.policy.allowedPrograms.includes(programId)) {
      return { wouldSucceed: false, reason: 'Program not allowed' };
    }

    return { wouldSucceed: true };
  }

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
  } {
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

  private generateMockSignature(authorityId: string, req: X402PaymentRequired): string {
    // Deterministic mock signature for demo purposes
    const data = `${authorityId}:${req.recipient}:${req.amount}:${Date.now()}`;
    // In production, this would be the real Solana transaction signature
    return Buffer.from(data).toString('base64').slice(0, 88);
  }
}
