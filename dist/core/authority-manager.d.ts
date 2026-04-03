/**
 * Authority Manager — Creates and manages spending authorities
 *
 * Handles the lifecycle: creation, delegation, revocation.
 * Each authority is cryptographically signed by the grantor,
 * creating a verifiable delegation chain without on-chain state.
 */
import { SpendingAuthority, SpendingPolicy, PolicyOverrides, PermissionRequest, NegotiationResult, AgentIdentity } from './types';
import { PolicyEngine } from './policy-engine';
export interface SigningProvider {
    getPublicKey(): string;
    sign(message: Uint8Array): Promise<Uint8Array>;
    verify(message: Uint8Array, signature: Uint8Array, pubkey: string): Promise<boolean>;
}
/**
 * Simple Ed25519 signer for development and demos.
 * In production, this is replaced by the OWS signing interface.
 */
export declare class Ed25519Signer implements SigningProvider {
    private keypair;
    constructor(secretKey?: Uint8Array);
    getPublicKey(): string;
    sign(message: Uint8Array): Promise<Uint8Array>;
    verify(message: Uint8Array, signature: Uint8Array, pubkey: string): Promise<boolean>;
    getSecretKey(): Uint8Array;
}
export declare class AuthorityManager {
    private engine;
    private agents;
    private signers;
    constructor(engine: PolicyEngine);
    registerAgent(identity: AgentIdentity, signer: SigningProvider): void;
    getAgent(id: string): AgentIdentity | undefined;
    createRootAuthority(grantorAgentId: string, granteeAgentId: string, policy: SpendingPolicy, chain?: string): Promise<SpendingAuthority>;
    delegate(parentAuthorityId: string, delegatorAgentId: string, granteeAgentId: string, amount: bigint, policyOverrides?: PolicyOverrides): Promise<SpendingAuthority>;
    negotiatePermission(orchestratorAuthorityId: string, orchestratorAgentId: string, request: PermissionRequest): Promise<NegotiationResult>;
    verifyDelegationChain(authorityId: string): Promise<{
        valid: boolean;
        chain: Array<{
            authorityId: string;
            grantor: string;
            grantee: string;
            depth: number;
        }>;
        error?: string;
    }>;
    private buildChildPolicy;
    private buildAuthorityPayload;
    private findSignerByPubkey;
}
//# sourceMappingURL=authority-manager.d.ts.map