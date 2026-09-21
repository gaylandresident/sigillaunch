/**
 * ZIP-227 issuance bundle builder — the canonical form that our
 * SigilCertificate contract stores on-chain and that the Zcash relayer
 * inscribes into a mainnet transparent tx.
 *
 * Fixes ZcashMEME weaknesses:
 *   - ZcashMEME's "issuance transaction" is version 6 mock JSON files stored locally
 *     → SIGIL stores canonical bytes on-chain (immutable, publicly verifiable)
 *   - ZcashMEME can't produce a `finalize=true` bundle that matches ZSA rules
 *     → we produce spec-conforming finalized bundles for every certificate
 *   - ZcashMEME has no migration story
 *     → our bundle can be replayed as-is against ZSA mainnet when it activates
 */

import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { deriveIssuer, type IssuerKey } from "./keys.js";
import { assetDescHash, assetBase } from "./hash.js";
import { signIssueAuth, sighashOfBundle } from "./sign.js";

export interface IssueAction {
  assetDescHash: Uint8Array; // 32 bytes
  amount: bigint;            // unit count of the asset being issued
  finalize: boolean;         // if true, no more issuance for this AssetBase — ever
}

export interface IssueBundle {
  issuer: Uint8Array;        // 33 bytes
  actions: IssueAction[];
  issueAuthSig: Uint8Array;  // 64-byte BIP-340 Schnorr sig over sigHash(actions)
  assetBase: Uint8Array;     // 32 bytes — routing/verification helper
}

export interface IssueBundleHex {
  issuer: `0x${string}`;
  actions: { assetDescHash: `0x${string}`; amount: string; finalize: boolean }[];
  issueAuthSig: `0x${string}`;
  assetBase: `0x${string}`;
}

/**
 * Build a finalized ZIP-227 IssueBundle for a single burn.
 *
 * A SIGIL certificate == a permanent record of one destroyed off-chain amount.
 * Once minted, `finalize=true` locks the asset base — no additional issuance
 * against it is ever possible. This mirrors the burn's irreversibility.
 */
export function buildFinalizedBundle(params: {
  mnemonic: string;
  accountIndex: number;
  description: Uint8Array; // canonical descriptor (e.g. `sigil:<chain>:<tx>`)
  amount: bigint;
}): IssueBundle {
  const key: IssuerKey = deriveIssuer(params.mnemonic, params.accountIndex);
  const descHash = assetDescHash(key.issuer, params.description);
  const base = assetBase(descHash);

  const actions: IssueAction[] = [
    { assetDescHash: descHash, amount: params.amount, finalize: true },
  ];

  const sigHash = sighashOfBundle({ issuer: key.issuer, actions });
  const issueAuthSig = signIssueAuth(key.isk, sigHash);

  return {
    issuer: key.issuer,
    actions,
    issueAuthSig,
    assetBase: base,
  };
}

/** Convert to hex form for the /attest JSON response + contract call. */
export function toHex(b: IssueBundle): IssueBundleHex {
  return {
    issuer: ("0x" + bytesToHex(b.issuer)) as `0x${string}`,
    actions: b.actions.map((a) => ({
      assetDescHash: ("0x" + bytesToHex(a.assetDescHash)) as `0x${string}`,
      amount: a.amount.toString(),
      finalize: a.finalize,
    })),
    issueAuthSig: ("0x" + bytesToHex(b.issueAuthSig)) as `0x${string}`,
    assetBase: ("0x" + bytesToHex(b.assetBase)) as `0x${string}`,
  };
}

/**
 * Canonical description for a certificate-backed burn:
 *   sigil:cert:v1:{sourceChain}:{sourceToken}:{burnTxHash}
 */
export function makeDescription(
  sourceChain: string,
  sourceToken: string,
  burnTxHash: string
): Uint8Array {
  const s = `sigil:cert:v1:${sourceChain}:${sourceToken.toLowerCase()}:${burnTxHash.toLowerCase()}`;
  return new TextEncoder().encode(s);
}

/**
 * Canonical description for a user-launched token on the SIGIL launchpad:
 *   sigil:launch:v1:robinhood:{creator}:{name}:{symbol}:{timestampMs}
 *
 * Deterministic across replays → the same launch produces the same
 * assetDescHash / assetBase forever → future ZSA migration is 1:1.
 */
export function makeLaunchDescription(params: {
  creator: string;
  name: string;
  symbol: string;
  timestampMs: number;
}): Uint8Array {
  const s = `sigil:launch:v1:robinhood:${params.creator.toLowerCase()}:${params.name}:${params.symbol}:${params.timestampMs}`;
  return new TextEncoder().encode(s);
}
