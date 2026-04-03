/**
 * Reputation Engine Types
 *
 * Behavioral metrics, trust tiers, and reputation reports.
 */

import { SpendingPolicy } from '../core/types';

// ============================================================
// AGENT BEHAVIORAL METRICS
// ============================================================

export interface AgentMetrics {
  agentId: string;

  // Core behavioral signals (EMA-smoothed, 0-1)
  successRate: number;
  averageSpendEfficiency: number;
  delegationReliability: number;
  timeConsistency: number;
  counterpartyDiversity: number;

  ageMs: number;
  totalVolumeProcessed: bigint;

  // Raw counters
  approvedCount: number;
  rejectedCount: number;
  delegationCount: number;
  delegationSuccesses: number;

  lastActivityAt: number;
  registeredAt: number;

  recentTransactionTimes: number[];
  recentPrograms: string[];
}

// ============================================================
// TRUST TIERS
// ============================================================

export type TrustTier =
  | 'Probationary'
  | 'Limited'
  | 'Standard'
  | 'Trusted'
  | 'Sovereign';

export interface TierLimits {
  tier: TrustTier;
  minScore: number;
  maxScore: number;
  maxDailySpend: bigint;
  maxTxSize: bigint;
  maxDelegationDepth: number;
  maxTxPerMin: number;
}

export interface ScoreDataPoint {
  timestamp: number;
  score: number;
  tier: TrustTier;
}

export interface ReputationReport {
  agentId: string;
  agentName: string;
  currentScore: number;
  currentTier: TrustTier;
  metrics: AgentMetrics;
  scoreHistory: ScoreDataPoint[];
  recommendedPolicy: {
    maxDailySpend: bigint;
    maxTxSize: bigint;
    maxDelegationDepth: number;
    maxTxPerMin: number;
  };
  tierLimits: TierLimits;
  lastUpdated: number;
}