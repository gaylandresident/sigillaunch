import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = postgres(config.databaseUrl, { max: 1 });
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  await sql.unsafe(schema);
  console.log("✓ schema applied");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
