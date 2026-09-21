import cbor from "cbor";

/// SIGIL inscription format — permanently written to Zcash as memo/output data.
/// Zcash Stamp-compatible layout with SIGIL-specific extensions.
export interface SigilInscription {
  protocol: "sigil";           // magic marker
  version: 1;
  sourceChain: "solana" | "ethereum" | "base" | "bsc" | "arbitrum";
  sourceToken: string;         // hex or base58 depending on chain
  sourceBurnTx: string;        // hex or base58
  amount: string;              // decimal string of raw units
  usdValueAtBurn: string;      // decimal string, scaled 1e8
  recipient: `0x${string}`;    // Robinhood Chain address receiving the certificate
  robinhoodTokenId: string;    // decimal, links back to SigilCertificate.tokenId
  zsaAssetBase: `0x${string}`; // ZIP-227 asset base (for future migration)
  zsaIssuer: `0x${string}`;    // ZIP-227 issuer identifier
  timestamp: number;           // unix seconds
}

/// Encode as compact CBOR blob suitable for a Zcash transparent memo (max ~1000 bytes).
export function encodeInscription(insc: SigilInscription): Buffer {
  return cbor.encode(insc);
}

export function decodeInscription(buf: Buffer): SigilInscription {
  return cbor.decode(buf) as SigilInscription;
}

/// Human-readable JSON version (used for testing & explorer display).
export function toJSON(insc: SigilInscription): string {
  return JSON.stringify(insc, null, 2);
}
