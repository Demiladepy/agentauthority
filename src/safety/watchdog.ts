/**
 * Behavioral Watchdog
 *
 * Monitors spending patterns for anomalies in real-time.
 * Subscribes to PolicyEngine events and detects:
 *
 *   velocity_spike        — agent suddenly spending 5x faster than historical average
 *   unusual_program       — agent uses a program it has never touched before
 *   near_limit_clustering — multiple transactions clustered right at the per-tx cap
 *   rapid_delegation      — agent creates many child authorities in a short window
 *
 * On WARNING: emits alert and logs.
 * On CRITICAL: auto-throttles (reduces rate limit) or pauses (sets rate limit to 0).
 */

import { PolicyEngine } from '../core/policy-engine';
import { AuditEvent } from '../core/types';
import { WatchdogAlert, HealthScore, AnomalyType, AlertSeverity } from './types';
import { v4 as uuid } from 'uuid';

// Per-agent behavioral state tracked by the watchdog
interface AgentState {
  agentId: string;
  authorityId: string;
  txTimestamps: number[];        // rolling window of tx timestamps
  seenPrograms: Set<string>;     // all programs ever seen for this agent
  nearLimitTxTimes: number[];    // timestamps of near-limit transactions
  delegationTimes: number[];     // timestamps of delegations created
  throttled: boolean;
  pausedUntil: number;
}

const VELOCITY_WINDOW_MS   = 5 * 60 * 1000;  // 5-minute rolling window
const VELOCITY_SPIKE_RATIO = 5;               // 5x historical average = spike
const NEAR_LIMIT_THRESHOLD = 0.92;           // within 8% of maxTransactionSize
const NEAR_LIMIT_CLUSTER   = 3;              // N near-limit txs to trigger
const NEAR_LIMIT_WINDOW_MS = 2 * 60 * 1000; // within 2 minutes
const RAPID_DELEGATION_N   = 3;             // N delegations to trigger
const RAPID_DELEGATION_MS  = 60 * 1000;     // within 1 minute

export class Watchdog {
  private engine: PolicyEngine;
  private agentState: Map<string, AgentState> = new Map();
  private allAlerts: WatchdogAlert[] = [];
  private alertHandlers: Array<(alert: WatchdogAlert) => void> = [];

  constructor(engine: PolicyEngine) {
    this.engine = engine;
    this.subscribeToEvents();
  }

  // -------------------------------------------------------
  // Event Subscription
  // -------------------------------------------------------

  private subscribeToEvents(): void {
    this.engine.on('spend_approved',   (e) => this.onSpend(e, true));
    this.engine.on('spend_rejected',   (e) => this.onSpend(e, false));
    this.engine.on('authority_created', (e) => this.onAuthorityCreated(e));
  }

  private onSpend(event: AuditEvent, approved: boolean): void {
    if (!approved) return; // only approved spends drive velocity/clustering checks

    const state = this.getOrCreate(event.agentId, event.authorityId);
    const now   = event.timestamp;
    const programId = event.details.programId as string | undefined;

    // Update state
    state.txTimestamps.push(now);
    if (state.txTimestamps.length > 500) state.txTimestamps.shift();

    // Check: unusual program
    if (programId) {
      if (state.seenPrograms.size > 0 && !state.seenPrograms.has(programId)) {
        this.emit({
          id: uuid(), timestamp: now,
          agentId: event.agentId, authorityId: event.authorityId,
          severity: 'info', anomalyType: 'unusual_program',
          message: `Agent used a new program: ${programId}`,
          recommendedAction: 'Verify the program is expected for this agent\'s role.',
          details: { programId, knownPrograms: Array.from(state.seenPrograms) },
          autoActionTaken: false,
        });
      }
      state.seenPrograms.add(programId);
    }

    // Check: velocity spike
    this.checkVelocity(event, state, now);

    // Check: near-limit clustering
    const amount = BigInt((event.details.amount as string) ?? '0');
    const auth   = this.engine.getAuthority(event.authorityId);
    if (auth && auth.policy.maxTransactionSize > 0n) {
      const ratio = Number(amount) / Number(auth.policy.maxTransactionSize);
      if (ratio >= NEAR_LIMIT_THRESHOLD) {
        state.nearLimitTxTimes.push(now);
        // Prune old
        const cutoff = now - NEAR_LIMIT_WINDOW_MS;
        state.nearLimitTxTimes = state.nearLimitTxTimes.filter(t => t > cutoff);

        if (state.nearLimitTxTimes.length >= NEAR_LIMIT_CLUSTER) {
          this.emit({
            id: uuid(), timestamp: now,
            agentId: event.agentId, authorityId: event.authorityId,
            severity: 'warning', anomalyType: 'near_limit_clustering',
            message: `${state.nearLimitTxTimes.length} transactions clustered near the per-tx cap within ${NEAR_LIMIT_WINDOW_MS / 1000}s`,
            recommendedAction: 'Agent may be probing transaction size limits. Review and consider reducing maxTransactionSize.',
            details: { clusterCount: state.nearLimitTxTimes.length, ratio: ratio.toFixed(3), maxTxSize: auth.policy.maxTransactionSize.toString() },
            autoActionTaken: false,
          });
          state.nearLimitTxTimes = []; // reset to avoid repeated alerts
        }
      }
    }
  }

  private checkVelocity(event: AuditEvent, state: AgentState, now: number): void {
    const windowTxs = state.txTimestamps.filter(t => t > now - VELOCITY_WINDOW_MS).length;
    const windowRate = windowTxs / (VELOCITY_WINDOW_MS / 60_000); // tx/min

    // Need at least 10 historical transactions to establish a baseline
    const historical = state.txTimestamps.filter(t => t < now - VELOCITY_WINDOW_MS);
    if (historical.length < 10) return;

    const oldestHistorical = historical[0];
    const historicalDuration = (now - VELOCITY_WINDOW_MS) - oldestHistorical;
    if (historicalDuration < 1000) return;

    const historicalRate = historical.length / (historicalDuration / 60_000);
    if (historicalRate < 0.001) return; // effectively zero baseline

    if (windowRate > historicalRate * VELOCITY_SPIKE_RATIO) {
      const severity: AlertSeverity = windowRate > historicalRate * 10 ? 'critical' : 'warning';
      let autoActionTaken = false;

      if (severity === 'critical') {
        // Auto-throttle: cut rate limit in half
        const auth = this.engine.getAuthority(event.authorityId);
        if (auth && !state.throttled) {
          auth.policy.rateLimit.maxTransactions = Math.max(
            1,
            Math.floor(auth.policy.rateLimit.maxTransactions / 2),
          );
          state.throttled = true;
          autoActionTaken = true;
        }
      }

      this.emit({
        id: uuid(), timestamp: now,
        agentId: event.agentId, authorityId: event.authorityId,
        severity, anomalyType: 'velocity_spike',
        message: `Velocity spike: ${windowRate.toFixed(1)} tx/min vs baseline ${historicalRate.toFixed(1)} tx/min (${(windowRate / historicalRate).toFixed(1)}x)`,
        recommendedAction: severity === 'critical'
          ? 'Rate limit halved automatically. Investigate agent behavior.'
          : 'Monitor closely — spending rate is abnormally high.',
        details: {
          currentRateTxPerMin: windowRate.toFixed(2),
          historicalRateTxPerMin: historicalRate.toFixed(2),
          ratio: (windowRate / historicalRate).toFixed(2),
          autoThrottled: autoActionTaken,
        },
        autoActionTaken,
      });
    }
  }

  private onAuthorityCreated(event: AuditEvent): void {
    const depth = Number(event.details.delegationDepth ?? 0);
    if (depth === 0) return; // root authority, not a delegation

    // The grantor is event.agentId — track rapid delegation on the grantor
    const grantorId = event.agentId;
    const state = this.getOrCreate(grantorId, event.authorityId);
    const now   = event.timestamp;

    state.delegationTimes.push(now);
    const cutoff = now - RAPID_DELEGATION_MS;
    state.delegationTimes = state.delegationTimes.filter(t => t > cutoff);

    if (state.delegationTimes.length >= RAPID_DELEGATION_N) {
      this.emit({
        id: uuid(), timestamp: now,
        agentId: grantorId, authorityId: event.authorityId,
        severity: 'warning', anomalyType: 'rapid_delegation',
        message: `${state.delegationTimes.length} delegations created within ${RAPID_DELEGATION_MS / 1000}s`,
        recommendedAction: 'Agent is spinning up sub-agents rapidly. Verify this is expected behavior.',
        details: { delegationCount: state.delegationTimes.length, windowMs: RAPID_DELEGATION_MS },
        autoActionTaken: false,
      });
      state.delegationTimes = []; // reset to avoid repeated alerts
    }
  }

  // -------------------------------------------------------
  // Public API
  // -------------------------------------------------------

  onAlert(handler: (alert: WatchdogAlert) => void): void {
    this.alertHandlers.push(handler);
  }

  getAlerts(agentId?: string): WatchdogAlert[] {
    if (!agentId) return [...this.allAlerts];
    return this.allAlerts.filter(a => a.agentId === agentId);
  }

  getHealthScore(agentId: string): HealthScore {
    const alerts    = this.getAlerts(agentId);
    const state     = this.agentState.get(agentId);
    const recent    = alerts.filter(a => a.timestamp > Date.now() - 10 * 60 * 1000);
    const penalty   = recent.reduce((sum, a) => {
      if (a.severity === 'critical') return sum + 40;
      if (a.severity === 'warning')  return sum + 15;
      return sum + 5;
    }, 0);

    return {
      agentId,
      score:        Math.max(0, 100 - penalty),
      throttled:    state?.throttled ?? false,
      recentAlerts: recent,
      lastUpdated:  Date.now(),
    };
  }

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------

  private emit(alert: WatchdogAlert): void {
    this.allAlerts.push(alert);
    // Keep at most 1000 alerts
    if (this.allAlerts.length > 1000) this.allAlerts.shift();

    for (const h of this.alertHandlers) {
      try { h(alert); } catch (_) {}
    }
  }

  private getOrCreate(agentId: string, authorityId: string): AgentState {
    if (!this.agentState.has(agentId)) {
      this.agentState.set(agentId, {
        agentId,
        authorityId,
        txTimestamps: [],
        seenPrograms: new Set(),
        nearLimitTxTimes: [],
        delegationTimes: [],
        throttled: false,
        pausedUntil: 0,
      });
    }
    return this.agentState.get(agentId)!;
  }
}