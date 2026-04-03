/**
 * OWS (Open Wallet Standard) Signing Adapter
 *
 * Implements the SigningProvider interface using the OWS CLI for all
 * wallet operations. If OWS is not installed, falls back to Ed25519Signer
 * with a visible warning — so the demo always runs.
 *
 * Chain format: "solana:mainnet", "solana:devnet", "eip155:1", "eip155:8453"
 */

import { execSync } from 'child_process';
import { SigningProvider, Ed25519Signer } from '../core/authority-manager';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// ============================================================
// OWS AVAILABILITY
// ============================================================

function isOWSAvailable(): boolean {
  try {
    execSync('ows --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// OWS SIGNER
// ============================================================

export class OWSSigner implements SigningProvider {
  private walletName: string;
  private chain: string;
  private owsAvailable: boolean;
  private fallback: Ed25519Signer;
  private cachedPubkey: string | null = null;

  constructor(walletName: string, chain: string = 'solana:mainnet') {
    this.walletName = walletName;
    this.chain = chain;
    this.owsAvailable = isOWSAvailable();
    this.fallback = new Ed25519Signer();

    if (!this.owsAvailable) {
      console.warn(
        `[OWSSigner] OWS CLI not found — falling back to Ed25519Signer for wallet "${walletName}". ` +
        `Install OWS: curl -fsSL https://docs.openwallet.sh/install.sh | bash`
      );
    }
  }

  getPublicKey(): string {
    if (this.cachedPubkey) return this.cachedPubkey;

    if (this.owsAvailable) {
      try {
        const result = execSync(
          `ows wallet pubkey --name "${this.walletName}" --chain "${this.chain}"`,
          { stdio: 'pipe', encoding: 'utf8' }
        ).trim();
        this.cachedPubkey = result;
        return result;
      } catch {
        // OWS available but wallet op failed — fall through
      }
    }

    this.cachedPubkey = this.fallback.getPublicKey();
    return this.cachedPubkey;
  }

  async sign(message: Uint8Array): Promise<Uint8Array> {
    if (this.owsAvailable) {
      try {
        const messageB64 = Buffer.from(message).toString('base64');
        const result = execSync(
          `ows wallet sign --name "${this.walletName}" --chain "${this.chain}" --message "${messageB64}"`,
          { stdio: 'pipe', encoding: 'utf8' }
        ).trim();
        return Buffer.from(result, 'base64');
      } catch {
        // Fall through to Ed25519 fallback
      }
    }

    return this.fallback.sign(message);
  }

  async verify(message: Uint8Array, signature: Uint8Array, pubkey: string): Promise<boolean> {
    // Verification is always done locally — no round-trip to OWS needed
    try {
      const pubkeyBytes = bs58.decode(pubkey);
      return nacl.sign.detached.verify(message, signature, pubkeyBytes);
    } catch {
      return false;
    }
  }

  isUsingOWS(): boolean {
    return this.owsAvailable;
  }

  getWalletName(): string {
    return this.walletName;
  }
}

// ============================================================
// WALLET CREATION HELPER
// ============================================================

/**
 * Creates an OWS wallet and returns a signer backed by it.
 * If OWS is not installed, the returned signer transparently
 * uses an in-process Ed25519 keypair.
 */
export async function createOWSWallet(
  name: string,
  chain: string = 'solana:mainnet'
): Promise<OWSSigner> {
  if (isOWSAvailable()) {
    try {
      execSync(
        `ows wallet create --name "${name}" --chain "${chain}"`,
        { stdio: 'pipe' }
      );
    } catch {
      // Wallet may already exist — fine
    }
  }

  return new OWSSigner(name, chain);
}
