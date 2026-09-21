/**
 * Refund user for the 0.0105 ETH that got stuck in old DividendRouter
 * (their devBuy went to fee router instead of triggering a real buy).
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, defineChain, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://robinhood-mainnet.g.alchemy.com/v2/alch_mkS7FTQnzPCIou3V7eI3c";
const USER = "0x4E91fc43e0a9BFBaf98D063eEf393Fe74211E624";
const REFUND = parseEther("0.015"); // 0.0105 lost + gas headroom

const keys = JSON.parse(readFileSync("./keys.json", "utf-8"));
const chain = defineChain({ id: 4663, name: "Robinhood", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const deployer = privateKeyToAccount(keys.deployer.privateKey);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account: deployer, chain, transport: http(RPC) });

console.log(`Deployer: ${deployer.address}`);
console.log(`Deployer bal before: ${formatEther(await pub.getBalance({ address: deployer.address }))} ETH`);
console.log(`User bal before:     ${formatEther(await pub.getBalance({ address: USER }))} ETH`);

const hash = await wallet.sendTransaction({ to: USER, value: REFUND });
console.log(`Refund tx: ${hash}`);
const rcpt = await pub.waitForTransactionReceipt({ hash });
console.log(`  status: ${rcpt.status}, block: ${rcpt.blockNumber}`);

console.log(`User bal after:      ${formatEther(await pub.getBalance({ address: USER }))} ETH`);
