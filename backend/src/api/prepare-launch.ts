import { Hono } from "hono";
import { config } from "../config.js";
import { buildFinalizedBundle, makeLaunchDescription, toHex } from "../zsa/index.js";

/**
 * POST /prepare-launch
 *
 * Called by the /launch frontend BEFORE the user signs the createLaunch tx.
 * Returns a real ZIP-227 issuance bundle (asset base, description hash,
 * issuer, BIP-340 Schnorr signature) that the frontend passes as calldata to
 * SigilLaunchpad.createLaunch(). The bundle is stored on-chain forever,
 * making every user-launched token ZSA-migration-ready from block 1.
 *
 * Body:
 *   { creator: 0x…, name: string, symbol: string, supply: string(decimal) }
 * Response:
 *   { zsa: { assetBase, descHash, issuer, issueAuthSig }, timestampMs }
 */
export const prepareLaunch = new Hono();

prepareLaunch.post("/", async (c) => {
  const body = await c.req.json<{
    creator: `0x${string}`;
    name: string;
    symbol: string;
    supply: string; // decimal string of raw units (1e18 * count)
  }>();

  if (!body.creator || !body.name || !body.symbol || !body.supply) {
    return c.json({ error: "missing fields" }, 400);
  }

  // Deterministic per-launch timestamp — bundle description embeds it so the
  // same call is reproducible for verification later.
  const timestampMs = Date.now();

  const description = makeLaunchDescription({
    creator: body.creator,
    name: body.name,
    symbol: body.symbol,
    timestampMs,
  });

  const amount = BigInt(body.supply);
  const bundle = buildFinalizedBundle({
    mnemonic: config.zsaIssuerMnemonic,
    accountIndex: config.zsaIssuerAccount,
    description,
    amount,
  });

  return c.json({
    zsa: toHex(bundle),
    timestampMs,
    description: new TextDecoder().decode(description),
  });
});
