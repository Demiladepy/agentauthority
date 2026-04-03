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
import {
  AuthorityManager,
  SigningProvider,
  Ed25519Signer,
} from '../core/authority-manager';
import { X402Handler, X402PaymentRequired } from '../x402/handler';
import {
  SpendingAuthority,
  SpendingPolicy,
  TransactionIntent,
  PermissionRequest,
  AgentIdentity,
  AuditEvent,
} from '../core/types';

// ============================================================
// TASK TYPES
// ============================================================

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

// ============================================================
// AUTONOMOUS AGENT
// ============================================================

export class AutonomousAgent {
  readonly identity: AgentIdentity;
  readonly signer: SigningProvider;
  private engine: PolicyEngine;
  private manager: AuthorityManager;
  private x402: X402Handler;
  private currentAuthority: SpendingAuthority | null = null;
  private taskHistory: Array<{ task: string; result: TaskResult; timestamp: number }> = [];
  private log: (level: 'info' | 'warn' | 'error', msg: string, data?: Record<string, unknown>) => void;

  constructor(config: AgentConfig) {
    this.identity = config.identity;
    this.signer = config.signer ?? new Ed25519Signer();
    this.engine = config.engine;
    this.manager = config.manager;
    this.x402 = config.x402Handler;
    this.log = config.onLog ?? ((level, msg, data) => {
      const prefix = `[${this.identity.name}]`;
      if (data) {
        console.log(`${prefix} [${level.toUpperCase()}] ${msg}`, data);
      } else {
        console.log(`${prefix} [${level.toUpperCase()}] ${msg}`);
      }
    });

    // Register with the authority manager
    this.manager.registerAgent(this.identity, this.signer);
  }

  // -------------------------------------------------------
  // Authority Management
  // -------------------------------------------------------

  setAuthority(authority: SpendingAuthority): void {
    this.currentAuthority = authority;
    this.log('info', `Received spending authority: ${authority.id}`, {
      maxSpend: authority.policy.maxSpend.toString(),
      expiresAt: new Date(authority.policy.expiresAt).toISOString(),
      allowedPrograms: authority.policy.allowedPrograms,
      depth: authority.depth,
    });
  }

  getAuthority(): SpendingAuthority | null {
    return this.currentAuthority;
  }

  getBudgetStatus(): {
    remaining: bigint;
    spent: bigint;
    utilization: number;
    timeRemainingMs: number;
    canDelegate: bigint;
  } | null {
    if (!this.currentAuthority) return null;
    const stats = this.engine.getAuthorityStats(this.currentAuthority.id);
    if (!stats) return null;

    return {
      remaining: BigInt(stats.remaining),
      spent: BigInt(stats.spent),
      utilization: stats.utilization,
      timeRemainingMs: stats.timeRemaining,
      canDelegate: this.currentAuthority.policy.maxRedelegation - this.currentAuthority.delegated,
    };
  }

  // -------------------------------------------------------
  // Spending — The core action
  // -------------------------------------------------------

  async spend(intent: Omit<TransactionIntent, 'authorityId'>): Promise<{
    success: boolean;
    remainingBudget?: bigint;
    error?: string;
  }> {
    if (!this.currentAuthority) {
      return { success: false, error: 'No spending authority assigned' };
    }

    const fullIntent: TransactionIntent = {
      ...intent,
      authorityId: this.currentAuthority.id,
    };

    const result = this.engine.validate(fullIntent);

    if (result.valid) {
      this.log('info', `Spend approved: ${intent.amount} for "${intent.description}"`, {
        remaining: result.remainingBudget.toString(),
        warning: result.warningLevel,
      });

      if (result.warningLevel === 'high') {
        this.log('warn', `Budget critically low: ${result.remainingBudget} remaining`);
      }

      return { success: true, remainingBudget: result.remainingBudget };
    } else {
      this.log('warn', `Spend rejected: ${result.reason}`, {
        attemptedAmount: intent.amount.toString(),
        code: result.code,
      });

      // Update trust score on rejection
      this.identity.totalRejections += 1;

      return { success: false, error: result.reason };
    }
  }

  // -------------------------------------------------------
  // x402 Payment — Auto-pay with policy check
  // -------------------------------------------------------

  async payX402(paymentRequest: X402PaymentRequired): Promise<{
    paid: boolean;
    signature?: string;
    remaining?: bigint;
    error?: string;
  }> {
    if (!this.currentAuthority) {
      return { paid: false, error: 'No spending authority' };
    }

    this.log('info', `x402 payment request: ${paymentRequest.amount} for ${paymentRequest.url}`);

    // Dry run first
    const preview = this.x402.dryRun(
      this.currentAuthority.id,
      paymentRequest.amount,
      paymentRequest.facilitatorProgram
    );

    if (!preview.wouldSucceed) {
      this.log('warn', `x402 payment would fail: ${preview.reason}`);
      return { paid: false, error: preview.reason };
    }

    const result = await this.x402.handlePaymentRequired(
      this.currentAuthority.id,
      paymentRequest
    );

    if (result.authorized) {
      this.identity.totalSpends += 1;
      // Improve trust score on successful spend
      this.identity.trustScore = Math.min(100, this.identity.trustScore + 1);

      this.log('info', `x402 payment successful`, {
        signature: result.transactionSignature,
        remaining: result.remainingBudget?.toString(),
      });

      return {
        paid: true,
        signature: result.transactionSignature,
        remaining: result.remainingBudget,
      };
    } else {
      this.identity.totalRejections += 1;
      return { paid: false, error: result.rejectionReason };
    }
  }

  // -------------------------------------------------------
  // Delegation — Hire a sub-agent
  // -------------------------------------------------------

  async delegateTo(
    childAgent: AutonomousAgent,
    amount: bigint,
    policyOverrides: Partial<SpendingPolicy> = {}
  ): Promise<SpendingAuthority> {
    if (!this.currentAuthority) {
      throw new Error('Cannot delegate without an active authority');
    }

    this.log('info', `Delegating ${amount} to ${childAgent.identity.name}`);

    const childAuthority = await this.manager.delegate(
      this.currentAuthority.id,
      this.identity.id,
      childAgent.identity.id,
      amount,
      policyOverrides
    );

    childAgent.setAuthority(childAuthority);

    this.log('info', `Delegation successful`, {
      childAuthorityId: childAuthority.id,
      amount: amount.toString(),
      remainingDelegation: (this.currentAuthority.policy.maxRedelegation - this.currentAuthority.delegated).toString(),
    });

    return childAuthority;
  }

  // -------------------------------------------------------
  // Permission Negotiation — Ask parent for authority
  // -------------------------------------------------------

  async requestPermission(
    orchestratorAuthorityId: string,
    orchestratorAgentId: string,
    request: Omit<PermissionRequest, 'requesterId' | 'requesterPubkey' | 'requestedAt'>
  ): Promise<{ granted: boolean; authority?: SpendingAuthority; counterOffer?: SpendingPolicy; reason?: string }> {
    
    this.log('info', `Requesting permission: "${request.description}"`, {
      requestedAmount: request.requestedPolicy.maxSpend?.toString(),
      priority: request.priority,
    });

    const fullRequest: PermissionRequest = {
      ...request,
      requesterId: this.identity.id,
      requesterPubkey: this.signer.getPublicKey(),
      requestedAt: Date.now(),
    };

    const result = await this.manager.negotiatePermission(
      orchestratorAuthorityId,
      orchestratorAgentId,
      fullRequest
    );

    switch (result.outcome) {
      case 'granted':
        this.setAuthority(result.authority);
        this.log('info', `Permission granted!`);
        return { granted: true, authority: result.authority };

      case 'counter_offer':
        this.log('info', `Counter-offer received: ${result.reason}`, {
          offeredAmount: result.adjustedPolicy.maxSpend.toString(),
        });
        return { granted: false, counterOffer: result.adjustedPolicy, reason: result.reason };

      case 'denied':
        this.log('warn', `Permission denied: ${result.reason}`);
        return { granted: false, reason: result.reason };
    }
  }

  // -------------------------------------------------------
  // Task Execution — High-level work
  // -------------------------------------------------------

  async executeTask(task: AgentTask): Promise<TaskResult> {
    this.log('info', `Starting task: "${task.description}"`, {
      estimatedCost: task.estimatedCost.toString(),
    });

    // Pre-check: do we have enough budget?
    const budget = this.getBudgetStatus();
    if (!budget) {
      const result: TaskResult = {
        success: false,
        output: null,
        actualCost: 0n,
        transactionSignatures: [],
        error: 'No active authority',
      };
      this.taskHistory.push({ task: task.description, result, timestamp: Date.now() });
      return result;
    }

    if (task.estimatedCost > budget.remaining) {
      this.log('warn', `Insufficient budget for task. Need ${task.estimatedCost}, have ${budget.remaining}`);
      const result: TaskResult = {
        success: false,
        output: null,
        actualCost: 0n,
        transactionSignatures: [],
        error: `Insufficient budget: need ${task.estimatedCost}, have ${budget.remaining}`,
      };
      this.taskHistory.push({ task: task.description, result, timestamp: Date.now() });
      return result;
    }

    try {
      const result = await task.execute(this);
      this.taskHistory.push({ task: task.description, result, timestamp: Date.now() });

      if (result.success) {
        this.log('info', `Task completed: "${task.description}"`, {
          actualCost: result.actualCost.toString(),
        });
      } else {
        this.log('error', `Task failed: "${task.description}" — ${result.error}`);
      }

      return result;
    } catch (err) {
      const result: TaskResult = {
        success: false,
        output: null,
        actualCost: 0n,
        transactionSignatures: [],
        error: err instanceof Error ? err.message : String(err),
      };
      this.taskHistory.push({ task: task.description, result, timestamp: Date.now() });
      return result;
    }
  }

  // -------------------------------------------------------
  // Introspection
  // -------------------------------------------------------

  getTaskHistory(): Array<{ task: string; result: TaskResult; timestamp: number }> {
    return [...this.taskHistory];
  }

  getPaymentAnalytics() {
    if (!this.currentAuthority) return null;
    return this.x402.getPaymentAnalytics(this.currentAuthority.id);
  }

  toString(): string {
    const budget = this.getBudgetStatus();
    return [
      `Agent: ${this.identity.name} (${this.identity.role})`,
      `  Pubkey: ${this.signer.getPublicKey().slice(0, 12)}...`,
      `  Trust Score: ${this.identity.trustScore}`,
      budget ? [
        `  Budget: ${budget.spent}/${BigInt(budget.spent) + budget.remaining} spent (${budget.utilization}%)`,
        `  Can Delegate: ${budget.canDelegate}`,
        `  Time Remaining: ${Math.round(budget.timeRemainingMs / 1000)}s`,
      ].join('\n') : '  No active authority',
    ].join('\n');
  }
}
