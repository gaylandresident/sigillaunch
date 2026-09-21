import pino from "pino";
import { config } from "./config.js";
import { distributeTick, botAddress } from "./distribute.js";

const log = pino({ level: config.logLevel });

async function tick() {
  const started = Date.now();
  try {
    const result = await distributeTick();
    if (result.skipped) {
      log.info({ reason: result.reason, balance: result.balance, ms: Date.now() - started }, "skip");
    } else {
      log.info(
        {
          totalRSpy: result.totalRSpy,
          sigilBought: result.sigilBought,
          buybackRSpy: (BigInt(result.totalRSpy) / 2n).toString(),
          dividendRSpy: (BigInt(result.totalRSpy) / 2n).toString(),
          gasUsed: result.gasUsed,
          tx: result.txHash,
          ms: Date.now() - started,
        },
        "✓ flushed"
      );
    }
  } catch (err: any) {
    log.error({ err: err?.shortMessage ?? err?.message ?? String(err) }, "tick failed");
  }
}

async function main() {
  log.info(
    {
      bot: botAddress(),
      router: config.dividendRouter,
      vault: config.rewardVault,
      weth: config.weth,
      intervalMs: config.tickIntervalMs,
    },
    "SIGIL distributor online"
  );
  await tick();
  setInterval(tick, config.tickIntervalMs);
}

main().catch((err) => {
  log.fatal({ err }, "distributor crashed");
  process.exit(1);
});
