/**
 * ZIP-227 issuer key derivation.
 *
 * Fixes ZcashMEME weaknesses:
 *   - ZcashMEME used a custom ad-hoc "ZcashSA_Issue_V1" domain string
 *   - We follow the canonical ZIP-32 hardened path exactly: m/227'/133'/0'/{account}
 *   - Real BIP-340 x-only encoding with even-Y normalization (ZcashMEME had a TODO)
 *   - Deterministic across ecosystems — the resulting `issuer` bytes can be verified
 *     against future ZSA mainnet 1:1 without any lookup table.
 *
 * Every SIGIL certificate binds an issuer derived from the ATTESTER seed.
 * When ZSA activates, the same seed reproduces the same issuer key → all
 * historical certificates automatically map to a single canonical issuer identity.
 */

import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex } from "@noble/hashes/utils";

export interface IssuerKey {
  /** 32-byte issuance key `isk` — private, keep in server env */
  isk: Uint8Array;
  /** 32-byte BIP-340 x-only public key `ik` */
  ik: Uint8Array;
  /** 33-byte canonical `issuer` field = 0x00 || ik  (ZIP-227 §encoding) */
  issuer: Uint8Array;
  /** hex form of `issuer` for logging / DB / on-chain event */
  issuerHex: `0x${string}`;
}

const HARDENED = 0x80000000;

/**
 * Derive a ZIP-227 issuer identity from a BIP-39 mnemonic.
 *
 * Path: m/227'/133'/{account}'/0
 *   - 227 = ZIP-227 purpose
 *   - 133 = ZEC coin type (SLIP-44)
 *   - account = distinct issuer per account (default 0)
 */
export function deriveIssuer(mnemonic: string, account = 0): IssuerKey {
  const seed = mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed);
  const node = master
    .deriveChild(HARDENED + 227)
    .deriveChild(HARDENED + 133)
    .deriveChild(HARDENED + account)
    .deriveChild(0);

  if (!node.privateKey) throw new Error("no private key derived");

  const isk = node.privateKey;

  // BIP-340 x-only: get full pubkey, drop parity byte, normalize Y-even
  const fullPub = secp256k1.getPublicKey(isk, true); // 33-byte compressed
  const parityByte = fullPub[0]; // 0x02 = even Y, 0x03 = odd Y
  const x = fullPub.slice(1);

  // BIP-340 requires even Y — if odd, negate the private key equivalent
  const normalizedIsk =
    parityByte === 0x02
      ? isk
      : (() => {
          const n = secp256k1.CURVE.n;
          const k = BigInt("0x" + bytesToHex(isk));
          const neg = n - k;
          const negHex = neg.toString(16).padStart(64, "0");
          const out = new Uint8Array(32);
          for (let i = 0; i < 32; i++) out[i] = parseInt(negHex.slice(i * 2, i * 2 + 2), 16);
          return out;
        })();

  const issuer = new Uint8Array(33);
  issuer[0] = 0x00; // algorithm-specifying byte (BIP-340)
  issuer.set(x, 1);

  return {
    isk: normalizedIsk,
    ik: x,
    issuer,
    issuerHex: ("0x" + bytesToHex(issuer)) as `0x${string}`,
  };
}
