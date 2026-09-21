import {
  createPublicClient,
  http,
  keccak256,
  encodeAbiParameters,
  parseAbi,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Connection, PublicKey } from "@solana/web3.js";
import { config, SOURCE_CHAIN_IDS } from "./config.js";

/// Verify a burn happened on the source chain, then sign an attestation
/// the BurnRegistry contract accepts.

const ROBINHOOD_CHAIN_ID = 4663n;

export type SourceChain = keyof typeof SOURCE_CHAIN_IDS;

export interface BurnClaim {
  sourceChain: SourceChain;
  sourceToken: Address | string; // Solana mint = base58 string
  burner: Address;               // who did the burn (must equal source tx.from)
  recipient: Address;            // where the certificate is minted (can differ from burner)
  amount: bigint;
  usdValueAtBurn: bigint;        // scaled 1e8
  burnBlock: bigint;
  burnTxHash: Hex;
}

export interface AttestationResult {
  attestation: Hex;
  attester: Address;
  digest: Hex;
}

const attester = privateKeyToAccount(config.attesterPrivateKey);

const erc20TransferAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const evmClients: Record<Exclude<SourceChain, "solana">, ReturnType<typeof createPublicClient>> = {
  ethereum:  createPublicClient({ transport: http(config.chains.ethereum.rpcUrl) }),
  base:      createPublicClient({ transport: http(config.chains.base.rpcUrl) }),
  bsc:       createPublicClient({ transport: http(config.chains.bsc.rpcUrl) }),
  arbitrum:  createPublicClient({ transport: http(config.chains.arbitrum.rpcUrl) }),
  robinhood: createPublicClient({ transport: http(config.chains.robinhood.rpcUrl) }),
};

const solanaConn = new Connection(config.chains.solana.rpcUrl, "confirmed");

/// Confirm a burn on source chain, throw if invalid.
export async function verifyBurn(claim: BurnClaim): Promise<void> {
  if (claim.sourceChain === "solana") {
    await verifySolanaBurn(claim);
  } else {
    await verifyEvmBurn(claim);
  }
}

async function verifyEvmBurn(claim: BurnClaim): Promise<void> {
  const client = evmClients[claim.sourceChain as Exclude<SourceChain, "solana">];
  const dead = config.chains[claim.sourceChain].dead as Address;

  const receipt = await client.getTransactionReceipt({ hash: claim.burnTxHash });
  if (!receipt) throw new Error("burn tx not found");
  if (receipt.status !== "success") throw new Error("burn tx failed");

  // Find matching ERC20 Transfer(from=burner, to=dead, value>=claim.amount)
  const logs = await client.getContractEvents({
    address: claim.sourceToken as Address,
    abi: erc20TransferAbi,
    eventName: "Transfer",
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  });

  const match = logs.find(
    (l: any) =>
      l.transactionHash === claim.burnTxHash &&
      l.args?.to?.toLowerCase() === dead.toLowerCase() &&
      l.args?.from?.toLowerCase() === claim.burner.toLowerCase() &&
      BigInt(l.args?.value ?? 0) >= claim.amount
  );
  if (!match) throw new Error("no matching burn Transfer log");
}

async function verifySolanaBurn(claim: BurnClaim): Promise<void> {
  const tx = await solanaConn.getParsedTransaction(claim.burnTxHash, {
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) throw new Error("solana tx not found");
  if (tx.meta?.err) throw new Error("solana tx errored");

  // Look for SPL Burn instruction on the claimed mint by the claimed burner
  const found = tx.transaction.message.instructions.find((ix: any) => {
    if (ix?.program !== "spl-token") return false;
    const info = ix?.parsed?.info;
    if (!info) return false;
    if (info.mint !== claim.sourceToken) return false;
    const owner = info.authority ?? info.owner;
    if (owner?.toLowerCase() !== claim.burner.toLowerCase()) return false;
    return (ix.parsed.type === "burn" || ix.parsed.type === "burnChecked");
  });
  if (!found) throw new Error("no matching SPL Burn instruction");
}

/// Produce ECDSA attestation matching BurnRegistry.claim's expected digest.
/// NOTE: digest binds `recipient` (not `burner`) — matches contract, which mints
/// to the attested recipient regardless of msg.sender.
export async function signAttestation(claim: BurnClaim): Promise<AttestationResult> {
  const digest = keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" }, // chainid
        { type: "address" }, // burn registry addr
        { type: "address" }, // recipient (mint destination)
        { type: "uint8" },   // sourceChain
        { type: "address" }, // sourceToken (padded from bytes for solana)
        { type: "uint256" }, // amount
        { type: "uint256" }, // usdValueAtBurn
        { type: "uint256" }, // burnBlock
        { type: "bytes32" }, // burnTxHash
      ],
      [
        ROBINHOOD_CHAIN_ID,
        config.robinhood.burnRegistry,
        claim.recipient,
        SOURCE_CHAIN_IDS[claim.sourceChain],
        claim.sourceChain === "solana"
          ? (`0x${solanaMintTo20Bytes(claim.sourceToken)}` as Address)
          : (claim.sourceToken as Address),
        claim.amount,
        claim.usdValueAtBurn,
        claim.burnBlock,
        claim.burnTxHash,
      ]
    )
  );

  const attestation = await attester.signMessage({
    message: { raw: toBytes(digest) },
  });

  return { attestation, attester: attester.address, digest };
}

function solanaMintTo20Bytes(mint: string): string {
  // First 20 bytes of the 32-byte pubkey — matches contract encoding
  return Buffer.from(new PublicKey(mint).toBytes()).slice(0, 20).toString("hex");
}
