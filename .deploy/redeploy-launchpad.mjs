/**
 * Redeploy ONLY the SigilLaunchpad (with atomic dev-buy inside createLaunch).
 * Everything else (Cert / Registry / Vault / Router) stays put.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import {
  createPublicClient, createWalletClient, http, defineChain, encodeDeployData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const RPC = "https://robinhood-mainnet.g.alchemy.com/v2/alch_mkS7FTQnzPCIou3V7eI3c";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

const addr = JSON.parse(readFileSync(join(__dirname, "addresses.json"), "utf-8"));
const keys = JSON.parse(readFileSync(join(__dirname, "keys.json"), "utf-8"));

const chain = defineChain({ id: 4663, name: "Robinhood", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const deployer = privateKeyToAccount(keys.deployer.privateKey);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account: deployer, chain, transport: http(RPC) });

function readContract(p) { return readFileSync(join(REPO, "contracts", p), "utf-8"); }
function readOZ(p) { return readFileSync(join(__dirname, "node_modules", p), "utf-8"); }
function findImport(p) {
  try {
    if (p.startsWith(".") || p.startsWith("src/")) {
      const abs = p.startsWith("src/") ? join(REPO, "contracts", p) : join(REPO, "contracts", "src", p.replace(/^\.\/?/, ""));
      return { contents: readFileSync(abs, "utf-8") };
    }
    if (p.startsWith("@openzeppelin/")) return { contents: readOZ(p) };
    return { error: "not found: " + p };
  } catch (e) { return { error: e.message }; }
}

console.log("Compiling SigilLaunchpad…");
const input = {
  language: "Solidity",
  sources: {
    "src/interfaces/IZip227.sol":     { content: readContract("src/interfaces/IZip227.sol") },
    "src/interfaces/ISwapRouter.sol": { content: readContract("src/interfaces/ISwapRouter.sol") },
    "src/SigilCertificate.sol":       { content: readContract("src/SigilCertificate.sol") },
    "src/BurnRegistry.sol":           { content: readContract("src/BurnRegistry.sol") },
    "src/RewardVault.sol":            { content: readContract("src/RewardVault.sol") },
    "src/DividendRouter.sol":         { content: readContract("src/DividendRouter.sol") },
    "src/SigilLaunchpad.sol":         { content: readContract("src/SigilLaunchpad.sol") },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const compiled = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
if (compiled.errors) {
  const fatal = compiled.errors.filter((e) => e.severity === "error");
  if (fatal.length) { fatal.forEach(e => console.error(e.formattedMessage)); process.exit(1); }
}
const art = compiled.contracts["src/SigilLaunchpad.sol"]["SigilLaunchpad"];

console.log("Deploying SigilLaunchpad → DividendRouter=", addr.DividendRouter);
const data = encodeDeployData({
  abi: art.abi,
  bytecode: "0x" + art.evm.bytecode.object,
  args: [deployer.address, WETH, addr.DividendRouter],
});
const hash = await wallet.sendTransaction({ data });
const rcpt = await pub.waitForTransactionReceipt({ hash });
console.log(`  new SigilLaunchpad: ${rcpt.contractAddress}`);

addr.SigilLaunchpad_previous = addr.SigilLaunchpad;
addr.SigilLaunchpad = rcpt.contractAddress;
addr.deployedAt = new Date().toISOString();
writeFileSync(join(__dirname, "addresses.json"), JSON.stringify(addr, null, 2));

console.log("\n✅ New launchpad live. Update fly.toml + contracts.ts with:");
console.log(`   NEXT_PUBLIC_LAUNCHPAD = "${rcpt.contractAddress}"`);
console.log(`   LAUNCHPAD_ADDRESS     = "${rcpt.contractAddress}"`);
