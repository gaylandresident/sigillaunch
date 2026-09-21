import pino from "pino";
import { config } from "./config.js";
import { watchBurns } from "./monitor.js";
import { makeZcashClient } from "./zcash.js";
import { nextPendingBatch, markWritten, markFailed, markConfirmed, sql } from "./db.js";
import type { SigilInscription } from "./inscription.js";

const log = pino({ level: config.logLevel });

async function processInscriptions() {
  const zcash = makeZcashClient();

  while (true) {
    try {
      const batch = await nextPendingBatch(5);
      for (const row of batch) {
        try {
          const [certRow] = await sql<
            {
              robinhood_token_id: string;
              burner: `0x${string}`;
              source_chain: number;
              source_token: `0x${string}`;
              amount: string;
              usd_value_at_burn: string;
              burn_tx_hash: `0x${string}`;
              zsa_asset_base: `0x${string}`;
              zsa_issuer: `0x${string}`;
            }[]
          >`
            SELECT * FROM certificates WHERE robinhood_token_id = ${row.robinhood_token_id}
          `;
          if (!certRow) {
            log.warn({ tokenId: row.robinhood_token_id }, "no certificate row yet, retrying later");
            continue;
          }

          const insc: SigilInscription = {
            protocol: "sigil",
            version: 1,
            sourceChain: (["solana", "ethereum", "base", "bsc", "arbitrum"] as const)[
              certRow.source_chain
            ],
            sourceToken: certRow.source_token,
            sourceBurnTx: certRow.burn_tx_hash,
            amount: certRow.amount,
            usdValueAtBurn: certRow.usd_value_at_burn,
            recipient: certRow.burner,
            robinhoodTokenId: certRow.robinhood_token_id,
            zsaAssetBase: certRow.zsa_asset_base,
            zsaIssuer: certRow.zsa_issuer,
            timestamp: Math.floor(Date.now() / 1000),
          };

          const result = await zcash.writeInscription(insc);
          await markWritten(BigInt(row.robinhood_token_id), result.zcashTxId);
          log.info(
            { tokenId: row.robinhood_token_id, zcashTx: result.zcashTxId, size: result.encodedSize },
            "inscription written to Zcash"
          );

          // fire and forget confirmation watch
          zcash
            .waitForConfirm(result.zcashTxId, 1)
            .then(() => markConfirmed(BigInt(row.robinhood_token_id)))
            .catch((err) => log.warn({ err }, "confirm watch failed"));
        } catch (err: any) {
          log.error({ err, row }, "inscription write failed");
          await markFailed(BigInt(row.robinhood_token_id), String(err?.message ?? err));
        }
      }
    } catch (err) {
      log.error({ err }, "inscription tick failed");
    }
    await sleep(3000);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  log.info({ config: { network: config.lightwalletd.network } }, "starting SIGIL relayer");
  await Promise.all([watchBurns(), processInscriptions()]);
}

main().catch((err) => {
  log.fatal({ err }, "relayer crashed");
  process.exit(1);
});
