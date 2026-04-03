/**
 * OWS (Open Wallet Standard) Signing Adapter
 *
 * Implements the SigningProvider interface using the OWS CLI for all
 * wallet operations. If OWS is not installed, falls back to Ed25519Signer
 * with a visible warning — so the demo always runs.
 *
 * Chain format: "solana:mainnet", "solana:devnet", "eip155:1", "eip155:8453"
 */
import { SigningProvider } from '../core/authority-manager';
export declare class OWSSigner implements SigningProvider {
    private walletName;
    private chain;
    private owsAvailable;
    private fallback;
    private cachedPubkey;
    constructor(walletName: string, chain?: string);
    getPublicKey(): string;
    sign(message: Uint8Array): Promise<Uint8Array>;
    verify(message: Uint8Array, signature: Uint8Array, pubkey: string): Promise<boolean>;
    isUsingOWS(): boolean;
    getWalletName(): string;
}
/**
 * Creates an OWS wallet and returns a signer backed by it.
 * If OWS is not installed, the returned signer transparently
 * uses an in-process Ed25519 keypair.
 */
export declare function createOWSWallet(name: string, chain?: string): Promise<OWSSigner>;
//# sourceMappingURL=signer.d.ts.map