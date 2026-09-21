import { Hono } from "hono";
import { serve } from "@hono/node-server";
import pino from "pino";
import { config } from "./config.js";
import { attest } from "./api/attest.js";
import { prepareLaunch } from "./api/prepare-launch.js";
import { sql, dbEnabled } from "./db/client.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";

const log = pino({ level: config.logLevel });
const app = new Hono();

// Global CORS — using raw Response to guarantee headers make it out.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  await next();
  for (const [k, v] of Object.entries(CORS_HEADERS)) c.res.headers.set(k, v);
});

app.get("/", (c) =>
  c.json({
    name: "SIGIL API",
    version: "0.1.0",
    endpoints: ["/health", "/attest", "/prepare-launch", "/leaderboard", "/certificates"],
  })
);

app.get("/health", async (c) => {
  if (!dbEnabled) return c.json({ ok: true, db: "disabled (MVP mode)" });
  try {
    await sql`SELECT 1`;
    return c.json({ ok: true, db: "connected" });
  } catch (e: any) {
    return c.json({ ok: true, db: "disconnected", error: e.message });
  }
});

app.route("/attest", attest);
app.route("/prepare-launch", prepareLaunch);

// ── /leaderboard — reads directly from chain (no DB dependency) ──
// Iterates all minted certificates on both current + legacy contracts and
// aggregates per-burner. Cached briefly to avoid RPC spam.
const CERT_ADDRESSES: `0x${string}`[] = [
  config.robinhood.certificate,
  "0x97d3caec8e581e95d6b1b15e1ead77cd6fac20bc", // legacy cert
];
const chainClient = createPublicClient({ transport: http(config.robinhood.rpcUrl) });
const certAbi = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "getBurnRecord", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{
    type: "tuple", components: [
      { name: "sourceChain", type: "uint8" },
      { name: "sourceToken", type: "address" },
      { name: "burner", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "usdValueAtBurn", type: "uint256" },
      { name: "burnBlock", type: "uint256" },
      { name: "burnTxHash", type: "bytes32" },
      { name: "burnedAt", type: "uint64" },
      { name: "rarity", type: "uint8" },
      { name: "zsaBundle", type: "tuple", components: [
        { name: "issuer", type: "bytes" },
        { name: "actions", type: "tuple[]", components: [
          { name: "assetDescHash", type: "bytes32" },
          { name: "amount", type: "uint256" },
          { name: "finalize", type: "bool" },
        ]},
        { name: "issueAuthSig", type: "bytes" },
      ]},
    ],
  }]},
] as const;

let lbCache: { at: number; data: any[] } = { at: 0, data: [] };

app.get("/leaderboard", async (c) => {
  if (Date.now() - lbCache.at < 20_000) return c.json(lbCache.data);
  const perAddr = new Map<string, { totalBurns: number; totalUsd: bigint; legendary: number }>();
  try {
    for (const cert of CERT_ADDRESSES) {
      const supply = (await chainClient.readContract({
        address: cert, abi: certAbi, functionName: "totalSupply",
      })) as bigint;
      for (let i = 1n; i <= supply; i++) {
        try {
          const rec = (await chainClient.readContract({
            address: cert, abi: certAbi, functionName: "getBurnRecord", args: [i],
          })) as any;
          const key = rec.burner.toLowerCase();
          const prev = perAddr.get(key) ?? { totalBurns: 0, totalUsd: 0n, legendary: 0 };
          prev.totalBurns += 1;
          prev.totalUsd += BigInt(rec.usdValueAtBurn);
          if (Number(rec.rarity) === 3) prev.legendary += 1;
          perAddr.set(key, prev);
        } catch {}
      }
    }
  } catch (e: any) {
    return c.json({ error: "chain read failed: " + e.message }, 500);
  }
  const rows = [...perAddr.entries()]
    .map(([address, v]) => ({
      address,
      totalBurns: v.totalBurns,
      totalUsdBurned: v.totalUsd.toString(),
      legendaryCount: v.legendary,
    }))
    .sort((a, b) => (BigInt(b.totalUsdBurned) > BigInt(a.totalUsdBurned) ? 1 : -1))
    .slice(0, 50)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  lbCache = { at: Date.now(), data: rows };
  return c.json(rows);
});

app.get("/certificates", async (c) => {
  const owner = c.req.query("owner");
  if (!owner) return c.json({ error: "owner required" }, 400);
  const rows = await sql<any[]>`
    SELECT c.*, i.zcash_tx_id, i.status AS zcash_status
    FROM certificates c
    LEFT JOIN inscriptions i ON i.robinhood_token_id = c.robinhood_token_id
    WHERE burner = ${owner.toLowerCase()}
    ORDER BY minted_at DESC
  `.catch(() => []);
  return c.json(
    rows.map((r) => ({
      tokenId: r.robinhood_token_id.toString(),
      sourceChain: ["solana", "ethereum", "base", "bsc", "arbitrum"][r.source_chain],
      sourceToken: r.source_token,
      amount: r.amount,
      usdValueAtBurn: r.usd_value_at_burn,
      burnedAt: Math.floor(new Date(r.minted_at).getTime() / 1000),
      rarity: r.rarity,
      zcashInscriptionTx: r.zcash_tx_id,
      zcashStatus: r.zcash_status ?? "pending",
    }))
  );
});

async function bootstrap() {
  if (!dbEnabled) {
    log.info("MVP mode: no DB — /attest works, /leaderboard + /certificates return empty");
    return;
  }
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const schema = readFileSync(join(__dirname, "db", "schema.sql"), "utf-8");
    await sql.unsafe(schema);
    log.info("db schema applied");
  } catch (e: any) {
    log.warn({ err: e.message }, "schema apply failed (may be OK if already applied)");
  }
}

bootstrap().then(() => {
  serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
    log.info({ port: info.port }, "sigil-api listening");
  });
});
