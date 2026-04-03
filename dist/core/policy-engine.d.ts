/**
 * Policy Engine — The core enforcement layer
 *
 * Every transaction an agent wants to execute passes through here.
 * The engine validates against the spending authority's policy,
 * tracks cumulative spend, enforces rate limits, and emits audit events.
 */
import { SpendingAuthority, SpendingPolicy, TransactionIntent, ValidationResult, AuditEventType, AuthorityEventHandler } from './types';
export declare class PolicyEngine {
    private authorities;
    private eventHandlers;
    registerAuthority(authority: SpendingAuthority): void;
    getAuthority(id: string): SpendingAuthority | undefined;
    getAllAuthorities(): SpendingAuthority[];
    validate(intent: TransactionIntent): ValidationResult;
    validateDelegation(parentAuthorityId: string, requestedAmount: bigint, requestedPolicy: Partial<SpendingPolicy>): ValidationResult;
    revoke(authorityId: string, reason?: string): boolean;
    on(eventType: AuditEventType, handler: AuthorityEventHandler): void;
    off(eventType: AuditEventType, handler: AuthorityEventHandler): void;
    private emitEvent;
    private emitRejectEvent;
    private getDelegationPath;
    getAuthorityStats(authorityId: string): {
        spent: string;
        remaining: string;
        delegated: string;
        utilization: number;
        transactions: number;
        status: string;
        timeRemaining: number;
        children: number;
    } | null;
}
//# sourceMappingURL=policy-engine.d.ts.map