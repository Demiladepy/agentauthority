/**
 * Agent Spending Authority Protocol — Core Types
 *
 * The fundamental data structures that define how agents
 * request, receive, delegate, and enforce spending authority.
 */
export interface SpendingPolicy {
    /** Maximum amount (in smallest unit, e.g. USDC lamports = 6 decimals) */
    maxSpend: bigint;
    /** Token mint address this policy applies to */
    tokenMint: string;
    /** Programs this agent is allowed to interact with */
    allowedPrograms: string[];
    /** Destination addresses this agent can send to (empty = any within allowed programs) */
    allowedDestinations: string[];
    /** Unix timestamp when this authority expires */
    expiresAt: number;
    /** Max amount this agent can re-delegate to sub-agents */
    maxRedelegation: bigint;
    /** Maximum depth of delegation chain from this point */
    maxDelegationDepth: number;
    /** Max single transaction size */
    maxTransactionSize: bigint;
    /** Rate limit: max transactions per window */
    rateLimit: {
        maxTransactions: number;
        windowMs: number;
    };
}
export type PolicyOverrides = Partial<SpendingPolicy>;
export type AuthorityStatus = 'active' | 'exhausted' | 'expired' | 'revoked';
export interface SpendingAuthority {
    /** Unique identifier for this authority */
    id: string;
    /** Chain this authority is scoped to */
    chain: string;
    /** Public key of the wallet that created this authority */
    grantor: string;
    /** Public key of the agent receiving this authority */
    grantee: string;
    /** The spending policy */
    policy: SpendingPolicy;
    /** How much has been spent under this authority */
    spent: bigint;
    /** How much has been delegated to sub-agents */
    delegated: bigint;
    /** Number of transactions executed */
    transactionCount: number;
    /** Transaction timestamps within current rate window */
    recentTransactions: number[];
    /** Parent authority ID (null if root) */
    parentAuthorityId: string | null;
    /** Depth in the delegation chain (0 = root) */
    depth: number;
    /** Current status */
    status: AuthorityStatus;
    /** Cryptographic signature from the grantor proving this delegation */
    grantorSignature: string;
    /** When this authority was created */
    createdAt: number;
    /** Child authority IDs */
    childAuthorities: string[];
}
export interface PermissionRequest {
    /** Who is requesting */
    requesterId: string;
    requesterPubkey: string;
    /** What they need */
    description: string;
    /** Requested policy (agent says what it wants) */
    requestedPolicy: PolicyOverrides;
    /** Why they need it — context for the orchestrator to evaluate */
    justification: string;
    /** Priority level */
    priority: 'low' | 'medium' | 'high' | 'critical';
    /** Timestamp */
    requestedAt: number;
}
export type NegotiationResult = {
    outcome: 'granted';
    authority: SpendingAuthority;
} | {
    outcome: 'counter_offer';
    adjustedPolicy: SpendingPolicy;
    reason: string;
} | {
    outcome: 'denied';
    reason: string;
};
export interface TransactionIntent {
    /** The authority being used */
    authorityId: string;
    /** Target program */
    programId: string;
    /** Destination address (for transfers) */
    destination?: string;
    /** Amount in token smallest units */
    amount: bigint;
    /** Raw transaction bytes to sign (for actual signing) */
    transactionBytes?: Buffer;
    /** Human-readable description */
    description: string;
}
export type ValidationResult = {
    valid: true;
    remainingBudget: bigint;
    warningLevel: 'none' | 'low' | 'high';
} | {
    valid: false;
    reason: string;
    code: ValidationErrorCode;
};
export declare enum ValidationErrorCode {
    AUTHORITY_EXPIRED = "AUTHORITY_EXPIRED",
    AUTHORITY_REVOKED = "AUTHORITY_REVOKED",
    AUTHORITY_EXHAUSTED = "AUTHORITY_EXHAUSTED",
    EXCEEDS_SPENDING_LIMIT = "EXCEEDS_SPENDING_LIMIT",
    EXCEEDS_TRANSACTION_LIMIT = "EXCEEDS_TRANSACTION_LIMIT",
    PROGRAM_NOT_ALLOWED = "PROGRAM_NOT_ALLOWED",
    DESTINATION_NOT_ALLOWED = "DESTINATION_NOT_ALLOWED",
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
    INVALID_SIGNATURE = "INVALID_SIGNATURE",
    DELEGATION_DEPTH_EXCEEDED = "DELEGATION_DEPTH_EXCEEDED",
    INSUFFICIENT_DELEGATION_BUDGET = "INSUFFICIENT_DELEGATION_BUDGET"
}
export type AuditEventType = 'authority_created' | 'authority_delegated' | 'spend_approved' | 'spend_rejected' | 'authority_revoked' | 'authority_expired' | 'authority_exhausted' | 'rate_limit_hit' | 'permission_requested' | 'permission_negotiated';
export interface AuditEvent {
    id: string;
    timestamp: number;
    eventType: AuditEventType;
    authorityId: string;
    agentId: string;
    details: Record<string, unknown>;
    /** Remaining budget after this event */
    remainingBudget?: bigint;
    /** Chain of authority IDs from root to this event */
    delegationPath: string[];
}
export interface AgentIdentity {
    /** Unique agent ID */
    id: string;
    /** Display name */
    name: string;
    /** Agent's public key (derived from OWS or standalone) */
    pubkey: string;
    /** What this agent does */
    role: string;
    /** Trust score based on audit history (0-100) */
    trustScore: number;
    /** Total successful spends */
    totalSpends: number;
    /** Total rejected attempts */
    totalRejections: number;
}
export type AuthorityEventHandler = (event: AuditEvent) => void | Promise<void>;
export interface AuthorityEventEmitter {
    on(event: AuditEventType, handler: AuthorityEventHandler): void;
    off(event: AuditEventType, handler: AuthorityEventHandler): void;
    emit(event: AuditEvent): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map