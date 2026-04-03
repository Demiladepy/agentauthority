/**
 * Quick-Start API
 *
 * One function to set up a complete multi-agent network with
 * spending authority delegation. Wraps PolicyEngine, AuthorityManager,
 * X402Handler, and AutonomousAgent into a single ergonomic call.
 *
 * Usage:
 *
 *   const network = await createAgentNetwork({
 *     chain: 'solana:mainnet',
 *     rootBudget: { amount: 100, token: 'USDC' },
 *     expiry: '2h',
 *     agents: [
 *       { name: 'researcher', budget: 30, allowedPrograms: ['allium', 'x402'], canDelegate: true, maxDelegationAmount: 10 },
 *       { name: 'trader',     budget: 20, allowedPrograms: ['jupiter'],        canDelegate: false },
 *     ],
 *   });
 *
 *   await network.agents.researcher.payX402({ ... });
 *   const sub = await network.agents.researcher.delegateTo(network.agents.trader, 5n);
 */

import { PolicyEngine } from './core/policy-engine';
import { AuthorityManager, Ed25519Signer, SigningProvider } from './core/authority-manager';
import { X402Handler } from './x402/handler';
import { AutonomousAgent } from './agents/autonomous-agent';
import { SpendingPolicy, SpendingAuthority, AuditEvent, AuditEventType } from './core/types';

// ============================================================
// WELL-KNOWN PROGRAM IDs
// ============================================================

const PROGRAM_IDS: Record<string, string> = {
  'jupiter':   'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  'raydium':   '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  'marinade':  'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD',
  'lido':      'CrX7kMhLC3cSsXJdT7JDgqrRVMGDGKwFQFNpP7BKCD3',
  'allium':    'ALLiUMv1Gx5EP7BuRhXDgzCkqFSJpGXyisotXwSey4Cd',
  'orca':      'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  'x402':      'x402FaciLitatorProgram11111111111111111111',
  'token':     'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  // EVM programs (Base)
  'uniswap-v3':  '0x2626664c2603336E57B271c5C0b26F421741e481',
  'aave-v3':     '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64B',
};

const TOKEN_MINTS: Record<string, string> = {
  'USDC':         'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'USDC-BASE':    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'USDC-DEVNET':  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

// ============================================================
// CONFIG TYPES
// ============================================================

export interface AgentNetworkConfig<TAgents extends Record<string, AgentSpec>> {
  /** Chain to create authorities on */
  chain: 'solana:mainnet' | 'solana:devnet' | 'eip155:1' | 'eip155:8453' | string;
  /** Root authority budget */
  rootBudget: { amount: number; token: keyof typeof TOKEN_MINTS | string };
  /** Authority expiry — e.g. "2h", "30m", "1d" */
  expiry: string;
  /** Agent definitions — keys become typed agent names */
  agents: TAgents;
  /** Optional custom signer for the root (orchestrator) agent */
  rootSigner?: SigningProvider;
}

export interface AgentSpec {
  /** USDC budget in whole dollars */
  budget: number;
  /** Friendly program names (e.g. 'jupiter') or raw program IDs */
  allowedPrograms: string[];
  /** Whether this agent can delegate to sub-agents */
  canDelegate: boolean;
  /** Max amount this agent can delegate (in whole dollars) */
  maxDelegationAmount?: number;
  /** Trust score 0–100 */
  trustScore?: number;
  /** Optional custom signer */
  signer?: SigningProvider;
}

// ============================================================
// NETWORK TYPE — Typed agent access
// ============================================================

export interface AgentNetwork<TAgents extends Record<string, AgentSpec>> {
  /** Typed agent access by name */
  agents: { [K in keyof TAgents]: AutonomousAgent };
  /** The root orchestrator agent */
  orchestrator: AutonomousAgent;
  /** Direct access to the policy engine for advanced use */
  engine: PolicyEngine;
  /** Direct access to the x402 handler */
  x402: X402Handler;
  /** Subscribe to all audit events */
  audit: (handler: (event: AuditEvent) => void) => void;
  /** Revoke a specific agent's authority */
  revoke: (agentName: keyof TAgents, reason?: string) => boolean;
  /** Per-agent spend/budget stats */
  stats: () => Record<keyof TAgents | 'orchestrator', ReturnType<PolicyEngine['getAuthorityStats']>>;
}

// ============================================================
// HELPERS
// ============================================================

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error(`Invalid expiry format: "${expiry}". Use e.g. "2h", "30m", "1d".`);
  const value = parseInt(match[1], 10);
  const unit  = match[2];
  const ms    = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return Date.now() + value * ms;
}

function resolvePrograms(programs: string[]): string[] {
  return programs.map(p => PROGRAM_IDS[p.toLowerCase()] ?? p);
}

function resolveToken(token: string): string {
  return TOKEN_MINTS[token] ?? token;
}

const USDC_UNIT = (dollars: number): bigint => BigInt(Math.round(dollars * 1_000_000));

// ============================================================
// createAgentNetwork
// ============================================================

/**
 * Set up a complete multi-agent spending authority network.
 *
 * Creates:
 * - A root orchestrator with the given budget
 * - One delegated authority per agent spec
 * - Typed `network.agents` object for direct use
 *
 * All signers default to Ed25519 (in-process). For OWS wallet signing,
 * pass custom `signer` in each AgentSpec or `rootSigner` in the config.
 */
export async function createAgentNetwork<TAgents extends Record<string, AgentSpec>>(
  config: AgentNetworkConfig<TAgents>
): Promise<AgentNetwork<TAgents>> {

  const engine      = new PolicyEngine();
  const manager     = new AuthorityManager(engine);
  const x402Handler = new X402Handler(engine);

  const tokenMint = resolveToken(String(config.rootBudget.token));
  const expiresAt = parseExpiry(config.expiry);

  // ----------------------------------------------------------
  // Orchestrator
  // ----------------------------------------------------------

  const rootSigner = config.rootSigner ?? new Ed25519Signer();
  manager.registerAgent(
    {
      id: '__root__',
      name: 'Orchestrator',
      pubkey: rootSigner.getPublicKey(),
      role: 'Root authority holder',
      trustScore: 100,
      totalSpends: 0,
      totalRejections: 0,
    },
    rootSigner
  );

  const agentKeys = Object.keys(config.agents);
  const allProgramIds = Array.from(new Set(
    agentKeys.flatMap(k => resolvePrograms(config.agents[k].allowedPrograms))
  ));

  const rootPolicy: SpendingPolicy = {
    maxSpend: USDC_UNIT(config.rootBudget.amount),
    tokenMint,
    allowedPrograms: allProgramIds,
    allowedDestinations: [],
    expiresAt,
    maxRedelegation: USDC_UNIT(config.rootBudget.amount * 0.95),
    maxDelegationDepth: 3,
    maxTransactionSize: USDC_UNIT(config.rootBudget.amount),
    rateLimit: { maxTransactions: 200, windowMs: 60_000 },
  };

  const rootAuth = await manager.createRootAuthority('__root__', '__root__', rootPolicy, config.chain);

  const orchestrator = new AutonomousAgent({
    identity: {
      id: '__root__',
      name: 'Orchestrator',
      pubkey: rootSigner.getPublicKey(),
      role: 'Root authority holder',
      trustScore: 100,
      totalSpends: 0,
      totalRejections: 0,
    },
    signer: rootSigner,
    engine, manager, x402Handler,
  });
  orchestrator.setAuthority(rootAuth);

  // ----------------------------------------------------------
  // Agent authorities
  // ----------------------------------------------------------

  const agentMap: Record<string, AutonomousAgent> = {};
  const authorityMap: Record<string, SpendingAuthority> = {};

  for (const [name, spec] of Object.entries(config.agents) as Array<[string, AgentSpec]>) {
    const agentSigner = spec.signer ?? new Ed25519Signer();
    const resolvedPrograms = resolvePrograms(spec.allowedPrograms);
    const canDelegate = spec.canDelegate;
    const maxRedeleg  = canDelegate
      ? USDC_UNIT(spec.maxDelegationAmount ?? Math.floor(spec.budget * 0.5))
      : 0n;

    manager.registerAgent(
      {
        id: name,
        name,
        pubkey: agentSigner.getPublicKey(),
        role: `Agent: ${name}`,
        trustScore: spec.trustScore ?? 70,
        totalSpends: 0,
        totalRejections: 0,
      },
      agentSigner
    );

    const childPolicy: SpendingPolicy = {
      maxSpend: USDC_UNIT(spec.budget),
      tokenMint,
      allowedPrograms: resolvedPrograms,
      allowedDestinations: [],
      expiresAt,
      maxRedelegation: maxRedeleg,
      maxDelegationDepth: canDelegate ? 2 : 0,
      maxTransactionSize: USDC_UNIT(spec.budget),
      rateLimit: { maxTransactions: 50, windowMs: 60_000 },
    };

    const auth = await manager.delegate(
      rootAuth.id,
      '__root__',
      name,
      USDC_UNIT(spec.budget),
      childPolicy
    );

    const agent = new AutonomousAgent({
      identity: {
        id: name,
        name,
        pubkey: agentSigner.getPublicKey(),
        role: `Agent: ${name}`,
        trustScore: spec.trustScore ?? 70,
        totalSpends: 0,
        totalRejections: 0,
      },
      signer: agentSigner,
      engine, manager, x402Handler,
    });
    agent.setAuthority(auth);

    agentMap[name] = agent;
    authorityMap[name] = auth;
  }

  // ----------------------------------------------------------
  // Build network object
  // ----------------------------------------------------------

  const allEventHandlers: Array<(event: AuditEvent) => void> = [];
  const auditEventTypes: AuditEventType[] = [
    'authority_created', 'authority_delegated', 'spend_approved',
    'spend_rejected', 'authority_revoked', 'authority_expired',
    'authority_exhausted', 'rate_limit_hit', 'permission_requested', 'permission_negotiated',
  ];
  for (const et of auditEventTypes) {
    engine.on(et, (event) => {
      for (const h of allEventHandlers) h(event);
    });
  }

  return {
    agents: agentMap as { [K in keyof TAgents]: AutonomousAgent },
    orchestrator,
    engine,
    x402: x402Handler,

    audit(handler: (event: AuditEvent) => void): void {
      allEventHandlers.push(handler);
    },

    revoke(agentName: keyof TAgents, reason?: string): boolean {
      const auth = authorityMap[agentName as string];
      if (!auth) return false;
      return engine.revoke(auth.id, reason ?? `Revoked by network.revoke('${String(agentName)}')`);
    },

    stats() {
      const result: Record<string, ReturnType<PolicyEngine['getAuthorityStats']>> = {
        orchestrator: engine.getAuthorityStats(rootAuth.id),
      };
      for (const [name, auth] of Object.entries(authorityMap)) {
        result[name] = engine.getAuthorityStats(auth.id);
      }
      return result as Record<keyof TAgents | 'orchestrator', ReturnType<PolicyEngine['getAuthorityStats']>>;
    },
  };
}
