/**
 * Autonomous Agent — The agentic runtime
 *
 * This is the agent abstraction that developers use.
 * An agent has an identity, a spending authority, and can:
 * - Execute tasks that require spending
 * - Request permissions from parent agents
 * - Delegate sub-tasks to child agents
 * - Make autonomous decisions within its policy bounds
 * - Handle x402 payments automatically
 */
import { PolicyEngine } from '../core/policy-engine';
import { AuthorityManager, SigningProvider } from '../core/authority-manager';
import { X402Handler, X402PaymentRequired } from '../x402/handler';
import { SpendingAuthority, SpendingPolicy, TransactionIntent, PermissionRequest, AgentIdentity } from '../core/types';
export interface AgentTask {
    id: string;
    description: string;
    /** Estimated cost for this task */
    estimatedCost: bigint;
    /** Program IDs this task will interact with */
    requiredPrograms: string[];
    /** Priority */
    priority: 'low' | 'medium' | 'high' | 'critical';
    /** The actual work */
    execute: (agent: AutonomousAgent) => Promise<TaskResult>;
}
export interface TaskResult {
    success: boolean;
    output: unknown;
    actualCost: bigint;
    transactionSignatures: string[];
    error?: string;
}
export interface AgentConfig {
    identity: AgentIdentity;
    signer?: SigningProvider;
    engine: PolicyEngine;
    manager: AuthorityManager;
    x402Handler: X402Handler;
    /** Called when the agent needs to log something */
    onLog?: (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => void;
}
export declare class AutonomousAgent {
    readonly identity: AgentIdentity;
    readonly signer: SigningProvider;
    private engine;
    private manager;
    private x402;
    private currentAuthority;
    private taskHistory;
    private log;
    constructor(config: AgentConfig);
    setAuthority(authority: SpendingAuthority): void;
    getAuthority(): SpendingAuthority | null;
    getBudgetStatus(): {
        remaining: bigint;
        spent: bigint;
        utilization: number;
        timeRemainingMs: number;
        canDelegate: bigint;
    } | null;
    spend(intent: Omit<TransactionIntent, 'authorityId'>): Promise<{
        success: boolean;
        remainingBudget?: bigint;
        error?: string;
    }>;
    payX402(paymentRequest: X402PaymentRequired): Promise<{
        paid: boolean;
        signature?: string;
        remaining?: bigint;
        error?: string;
    }>;
    delegateTo(childAgent: AutonomousAgent, amount: bigint, policyOverrides?: Partial<SpendingPolicy>): Promise<SpendingAuthority>;
    requestPermission(orchestratorAuthorityId: string, orchestratorAgentId: string, request: Omit<PermissionRequest, 'requesterId' | 'requesterPubkey' | 'requestedAt'>): Promise<{
        granted: boolean;
        authority?: SpendingAuthority;
        counterOffer?: SpendingPolicy;
        reason?: string;
    }>;
    executeTask(task: AgentTask): Promise<TaskResult>;
    getTaskHistory(): Array<{
        task: string;
        result: TaskResult;
        timestamp: number;
    }>;
    getPaymentAnalytics(): {
        totalPayments: number;
        totalSpent: bigint;
        approvedCount: number;
        rejectedCount: number;
        uniqueEndpoints: number;
        averagePayment: bigint;
    } | null;
    toString(): string;
}
//# sourceMappingURL=autonomous-agent.d.ts.map