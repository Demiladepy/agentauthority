/**
 * Safety Module Types
 *
 * Types for the Watchdog (anomaly detection) and Dead Man's Switch
 * (heartbeat-based authority auto-revocation).
 */

// ============================================================
// WATCHDOG
// ============================================================

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AnomalyType =
  | 'velocity_spike'
  | 'unusual_program'
  | 'near_limit_clustering'
  | 'rapid_delegation';

export interface WatchdogAlert {
  id: string;
  timestamp: number;
  agentId: string;
  authorityId: string;
  severity: AlertSeverity;
  anomalyType: AnomalyType;
  message: string;
  recommendedAction: string;
  details: Record<string, unknown>;
  /** Whether auto-action was taken (throttle / revoke) */
  autoActionTaken: boolean;
}

export interface HealthScore {
  agentId: string;
  /** 0–100, 100 = perfectly healthy */
  score: number;
  throttled: boolean;
  recentAlerts: WatchdogAlert[];
  lastUpdated: number;
}

// ============================================================
// DEAD MAN'S SWITCH
// ============================================================

export interface DeadMansSwitchConfig {
  /** How often the timer checks for missed heartbeats (ms). Default 60_000 */
  checkIntervalMs: number;
  /** Address to sweep remaining funds to on trigger */
  recoveryWallet: string;
  /** Default heartbeat interval if agent doesn't specify (ms). Default 300_000 */
  defaultHeartbeatIntervalMs: number;
}

export interface AgentRegistration {
  agentId: string;
  authorityId: string;
  /** Expected heartbeat frequency in ms */
  heartbeatIntervalMs: number;
  lastHeartbeat: number;
  registeredAt: number;
  triggered: boolean;
}

export interface SwitchStatus {
  agentId: string;
  authorityId: string;
  lastHeartbeat: number;
  heartbeatIntervalMs: number;
  /** ms until auto-revoke fires (negative = already overdue) */
  msUntilTrigger: number;
  triggered: boolean;
}