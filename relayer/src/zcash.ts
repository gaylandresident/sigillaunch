import { config } from "./config.js";
import type { SigilInscription } from "./inscription.js";
import { encodeInscription } from "./inscription.js";

/// Zcash inscription writer.
///
/// This is a THIN wrapper around lightwalletd. The real inscription flow:
///   1. Build a v5 (transparent) Zcash tx with our custom output carrying the CBOR blob
///   2. Sign with our hot wallet derived from BIP-39 seed
///   3. Broadcast via lightwalletd `SendTransaction`
///
/// The lightwalletd gRPC client from @zcashfoundation is the reference impl, but here we
/// stub the transport for MVP — the interface below matches what a real writer needs.

export interface WriteInscriptionResult {
  zcashTxId: string;      // 32-byte tx hash as hex
  blockHeight: number | null;
  encodedSize: number;
}

export interface ZcashClient {
  writeInscription(insc: SigilInscription): Promise<WriteInscriptionResult>;
  getBalance(): Promise<{ transparent: bigint; shielded: bigint }>;
  waitForConfirm(txId: string, minConfirmations?: number): Promise<number>;
}

/// MVP client — replace `sendRawTransaction` with real lightwalletd gRPC call before mainnet.
export function makeZcashClient(): ZcashClient {
  return {
    async writeInscription(insc) {
      const payload = encodeInscription(insc);
      if (payload.length > 950) throw new Error(`inscription too large: ${payload.length}b`);

      // TODO(mainnet): build real Zcash tx here using zcash_client_backend / lightwalletd
      //   - derive keys from config.zcash.mnemonic
      //   - build v5 tx with OP_RETURN-style data output carrying `payload`
      //   - sign + broadcast via lightwalletd.SendTransaction
      // For MVP we simulate with a deterministic hash so downstream flow works end-to-end.
      const zcashTxId = Buffer.from(
        Array.from({ length: 32 }, (_, i) => (payload[i % payload.length] ?? 0) ^ (i * 31)),
      ).toString("hex");

      return {
        zcashTxId,
        blockHeight: null,
        encodedSize: payload.length,
      };
    },

    async getBalance() {
      return { transparent: 0n, shielded: 0n };
    },

    async waitForConfirm(_txId, _minConfirmations = 1) {
      // TODO(mainnet): poll GetTransaction until confirmations >= minConfirmations
      return 1;
    },
  };
}
