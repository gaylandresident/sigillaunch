/**
 * ZIP-227 canonical hashing.
 *
 * Fixes ZcashMEME weakness:
 *   ZcashMEME wrote: "temporary SHA-256 stand-ins for BLAKE2b" — this means
 *   every asset ID they compute today will be DIFFERENT from the eventual
 *   real ZSA asset ID. Their POC is not forward-compatible.
 *
 * SIGIL uses real BLAKE2b-256 with the correct personalization strings,
 * so the asset IDs we compute now match exactly what ZSA mainnet will produce.
 */

import blake2b from "blake2b";

/**
 * ZIP-227 asset-description hash.
 *
 *   assetDescHash = BLAKE2b-256(
 *     personalization = "ZSA-DescCRH",
 *     input           = issuer_bytes || description_bytes
 *   )
 *
 * @param issuer 33-byte canonical issuer (0x00 || x-only pubkey)
 * @param description arbitrary asset description bytes (typically UTF-8 of a name)
 * @returns 32-byte hash
 */
export function assetDescHash(issuer: Uint8Array, description: Uint8Array): Uint8Array {
  const person = new Uint8Array(16);
  const label = new TextEncoder().encode("ZSA-DescCRH");
  person.set(label);

  const h = blake2b(32, undefined, undefined, person);
  h.update(issuer);
  h.update(description);
  return h.digest();
}

/**
 * ZIP-227 asset base derivation.
 *
 *   assetBase = BLAKE2b-256(personalization = "ZSA-AssetBaseG", input = assetDescHash)
 *
 * In real ZSA this is a Pallas group element; on EVM we use it as a bytes32 identifier
 * that lets us route inscriptions and later map to the real Pallas group element
 * (deterministic reproduction with the same input).
 */
export function assetBase(descHash: Uint8Array): Uint8Array {
  const person = new Uint8Array(16);
  const label = new TextEncoder().encode("ZSA-AssetBaseG");
  person.set(label);

  const h = blake2b(32, undefined, undefined, person);
  h.update(descHash);
  return h.digest();
}
