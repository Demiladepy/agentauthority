/**
 * Policy Engine — The core enforcement layer
 * 
 * Every transaction an agent wants to execute passes through here.
 * The engine validates against the spending authority's policy,
 * tracks cumulative spend, enforces rate limits, and emits audit events.
 */

import {
  SpendingAuthority,
  SpendingPolicy,
  TransactionIntent,
  ValidationResult,
  ValidationErrorCode,
  AuditEvent,
  AuditEventType,
  AuthorityEventHandler,
} from './types';
import { v4 as uuid } from 'uuid';

export class PolicyEngine {
  private authorities: Map<string, SpendingAuthority> = new Map();
  private eventHandlers: Map<AuditEventType, Set<AuthorityEventHandler>> = new Map();

  // -------------------------------------------------------
  // Authority Management
  // -------------------------------------------------------

  registerAuthority(authority: SpendingAuthority): void {
    this.authorities.set(authority.id, authority);
    this.emitEvent({
      id: uuid(),
      timestamp: Date.now(),
      eventType: 'authority_created',
      authorityId: authority.id,
      agentId: authority.grantee,
      details: {
        grantor: authority.grantor,
        maxSpend: authority.policy.maxSpend.toString(),
        expiresAt: authority.policy.expiresAt,
        allowedPrograms: authority.policy.allowedPrograms,
        delegationDepth: authority.depth,
      },
      remainingBudget: authority.policy.maxSpend,
      delegationPath: this.getDelegationPath(authority),
    });
  }

  getAuthority(id: string): SpendingAuthority | undefined {
    return this.authorities.get(id);
  }

  getAllAuthorities(): SpendingAuthority[] {
    return Array.from(this.authorities.values());
  }

  // -------------------------------------------------------
  // Transaction Validation — THE CORE
  // -------------------------------------------------------

  validate(intent: TransactionIntent): ValidationResult {
    const authority = this.authorities.get(intent.authorityId);

    if (!authority) {
      return { valid: false, reason: 'Authority not found', code: ValidationErrorCode.INVALID_SIGNATURE };
    }

    // 1. Check status
    if (authority.status === 'revoked') {
      this.emitRejectEvent(authority, intent, 'Authority has been revoked');
      return { valid: false, reason: 'Authority has been revoked', code: ValidationErrorCode.AUTHORITY_REVOKED };
    }

    if (authority.status === 'exhausted') {
      this.emitRejectEvent(authority, intent, 'Authority budget exhausted');
      return { valid: false, reason: 'Authority budget exhausted', code: ValidationErrorCode.AUTHORITY_EXHAUSTED };
    }

    // 2. Check expiry
    if (Date.now() > authority.policy.expiresAt) {
      authority.status = 'expired';
      this.emitRejectEvent(authority, intent, 'Authority has expired');
      return { valid: false, reason: 'Authority has expired', code: ValidationErrorCode.AUTHORITY_EXPIRED };
    }

    // 3. Check program allowlist
    if (authority.policy.allowedPrograms.length > 0 &&
        !authority.policy.allowedPrograms.includes(intent.programId)) {
      this.emitRejectEvent(authority, intent, `Program ${intent.programId} not in allowlist`);
      return {
        valid: false,
        reason: `Program ${intent.programId} not in allowlist`,
        code: ValidationErrorCode.PROGRAM_NOT_ALLOWED,
      };
    }

    // 4. Check destination allowlist
    if (intent.destination &&
        authority.policy.allowedDestinations.length > 0 &&
        !authority.policy.allowedDestinations.includes(intent.destination)) {
      this.emitRejectEvent(authority, intent, `Destination ${intent.destination} not allowed`);
      return {
        valid: false,
        reason: `Destination ${intent.destination} not allowed`,
        code: ValidationErrorCode.DESTINATION_NOT_ALLOWED,
      };
    }

    // 5. Check single transaction size
    if (intent.amount > authority.policy.maxTransactionSize) {
      this.emitRejectEvent(authority, intent, `Transaction size ${intent.amount} exceeds max ${authority.policy.maxTransactionSize}`);
      return {
        valid: false,
        reason: `Transaction size exceeds maximum of ${authority.policy.maxTransactionSize}`,
        code: ValidationErrorCode.EXCEEDS_TRANSACTION_LIMIT,
      };
    }

    // 6. Check cumulative spending limit
    const effectiveBudget = authority.policy.maxSpend - authority.delegated;
    if (authority.spent + intent.amount > effectiveBudget) {
      const remaining = effectiveBudget - authority.spent;
      this.emitRejectEvent(authority, intent, `Would exceed budget. Remaining: ${remaining}`);
      return {
        valid: false,
        reason: `Would exceed spending limit. Remaining budget: ${remaining}`,
        code: ValidationErrorCode.EXCEEDS_SPENDING_LIMIT,
      };
    }

    // 7. Check rate limit
    const now = Date.now();
    const windowStart = now - authority.policy.rateLimit.windowMs;
    const recentTxCount = authority.recentTransactions.filter(t => t > windowStart).length;
    if (recentTxCount >= authority.policy.rateLimit.maxTransactions) {
      this.emitEvent({
        id: uuid(),
        timestamp: now,
        eventType: 'rate_limit_hit',
        authorityId: authority.id,
        agentId: authority.grantee,
        details: {
          currentCount: recentTxCount,
          limit: authority.policy.rateLimit.maxTransactions,
          windowMs: authority.policy.rateLimit.windowMs,
        },
        delegationPath: this.getDelegationPath(authority),
      });
      return {
        valid: false,
        reason: `Rate limit exceeded: ${recentTxCount}/${authority.policy.rateLimit.maxTransactions} in window`,
        code: ValidationErrorCode.RATE_LIMIT_EXCEEDED,
      };
    }

    // ✅ ALL CHECKS PASSED — Record the spend
    authority.spent += intent.amount;
    authority.transactionCount += 1;
    authority.recentTransactions.push(now);
    // Prune old timestamps
    authority.recentTransactions = authority.recentTransactions.filter(t => t > windowStart);

    const remainingBudget = effectiveBudget - authority.spent;

    // Check if exhausted after this spend
    if (remainingBudget <= 0n) {
      authority.status = 'exhausted';
    }

    // Calculate warning level
    const spendRatio = Number(authority.spent) / Number(effectiveBudget);
    const timeRatio = (now - authority.createdAt) / (authority.policy.expiresAt - authority.createdAt);
    let warningLevel: 'none' | 'low' | 'high' = 'none';

    if (spendRatio > 0.9) {
      warningLevel = 'high';
    } else if (spendRatio > timeRatio * 1.5) {
      // Spending faster than time suggests — early warning
      warningLevel = 'low';
    }

    // Emit approval event
    this.emitEvent({
      id: uuid(),
      timestamp: now,
      eventType: 'spend_approved',
      authorityId: authority.id,
      agentId: authority.grantee,
      details: {
        amount: intent.amount.toString(),
        programId: intent.programId,
        destination: intent.destination,
        description: intent.description,
        transactionNumber: authority.transactionCount,
        warningLevel,
      },
      remainingBudget,
      delegationPath: this.getDelegationPath(authority),
    });

    return { valid: true, remainingBudget, warningLevel };
  }

  // -------------------------------------------------------
  // Delegation
  // -------------------------------------------------------

  validateDelegation(
    parentAuthorityId: string,
    requestedAmount: bigint,
    requestedPolicy: Partial<SpendingPolicy>
  ): ValidationResult {
    const parent = this.authorities.get(parentAuthorityId);

    if (!parent) {
      return { valid: false, reason: 'Parent authority not found', code: ValidationErrorCode.INVALID_SIGNATURE };
    }

    if (parent.status !== 'active') {
      return { valid: false, reason: `Parent authority is ${parent.status}`, code: ValidationErrorCode.AUTHORITY_REVOKED };
    }

    // Check delegation depth
    if (parent.depth >= parent.policy.maxDelegationDepth) {
      return {
        valid: false,
        reason: `Max delegation depth ${parent.policy.maxDelegationDepth} reached`,
        code: ValidationErrorCode.DELEGATION_DEPTH_EXCEEDED,
      };
    }

    // Check delegation budget
    const availableForDelegation = parent.policy.maxRedelegation - parent.delegated;
    if (requestedAmount > availableForDelegation) {
      return {
        valid: false,
        reason: `Requested ${requestedAmount} but only ${availableForDelegation} available for delegation`,
        code: ValidationErrorCode.INSUFFICIENT_DELEGATION_BUDGET,
      };
    }

    // Validate that child policy doesn't exceed parent
    if (requestedPolicy.allowedPrograms) {
      const parentPrograms = new Set(parent.policy.allowedPrograms);
      if (parent.policy.allowedPrograms.length > 0) {
        const invalid = requestedPolicy.allowedPrograms.filter(p => !parentPrograms.has(p));
        if (invalid.length > 0) {
          return {
            valid: false,
            reason: `Child requests programs not in parent allowlist: ${invalid.join(', ')}`,
            code: ValidationErrorCode.PROGRAM_NOT_ALLOWED,
          };
        }
      }
    }

    // Check expiry doesn't exceed parent
    if (requestedPolicy.expiresAt && requestedPolicy.expiresAt > parent.policy.expiresAt) {
      return {
        valid: false,
        reason: 'Child authority cannot expire after parent',
        code: ValidationErrorCode.AUTHORITY_EXPIRED,
      };
    }

    // Record the delegation
    parent.delegated += requestedAmount;

    return {
      valid: true,
      remainingBudget: parent.policy.maxRedelegation - parent.delegated,
      warningLevel: 'none',
    };
  }

  // -------------------------------------------------------
  // Revocation
  // -------------------------------------------------------

  revoke(authorityId: string, reason: string = 'Manual revocation'): boolean {
    const authority = this.authorities.get(authorityId);
    if (!authority) return false;

    authority.status = 'revoked';

    // Cascade revocation to all children
    for (const childId of authority.childAuthorities) {
      this.revoke(childId, `Parent ${authorityId} revoked: ${reason}`);
    }

    this.emitEvent({
      id: uuid(),
      timestamp: Date.now(),
      eventType: 'authority_revoked',
      authorityId: authority.id,
      agentId: authority.grantee,
      details: { reason, cascadedChildren: authority.childAuthorities.length },
      remainingBudget: authority.policy.maxSpend - authority.spent,
      delegationPath: this.getDelegationPath(authority),
    });

    return true;
  }

  // -------------------------------------------------------
  // Event System
  // -------------------------------------------------------

  on(eventType: AuditEventType, handler: AuthorityEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  off(eventType: AuditEventType, handler: AuthorityEventHandler): void {
    this.eventHandlers.get(eventType)?.delete(handler);
  }

  private async emitEvent(event: AuditEvent): Promise<void> {
    const handlers = this.eventHandlers.get(event.eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (err) {
          // Don't let handler errors break the engine
          console.error(`[PolicyEngine] Event handler error:`, err);
        }
      }
    }

    // Also emit to wildcard listeners
    const wildcardHandlers = this.eventHandlers.get('spend_approved'); // TODO: add wildcard support
  }

  private emitRejectEvent(authority: SpendingAuthority, intent: TransactionIntent, reason: string): void {
    this.emitEvent({
      id: uuid(),
      timestamp: Date.now(),
      eventType: 'spend_rejected',
      authorityId: authority.id,
      agentId: authority.grantee,
      details: {
        reason,
        attemptedAmount: intent.amount.toString(),
        programId: intent.programId,
        destination: intent.destination,
      },
      remainingBudget: authority.policy.maxSpend - authority.spent - authority.delegated,
      delegationPath: this.getDelegationPath(authority),
    });
  }

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------

  private getDelegationPath(authority: SpendingAuthority): string[] {
    const path: string[] = [authority.id];
    let current = authority;
    while (current.parentAuthorityId) {
      path.unshift(current.parentAuthorityId);
      const parent = this.authorities.get(current.parentAuthorityId);
      if (!parent) break;
      current = parent;
    }
    return path;
  }

  getAuthorityStats(authorityId: string): {
    spent: string;
    remaining: string;
    delegated: string;
    utilization: number;
    transactions: number;
    status: string;
    timeRemaining: number;
    children: number;
  } | null {
    const auth = this.authorities.get(authorityId);
    if (!auth) return null;

    const effectiveBudget = auth.policy.maxSpend - auth.delegated;
    const remaining = effectiveBudget - auth.spent;

    return {
      spent: auth.spent.toString(),
      remaining: remaining.toString(),
      delegated: auth.delegated.toString(),
      utilization: effectiveBudget > 0n ? Number(auth.spent * 100n / effectiveBudget) : 0,
      transactions: auth.transactionCount,
      status: auth.status,
      timeRemaining: Math.max(0, auth.policy.expiresAt - Date.now()),
      children: auth.childAuthorities.length,
    };
  }
}
