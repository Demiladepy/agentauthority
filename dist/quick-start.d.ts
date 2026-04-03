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
import { SigningProvider } from './core/authority-manager';
import { X402Handler } from './x402/handler';
import { AutonomousAgent } from './agents/autonomous-agent';
import { AuditEvent } from './core/types';
declare const TOKEN_MINTS: Record<string, string>;
export interface AgentNetworkConfig<TAgents extends Record<string, AgentSpec>> {
    /** Chain to create authorities on */
    chain: 'solana:mainnet' | 'solana:devnet' | 'eip155:1' | 'eip155:8453' | string;
    /** Root authority budget */
    rootBudget: {
        amount: number;
        token: keyof typeof TOKEN_MINTS | string;
    };
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
export interface AgentNetwork<TAgents extends Record<string, AgentSpec>> {
    /** Typed agent access by name */
    agents: {
        [K in keyof TAgents]: AutonomousAgent;
    };
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
export declare function createAgentNetwork<TAgents extends Record<string, AgentSpec>>(config: AgentNetworkConfig<TAgents>): Promise<AgentNetwork<TAgents>>;
export {};
//# sourceMappingURL=quick-start.d.ts.map