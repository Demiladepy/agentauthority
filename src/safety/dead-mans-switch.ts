/**
 * Dead Man's Switch
 *
 * Agents must periodically call heartbeat(agentId) or their spending
 * authority is automatically revoked. When triggered, remaining budget
 * can be swept to a recovery wallet.
 *
 * This prevents rogue, crashed, or compromised agents from holding
 * live spending authority indefinitely.
 */

import { PolicyEngine } from '../core/policy-engine';
import { TransactionIntent } from '../core/types';
import {
  DeadMansSwitchConfig,
  AgentRegistration,
  SwitchStatus,
} from './types';
import { v4 as uuid } from 'uuid';

type TriggerHandler = (agentId: string, authorityId: string, recoveryWallet: string) => void;

export class DeadMansSwitch {
  private engine: PolicyEngine;
  private config: DeadMansSwitchConfig;
  private registrations: Map<string, AgentRegistration> = new Map();
  private timer: ReturnType<typeof setInterval> | null = null;
  private triggerHandlers: TriggerHandler[] = [];
  private triggerLog: Array<{ agentId: string; authorityId: string; timestamp: number }> = [];

  constructor(engine: PolicyEngine, config: Partial<DeadMansSwitchConfig> = {}) {
    this.engine = engine;
    this.config = {
      checkIntervalMs:         config.checkIntervalMs         ?? 60_000,
      recoveryWallet:          config.recoveryWallet          ?? 'RECOVERY_WALLET_NOT_SET',
      defaultHeartbeatIntervalMs: config.defaultHeartbeatIntervalMs ?? 300_000,
    };

    this.timer = setInterval(() => this.check(), this.config.checkIntervalMs);
    // Allow Node to exit even if timer is active
    if (this.timer.unref) this.timer.unref();
  }

  // -------------------------------------------------------
  // Registration
  // -------------------------------------------------------

  /**
   * Register an agent with the dead man's switch.
   * The agent MUST call heartbeat(agentId) within heartbeatIntervalMs
   * or their authority will be revoked.
   */
  register(
    agentId: string,
    authorityId: string,
    heartbeatIntervalMs?: number,
  ): void {
    this.registrations.set(agentId, {
      agentId,
      authorityId,
      heartbeatIntervalMs: heartbeatIntervalMs ?? this.config.defaultHeartbeatIntervalMs,
      lastHeartbeat: Date.now(),
      registeredAt: Date.now(),
      triggered: false,
    });
  }

  /**
   * Agent check-in. Must be called within heartbeatIntervalMs to stay alive.
   */
  heartbeat(agentId: string): void {
    const reg = this.registrations.get(agentId);
    if (reg && !reg.triggered) {
      reg.lastHeartbeat = Date.now();
    }
  }

  // -------------------------------------------------------
  // Timer Check
  // -------------------------------------------------------

  private check(): void {
    const now = Date.now();
    for (const [agentId, reg] of this.registrations) {
      if (reg.triggered) continue;

      const deadline = reg.lastHeartbeat + reg.heartbeatIntervalMs * 2;
      if (now > deadline) {
        this.trigger(agentId, reg);
      }
    }
  }

  private trigger(agentId: string, reg: AgentRegistration): void {
    reg.triggered = true;
    const now = Date.now();

    console.warn(
      `[DeadMansSwitch] ⚠ TRIGGERED for agent ${agentId} ` +
      `(authority ${reg.authorityId.slice(0, 8)}...). ` +
      `Last heartbeat: ${new Date(reg.lastHeartbeat).toISOString()}`
    );

    // Revoke the authority
    this.engine.revoke(reg.authorityId, `Dead man's switch triggered — agent ${agentId} missed heartbeat`);

    // Attempt fund sweep intent
    const auth = this.engine.getAuthority(reg.authorityId);
    if (auth && auth.policy.maxSpend - auth.spent > 0n) {
      const sweepIntent: TransactionIntent = {
        authorityId: reg.authorityId,
        programId:   auth.policy.allowedPrograms[0] ?? 'TOKEN_PROGRAM',
        destination: this.config.recoveryWallet,
        amount:      auth.policy.maxSpend - auth.spent - auth.delegated,
        description: `Dead man's switch fund sweep → ${this.config.recoveryWallet}`,
      };
      // The authority is already revoked so this validate will fail —
      // but we emit a record of the intent for the audit trail
      this.engine.validate(sweepIntent);
    }

    this.triggerLog.push({ agentId, authorityId: reg.authorityId, timestamp: now });

    // Notify handlers
    for (const h of this.triggerHandlers) {
      try {
        h(agentId, reg.authorityId, this.config.recoveryWallet);
      } catch (_) { /* never let a handler crash the timer */ }
    }
  }

  // -------------------------------------------------------
  // Public API
  // -------------------------------------------------------

  onTrigger(handler: TriggerHandler): void {
    this.triggerHandlers.push(handler);
  }

  getStatus(): SwitchStatus[] {
    const now = Date.now();
    return Array.from(this.registrations.values()).map(reg => ({
      agentId:              reg.agentId,
      authorityId:          reg.authorityId,
      lastHeartbeat:        reg.lastHeartbeat,
      heartbeatIntervalMs:  reg.heartbeatIntervalMs,
      msUntilTrigger:       (reg.lastHeartbeat + reg.heartbeatIntervalMs * 2) - now,
      triggered:            reg.triggered,
    }));
  }

  getTriggerLog(): Array<{ agentId: string; authorityId: string; timestamp: number }> {
    return [...this.triggerLog];
  }

  shutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}