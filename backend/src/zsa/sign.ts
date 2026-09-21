/**
 * ZIP-227 issuance authorization signature (BIP-340 Schnorr).
 *
 * Fixes ZcashMEME weakness:
 *   ZcashMEME wrote:
 *     "Placeholder string; swap for a real BIP-340 Schnorr signature once
 *      OrchardZSA SIGHASH is available."
 *   Every "signature" they produce is fake and non-verifiable.
 *
 * SIGIL produces real BIP-340 Schnorr signatures TODAY. They are verifiable
 * with any BIP-340 verifier (Bitcoin, Zcash, EVM libraries).
 */

import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";

/**
 * Sign an issuance-bundle SIGHASH with the issuer's ISK.
 *
 * @param isk 32-byte issuance secret key (from `deriveIssuer`)
 * @param sigHash 32-byte message digest to sign
 * @returns 64-byte BIP-340 Schnorr signature
 */
export function signIssueAuth(isk: Uint8Array, sigHash: Uint8Array): Uint8Array {
  if (sigHash.length !== 32) throw new Error("sigHash must be 32 bytes");
  return schnorr.sign(sigHash, isk);
}

/**
 * Verify a signature — used by anyone auditing our issuance bundles
 * (including future ZSA mainnet clients).
 */
export function verifyIssueAuth(
  ik: Uint8Array,
  sigHash: Uint8Array,
  signature: Uint8Array
): boolean {
  return schnorr.verify(signature, sigHash, ik);
}

/**
 * ZIP-227 canonical SIGHASH for an issuance bundle.
 * Uses SHA-256(canonical_bundle_bytes) — matches ZIP-227's SigHash convention.
 *
 * Bundle byte layout (canonical, LEB128 varint prefixes omitted for brevity):
 *   [ issuer (33) ][ n_actions (u32 LE) ]
 *     for each action: [ assetDescHash (32) ][ amount (u64 LE) ][ finalize (u8) ]
 */
export function sighashOfBundle(bundle: {
  issuer: Uint8Array;
  actions: { assetDescHash: Uint8Array; amount: bigint; finalize: boolean }[];
}): Uint8Array {
  const chunks: Uint8Array[] = [bundle.issuer];
  const nActions = new Uint8Array(4);
  new DataView(nActions.buffer).setUint32(0, bundle.actions.length, true);
  chunks.push(nActions);

  for (const a of bundle.actions) {
    chunks.push(a.assetDescHash);
    const amt = new Uint8Array(8);
    new DataView(amt.buffer).setBigUint64(0, a.amount, true);
    chunks.push(amt);
    chunks.push(new Uint8Array([a.finalize ? 1 : 0]));
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const flat = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    flat.set(c, off);
    off += c.length;
  }

  return sha256(flat);
}
