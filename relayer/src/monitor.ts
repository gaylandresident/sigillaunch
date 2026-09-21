import { createPublicClient, http, parseAbi, type Log } from "viem";
import { config } from "./config.js";
import { sql, markPending } from "./db.js";
import pino from "pino";

const log = pino({ level: config.logLevel });

const burnAcceptedAbi = parseAbi([
  "event BurnAccepted(uint256 indexed tokenId, address indexed burner, uint8 sourceChain, bytes32 burnTxHash, uint256 amount, uint256 usdValueAtBurn, bytes zsaBundle)",
]);

const client = createPublicClient({
  transport: http(config.robinhoodRpcUrl),
});

const SOURCE_CHAIN_NAMES = [
  "solana",
  "ethereum",
  "base",
  "bsc",
  "arbitrum",
] as const;

export async function watchBurns() {
  let cursor = await loadCursor();
  log.info({ cursor: cursor.toString() }, "starting burn watcher");

  // Simple polling loop — bump interval down / add subscribeContractEvent for prod
  while (true) {
    try {
      const latest = await client.getBlockNumber();
      if (latest > cursor) {
        const logs = await client.getLogs({
          address: config.burnRegistryAddress,
          event: burnAcceptedAbi[0],
          fromBlock: cursor + 1n,
          toBlock: latest,
        });

        for (const l of logs) {
          await handleBurnAccepted(l);
        }
        cursor = latest;
        await saveCursor(cursor);
      }
    } catch (err) {
      log.error({ err }, "watcher tick failed");
    }
    await sleep(6000);
  }
}

async function handleBurnAccepted(l: Log) {
  const args = (l as any).args as {
    tokenId: bigint;
    burner: `0x${string}`;
    sourceChain: number;
    burnTxHash: `0x${string}`;
    amount: bigint;
    usdValueAtBurn: bigint;
    zsaBundle: `0x${string}`;
  };
  log.info(
    {
      tokenId: args.tokenId.toString(),
      chain: SOURCE_CHAIN_NAMES[args.sourceChain],
      burner: args.burner,
      usd: args.usdValueAtBurn.toString(),
    },
    "burn accepted → queuing inscription"
  );
  await markPending(args.tokenId, l.transactionHash!);
}

async function loadCursor(): Promise<bigint> {
  const [row] = await sql<{ value: string }[]>`
    SELECT value FROM cursors WHERE key='burn_watcher' LIMIT 1
  `;
  return row ? BigInt(row.value) : config.startBlock;
}

async function saveCursor(block: bigint) {
  await sql`
    INSERT INTO cursors(key, value) VALUES ('burn_watcher', ${block.toString()})
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value
  `;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
