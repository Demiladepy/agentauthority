/**
 * Reputation Engine — Dynamic Trust Scoring
 *
 * Agents earn trust through behavior. Every approved spend, rejected attempt,
 * and delegation outcome feeds into a composite score (0-100) that determines
 * what spending limits an agent can receive.
 *
 * Score is updated in real-time by subscribing to PolicyEngine events.
 * All metrics use Exponential Moving Averages so recent behavior matters more.
 */

import { PolicyEngine } from '../core/policy-engine';
import { AuditEvent, SpendingPolicy, AgentIdentity } from '../core/types';
import {
  AgentMetrics,
  TrustTier,
  TierLimits,
  ScoreDataPoint,
  ReputationReport,
} from './types';

// ============================================================
// TIER DEFINITIONS
// ============================================================

const USDC = (n: number): bigint => BigInt(Math.round(n * 1_000_000));

export const TIER_TABLE: TierLimits[] = [
  { tier: 'Probationary', minScore:  0, maxScore: 20,  maxDailySpend: USDC(5),    maxTxSize: USDC(1),    maxDelegationDepth: 0, maxTxPerMin: 5   },
  { tier: 'Limited',      minScore: 21, maxScore: 40,  maxDailySpend: USDC(50),   maxTxSize: USDC(10),   maxDelegationDepth: 1, maxTxPerMin: 10  },
  { tier: 'Standard',     minScore: 41, maxScore: 60,  maxDailySpend: USDC(200),  maxTxSize: USDC(50),   maxDelegationDepth: 2, maxTxPerMin: 20  },
  { tier: 'Trusted',      minScore: 61, maxScore: 80,  maxDailySpend: USDC(1000), maxTxSize: USDC(200),  maxDelegationDepth: 3, maxTxPerMin: 50  },
  { tier: 'Sovereign',    minScore: 81, maxScore: 100, maxDailySpend: USDC(5000), maxTxSize: USDC(1000), maxDelegationDepth: 4, maxTxPerMin: 100 },
];

// ============================================================
// REPUTATION ENGINE
// ============================================================

export class ReputationEngine {
  private metricsMap: Map<string, AgentMetrics> = new Map();
  private scoreMap: Map<string, number> = new Map();
  private historyMap: Map<string, ScoreDataPoint[]> = new Map();
  /** Maps agentId (identity.id) → pubkey for convenience lookups */
  private idToPubkey: Map<string, string> = new Map();
  private nameMap: Map<string, string> = new Map();

  constructor(engine: PolicyEngine) {
    this.subscribeToEvents(engine);
  }

  // -------------------------------------------------------
  // Registration
  // -------------------------------------------------------

  /**
   * Register an agent so the engine tracks them.
   * Call this before creating authorities for the agent.
   */
  registerAgent(identity: AgentIdentity, initialScore?: number): void {
    const key = identity.pubkey || identity.id;
    this.idToPubkey.set(identity.id, key);
    this.nameMap.set(key, identity.name);

    if (!this.metricsMap.has(key)) {
      const now = Date.now();
      const score = initialScore ?? 50;
      this.metricsMap.set(key, {
        agentId: key,
        successRate: score / 100,
        averageSpendEfficiency: 0.5,
        delegationReliability: 0.5,
        timeConsistency: 0.5,
        counterpartyDiversity: 0.5,
        ageMs: 0,
        totalVolumeProcessed: 0n,
        approvedCount: 0,
        rejectedCount: 0,
        delegationCount: 0,
        delegationSuccesses: 0,
        lastActivityAt: now,
        registeredAt: now,
        recentTransactionTimes: [],
        recentPrograms: [],
      });
      this.scoreMap.set(key, score);
      this.historyMap.set(key, [{ timestamp: now, score, tier: this.getTier(score) }]);
    }
  }

  /**
   * Directly set a score (useful for seeding demo scenarios).
   */
  setScore(agentIdOrPubkey: string, score: number): void {
    const key = this.resolveKey(agentIdOrPubkey);
    const clamped = Math.max(0, Math.min(100, score));
    this.scoreMap.set(key, clamped);
    const history = this.historyMap.get(key) ?? [];
    history.push({ timestamp: Date.now(), score: clamped, tier: this.getTier(clamped) });
    if (history.length > 20) history.shift();
    this.historyMap.set(key, history);
  }

  // -------------------------------------------------------
  // Event Subscription
  // -------------------------------------------------------

  private subscribeToEvents(engine: PolicyEngine): void {
    engine.on('spend_approved',   (e) => this.onSpendApproved(e));
    engine.on('spend_rejected',   (e) => this.onSpendRejected(e));
    engine.on('authority_created', (e) => this.onAuthorityCreated(e));
    engine.on('authority_revoked', (e) => this.onAuthorityRevoked(e));
  }

  private onSpendApproved(event: AuditEvent): void {
    const m = this.getOrCreate(event.agentId);
    m.approvedCount++;
    m.lastActivityAt = event.timestamp;

    const amount = BigInt((event.details.amount as string) ?? '0');
    m.totalVolumeProcessed += amount;

    m.recentTransactionTimes.push(event.timestamp);
    if (m.recentTransactionTimes.length > 50) m.recentTransactionTimes.shift();

    const program = event.details.programId as string;
    if (program) {
      m.recentPrograms.push(program);
      if (m.recentPrograms.length > 100) m.recentPrograms.shift();
    }

    this.recompute(event.agentId);
  }

  private onSpendRejected(event: AuditEvent): void {
    const m = this.getOrCreate(event.agentId);
    m.rejectedCount++;
    m.lastActivityAt = event.timestamp;
    this.recompute(event.agentId);
  }

  private onAuthorityCreated(event: AuditEvent): void {
    const depth = Number(event.details.delegationDepth ?? 0);
    if (depth > 0) {
      const m = this.getOrCreate(event.agentId);
      m.delegationCount++;
      // Optimistically assume success until revocation proves otherwise
      m.delegationSuccesses++;
      this.recompute(event.agentId);
    }
  }

  private onAuthorityRevoked(event: AuditEvent): void {
    const m = this.getOrCreate(event.agentId);
    const cascaded = Number(event.details.cascadedChildren ?? 0);
    if (cascaded > 0) {
      // Delegations that cascaded suggests unreliable sub-agents
      const penalty = Math.min(m.delegationReliability, 0.1 * cascaded);
      m.delegationReliability = Math.max(0, m.delegationReliability - penalty);
    }
    this.recompute(event.agentId);
  }

  // -------------------------------------------------------
  // Score Computation
  // -------------------------------------------------------

  private recompute(agentId: string): void {
    const key = this.resolveKey(agentId);
    const m = this.metricsMap.get(key);
    if (!m) return;

    const total = m.approvedCount + m.rejectedCount;
    const EMA = (old: number, newVal: number, alpha = 0.25): number =>
      old * (1 - alpha) + newVal * alpha;

    // Success rate (EMA)
    if (total > 0) {
      m.successRate = EMA(m.successRate, m.approvedCount / total);
    }

    // Age factor — normalised over 30 days
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    m.ageMs = Date.now() - m.registeredAt;
    const ageFactor = Math.min(1, m.ageMs / thirtyDays);

    // Time consistency — coefficient of variation of inter-tx intervals
    if (m.recentTransactionTimes.length >= 3) {
      const intervals: number[] = [];
      for (let i = 1; i < m.recentTransactionTimes.length; i++) {
        intervals.push(m.recentTransactionTimes[i] - m.recentTransactionTimes[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avg > 0) {
        const variance = intervals.reduce((s, v) => s + (v - avg) ** 2, 0) / intervals.length;
        const cv = Math.sqrt(variance) / avg;
        m.timeConsistency = EMA(m.timeConsistency, Math.max(0, 1 - Math.min(1, cv / 3)));
      }
    }

    // Counterparty diversity — unique programs / sqrt(total programs seen)
    if (m.recentPrograms.length > 0) {
      const unique = new Set(m.recentPrograms).size;
      const raw = Math.min(1, unique / Math.max(1, Math.sqrt(m.recentPrograms.length)));
      m.counterpartyDiversity = EMA(m.counterpartyDiversity, raw);
    }

    // Delegation reliability
    if (m.delegationCount > 0) {
      const raw = m.delegationSuccesses / m.delegationCount;
      m.delegationReliability = EMA(m.delegationReliability, raw);
    }

    // Volume factor (log-scale, normalized to $10k)
    const volumeUSD = Number(m.totalVolumeProcessed) / 1_000_000;
    const volumeFactor = Math.min(1, Math.log1p(volumeUSD) / Math.log1p(10_000));

    // Composite score (weights sum to 100%)
    const raw =
      m.successRate              * 25 +
      m.averageSpendEfficiency   * 15 +
      m.delegationReliability    * 20 +
      m.timeConsistency          * 10 +
      m.counterpartyDiversity    * 10 +
      ageFactor                  * 10 +
      volumeFactor               * 10;

    const newScore = Math.max(0, Math.min(100, raw));
    const oldScore = this.scoreMap.get(key) ?? 50;
    // Smooth score changes — big jumps need multiple events to propagate
    const smoothed = Math.round(EMA(oldScore, newScore, 0.3));
    this.scoreMap.set(key, smoothed);

    const history = this.historyMap.get(key) ?? [];
    history.push({ timestamp: Date.now(), score: smoothed, tier: this.getTier(smoothed) });
    if (history.length > 20) history.shift();
    this.historyMap.set(key, history);
  }

  // -------------------------------------------------------
  // Public API
  // -------------------------------------------------------

  getScore(agentIdOrPubkey: string): number {
    const key = this.resolveKey(agentIdOrPubkey);
    return this.scoreMap.get(key) ?? 50;
  }

  getTier(score: number): TrustTier {
    for (const t of TIER_TABLE) {
      if (score >= t.minScore && score <= t.maxScore) return t.tier;
    }
    return 'Probationary';
  }

  getTierLimits(score: number): TierLimits {
    for (const t of TIER_TABLE) {
      if (score >= t.minScore && score <= t.maxScore) return t;
    }
    return TIER_TABLE[0];
  }

  /**
   * Returns a SpendingPolicy derived from this agent's current trust tier.
   * Use this when setting up delegated authorities.
   */
  getRecommendedPolicy(
    agentIdOrPubkey: string,
    tokenMint: string,
    allowedPrograms: string[],
  ): SpendingPolicy {
    const score  = this.getScore(agentIdOrPubkey);
    const limits = this.getTierLimits(score);

    return {
      maxSpend:           limits.maxDailySpend,
      tokenMint,
      allowedPrograms,
      allowedDestinations: [],
      expiresAt:          Date.now() + 24 * 60 * 60 * 1000,
      maxRedelegation:    limits.maxDelegationDepth > 0 ? limits.maxDailySpend / 4n : 0n,
      maxDelegationDepth: limits.maxDelegationDepth,
      maxTransactionSize: limits.maxTxSize,
      rateLimit:          { maxTransactions: limits.maxTxPerMin, windowMs: 60_000 },
    };
  }

  getReputationReport(agentIdOrPubkey: string): ReputationReport {
    const key     = this.resolveKey(agentIdOrPubkey);
    const score   = this.scoreMap.get(key) ?? 50;
    const tier    = this.getTier(score);
    const limits  = this.getTierLimits(score);
    const m       = this.getOrCreate(key);
    const history = this.historyMap.get(key) ?? [];

    return {
      agentId:    key,
      agentName:  this.nameMap.get(key) ?? key.slice(0, 12) + '...',
      currentScore: score,
      currentTier: tier,
      metrics:    { ...m, totalVolumeProcessed: m.totalVolumeProcessed },
      scoreHistory: [...history],
      recommendedPolicy: {
        maxDailySpend:      limits.maxDailySpend,
        maxTxSize:          limits.maxTxSize,
        maxDelegationDepth: limits.maxDelegationDepth,
        maxTxPerMin:        limits.maxTxPerMin,
      },
      tierLimits: limits,
      lastUpdated: Date.now(),
    };
  }

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------

  private resolveKey(agentIdOrPubkey: string): string {
    return this.idToPubkey.get(agentIdOrPubkey) ?? agentIdOrPubkey;
  }

  private getOrCreate(agentId: string): AgentMetrics {
    const key = this.resolveKey(agentId);
    if (!this.metricsMap.has(key)) {
      const now = Date.now();
      this.metricsMap.set(key, {
        agentId: key,
        successRate: 0.5,
        averageSpendEfficiency: 0.5,
        delegationReliability: 0.5,
        timeConsistency: 0.5,
        counterpartyDiversity: 0.5,
        ageMs: 0,
        totalVolumeProcessed: 0n,
        approvedCount: 0,
        rejectedCount: 0,
        delegationCount: 0,
        delegationSuccesses: 0,
        lastActivityAt: now,
        registeredAt: now,
        recentTransactionTimes: [],
        recentPrograms: [],
      });
      this.scoreMap.set(key, 50);
      this.historyMap.set(key, [{ timestamp: now, score: 50, tier: 'Standard' }]);
    }
    return this.metricsMap.get(key)!;
  }
}