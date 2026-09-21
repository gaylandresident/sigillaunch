import postgres from "postgres";
import { config } from "./config.js";

export const sql = postgres(config.databaseUrl, {
  max: 5,
  idle_timeout: 30,
});

export interface InscriptionRow {
  robinhood_token_id: string;
  robinhood_tx_hash: string;
  zcash_tx_id: string | null;
  status: "pending" | "written" | "confirmed" | "failed";
  error: string | null;
  created_at: Date;
}

export async function markPending(robinhoodTokenId: bigint, robinhoodTxHash: string) {
  await sql`
    INSERT INTO inscriptions (robinhood_token_id, robinhood_tx_hash, status)
    VALUES (${robinhoodTokenId.toString()}, ${robinhoodTxHash}, 'pending')
    ON CONFLICT (robinhood_token_id) DO NOTHING
  `;
}

export async function markWritten(robinhoodTokenId: bigint, zcashTxId: string) {
  await sql`
    UPDATE inscriptions
    SET status='written', zcash_tx_id=${zcashTxId}, updated_at=NOW()
    WHERE robinhood_token_id=${robinhoodTokenId.toString()}
  `;
}

export async function markConfirmed(robinhoodTokenId: bigint) {
  await sql`
    UPDATE inscriptions
    SET status='confirmed', updated_at=NOW()
    WHERE robinhood_token_id=${robinhoodTokenId.toString()}
  `;
}

export async function markFailed(robinhoodTokenId: bigint, err: string) {
  await sql`
    UPDATE inscriptions
    SET status='failed', error=${err}, updated_at=NOW()
    WHERE robinhood_token_id=${robinhoodTokenId.toString()}
  `;
}

export async function nextPendingBatch(limit = 10): Promise<InscriptionRow[]> {
  const rows = await sql<InscriptionRow[]>`
    SELECT * FROM inscriptions
    WHERE status='pending'
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
  return rows;
}
