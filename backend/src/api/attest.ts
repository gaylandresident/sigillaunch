import { Hono } from "hono";
import { verifyBurn, signAttestation, type SourceChain, type BurnClaim } from "../attest.js";
import { priceUsdAtBlock } from "../price.js";
import { sql } from "../db/client.js";
import type { Address, Hex } from "viem";
import { createPublicClient, http, recoverMessageAddress } from "viem";
import { config } from "../config.js";
import { buildFinalizedBundle, makeDescription, toHex } from "../zsa/index.js";

/**
 * Canonical bind message. The wallet that did the burn MUST sign this
 * before we're willing to attest that the certificate goes to `recipient`.
 * Format is human-readable so the wallet UI shows something intelligible
 * to the user rather than a raw hash.
 */
function bindMessage(params: {
  burnTxHash: string;
  recipient: string;
  sourceChain: string;
}): string {
  return [
    "SIGIL Certificate Claim v1",
    `Chain: ${params.sourceChain}`,
    `Burn tx: ${params.burnTxHash}`,
    `Deliver certificate to: ${params.recipient}`,
    "",
    "I authorize the SIGIL protocol to mint a certificate for this burn to the address above.",
  ].join("\n");
}

/**
 * POST /attest
 *   {
 *     sourceChain, sourceToken, burner,
 *     amount (decimal string),
 *     burnTxHash
 *   }
 * →
 *   {
 *     attestation, attester, digest,
 *     claim: { ... resolved values ... },
 *     zsa:   { issuer, actions[], issueAuthSig, assetBase }
 *   }
 *
 * Client passes both the attestation AND the zsa bundle into
 * BurnRegistry.claim() on Robinhood Chain.
 */
export const attest = new Hono();

const evmClients = {
  ethereum: createPublicClient({ transport: http(config.chains.ethereum.rpcUrl) }),
  base: createPublicClient({ transport: http(config.chains.base.rpcUrl) }),
  bsc: createPublicClient({ transport: http(config.chains.bsc.rpcUrl) }),
  arbitrum: createPublicClient({ transport: http(config.chains.arbitrum.rpcUrl) }),
};

const SOURCE_CHAIN_IDS = {
  solana: 0,
  ethereum: 1,
  base: 2,
  bsc: 3,
  arbitrum: 4,
} as const;

attest.post("/", async (c) => {
  const body = await c.req.json<{
    sourceChain: SourceChain;
    sourceToken: string;
    burner: Address;      // who did the burn (must equal tx.from)
    recipient: Address;   // where the certificate goes (can differ)
    amount: string;
    burnTxHash: Hex;
    bindSignature: Hex;   // signed by `burner` over bindMessage()
  }>();

  if (!body.bindSignature || !body.recipient) {
    return c.json({ error: "bindSignature and recipient are required" }, 400);
  }

  // De-dupe: one attestation per burn tx
  const [existing] = await sql`
    SELECT burn_tx_hash FROM burn_attestations WHERE burn_tx_hash=${body.burnTxHash}
  `;
  if (existing) return c.json({ error: "already attested" }, 409);

  // Resolve block + timestamp on source chain
  let burnBlock: bigint;
  let unixTs: number;
  if (body.sourceChain === "solana") {
    const { Connection } = await import("@solana/web3.js");
    const conn = new Connection(config.chains.solana.rpcUrl, "confirmed");
    const tx = await conn.getParsedTransaction(body.burnTxHash, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return c.json({ error: "solana tx not found" }, 404);
    burnBlock = BigInt(tx.slot);
    unixTs = tx.blockTime ?? Math.floor(Date.now() / 1000);
  } else {
    const client = evmClients[body.sourceChain];
    const receipt = await client.getTransactionReceipt({ hash: body.burnTxHash });
    if (!receipt) return c.json({ error: "burn tx not found" }, 404);
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    burnBlock = receipt.blockNumber;
    unixTs = Number(block.timestamp);
  }

  const amount = BigInt(body.amount);
  const usdValueAtBurn = await priceUsdAtBlock(body.sourceChain, body.sourceToken, unixTs, amount);

  const claim: BurnClaim = {
    sourceChain: body.sourceChain,
    sourceToken: body.sourceToken,
    burner: body.burner,
    recipient: body.recipient,
    amount,
    usdValueAtBurn,
    burnBlock,
    burnTxHash: body.burnTxHash,
  };

  try {
    await verifyBurn(claim);
  } catch (e: any) {
    return c.json({ error: `burn verification failed: ${e.message}` }, 400);
  }

  // ── CRITICAL: verify the burner's signature over the recipient binding ──
  // Prevents "I saw your burn tx, let me claim your certificate to my wallet."
  try {
    const msg = bindMessage({
      burnTxHash: body.burnTxHash,
      recipient: body.recipient,
      sourceChain: body.sourceChain,
    });
    const recovered = await recoverMessageAddress({
      message: msg,
      signature: body.bindSignature,
    });
    if (recovered.toLowerCase() !== body.burner.toLowerCase()) {
      return c.json(
        { error: `bind signature invalid: recovered ${recovered}, expected ${body.burner}` },
        401
      );
    }
  } catch (e: any) {
    return c.json({ error: `bind signature verification failed: ${e.message}` }, 401);
  }

  // ── ZIP-227 bundle (real, not mocked — real BLAKE2b, real BIP-340 Schnorr) ──
  const description = makeDescription(body.sourceChain, body.sourceToken, body.burnTxHash);
  const bundle = buildFinalizedBundle({
    mnemonic: config.zsaIssuerMnemonic,
    accountIndex: config.zsaIssuerAccount,
    description,
    amount,
  });
  const zsa = toHex(bundle);

  // ── ECDSA attestation for the on-chain BurnRegistry.claim() ──
  const { attestation, attester, digest } = await signAttestation(claim);

  await sql`
    INSERT INTO burn_attestations (
      burn_tx_hash, source_chain, source_token, burner, amount,
      usd_value_at_burn, burn_block, attestation_sig
    ) VALUES (
      ${body.burnTxHash},
      ${SOURCE_CHAIN_IDS[body.sourceChain]},
      ${body.sourceToken},
      ${body.burner},
      ${amount.toString()},
      ${usdValueAtBurn.toString()},
      ${burnBlock.toString()},
      ${attestation}
    )
  `;

  return c.json({
    attestation,
    attester,
    digest,
    claim: {
      sourceChain: body.sourceChain,
      sourceToken: body.sourceToken,
      burner: body.burner,
      recipient: body.recipient,
      amount: amount.toString(),
      usdValueAtBurn: usdValueAtBurn.toString(),
      burnBlock: burnBlock.toString(),
      burnTxHash: body.burnTxHash,
    },
    zsa,
  });
});

/** Exported for frontend re-use — the same string that user's wallet signs. */
export function bindMessageFor(params: {
  burnTxHash: string;
  recipient: string;
  sourceChain: string;
}): string {
  return bindMessage(params);
}
