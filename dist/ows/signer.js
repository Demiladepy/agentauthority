"use strict";
/**
 * OWS (Open Wallet Standard) Signing Adapter
 *
 * Implements the SigningProvider interface using the OWS CLI for all
 * wallet operations. If OWS is not installed, falls back to Ed25519Signer
 * with a visible warning — so the demo always runs.
 *
 * Chain format: "solana:mainnet", "solana:devnet", "eip155:1", "eip155:8453"
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OWSSigner = void 0;
exports.createOWSWallet = createOWSWallet;
const child_process_1 = require("child_process");
const authority_manager_1 = require("../core/authority-manager");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const bs58_1 = __importDefault(require("bs58"));
// ============================================================
// OWS AVAILABILITY
// ============================================================
function isOWSAvailable() {
    try {
        (0, child_process_1.execSync)('ows --version', { stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
// ============================================================
// OWS SIGNER
// ============================================================
class OWSSigner {
    walletName;
    chain;
    owsAvailable;
    fallback;
    cachedPubkey = null;
    constructor(walletName, chain = 'solana:mainnet') {
        this.walletName = walletName;
        this.chain = chain;
        this.owsAvailable = isOWSAvailable();
        this.fallback = new authority_manager_1.Ed25519Signer();
        if (!this.owsAvailable) {
            console.warn(`[OWSSigner] OWS CLI not found — falling back to Ed25519Signer for wallet "${walletName}". ` +
                `Install OWS: curl -fsSL https://docs.openwallet.sh/install.sh | bash`);
        }
    }
    getPublicKey() {
        if (this.cachedPubkey)
            return this.cachedPubkey;
        if (this.owsAvailable) {
            try {
                const result = (0, child_process_1.execSync)(`ows wallet pubkey --name "${this.walletName}" --chain "${this.chain}"`, { stdio: 'pipe', encoding: 'utf8' }).trim();
                this.cachedPubkey = result;
                return result;
            }
            catch {
                // OWS available but wallet op failed — fall through
            }
        }
        this.cachedPubkey = this.fallback.getPublicKey();
        return this.cachedPubkey;
    }
    async sign(message) {
        if (this.owsAvailable) {
            try {
                const messageB64 = Buffer.from(message).toString('base64');
                const result = (0, child_process_1.execSync)(`ows wallet sign --name "${this.walletName}" --chain "${this.chain}" --message "${messageB64}"`, { stdio: 'pipe', encoding: 'utf8' }).trim();
                return Buffer.from(result, 'base64');
            }
            catch {
                // Fall through to Ed25519 fallback
            }
        }
        return this.fallback.sign(message);
    }
    async verify(message, signature, pubkey) {
        // Verification is always done locally — no round-trip to OWS needed
        try {
            const pubkeyBytes = bs58_1.default.decode(pubkey);
            return tweetnacl_1.default.sign.detached.verify(message, signature, pubkeyBytes);
        }
        catch {
            return false;
        }
    }
    isUsingOWS() {
        return this.owsAvailable;
    }
    getWalletName() {
        return this.walletName;
    }
}
exports.OWSSigner = OWSSigner;
// ============================================================
// WALLET CREATION HELPER
// ============================================================
/**
 * Creates an OWS wallet and returns a signer backed by it.
 * If OWS is not installed, the returned signer transparently
 * uses an in-process Ed25519 keypair.
 */
async function createOWSWallet(name, chain = 'solana:mainnet') {
    if (isOWSAvailable()) {
        try {
            (0, child_process_1.execSync)(`ows wallet create --name "${name}" --chain "${chain}"`, { stdio: 'pipe' });
        }
        catch {
            // Wallet may already exist — fine
        }
    }
    return new OWSSigner(name, chain);
}
//# sourceMappingURL=signer.js.map