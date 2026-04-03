/**
 * Solana Devnet On-Chain Proof
 *
 * Writes a compact cryptographic fingerprint of each SpendingAuthority
 * to Solana devnet via the SPL Memo program.
 *
 * This gives every authority creation an on-chain record visible at:
 *   https://explorer.solana.com/tx/<sig>?cluster=devnet
 *
 * Uses a locally-generated ephemeral keypair for fee payment so no
 * wallet setup is required. Requests an airdrop automatically.
 *
 * In production this would use the agent's OWS wallet for the payer.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import crypto from 'crypto';

// SPL Memo v2 program
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const DEVNET_RPC      = 'https://api.devnet.solana.com';

// ============================================================
// TYPES
// ============================================================

export interface DevnetProofResult {
  signature:   string;
  explorerUrl: string;
  memoHash:    string;
  cluster:     'devnet';
  slot?:       number;
}

// ============================================================
// AIRDROP HELPER (with retry)
// ============================================================

async function ensureFunds(
  connection: Connection,
  keypair:    Keypair,
  lamports:   number = 0.01 * LAMPORTS_PER_SOL,
): Promise<void> {
  const balance = await connection.getBalance(keypair.publicKey);
  if (balance >= lamports) return;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sig = await connection.requestAirdrop(keypair.publicKey, 0.1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, 'confirmed');
      return;
    } catch {
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('[DevnetProof] Airdrop failed after 3 attempts — devnet may be rate-limiting');
}

// ============================================================
// CORE: Write to devnet
// ============================================================

/**
 * Write a compressed fingerprint of the given data to Solana devnet
 * via the SPL Memo program. Returns the transaction signature + explorer URL.
 *
 * @param payload   Any JSON-serializable data to fingerprint
 * @param payer     Optional existing Keypair. Creates ephemeral one if not provided.
 */
export async function writeDevnetProof(
  payload:  Record<string, unknown>,
  payer?:   Keypair,
): Promise<DevnetProofResult> {
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const feePayer   = payer ?? Keypair.generate();

  await ensureFunds(connection, feePayer);

  // Build a compact memo: "spendos:sha256(payload)[0..16]:version"
  const json     = JSON.stringify(payload);
  const hash     = crypto.createHash('sha256').update(json).digest('hex');
  const memoText = `spendos:v1:${hash.slice(0, 32)}`;

  const ix = new TransactionInstruction({
    keys:       [{ pubkey: feePayer.publicKey, isSigner: true, isWritable: false }],
    programId:  MEMO_PROGRAM_ID,
    data:       Buffer.from(memoText, 'utf-8'),
  });

  const tx        = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [feePayer], {
    commitment: 'confirmed',
  });

  // Fetch slot for context
  let slot: number | undefined;
  try {
    const info = await connection.getTransaction(signature, { commitment: 'confirmed' });
    slot = info?.slot;
  } catch { /* non-critical */ }

  return {
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    memoHash:    hash,
    cluster:     'devnet',
    slot,
  };
}

// ============================================================
// HIGH-LEVEL: Prove a SpendingAuthority on-chain
// ============================================================

/**
 * Write a SpendingAuthority fingerprint to devnet.
 * Call this after createRootAuthority() or delegate() for on-chain proof.
 */
export async function proveAuthorityOnChain(
  authorityId:  string,
  grantorPubkey: string,
  granteePubkey: string,
  maxSpend:      bigint,
  chain:         string,
  payer?:        Keypair,
): Promise<DevnetProofResult> {
  return writeDevnetProof({
    protocol:   'SpendOS',
    version:    '0.1.0',
    authorityId,
    grantor:    grantorPubkey,
    grantee:    granteePubkey,
    maxSpend:   maxSpend.toString(),
    chain,
    createdAt:  Date.now(),
  }, payer);
}

// ============================================================
// CONVENIENCE: Shared ephemeral payer singleton for demos
// (avoids multiple airdrops per demo run)
// ============================================================

let _demoPayer: Keypair | null = null;

export function getDemoPayer(): Keypair {
  if (!_demoPayer) _demoPayer = Keypair.generate();
  return _demoPayer;
}